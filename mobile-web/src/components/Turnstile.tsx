import { useEffect, useRef } from 'react'
import { TURNSTILE_SITE_KEY } from '../services/captcha'

// CAPTCHA de Cloudflare. Supabase valida el token del lado del servidor
// (Authentication > Attack Protection), así que no se puede saltar desde el navegador.

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

interface TurnstileApi {
  render: (container: HTMLElement, options: Record<string, unknown>) => string
  remove: (widgetId: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

let scriptPromise: Promise<TurnstileApi> | null = null

function loadTurnstile(): Promise<TurnstileApi> {
  scriptPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SCRIPT_URL
    script.async = true
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('Turnstile no disponible')))
    script.onerror = () => {
      scriptPromise = null
      reject(new Error('No se pudo cargar la verificación de seguridad'))
    }
    document.head.appendChild(script)
  })
  return scriptPromise
}

interface TurnstileProps {
  onToken: (token: string | null) => void
}

// Cada token sirve una sola vez: el formulario vuelve a montar el widget (cambiando su `key`)
// después de cada intento.
export default function Turnstile({ onToken }: TurnstileProps) {
  const container = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return
    let widgetId: string | null = null
    let cancelled = false
    loadTurnstile()
      .then((turnstile) => {
        if (cancelled || !container.current) return
        widgetId = turnstile.render(container.current, {
          sitekey: TURNSTILE_SITE_KEY,
          language: 'es',
          appearance: 'interaction-only',
          size: 'flexible',
          callback: (token: string) => onToken(token),
          'expired-callback': () => onToken(null),
          'error-callback': () => onToken(null),
        })
      })
      .catch(() => onToken(null))
    return () => {
      cancelled = true
      if (widgetId) window.turnstile?.remove(widgetId)
    }
  }, [onToken])

  return TURNSTILE_SITE_KEY ? <div ref={container} /> : null
}
