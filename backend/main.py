from __future__ import annotations

import logging
from typing import Annotated

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from processing import FileProcessingError, ReconciliationResult, reconcile_files

logger = logging.getLogger(__name__)

app = FastAPI(title="PECARSYS Llantas API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ReconciliationResponse(BaseModel):
    status: str
    summary: dict[str, int]
    warnings: list[str]
    metadata: dict[str, str | None]
    records: list[dict]


@app.get("/")
def read_root() -> dict[str, str]:
    return {"status": "online", "message": "API de Llantas funcionando"}


@app.post("/api/v1/process-excel", response_model=ReconciliationResponse)
async def process_excel_files(
    inventory_file: Annotated[UploadFile, File(...)],
    prices_file: Annotated[UploadFile, File(...)],
) -> ReconciliationResponse:
    try:
        inventory_contents = await inventory_file.read()
        prices_contents = await prices_file.read()
        result: ReconciliationResult = reconcile_files(
            inventory_contents,
            inventory_file.filename or "inventario",
            prices_contents,
            prices_file.filename or "precios",
        )
        return ReconciliationResponse(
            status="success",
            summary=result.summary,
            warnings=result.warnings,
            metadata=result.metadata,
            records=result.records,
        )
    except FileProcessingError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Error inesperado procesando archivos")
        raise HTTPException(
            status_code=500,
            detail="No fue posible procesar los archivos.",
        ) from exc
