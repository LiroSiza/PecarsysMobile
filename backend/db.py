from __future__ import annotations

from functools import lru_cache

from supabase import Client, create_client

from config import get_settings
from processing import ReconciliationResult


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


def save_import(
    result: ReconciliationResult,
    sucursal: str,
    inventory_filename: str,
    prices_filename: str,
    imported_by: str | None = None,
) -> None:
    """Guarda precios (upsert) y reemplaza la foto de existencias de la sucursal.

    Los precios van primero: si la carga de existencias falla, el catálogo
    actualizado sigue siendo válido por sí solo.
    """
    client = get_client()
    taken_at = result.metadata.get("fecha_corte")
    if taken_at:
        taken_at += get_settings().report_utc_offset
    client.rpc(
        "upsert_catalog",
        {
            "p_rows": result.catalog_rows,
            "p_filename": prices_filename,
            "p_summary": {"price_rows": result.summary["price_rows"]},
            "p_warnings": result.warnings,
            "p_imported_by": imported_by,
        },
    ).execute()
    client.rpc(
        "import_inventory",
        {
            "p_sucursal": sucursal,
            "p_taken_at": taken_at,
            "p_rows": result.inventory_rows,
            "p_filename": inventory_filename,
            "p_summary": result.summary,
            "p_warnings": result.warnings,
            "p_imported_by": imported_by,
        },
    ).execute()
