import { AlertTriangle, KeyRound, Loader2, LogOut, Smartphone } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from '../services/auth'
import { translateAuthError } from '../services/password'
import { supabase } from '../services/supabase'
import AuthShell from './AuthShell'

interface Enrollment {
  factorId: string
  qrCode: string
  secret: string
}

// Alta de la app de autenticación (TOTP). Reutilizable dentro y fuera de la app.
export function MfaEnrollForm({ onVerified }: { onVerified: () => void }) {
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null)
  const [error, setError] = useState<string | null>(null)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    ;(async () => {
      // Limpia altas que quedaron sin terminar (p. ej. si se cerró la app a medio proceso).
      const { data: factors } = await supabase.auth.mfa.listFactors()
      for (const factor of factors?.all ?? []) {
        if (factor.factor_type === 'totp' && factor.status === 'unverified') {
          await supabase.auth.mfa.unenroll({ factorId: factor.id })
        }
      }
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: `PECARSYS ${new Date().toISOString().slice(0, 16)}`,
      })
      if (enrollError) setError(translateAuthError(enrollError))
      else setEnrollment({ factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret })
    })()
  }, [])

  if (error) return <ErrorMessage message={error} />
  if (!enrollment) return <div className="flex justify-center p-6 text-slate-500"><Loader2 className="animate-spin" /></div>

  return (
    <div className="space-y-3">
      <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-600">
        <li>Instala una app de autenticación (Google Authenticator, Microsoft Authenticator o 1Password).</li>
        <li>Escanea este código QR con la app.</li>
        <li>Escribe el código de 6 dígitos que muestra la app.</li>
      </ol>
      <img src={enrollment.qrCode} alt="Código QR para la app de autenticación" className="mx-auto h-48 w-48 rounded-xl border border-slate-200 bg-white p-2" />
      <details className="text-xs text-slate-500">
        <summary className="cursor-pointer">¿No puedes escanear? Usa esta clave</summary>
        <code className="mt-1 block break-all rounded-lg bg-slate-100 p-2 text-slate-700">{enrollment.secret}</code>
      </details>
      <CodeForm factorId={enrollment.factorId} submitLabel="Activar verificación" onVerified={onVerified} />
    </div>
  )
}

function CodeForm({ factorId, submitLabel, onVerified }: { factorId: string; submitLabel: string; onVerified: () => void }) {
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError(null)
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.trim() })
    setLoading(false)
    if (verifyError) {
      setError(translateAuthError(verifyError))
      setCode('')
    } else {
      onVerified()
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <input
        value={code}
        onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="000000"
        aria-label="Código de 6 dígitos"
        autoFocus
        className="w-full rounded-xl border border-slate-300 px-3 py-3 text-center text-2xl tracking-[0.5em] outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
      />
      {error && <ErrorMessage message={error} />}
      <button type="submit" disabled={loading || code.length !== 6} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 font-semibold text-white hover:bg-emerald-500 disabled:opacity-50">
        {loading && <Loader2 className="animate-spin" size={18} />} {submitLabel}
      </button>
    </form>
  )
}

// Alta obligatoria para administradores que aún no tienen segundo factor.
export function MfaEnrollScreen() {
  const { refresh, signOut } = useAuth()
  return (
    <AuthShell>
      <Smartphone className="text-emerald-600" size={32} />
      <h2 className="mt-2 text-lg font-bold text-slate-900">Activa la verificación en dos pasos</h2>
      <p className="mb-4 mt-1 text-sm text-slate-600">
        Las cuentas de administrador requieren un código de tu teléfono además de la contraseña.
      </p>
      <MfaEnrollForm onVerified={refresh} />
      <SignOutLink onClick={signOut} />
    </AuthShell>
  )
}

// Pide el código a quien ya tiene segundo factor.
export function MfaChallengeScreen() {
  const { refresh, signOut } = useAuth()
  const [factorId, setFactorId] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.mfa.listFactors().then(({ data }) => setFactorId(data?.totp[0]?.id ?? null))
  }, [])

  return (
    <AuthShell>
      <KeyRound className="text-emerald-600" size={32} />
      <h2 className="mt-2 text-lg font-bold text-slate-900">Verificación en dos pasos</h2>
      <p className="mb-4 mt-1 text-sm text-slate-600">Escribe el código de 6 dígitos de tu app de autenticación.</p>
      {factorId ? <CodeForm factorId={factorId} submitLabel="Verificar" onVerified={refresh} /> : <div className="flex justify-center p-4 text-slate-500"><Loader2 className="animate-spin" /></div>}
      <SignOutLink onClick={signOut} />
    </AuthShell>
  )
}

function SignOutLink({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="mt-4 flex w-full items-center justify-center gap-2 py-2 text-sm text-slate-600 hover:underline">
      <LogOut size={14} /> Cerrar sesión
    </button>
  )
}

function ErrorMessage({ message }: { message: string }) {
  return (
    <p className="flex gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700">
      <AlertTriangle className="shrink-0" size={18} /> {message}
    </p>
  )
}
