import { ShieldCheck } from 'lucide-react'
import type { ReactNode } from 'react'

// Marco común de las pantallas previas a entrar a la app (acceso, MFA, recuperación).
export default function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-900 px-4 py-10">
      <div className="mb-6 flex items-center gap-2 text-white">
        <ShieldCheck className="text-emerald-400" size={28} />
        <div>
          <strong className="text-xl">PECARSYS Móvil</strong>
          <span className="block text-xs text-slate-400">Existencias y precios de llantas</span>
        </div>
      </div>
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">{children}</div>
    </div>
  )
}
