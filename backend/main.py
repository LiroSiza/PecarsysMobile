from __future__ import annotations

import logging
from typing import Annotated

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from auth import CurrentUser, require_admin
from config import get_settings
from db import DatabaseNotConfiguredError, save_import
from processing import FileProcessingError, ReconciliationResult, reconcile_files

logger = logging.getLogger(__name__)

MAX_UPLOAD_BYTES = 20 * 1024 * 1024

app = FastAPI(title="PECARSYS Llantas API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ReconciliationResponse(BaseModel):
    status: str
    summary: dict[str, int]
    warnings: list[str]
    metadata: dict[str, str | None]


@app.get("/")
def read_root() -> dict[str, str]:
    return {"status": "online", "message": "API de Llantas funcionando"}


@app.post("/api/v1/import", response_model=ReconciliationResponse)
async def import_files(
    inventory_file: Annotated[UploadFile, File(...)],
    prices_file: Annotated[UploadFile, File(...)],
    user: Annotated[CurrentUser, Depends(require_admin)],
) -> ReconciliationResponse:
    inventory_filename = inventory_file.filename or "inventario"
    prices_filename = prices_file.filename or "precios"
    for upload in (inventory_file, prices_file):
        if upload.size is not None and upload.size > MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=413, detail=f"'{upload.filename}' excede el máximo de 20 MB.")
    try:
        result: ReconciliationResult = await run_in_threadpool(
            reconcile_files,
            await inventory_file.read(),
            inventory_filename,
            await prices_file.read(),
            prices_filename,
        )
        sucursal = result.metadata.get("sucursal")
        if not sucursal:
            sucursal = get_settings().default_sucursal
            result.metadata["sucursal"] = sucursal
            result.warnings.append(
                f"El reporte de existencias no indica sucursal; se usó {sucursal}."
            )
        await run_in_threadpool(save_import, result, sucursal, inventory_filename, prices_filename, user.id)
        return ReconciliationResponse(
            status="success",
            summary=result.summary,
            warnings=result.warnings,
            metadata=result.metadata,
        )
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
