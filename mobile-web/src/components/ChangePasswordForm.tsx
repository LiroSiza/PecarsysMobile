import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { isStrongPassword, translateAuthError } from '../services/password'
import { supabase } from '../services/supabase'
import PasswordInput from './PasswordInput'

interface ChangePasswordFormProps {
  submitLabel: string
  onDone: () => void
}

export default function ChangePasswordForm({ submitLabel, onDone }: ChangePasswordFormProps) {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  // Con "Secure password change" activo, Supabase pide un código enviado al correo
  // si la sesión no es reciente.
  const [needsNonce, setNeedsNonce] = useState(false)
  const [nonce, setNonce] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    if (!isStrongPassword(password)) return setError('La contraseña no cumple los requisitos de seguridad.')
    if (password !== confirmation) return setError('Las contraseñas no coinciden.')

    setLoading(true)
    const { error: updateError } = await supabase.auth.updateUser(needsNonce ? { password, nonce: nonce.trim() } : { password })
    if (updateError?.code === 'reauthentication_needed') {
      const { error: reauthError } = await supabase.auth.reauthenticate()
      if (reauthError) setError(translateAuthError(reauthError))
      else setNeedsNonce(true)
    } else if (updateError) {
      setError(translateAuthError(updateError))
    } else {
      // Cierra las sesiones abiertas en otros dispositivos con la contraseña anterior.
      await supabase.auth.signOut({ scope: 'others' })
      setDone(true)
    }
    setLoading(false)
  }

  if (done) {
    return (
      <div className="text-center">
        <CheckCircle2 className="mx-auto text-emerald-600" size={36} />
        <p className="mt-2 font-semibold text-slate-900">Contraseña actualizada</p>
        <p className="mt-1 text-sm text-slate-600">Se cerraron las sesiones abiertas en otros dispositivos.</p>
        <button onClick={onDone} className="mt-4 w-full rounded-xl bg-emerald-600 py-3 font-semibold text-white hover:bg-emerald-500">Continuar</button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <PasswordInput label="Nueva contraseña" value={password} onChange={setPassword} autoComplete="new-password" showRules />
      <PasswordInput label="Confirmar contraseña" value={confirmation} onChange={setConfirmation} autoComplete="new-password" />
      {needsNonce && (
        <label className="block text-sm font-medium text-slate-700">
          Código enviado a tu correo
          <input
            value={nonce}
            onChange={(event) => setNonce(event.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-3 text-center text-lg tracking-widest outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
          />
          <span className="mt-1 block text-xs font-normal text-slate-500">Por seguridad confirmamos que eres tú antes de cambiar la contraseña.</span>
        </label>
      )}
      {error && (
        <p className="flex gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700">
          <AlertTriangle className="shrink-0" size={18} /> {error}
        </p>
      )}
      <button type="submit" disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 font-semibold text-white hover:bg-emerald-500 disabled:opacity-60">
        {loading && <Loader2 className="animate-spin" size={18} />} {submitLabel}
      </button>
    </form>
  )
}
