import { AlertTriangle, Loader2, MailCheck } from 'lucide-react'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { isStrongPassword, translateAuthError } from '../services/password'
import { TURNSTILE_SITE_KEY } from '../services/captcha'
import { authRedirect, supabase } from '../services/supabase'
import AuthShell from './AuthShell'
import PasswordInput from './PasswordInput'
import Turnstile from './Turnstile'

type Mode = 'login' | 'register' | 'forgot'

const REDIRECT_ERRORS: Record<string, string> = {
  otp_expired: 'El enlace expiró o ya fue usado. Si pediste varios correos, sólo funciona el más reciente. Solicita uno nuevo.',
  access_denied: 'El enlace no es válido. Solicita uno nuevo.',
}

const redirectError = authRedirect.errorCode
  ? REDIRECT_ERRORS[authRedirect.errorCode] ?? 'El enlace no es válido. Solicita uno nuevo.'
  : null

export default function AuthScreen() {
  // Un enlace de correo inválido casi siempre viene de "¿Olvidaste tu contraseña?".
  const [mode, setMode] = useState<Mode>(authRedirect.recovery || redirectError ? 'forgot' : 'login')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(redirectError)
  const [notice, setNotice] = useState<{ title: string; body: string } | null>(null)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [captchaKey, setCaptchaKey] = useState(0)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    const cleanEmail = email.trim()
    if (mode === 'register' && !isStrongPassword(password)) {
      setError('La contraseña no cumple los requisitos de seguridad.')
      return
    }
    if (TURNSTILE_SITE_KEY && !captchaToken) {
      setError('Espera a que termine la verificación de seguridad e intenta de nuevo.')
      return
    }
    const captcha = captchaToken ?? undefined

    setLoading(true)
    if (mode === 'login') {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: cleanEmail, password, options: { captchaToken: captcha } })
      if (signInError) setError(translateAuthError(signInError))
    } else if (mode === 'register') {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: { data: { full_name: fullName.trim() }, emailRedirectTo: window.location.origin, captchaToken: captcha },
      })
      if (signUpError) setError(translateAuthError(signUpError))
      else if (!data.session) {
        setNotice({
          title: 'Revisa tu correo',
          body: `Enviamos un enlace de confirmación a ${cleanEmail}. Después de confirmarlo, un administrador debe aprobar tu cuenta.`,
        })
      }
    } else {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(cleanEmail, { redirectTo: window.location.origin, captchaToken: captcha })
      // Mismo mensaje exista o no la cuenta, para no revelar qué correos están registrados.
      if (resetError && resetError.code?.includes('rate_limit')) setError(translateAuthError(resetError))
      else {
        setNotice({
          title: 'Revisa tu correo',
          body: `Si ${cleanEmail} tiene una cuenta, recibirás un enlace para definir una nueva contraseña.`,
        })
      }
    }
    // El token del CAPTCHA es de un solo uso: se pide uno nuevo para el siguiente intento.
    setCaptchaToken(null)
    setCaptchaKey((key) => key + 1)
    setLoading(false)
  }

  function switchMode(next: Mode) {
    setMode(next)
    setError(null)
    setPassword('')
  }

  if (notice) {
    return (
      <AuthShell>
        <div className="text-center">
          <MailCheck className="mx-auto text-emerald-600" size={40} />
          <h2 className="mt-3 text-lg font-bold text-slate-900">{notice.title}</h2>
          <p className="mt-2 text-sm text-slate-600">{notice.body}</p>
          <button onClick={() => { setNotice(null); switchMode('login') }} className="mt-5 w-full rounded-xl bg-emerald-600 py-3 font-semibold text-white hover:bg-emerald-500">
            Ir a iniciar sesión
          </button>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell>
      {mode === 'forgot' ? (
        <div className="mb-4">
          <h2 className="text-lg font-bold text-slate-900">Recuperar contraseña</h2>
          <p className="mt-1 text-sm text-slate-600">Te enviaremos un enlace para definir una nueva contraseña.</p>
        </div>
      ) : (
        <div className="mb-5 grid grid-cols-2 rounded-xl bg-slate-100 p-1 text-sm font-medium">
          <button type="button" onClick={() => switchMode('login')} className={`rounded-lg py-2 ${mode === 'login' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>
            Iniciar sesión
          </button>
          <button type="button" onClick={() => switchMode('register')} className={`rounded-lg py-2 ${mode === 'register' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>
            Crear cuenta
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        {mode === 'register' && (
          <TextField label="Nombre completo" value={fullName} onChange={setFullName} autoComplete="name" />
        )}
        <TextField label="Correo" type="email" value={email} onChange={setEmail} autoComplete="email" />
        {mode !== 'forgot' && (
          <PasswordInput
            label="Contraseña"
            value={password}
            onChange={setPassword}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            showRules={mode === 'register'}
          />
        )}
        <Turnstile key={captchaKey} onToken={setCaptchaToken} />
        {error && (
          <p className="flex gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700">
            <AlertTriangle className="shrink-0" size={18} /> {error}
          </p>
        )}
        <button type="submit" disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-base font-semibold text-white hover:bg-emerald-500 disabled:opacity-60">
          {loading && <Loader2 className="animate-spin" size={18} />}
          {mode === 'login' ? 'Entrar' : mode === 'register' ? 'Crear cuenta' : 'Enviar enlace'}
        </button>
        {mode === 'login' && (
          <button type="button" onClick={() => switchMode('forgot')} className="w-full py-1 text-sm text-slate-600 underline">
            ¿Olvidaste tu contraseña?
          </button>
        )}
        {mode === 'forgot' && (
          <button type="button" onClick={() => switchMode('login')} className="w-full py-1 text-sm text-slate-600 underline">
            Volver a iniciar sesión
          </button>
        )}
        {mode === 'register' && (
          <p className="text-center text-xs text-slate-500">Tu cuenta quedará pendiente hasta que un administrador la apruebe.</p>
        )}
      </form>
    </AuthShell>
  )
}

interface TextFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  autoComplete?: string
}

function TextField({ label, value, onChange, type = 'text', autoComplete }: TextFieldProps) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        required
        className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-3 text-base outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
      />
    </label>
  )
}
