import { useAuth } from '../services/auth'
import AuthShell from './AuthShell'
import ChangePasswordForm from './ChangePasswordForm'

// Se muestra al abrir el enlace de "¿Olvidaste tu contraseña?".
export default function RecoveryScreen() {
  const { finishRecovery } = useAuth()
  return (
    <AuthShell>
      <h2 className="text-lg font-bold text-slate-900">Define tu nueva contraseña</h2>
      <p className="mb-4 mt-1 text-sm text-slate-600">Elige una contraseña que no uses en otros sitios.</p>
      <ChangePasswordForm submitLabel="Guardar contraseña" onDone={finishRecovery} />
    </AuthShell>
  )
}
