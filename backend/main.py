from __future__ import annotations

import logging
from typing import Annotated

from fastapi import Depends, FastAPI, File, HTTPException, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from auth import CurrentUser, require_admin
from config import get_settings
from db import DatabaseNotConfiguredError, fetch_summary, save_inventory, save_prices
from processing import FileProcessingError, parse_inventory, parse_prices

logger = logging.getLogger(__name__)

MAX_UPLOAD_BYTES = 20 * 1024 * 1024

settings = get_settings()
if settings.is_production and not (settings.supabase_url and settings.supabase_service_role_key):
    raise RuntimeError("En producción son obligatorios SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.")

# En producción no se publica la documentación interactiva de la API.
app = FastAPI(
    title="PECARSYS Llantas API",
    version="1.0.0",
    docs_url=None if settings.is_production else "/docs",
    redoc_url=None if settings.is_production else "/redoc",
    openapi_url=None if settings.is_production else "/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization"],
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Cache-Control"] = "no-store"
    if settings.is_production:
        response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
    return response


class ImportResponse(BaseModel):
    status: str
    updated: list[str]
    summary: dict[str, int]
    warnings: list[str]
    metadata: dict[str, str | None]


@app.get("/")
def read_root() -> dict[str, str]:
    return {"status": "online", "message": "API de Llantas funcionando"}


async def _read_upload(upload: UploadFile) -> tuple[bytes, str]:
    if upload.size is not None and upload.size > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail=f"'{upload.filename}' excede el máximo de 20 MB.")
    return await upload.read(), upload.filename or "archivo"


@app.post("/api/v1/import", response_model=ImportResponse)
async def import_files(
    user: Annotated[CurrentUser, Depends(require_admin)],
    inventory_file: Annotated[UploadFile | None, File()] = None,
    prices_file: Annotated[UploadFile | None, File()] = None,
) -> ImportResponse:
    """Importa existencias, precios o ambos. Se valida todo antes de guardar nada."""
    if inventory_file is None and prices_file is None:
        raise HTTPException(status_code=400, detail="Selecciona al menos un archivo.")
    try:
        inventory = prices = None
        if inventory_file is not None:
            contents, inventory_name = await _read_upload(inventory_file)
            inventory = await run_in_threadpool(parse_inventory, contents, inventory_name)
        if prices_file is not None:
            contents, prices_name = await _read_upload(prices_file)
            prices = await run_in_threadpool(parse_prices, contents, prices_name)

        warnings: list[str] = []
        metadata: dict[str, str | None] = {"sucursal": get_settings().default_sucursal, "fecha_corte": None}
        if inventory is not None:
            warnings += inventory.warnings
            metadata.update(inventory.metadata)
            if not metadata.get("sucursal"):
                metadata["sucursal"] = get_settings().default_sucursal
                warnings.append(f"El reporte de existencias no indica sucursal; se usó {metadata['sucursal']}.")
        sucursal = metadata["sucursal"] or get_settings().default_sucursal

        # Precios primero: si falla la carga de existencias, el catálogo nuevo sigue siendo válido.
        updated: list[str] = []
        if prices is not None:
            warnings += prices.warnings
            await run_in_threadpool(save_prices, prices, prices_name, user.id)
            updated.append("prices")
        if inventory is not None:
            await run_in_threadpool(save_inventory, inventory, sucursal, inventory_name, user.id)
            updated.append("inventory")

        summary = await run_in_threadpool(fetch_summary, sucursal)
        if summary["inventory_without_price"]:
            warnings.append(f"{summary['inventory_without_price']} artículos en existencia no tienen precio en la lista actual.")
        return ImportResponse(status="success", updated=updated, summary=summary, warnings=warnings, metadata=metadata)
    except HTTPException:
        raise
    except FileProcessingError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except DatabaseNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Error inesperado importando archivos")
        raise HTTPException(
            status_code=500,
            detail="No fue posible guardar la información. Intenta de nuevo.",
        ) from exc
