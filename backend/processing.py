from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from io import BytesIO
from typing import Any

import pandas as pd


class FileProcessingError(ValueError):
    """Raised when an uploaded source cannot be imported safely."""


# Los encabezados se comparan ya normalizados (mayúsculas, sin acentos,
# espacios colapsados). Los escalones de precio son por volumen de compra.
INVENTORY_ALIASES: dict[str, set[str]] = {
    "pecarsys": {"ARTICULO"},
    "descripcion": {"DESCRIPCION"},
    "linea": {"LINEA"},
    "marca": {"MARCA"},
    "existencia": {"EXISTENCIA"},
    "apartados": {"APARTADOS", "APARTADO"},
}

PRICE_ALIASES: dict[str, set[str]] = {
    "pecarsys": {"PECARSYS", "PECARSIS"},
    "medida": {"MEDIDA"},
    "marca": {"MARCA"},
    "modelo": {"MODELO"},
    "indice": {"INDICE"},
    "inventario_matriz": {"INVENTARIO"},
    "precio_1": {"$1.00 A $199,999", "PRECIO UNICO", "PRECIO 1"},
    "precio_2": {"$200,000 A $499,999", "PRECIO 2"},
    "precio_3": {"$500,000 O MAS ACUMULATIVO", "PRECIO 3"},
    "precio_4": {"$1,000,000 O MAS ACUMULATIVO", "PRECIO 4"},
    "precio_5": {"$1,500,000 (1 EXHIBICION)", "PRECIO 5"},
    "precio_especial": {"ESPECIAL", "ESPECIAL (INVENTARIO MATRIZ)", "PRECIO ESPECIAL"},
}

PRICE_COLUMNS = ("precio_1", "precio_2", "precio_3", "precio_4", "precio_5", "precio_especial")
EXCEL_EXTENSIONS = {"xlsx", "xlsm"}
HEADER_SEARCH_ROWS = 20
VALID_KEY = re.compile(r"^[A-Z0-9][A-Z0-9-]*$")


@dataclass(frozen=True)
class InventoryImport:
    """Reporte de existencias del ERP, listo para guardar."""

    rows: list[dict[str, Any]]
    metadata: dict[str, str | None]
    warnings: list[str]


@dataclass(frozen=True)
class PriceImport:
    """Lista de precios (todas sus pestañas), lista para guardar."""

    rows: list[dict[str, Any]]
    warnings: list[str]


@dataclass(frozen=True)
class _Sheet:
    name: str
    frame: pd.DataFrame
    preamble: list[str]
    headers: list[str]


def _normalize_header(value: object) -> str:
    text = unicodedata.normalize("NFKD", str(value))
    text = "".join(char for char in text if not unicodedata.combining(char))
    return " ".join(text.strip().upper().replace("_", " ").split())


def _read_raw_sheets(contents: bytes, filename: str) -> dict[str, pd.DataFrame]:
    extension = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""
    try:
        if extension == "csv":
            return {"CSV": pd.read_csv(BytesIO(contents), header=None, dtype=object)}
        if extension in EXCEL_EXTENSIONS:
            return pd.read_excel(BytesIO(contents), sheet_name=None, header=None, dtype=object)
    except Exception as exc:
        raise FileProcessingError(f"No fue posible leer el archivo {filename}.") from exc
    raise FileProcessingError("Sólo se permiten archivos .xlsx, .xlsm o .csv.")


def _locate_table(name: str, raw: pd.DataFrame, aliases: dict[str, set[str]]) -> _Sheet | None:
    """Busca la fila de encabezados (la que contiene la clave) y arma la tabla."""
    key_aliases = aliases["pecarsys"]
    for index in range(min(HEADER_SEARCH_ROWS, len(raw))):
        headers = [_normalize_header(value) for value in raw.iloc[index]]
        if not key_aliases.intersection(headers):
            continue
        rename: dict[int, str] = {}
        for position, header in enumerate(headers):
            for canonical, accepted in aliases.items():
                if header in accepted and canonical not in rename.values():
                    rename[position] = canonical
                    break
        frame = raw.iloc[index + 1:, list(rename)].copy()
        frame.columns = [rename[position] for position in rename]
        preamble = [
            str(value).strip()
            for row in raw.iloc[:index].itertuples(index=False)
            for value in row
            if not pd.isna(value) and str(value).strip()
        ]
        return _Sheet(name=name, frame=frame, preamble=preamble, headers=headers)
    return None


def _clean_key(value: object) -> str:
    if pd.isna(value):
        return ""
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    key = str(value).strip().upper()
    # El ERP exporta "00501" y la lista de precios 501: se igualan sin ceros.
    if key.isdigit():
        key = key.lstrip("0") or "0"
    return key


def _prepare(frame: pd.DataFrame, source_name: str, warnings: list[str]) -> pd.DataFrame:
    result = frame.copy()
    result["pecarsys"] = result["pecarsys"].map(_clean_key)
    result = result[result["pecarsys"] != ""]
    invalid = result.loc[~result["pecarsys"].str.match(VALID_KEY), "pecarsys"]
    if not invalid.empty:
        warnings.append(
            f"{len(invalid)} filas de {source_name} con código inválido se omitieron: "
            f"{', '.join(invalid.head(5))}."
        )
        result = result.drop(invalid.index)
    duplicated = result.loc[result["pecarsys"].duplicated(), "pecarsys"]
    if not duplicated.empty:
        warnings.append(
            f"{len(duplicated)} códigos repetidos en {source_name}; se tomó la primera aparición: "
            f"{', '.join(duplicated.drop_duplicates().head(5))}."
        )
        result = result.drop_duplicates(subset="pecarsys", keep="first")
    return result


