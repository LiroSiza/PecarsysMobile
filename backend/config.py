from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).with_name(".env"))


@dataclass(frozen=True)
class Settings:
    environment: str
    supabase_url: str | None
    supabase_service_role_key: str | None
    cors_origins: list[str]
    default_sucursal: str
    report_utc_offset: str

    @property
    def is_production(self) -> bool:
        return self.environment == "production"


@lru_cache
def get_settings() -> Settings:
    origins = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
    url = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
    # Se acepta también la URL de la API REST (…supabase.co/rest/v1).
    url = url.removesuffix("/rest/v1")
    return Settings(
        environment=os.getenv("ENVIRONMENT", "development").strip().lower(),
        supabase_url=url or None,
        supabase_service_role_key=os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip() or None,
        cors_origins=[origin.strip() for origin in origins.split(",") if origin.strip()],
        default_sucursal=os.getenv("DEFAULT_SUCURSAL", "VERACRUZ").strip().upper(),
        # Hora local de las fechas impresas en el reporte ERP (Veracruz = UTC-6).
        report_utc_offset=os.getenv("REPORT_UTC_OFFSET", "-06:00").strip(),
    )
