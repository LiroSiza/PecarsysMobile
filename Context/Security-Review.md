# Análisis de Seguridad — Inicio de Sesión y Contraseñas

Fecha: 2026-10-08 · Alcance: Supabase Auth, frontend (PWA), backend (FastAPI), base de datos (RLS).
Objetivo: nivel de seguridad **alto** para información comercial confidencial (precios y existencias).

## 1. Lo que ya está bien

| Control | Estado |
|---|---|
| Contraseñas | Las gestiona Supabase Auth (hash bcrypt). Ni el backend ni la base de la app las ven. |
| Aprobación manual | Toda cuenta nueva nace `vendedor` + `is_active = false` (trigger). El rol no se puede elegir al registrarse. |
| Escalamiento de privilegios | Un usuario no puede modificar su propio perfil; sólo un admin activo cambia `role` / `is_active` (RLS + permisos por columna). |
| Acceso a datos | RLS en todas las tablas. Verificado: sin sesión, la llave pública recibe *permission denied* en tablas, vista y funciones. |
| Bloqueo inmediato | RLS consulta `is_active` en cada petición: un usuario bloqueado deja de ver datos al instante, aunque su sesión siga viva. |
| Importación | El backend valida la sesión contra Supabase Auth en cada petición y exige admin activo; registra quién importó. |
| Llave secreta | Sólo en `backend/.env` (ignorado por git). El frontend usa la llave pública. |
| Enumeración de cuentas | El inicio de sesión responde un mensaje genérico ("Correo o contraseña incorrectos"). |
| Caché local | Se borra al cerrar sesión. |
| Confirmación de correo | Activa: ambas cuentas actuales tienen el correo confirmado. |

## 2. Hallazgos

| # | Severidad | Hallazgo | Dónde |
|---|---|---|---|
| H1 | **Alta** | **Sin segundo factor (MFA).** Una contraseña robada o reutilizada da acceso total al administrador (importar, aprobar usuarios, cambiar roles). | Supabase + app |
| H2 | **Alta** | **Política de contraseñas débil.** El formulario acepta 6 caracteres; Supabase por defecto también. | Supabase + `AuthScreen.tsx` |
| H3 | **Alta** | **El correo de Supabase sólo llega a miembros de tu organización** (máx. ~2 correos/hora). Los vendedores reales no recibirán la confirmación de su cuenta. | Supabase |
| H4 | Media | **No hay recuperación de contraseña.** Sin ella, los usuarios tienden a compartir o anotar contraseñas, o se crean cuentas nuevas. | App |
| H5 | Media | **Sin CAPTCHA** en registro, inicio de sesión y recuperación: permite ataques automatizados (fuerza bruta, registro masivo). Supabase sólo limita por IP. | Supabase + app |
| H6 | Media | **Sesiones sin límite de duración.** La sesión se renueva indefinidamente; un teléfono perdido sigue con acceso. Límite por tiempo / inactividad requiere plan Pro. | Supabase |
| H7 | Media | **El token de sesión se guarda en `localStorage`.** Un XSS podría robarlo. Hoy no hay vectores conocidos (React escapa el texto), pero falta una política CSP. | Despliegue |
| H8 | Baja | Un usuario bloqueado conserva la caché de precios en su teléfono hasta que cierre sesión. | `App.tsx` |
| H9 | Baja | El backend no limita el tamaño de los archivos subidos. | `main.py` |
| H10 | Baja | Un admin puede quitar el rol al último admin activo (bloqueo de administración). | RLS |

## 3. Recomendaciones

### En el código (las implemento yo)

1. **MFA obligatorio para administradores (TOTP: Google Authenticator, Microsoft Authenticator, 1Password…).** Gratis en Supabase.
   - Al iniciar sesión, un admin sin MFA debe enrolarlo (código QR) antes de entrar; con MFA, pide el código de 6 dígitos.
   - **Exigido en el servidor, no sólo en pantalla:** el backend rechaza importaciones sin nivel `aal2` y las políticas RLS de administración (usuarios, bitácora) también lo exigen.
   - Opcional para vendedores (se puede volver obligatorio después).
2. **Política de contraseñas en el formulario:** mínimo 12 caracteres con mayúsculas, minúsculas y números, con indicador en vivo de los requisitos.
3. **Recuperación de contraseña:** "¿Olvidaste tu contraseña?" → correo → pantalla para definir una nueva (misma política). Respuesta idéntica exista o no el correo.
4. **Cambio de contraseña** desde la app, con reautenticación.
5. **CAPTCHA (Cloudflare Turnstile, gratis e invisible)** en registro, inicio de sesión y recuperación.
6. **Borrar la caché** en cuanto se detecta que la cuenta fue bloqueada (H8); límite de 20 MB por archivo (H9); impedir dejar el sistema sin administradores activos (H10).
7. **Encabezados de seguridad en el despliegue** (CSP, HSTS, `X-Frame-Options`, `Referrer-Policy`) en Vercel (H7).

