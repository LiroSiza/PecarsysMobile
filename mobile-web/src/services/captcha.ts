// Llave pública de Cloudflare Turnstile. Sin ella el CAPTCHA queda desactivado (desarrollo local).
export const TURNSTILE_SITE_KEY: string | undefined = import.meta.env.VITE_TURNSTILE_SITE_KEY || undefined
