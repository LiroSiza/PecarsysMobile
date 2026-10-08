from __future__ import annotations

from functools import lru_cache

from supabase import Client, create_client

from config import get_settings
from processing import InventoryImport, PriceImport


class DatabaseNotConfiguredError(RuntimeError):
    """Raised when SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY are missing."""


@lru_cache
def get_client() -> Client:
    settings = get_settings()
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise DatabaseNotConfiguredError(
            "Falta configurar SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en backend/.env."
        )
    return create_client(settings.supabase_url, settings.supabase_service_role_key)


def save_prices(prices: PriceImport, filename: str, imported_by: str) -> None:
    """Actualiza el catálogo (upsert): nunca borra productos."""
    get_client().rpc(
        "upsert_catalog",
        {
            "p_rows": prices.rows,
            "p_filename": filename,
            "p_summary": {"rows": len(prices.rows)},
            "p_warnings": prices.warnings,
            "p_imported_by": imported_by,
        },
    ).execute()


def save_inventory(inventory: InventoryImport, sucursal: str, filename: str, imported_by: str) -> None:
    """Reemplaza la foto completa de existencias de la sucursal."""
    taken_at = inventory.metadata.get("fecha_corte")
    if taken_at:
        taken_at += get_settings().report_utc_offset
    get_client().rpc(
        "import_inventory",
        {
            "p_sucursal": sucursal,
            "p_taken_at": taken_at,
            "p_rows": inventory.rows,
            "p_filename": filename,
            "p_summary": {"rows": len(inventory.rows)},
            "p_warnings": inventory.warnings,
            "p_imported_by": imported_by,
        },
    ).execute()


def _count(table: str, **filters: str) -> int:
    query = get_client().table(table).select("pecarsys", count="exact", head=True)
    for column, value in filters.items():
        query = query.eq(column, value)
    return query.execute().count or 0


def fetch_summary(sucursal: str) -> dict[str, int]:
    """Estado de la base después de importar (existencias de la sucursal vs. catálogo)."""
    return {
        "inventory_rows": _count("inventory", sucursal=sucursal),
        "price_rows": _count("catalog"),
        "matched_rows": _count("product_search", sucursal=sucursal, match_status="both"),
        "inventory_without_price": _count("product_search", sucursal=sucursal, match_status="left_only"),
    }
