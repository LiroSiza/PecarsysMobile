import type { AuthError } from '@supabase/supabase-js'

// Debe coincidir con Supabase > Authentication > Providers > Email (validación del servidor).
export const PASSWORD_RULES = [
  { id: 'length', label: 'Al menos 12 caracteres', test: (value: string) => value.length >= 12 },
  { id: 'lower', label: 'Una letra minúscula', test: (value: string) => /[a-z]/.test(value) },
  { id: 'upper', label: 'Una letra mayúscula', test: (value: string) => /[A-Z]/.test(value) },
  { id: 'digit', label: 'Un número', test: (value: string) => /\d/.test(value) },
] as const

export function isStrongPassword(value: string): boolean {
  return PASSWORD_RULES.every((rule) => rule.test(value))
}

const ERRORS_BY_CODE: Record<string, string> = {
  invalid_credentials: 'Correo o contraseña incorrectos.',
  email_not_confirmed: 'Primero confirma tu correo con el enlace que te enviamos.',
  user_already_exists: 'Ya existe una cuenta con ese correo. Inicia sesión.',
  weak_password: 'La contraseña no cumple los requisitos de seguridad.',
  same_password: 'La nueva contraseña debe ser distinta de la actual.',
  over_request_rate_limit: 'Demasiados intentos. Espera unos minutos.',
  over_email_send_rate_limit: 'Se enviaron demasiados correos. Espera unos minutos.',
  mfa_verification_failed: 'Código incorrecto o vencido. Revisa tu app de autenticación.',
  mfa_challenge_expired: 'El código expiró. Intenta de nuevo.',
  reauthentication_not_valid: 'El código de verificación es incorrecto o expiró.',
  session_expired: 'Tu sesión expiró. Vuelve a iniciar sesión.',
  captcha_failed: 'No se pudo completar la verificación de seguridad. Intenta de nuevo.',
}

export function translateAuthError(error: AuthError | Error): string {
  const code = 'code' in error ? error.code : undefined
  if (code && ERRORS_BY_CODE[code]) return ERRORS_BY_CODE[code]
  const message = error.message.toLowerCase()
  if (message.includes('invalid login credentials')) return ERRORS_BY_CODE.invalid_credentials
  if (message.includes('rate limit')) return ERRORS_BY_CODE.over_request_rate_limit
  if (message.includes('password')) return ERRORS_BY_CODE.weak_password
  return 'No fue posible completar la operación. Intenta de nuevo.'
}