### En el panel de Supabase (los configuras tú; te doy la guía paso a paso)

| Ajuste | Dónde | Valor | Plan |
|---|---|---|---|
| Longitud mínima y requisitos | Authentication → Providers → Email | 12; minúsculas, mayúsculas y dígitos | Gratis |
| Confirmar correo | Authentication → Providers → Email | Activado (ya) | Gratis |
| Cambio de correo y contraseña seguros | Authentication → Providers → Email | *Secure email change* y *Secure password change* activados | Gratis |
| SMTP propio (H3) | Authentication → Emails → SMTP | Resend / Amazon SES / SendGrid con tu dominio | Gratis (el proveedor tiene capa gratis) |
| CAPTCHA | Authentication → Attack Protection | Turnstile + llave secreta | Gratis |
| URLs de redirección | Authentication → URL Configuration | Sólo `localhost:5173` y el dominio de Vercel | Gratis |
| MFA TOTP | Authentication → Multi-Factor | Habilitado | Gratis |
| Protección de contraseñas filtradas (HaveIBeenPwned) | Authentication → Attack Protection | Activado | **Pro** |
| Límite de sesión / inactividad / sesión única | Authentication → Sessions | p. ej. 7 días / 24 h | **Pro** |

**Plan Pro (USD 25/mes):** recomendable para "alta seguridad" por contraseñas filtradas y caducidad de sesiones. Sin Pro, el MFA para administradores y el bloqueo inmediato por RLS cubren el riesgo principal.

## 4. Estado de implementación (2026-10-08)

| Hallazgo | Estado |
|---|---|
| H1 MFA | ✅ Código: obligatorio para admins (pantalla de alta con QR), opcional para vendedores (Cuenta). Exigido en backend (`aal2` para importar) y en RLS (`is_admin`, `is_active_user`). Requiere migración `20261008000000_security_hardening.sql`. |
| H2 Contraseñas | ✅ Formulario: 12+ con mayúsculas, minúsculas y números. ⏳ Falta igualar la política en el panel de Supabase (validación del servidor). |
| H4 Recuperación | ✅ "¿Olvidaste tu contraseña?" + pantalla de nueva contraseña; cambio desde Cuenta con reautenticación por código; al cambiarla se cierran las demás sesiones. |
| H8 Caché | ✅ Se borra al detectar cuenta bloqueada o pendiente. |
| H9 Archivos | ✅ Máximo 20 MB por archivo. |
| H10 Último admin | ✅ Trigger en la base impide bloquear o degradar al último admin activo. |
| H3 SMTP | ✅ SMTP propio configurado. |
| H5 CAPTCHA | ✅ Turnstile en inicio de sesión, registro y recuperación; verificado que Supabase rechaza peticiones sin token (`captcha_failed`). |
| H7 Encabezados | ✅ CSP estricta (sin scripts en línea), HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` en Vercel; equivalentes en el backend. |
| H6 Sesiones | ⏳ Requiere plan Pro. |

**Si un administrador pierde su teléfono:** otro admin no puede quitarle el MFA desde la app. Se elimina el factor desde Supabase > Authentication > Users > (usuario) > *Remove MFA factors*, y al volver a entrar se le pedirá dar de alta uno nuevo.

## 5. Orden propuesto

1. Política de contraseñas + recuperación + cambio de contraseña (H2, H4).
2. MFA obligatorio para administradores, exigido en backend y RLS (H1).
3. Ajustes pequeños H8, H9, H10.
4. SMTP propio (H3) — **necesario antes de dar acceso a vendedores reales**.
5. CAPTCHA (H5) y encabezados de seguridad (H7) junto con el despliegue.
6. Plan Pro: contraseñas filtradas y sesiones (H6), si se aprueba el costo.

## Referencias

- [Password security — Supabase](https://supabase.com/docs/guides/auth/password-security)
- [User sessions — Supabase](https://supabase.com/docs/guides/auth/sessions)
- [Send emails with custom SMTP — Supabase](https://supabase.com/docs/guides/auth/auth-smtp)
- [Production Checklist — Supabase](https://supabase.com/docs/guides/deployment/going-into-prod)
