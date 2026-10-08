import { KeyRound, ShieldCheck, ShieldAlert } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '../services/auth'
import ChangePasswordForm from './ChangePasswordForm'
import { MfaEnrollForm } from './Mfa'

export default function AccountPanel() {
  const { profile, assurance, refresh } = useAuth()
  const [changingPassword, setChangingPassword] = useState(false)
  const [enrolling, setEnrolling] = useState(false)
  const mfaActive = assurance.next === 'aal2'

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="font-semibold text-slate-900">{profile?.full_name || 'Sin nombre'}</p>
        <p className="text-sm text-slate-500">{profile?.email}</p>
        <p className="mt-1 text-xs text-slate-400">Rol: {profile?.role === 'admin' ? 'Administrador' : 'Vendedor'}</p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="flex items-center gap-2 font-semibold text-slate-900"><KeyRound size={18} /> Contraseña</h2>
        {changingPassword ? (
          <div className="mt-3">
            <ChangePasswordForm submitLabel="Cambiar contraseña" onDone={() => setChangingPassword(false)} />
          </div>
        ) : (
          <button onClick={() => setChangingPassword(true)} className="mt-3 w-full rounded-xl border border-slate-300 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Cambiar contraseña
          </button>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="flex items-center gap-2 font-semibold text-slate-900">
          {mfaActive ? <ShieldCheck className="text-emerald-600" size={18} /> : <ShieldAlert className="text-amber-600" size={18} />}
          Verificación en dos pasos
        </h2>
        {mfaActive ? (
          <p className="mt-2 text-sm text-slate-600">Activa. Al iniciar sesión se pide el código de tu app de autenticación.</p>
        ) : enrolling ? (
          <div className="mt-3">
            <MfaEnrollForm onVerified={() => { setEnrolling(false); refresh() }} />
          </div>
        ) : (
          <>
            <p className="mt-2 text-sm text-slate-600">Protege tu cuenta aunque alguien conozca tu contraseña.</p>
            <button onClick={() => setEnrolling(true)} className="mt-3 w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500">
              Activar verificación en dos pasos
            </button>
          </>
        )}
      </div>
    </section>
  )
}
