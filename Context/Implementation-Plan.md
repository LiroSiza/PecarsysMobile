# Plan de Implementación — PECARSYS Móvil

Complementa a [Technical-Specifications.md](Technical-Specifications.md). Orden de trabajo: **base de datos → usuarios y roles → despliegue**.

## Estado actual (v0.1)

- [x] Análisis de fuentes (Excel con macros, reporte ERP, lista de precios multi-pestaña).
- [x] Backend FastAPI: lectura de `.xlsx/.xlsm/.xls/.csv`, detección de encabezados, todas las pestañas de precios, normalización de códigos (ceros a la izquierda), escalones/precio único, avisos de duplicados e inválidos, detección de archivos invertidos.
- [x] Frontend PWA: importación en 2 pasos, resumen de carga, buscador en vivo, tarjeta con disponible y escalones.
- [ ] Los datos sólo viven en el navegador (localStorage) y la API no tiene autenticación.

---

## Fase 1 — Base de datos (Supabase)

**Arquitectura de acceso**

| Operación | Quién | Cómo |
|---|---|---|
| Escribir (importaciones) | Backend FastAPI | Llave secreta / `service_role` (omite RLS). Nunca en el frontend. |
| Leer (consultas) | Frontend | Cliente Supabase con llave pública + sesión; RLS sólo permite usuarios activos. |
| Buscar | Celular | Descarga los ~3,000 registros una vez y filtra localmente (instantáneo, como el Excel). |

**Reglas de datos**

- **Existencias = foto completa por sucursal.** El reporte ERP sólo trae existencias positivas, así que cada carga **reemplaza** todo el inventario de esa sucursal (lo que no viene, quedó en 0). Operación atómica en una función SQL.
- **Precios = upsert.** Nunca se borra el catálogo; los códigos sin precio hoy conservan su registro y, si llegan después, se guardan.
- Precios ausentes = `NULL` (no 0).
- Cada carga queda registrada en `import_log`.

**Tareas**

- [x] Migración SQL: `profiles`, `catalog`, `inventory`, `inventory_snapshots`, `import_log`, vista `product_search`, funciones de importación, trigger de perfiles y políticas RLS → `supabase/migrations/`.
- [x] Backend: configuración por `.env`, cliente Supabase, endpoint `POST /api/v1/import` que valida y guarda.
- [x] Ejecutar las migraciones en el SQL Editor (esquema + permisos de la Data API) y probar una importación real: 2,777 precios, 454 existencias, 339 coincidencias, ~5 s; reimportar no duplica.
- [x] Carga independiente: existencias, precios o ambos; se valida todo antes de guardar y el resumen se calcula desde la base.

## Fase 2 — Usuarios y roles

- [x] Supabase Auth (correo + contraseña). Registro crea perfil `vendedor` con `is_active = false` (trigger ya incluido en la migración).
- [x] Frontend: pantallas de inicio de sesión, registro y "cuenta pendiente de aprobación".
- [ ] Primer administrador (torresreyes005@gmail.com): registrarse en la app y luego `update profiles set role = 'admin', is_active = true where email = 'torresreyes005@gmail.com';`
- [x] Panel de administración: listar usuarios, aprobar / bloquear, cambiar rol.
- [x] Backend: validar el JWT en `/api/v1/import` y exigir `admin` activo; la bitácora registra quién importó.
- [x] Frontend: leer `product_search` desde Supabase (paginado de 1,000 en 1,000), con caché para uso sin señal que se borra al cerrar sesión.
- [ ] Configurar en Supabase > Authentication > URL Configuration el *Site URL* (local: `http://localhost:5173`; luego el dominio de Vercel).
- [ ] Probar con la llave pública: registro, aprobación, consulta, importación y que un usuario sin aprobar no vea datos.
- [ ] (Posterior) Visibilidad del precio Especial por rol mediante una vista.

### Seguridad de acceso (ver [Security-Review.md](Security-Review.md))

- [x] Política de contraseñas (12+, mayúsculas, minúsculas, números), recuperación y cambio de contraseña.
- [x] MFA (TOTP) obligatorio para administradores, opcional para vendedores; exigido en backend y RLS.
- [x] Caché borrada al bloquear, límite de 20 MB, protección del último administrador.
- [ ] Ejecutar migración `20261008000000_security_hardening.sql` y ajustar el panel de Supabase.
- [ ] SMTP propio (necesario antes de dar acceso a vendedores reales).
- [ ] CAPTCHA (Turnstile) y encabezados de seguridad, junto con el despliegue.

## Fase 3 — Despliegue

| Pieza | Servicio | Variables de entorno |
|---|---|---|
| Frontend | Vercel | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_API_BASE_URL` |
| Backend | Render (plan gratis se duerme ~50 s; Railway ≈ USD 5/mes si molesta) | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CORS_ORIGINS`, `DEFAULT_SUCURSAL` |
| Base de datos | Supabase | — |

- [x] Íconos PWA (192, 512, maskable, apple-touch, favicon) y manifiesto en español.
- [x] Backend listo para producción: `render.yaml`, dependencias fijas, `/docs` oculto, encabezados de seguridad, CORS restringido.
- [x] Frontend: `vercel.json` con CSP estricta y encabezados de seguridad; CAPTCHA Turnstile (se activa con `VITE_TURNSTILE_SITE_KEY`).
- [ ] Desplegar siguiendo [Deployment-Guide.md](Deployment-Guide.md).
- [x] Depurar `requirements.txt` (sin `pdfplumber`; versiones fijas).
- [ ] Pruebas en Android e iOS: instalación en pantalla de inicio, búsqueda, importación.

## Necesario del cliente

1. Proyecto Supabase creado (URL y llaves).
2. Cuentas de Vercel y Render conectadas al repositorio de GitHub.
3. Correo del primer administrador.
