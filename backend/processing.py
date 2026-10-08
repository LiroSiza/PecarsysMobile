from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
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
EXCEL_EXTENSIONS = {"xlsx", "xlsm", "xls"}
HEADER_SEARCH_ROWS = 20
VALID_KEY = re.compile(r"^[A-Z0-9][A-Z0-9-]*$")


@dataclass(frozen=True)
class ReconciliationResult:
    records: list[dict[str, Any]]
    summary: dict[str, int]
    warnings: list[str]
    metadata: dict[str, str | None] = field(default_factory=dict)
    # Filas listas para guardar en Supabase (tablas inventory y catalog).
    inventory_rows: list[dict[str, Any]] = field(default_factory=list)
    catalog_rows: list[dict[str, Any]] = field(default_factory=list)


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
    raise FileProcessingError("Sólo se permiten archivos .xlsx, .xlsm, .xls o .csv.")


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


def reconcile_files(
    inventory_contents: bytes,
    inventory_filename: str,
    prices_contents: bytes,
    prices_filename: str,
) -> ReconciliationResult:
    warnings: list[str] = []
    inventory, metadata = _load_inventory(inventory_contents, inventory_filename, warnings)
    prices = _load_prices(prices_contents, prices_filename, warnings)

    inventory["existencia"] = _numeric(inventory, "existencia")
    inventory["apartados"] = _numeric(inventory, "apartados")
    prices["inventario_matriz"] = _numeric(prices, "inventario_matriz")
    for column in PRICE_COLUMNS:
        prices[column] = _numeric(prices, column)

    inventory_keys = set(inventory["pecarsys"])
    price_keys = set(prices["pecarsys"])
    merged = inventory.merge(prices, on="pecarsys", how="outer", suffixes=("_inv", "_price"), indicator=True)

    def row_value(row: pd.Series, column: str) -> object:
        # La marca del ERP tiene prioridad sobre la de la lista de precios.
        for candidate in (column, f"{column}_inv", f"{column}_price"):
            if candidate in row.index and not pd.isna(row[candidate]) and str(row[candidate]).strip():
                return row[candidate]
        return ""

    records: list[dict[str, Any]] = []
    for _, row in merged.iterrows():
        existencia = int(row_value(row, "existencia") or 0)
        apartados = int(row_value(row, "apartados") or 0)
        record: dict[str, Any] = {
            "pecarsys": row["pecarsys"],
            "medida": _text(row_value(row, "medida")),
            "marca": _text(row_value(row, "marca")),
            "modelo": _text(row_value(row, "modelo")),
            "descripcion": _text(row_value(row, "descripcion")),
            "linea": _text(row_value(row, "linea")),
            "indice": _text(row_value(row, "indice")),
            "categoria": _text(row_value(row, "categoria")),
            "esquema_precio": _text(row_value(row, "esquema_precio")) or None,
            "existencia": existencia,
            "apartados": apartados,
            "disponible": existencia - apartados,
            "inventario_matriz": int(row_value(row, "inventario_matriz") or 0),
            "match_status": row["_merge"],
        }
        for column in PRICE_COLUMNS:
            record[column] = round(float(row_value(row, column) or 0), 2)
        records.append(record)

    only_inventory = inventory_keys - price_keys
    only_prices = price_keys - inventory_keys
    if only_inventory:
        warnings.append(
            f"{len(only_inventory)} productos de inventario no tienen precio: "
            f"{', '.join(sorted(only_inventory)[:5])}."
        )

    return ReconciliationResult(
        records=records,
        inventory_rows=_inventory_rows(inventory),
        catalog_rows=_catalog_rows(prices),
        summary={
            "inventory_rows": len(inventory),
            "price_rows": len(prices),
            "matched_rows": len(inventory_keys & price_keys),
            "inventory_without_price": len(only_inventory),
            "price_without_inventory": len(only_prices),
            "total_rows": len(records),
        },
        warnings=warnings,
        metadata=metadata,
    )
