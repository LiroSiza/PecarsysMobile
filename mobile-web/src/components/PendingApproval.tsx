import { Clock, Loader2, LogOut, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '../services/auth'

export default function PendingApproval() {
  const { session, profile, refresh, signOut } = useAuth()
  const [checking, setChecking] = useState(false)

  async function check() {
    setChecking(true)
    await refresh()
    setChecking(false)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl">
        <Clock className="mx-auto text-amber-500" size={40} />
        <h2 className="mt-3 text-lg font-bold text-slate-900">Cuenta pendiente de aprobación</h2>
        <p className="mt-2 text-sm text-slate-600">
          Tu cuenta <strong>{profile?.email ?? session?.user.email}</strong> se creó correctamente. Un administrador debe
          autorizar tu acceso antes de que puedas consultar existencias y precios.
        </p>
        <button onClick={check} disabled={checking} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 font-semibold text-white hover:bg-emerald-500 disabled:opacity-60">
          {checking ? <Loader2 className="animate-spin" size={18} /> : <RefreshCw size={18} />} Ya me aprobaron
        </button>
        <button onClick={signOut} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm text-slate-600 hover:bg-slate-100">
          <LogOut size={16} /> Cerrar sesión
        </button>
      </div>
    </div>
  )
}