def _numeric(frame: pd.DataFrame, column: str) -> pd.Series:
    if column not in frame.columns:
        return pd.Series(0.0, index=frame.index)
    return pd.to_numeric(frame[column], errors="coerce").fillna(0).clip(lower=0)


def _text(value: object) -> str:
    return "" if pd.isna(value) else " ".join(str(value).split())


def _inventory_metadata(preamble: list[str]) -> dict[str, str | None]:
    # Ej: ["EXISTENCIA SOLO POSITIVOS", "Sucursal: VERACRUZ",
    #      "Fecha de impresion:07/10/2026   Hora: 04:48:43p. m."]
    sucursal = None
    for cell in preamble:
        match = re.match(r"SUCURSAL:\s*(.+)", cell, re.IGNORECASE)
        if match:
            sucursal = match.group(1).strip()
    header = " ".join(preamble)
    fecha_corte = None
    stamp = re.search(
        r"(\d{1,2})/(\d{1,2})/(\d{4}).*?HORA:\s*(\d{1,2}):(\d{2}):(\d{2})\s*([AP])\.?\s*M",
        header,
        re.IGNORECASE,
    )
    if stamp:
        day, month, year, hour, minute, second = (int(part) for part in stamp.groups()[:6])
        hour = hour % 12 + (12 if stamp.group(7).upper() == "P" else 0)
        fecha_corte = f"{year:04d}-{month:02d}-{day:02d}T{hour:02d}:{minute:02d}:{second:02d}"
    return {
        "sucursal": sucursal,
        "fecha_corte": fecha_corte,
        "encabezado_reporte": header or None,
    }


def _has_table(sheets: dict[str, pd.DataFrame], aliases: dict[str, set[str]]) -> bool:
    return any(_locate_table(name, raw, aliases) is not None for name, raw in sheets.items())


def _load_inventory(contents: bytes, filename: str, warnings: list[str]) -> tuple[pd.DataFrame, dict[str, str | None]]:
    sheets = _read_raw_sheets(contents, filename)
    for name, raw in sheets.items():
        sheet = _locate_table(name, raw, INVENTORY_ALIASES)
        if sheet is not None:
            inventory = _prepare(sheet.frame, "inventario", warnings)
            return inventory, _inventory_metadata(sheet.preamble)
    if _has_table(sheets, PRICE_ALIASES):
        raise FileProcessingError(
            f"'{filename}' parece ser la lista de precios. En el paso 1 va el reporte "
            "de existencias del sistema (columna Articulo)."
        )
    raise FileProcessingError(
        f"'{filename}' no parece un reporte de existencias: no se encontró la columna Articulo."
    )


def _load_prices(contents: bytes, filename: str, warnings: list[str]) -> pd.DataFrame:
    frames: list[pd.DataFrame] = []
    skipped: list[str] = []
    sheets = _read_raw_sheets(contents, filename)
    for name, raw in sheets.items():
        sheet = _locate_table(name, raw, PRICE_ALIASES)
        if sheet is None:
            skipped.append(name)
            continue
        sheet.frame["categoria"] = name.strip()
        sheet.frame["esquema_precio"] = "unico" if "PRECIO UNICO" in sheet.headers else "escalones"
        frames.append(sheet.frame)
    if not frames:
        if _has_table(sheets, INVENTORY_ALIASES):
            raise FileProcessingError(
                f"'{filename}' parece ser el reporte de existencias. En el paso 2 va la "
                "lista de precios (columna PECARSIS)."
            )
        raise FileProcessingError(
            f"'{filename}' no parece una lista de precios: no se encontró la columna PECARSIS."
        )
    for name in skipped:
        warnings.append(f"Pestaña '{name}' omitida: no contiene columna PECARSIS.")
    return _prepare(pd.concat(frames, ignore_index=True), "precios", warnings)


def _inventory_rows(inventory: pd.DataFrame) -> list[dict[str, Any]]:
    return [
        {
            "pecarsys": row["pecarsys"],
            "descripcion": _text(row.get("descripcion")),
            "linea": _text(row.get("linea")) or None,
            "marca": _text(row.get("marca")) or None,
            "existencia": int(row["existencia"]),
            "apartados": int(row["apartados"]),
        }
        for _, row in inventory.iterrows()
    ]


def _catalog_rows(prices: pd.DataFrame) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for _, row in prices.iterrows():
        record: dict[str, Any] = {
            "pecarsys": row["pecarsys"],
            "medida": _text(row.get("medida")) or None,
            "marca": _text(row.get("marca")) or None,
            "modelo": _text(row.get("modelo")) or None,
            "indice": _text(row.get("indice")) or None,
            "categoria": _text(row.get("categoria")) or None,
            "esquema_precio": row.get("esquema_precio"),
            "inventario_matriz": int(row["inventario_matriz"]),
        }
        # Un precio ausente se guarda como NULL, no como 0.
        for column in PRICE_COLUMNS:
            value = float(row[column])
            record[column] = round(value, 2) if value > 0 else None
        rows.append(record)
    return rows


def parse_inventory(contents: bytes, filename: str) -> InventoryImport:
    warnings: list[str] = []
    inventory, metadata = _load_inventory(contents, filename, warnings)
    inventory["existencia"] = _numeric(inventory, "existencia")
    inventory["apartados"] = _numeric(inventory, "apartados")
    return InventoryImport(rows=_inventory_rows(inventory), metadata=metadata, warnings=warnings)


def parse_prices(contents: bytes, filename: str) -> PriceImport:
    warnings: list[str] = []
    prices = _load_prices(contents, filename, warnings)
    prices["inventario_matriz"] = _numeric(prices, "inventario_matriz")
    for column in PRICE_COLUMNS:
        prices[column] = _numeric(prices, column)
    return PriceImport(rows=_catalog_rows(prices), warnings=warnings)
