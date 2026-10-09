# Guía de Despliegue — PECARSYS Móvil

Orden obligatorio: **Render (backend) → Vercel (frontend) → Render (CORS) → Supabase (URLs) → Cloudflare (CAPTCHA) → pruebas**.
Cada servicio necesita la dirección del otro; seguir el orden evita errores de CORS y de redirección.

> **Secretos:** la llave secreta de Supabase (`sb_secret_…`) y la secreta de Turnstile sólo se capturan en los paneles de Render y Supabase. Nunca en Vercel, en el repositorio ni en el chat.

---

## 0. Antes de empezar

1. Haz commit y push de todos los cambios a GitHub (rama `main`).
2. Ten a mano: llave secreta de Supabase (está en `backend/.env`) y llave pública (en `mobile-web/.env.local`).

## 1. Backend en Render

1. Render → **New → Blueprint** → elige el repositorio. Render lee `render.yaml` y propone el servicio **pecarsys-api**.
2. Te pedirá los valores secretos:
   - `SUPABASE_SERVICE_ROLE_KEY`: la llave secreta (`sb_secret_…`).
   - `CORS_ORIGINS`: por ahora `https://pecarsys-mobile.vercel.app` (se corrige en el paso 3 si Vercel asigna otro dominio).
3. **Apply**. Espera a que el despliegue termine (*Live*).
4. Anota la URL del servicio, p. ej. `https://pecarsys-api.onrender.com`, y verifica en el navegador:
   - `https://…onrender.com/` → `{"status":"online", …}`
   - `https://…onrender.com/docs` → **404** (en producción la documentación está oculta).
5. **Si la URL no es exactamente `https://pecarsys-api.onrender.com`**, avísame: hay que actualizarla en `mobile-web/vercel.json` (política CSP, `connect-src`) antes del paso 2.

## 2. Frontend en Vercel

1. Vercel → **Add New → Project** → importa el repositorio.
2. **Root Directory:** `mobile-web` · Framework: **Vite** (se detecta solo; `vercel.json` ya define build y salida).
3. **Environment Variables** (Production):

   | Variable | Valor |
   |---|---|
   | `VITE_API_BASE_URL` | URL de Render del paso 1 (sin `/` final) |
   | `VITE_SUPABASE_URL` | `https://dveissdkttqrgkuwmsdu.supabase.co` |
   | `VITE_SUPABASE_PUBLISHABLE_KEY` | llave pública `sb_publishable_…` |

4. **Deploy**. Anota el dominio de producción, p. ej. `https://pecarsys-mobile.vercel.app`.
   - Si quieres ese nombre exacto, en *Settings → Domains* puedes ajustar el subdominio `.vercel.app`.

## 3. CORS en Render

1. Render → pecarsys-api → **Environment** → `CORS_ORIGINS` = dominio exacto de Vercel (con `https://`, sin `/` final).
2. Guarda: Render vuelve a desplegar solo.

## 4. URLs en Supabase

Authentication → **URL Configuration**:
- **Site URL:** el dominio de Vercel.
- **Redirect URLs:** agrega `https://<tu-dominio>.vercel.app/**` y conserva `http://localhost:5173/**` para desarrollo.

## 5. CAPTCHA (Cloudflare Turnstile)

El orden importa: **primero el frontend, después Supabase**. Si se activa en Supabase antes, nadie podrá iniciar sesión.

1. Cloudflare → **Turnstile → Add widget**:
   - Nombre: `PECARSYS Móvil`.
   - Hostnames: el dominio de Vercel y `localhost`.
   - Modo: **Managed**.
   - Copia la **Site Key** (pública) y la **Secret Key**.
2. Vercel → Environment Variables → `VITE_TURNSTILE_SITE_KEY` = Site Key → **Redeploy**.
   - Para desarrollo local, agrégala también en `mobile-web/.env.local`.
3. Comprueba que el inicio de sesión en Vercel sigue funcionando.
4. Supabase → Authentication → **Attack Protection** → *Enable CAPTCHA protection* → proveedor **Turnstile** → pega la **Secret Key** → Save.
5. Vuelve a probar inicio de sesión, registro y "¿Olvidaste tu contraseña?".

## 6. Pruebas en el celular

- **Android (Chrome):** abre el dominio de Vercel → menú ⋮ → **Instalar aplicación**.
- **iPhone (Safari):** abre el dominio → botón Compartir → **Agregar a inicio**.
- Verifica: inicio de sesión con código de 2 pasos (admin), búsqueda, importación de existencias, cierre de sesión.

## 7. Verificación de seguridad

- Encabezados del frontend: https://securityheaders.com con el dominio de Vercel (objetivo: calificación **A**).
- Backend: `/docs` y `/openapi.json` deben responder 404.
- Desde otra cuenta sin aprobar: no debe ver existencias ni precios.

## Notas de operación

- **Render plan gratis:** el backend se duerme tras ~15 min sin uso; la primera importación puede tardar ~50 s en responder. Sólo afecta a la importación (las consultas van directo a Supabase).
- **Actualizaciones:** cada push a `main` despliega automáticamente en Vercel y Render.
- **Cambios de base de datos:** las migraciones de `supabase/migrations/` se ejecutan a mano en el SQL Editor, en orden.
