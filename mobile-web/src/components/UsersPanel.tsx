import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { supabase } from '../services/supabase'
import type { Profile, UserRole } from '../types/domain'

async function fetchProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data as Profile[]
}

async function updateProfile({ id, changes }: { id: string; changes: Partial<Pick<Profile, 'role' | 'is_active'>> }) {
  const { error } = await supabase.from('profiles').update(changes).eq('id', id)
  if (error) throw new Error(error.message)
}

export default function UsersPanel({ currentUserId }: { currentUserId: string }) {
  const queryClient = useQueryClient()
  const profiles = useQuery({ queryKey: ['profiles'], queryFn: fetchProfiles })
  const mutation = useMutation({
    mutationFn: updateProfile,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['profiles'] }),
  })

  if (profiles.isPending) {
    return <div className="flex justify-center p-8 text-slate-500"><Loader2 className="animate-spin" /></div>
  }
  if (profiles.isError) {
    return <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">No fue posible cargar los usuarios: {profiles.error.message}</p>
  }

  const pending = profiles.data.filter((profile) => !profile.is_active)
  const active = profiles.data.filter((profile) => profile.is_active)

  return (
    <section className="space-y-4">
      {mutation.isError && (
        <p className="flex gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700">
          <AlertTriangle className="shrink-0" size={18} /> No se guardó el cambio: {mutation.error.message}
        </p>
      )}
      <UserGroup title="Pendientes y bloqueados" empty="No hay solicitudes pendientes." profiles={pending} currentUserId={currentUserId} busy={mutation.isPending} onChange={mutation.mutate} />
      <UserGroup title="Usuarios activos" empty="No hay usuarios activos." profiles={active} currentUserId={currentUserId} busy={mutation.isPending} onChange={mutation.mutate} />
    </section>
  )
}

interface UserGroupProps {
  title: string
  empty: string
  profiles: Profile[]
  currentUserId: string
  busy: boolean
  onChange: (input: { id: string; changes: Partial<Pick<Profile, 'role' | 'is_active'>> }) => void
}

function UserGroup({ title, empty, profiles, currentUserId, busy, onChange }: UserGroupProps) {
  return (
    <div>
      <h2 className="mb-2 px-1 text-sm font-semibold uppercase tracking-wide text-slate-500">{title} ({profiles.length})</h2>
      {profiles.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-4 text-center text-sm text-slate-500">{empty}</p>
      ) : (
        <div className="space-y-2">
          {profiles.map((profile) => {
            const isSelf = profile.id === currentUserId
            return (
              <article key={profile.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-900">{profile.full_name || 'Sin nombre'}{isSelf && ' (tú)'}</p>
                    <p className="truncate text-sm text-slate-500">{profile.email}</p>
                    <p className="text-xs text-slate-400">Registro: {new Date(profile.created_at).toLocaleDateString('es-MX')}</p>
                  </div>
                  <select
                    value={profile.role}
                    disabled={busy || isSelf}
                    onChange={(event) => onChange({ id: profile.id, changes: { role: event.target.value as UserRole } })}
                    className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm disabled:opacity-60"
                    aria-label="Rol"
                  >
                    <option value="vendedor">Vendedor</option>
                    <option value="admin">Administrador</option>
                  </select>
                </div>
                {!isSelf && (
                  <button
                    disabled={busy}
                    onClick={() => onChange({ id: profile.id, changes: { is_active: !profile.is_active } })}
                    className={`mt-3 w-full rounded-xl py-2.5 text-sm font-semibold disabled:opacity-60 ${profile.is_active ? 'border border-red-200 text-red-700 hover:bg-red-50' : 'bg-emerald-600 text-white hover:bg-emerald-500'}`}
                  >
                    {profile.is_active ? 'Bloquear acceso' : 'Aprobar acceso'}
                  </button>
                )}
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
