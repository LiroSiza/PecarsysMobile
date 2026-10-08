import { createClient } from '@supabase/supabase-js'

// Se acepta también la URL de la API REST (…supabase.co/rest/v1/).
const url = (import.meta.env.VITE_SUPABASE_URL ?? '').trim().replace(/\/+$/, '').replace(/\/rest\/v1$/, '')
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

export const supabaseConfigured = Boolean(url && publishableKey)

export interface AuthRedirect {
  // El usuario llegó desde el enlace de "¿Olvidaste tu contraseña?".
  recovery: boolean
  // Código de error de Supabase (p. ej. otp_expired si el enlace expiró o ya se usó).
  errorCode: string | null
}

// Se lee antes de crear el cliente: supabase-js limpia la URL al procesar el enlace
// y el evento PASSWORD_RECOVERY puede emitirse antes de que React se suscriba.
function readAuthRedirect(): AuthRedirect {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const query = new URLSearchParams(window.location.search)
  const errorCode = params.get('error_code') ?? query.get('error_code') ?? (params.get('error') || query.get('error'))
  if (errorCode) window.history.replaceState(null, '', window.location.pathname)
  return { recovery: params.get('type') === 'recovery', errorCode }
}

export const authRedirect = readAuthRedirect()

// Con la configuración incompleta la app muestra un aviso en lugar de fallar al cargar.
export const supabase = createClient(url || 'http://localhost', publishableKey || 'missing-key')
