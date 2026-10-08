from __future__ import annotations

import base64
import json
from dataclasses import dataclass
from typing import Annotated

import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from config import get_settings
from db import get_client

bearer = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class CurrentUser:
    id: str
    email: str
    role: str


def _fetch_auth_user(token: str) -> dict:
    """Valida el JWT de la sesión contra Supabase Auth."""
    settings = get_settings()
    try:
        response = httpx.get(
            f"{settings.supabase_url}/auth/v1/user",
            headers={"apikey": settings.supabase_service_role_key or "", "Authorization": f"Bearer {token}"},
            timeout=10,
        )
    except httpx.HTTPError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "No fue posible validar la sesión.") from exc
    if response.status_code != 200:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Tu sesión expiró. Vuelve a iniciar sesión.")
    return response.json()


def _assurance_level(token: str) -> str:
    """Nivel de autenticación del JWT (aal1 = contraseña, aal2 = con segundo factor).

    Sólo se lee después de que Supabase Auth validó el token en _fetch_auth_user.
    """
    try:
        payload = token.split(".")[1]
        claims = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
    except (IndexError, ValueError):
        return "aal1"
    return claims.get("aal", "aal1")


def require_admin(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
) -> CurrentUser:
    if credentials is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Inicia sesión para continuar.")
    user = _fetch_auth_user(credentials.credentials)
    if _assurance_level(credentials.credentials) != "aal2":
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Los administradores deben verificar su segundo factor para importar.",
        )
    profile = (
        get_client().table("profiles").select("role, is_active").eq("id", user["id"]).maybe_single().execute()
    )
    data = profile.data if profile else None
    if not data or not data["is_active"] or data["role"] != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Sólo un administrador activo puede actualizar la información.")
    return CurrentUser(id=user["id"], email=user.get("email", ""), role=data["role"])
