import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FileSpreadsheet, Loader2, LogOut, Search, ShieldCheck, UserCog, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import AccountPanel from './components/AccountPanel'
import AuthScreen from './components/AuthScreen'
import ImportPanel from './components/ImportPanel'
import { MfaChallengeScreen, MfaEnrollScreen } from './components/Mfa'
import PendingApproval from './components/PendingApproval'
import RecoveryScreen from './components/RecoveryScreen'
import SearchPage from './components/SearchPage'
import UsersPanel from './components/UsersPanel'
import { useAuth } from './services/auth'
import { clearProductCache, loadProducts } from './services/products'
import { supabaseConfigured } from './services/supabase'

type View = 'search' | 'import' | 'users' | 'account'

function App() {
  const { session, profile, assurance, recovering, loading } = useAuth()
  const queryClient = useQueryClient()
  const blocked = Boolean(session && profile && !profile.is_active)

  useEffect(() => {
    // Cuenta bloqueada o pendiente: no se conservan precios en el teléfono.
    if (blocked) {
      clearProductCache()
      queryClient.removeQueries({ queryKey: ['products'] })
    }
  }, [blocked, queryClient])

  if (!supabaseConfigured) {
    return (
      <FullScreenMessage>
        Falta configurar <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> en <code>mobile-web/.env.local</code>.
      </FullScreenMessage>
    )
  }
  if (loading) return <FullScreenMessage><Loader2 className="mx-auto animate-spin" /></FullScreenMessage>
  if (!session) return <AuthScreen />
  // Quien ya tiene segundo factor debe dar el código antes de cualquier otra cosa.
  if (assurance.current === 'aal1' && assurance.next === 'aal2') return <MfaChallengeScreen />
  if (recovering) return <RecoveryScreen />
  if (!profile?.is_active) return <PendingApproval />
  // Administradores: segundo factor obligatorio (también lo exigen el backend y la base).
  if (profile.role === 'admin' && assurance.current !== 'aal2') return <MfaEnrollScreen />
  return <MainApp isAdmin={profile.role === 'admin'} userId={profile.id} name={profile.full_name || profile.email} />
}

function MainApp({ isAdmin, userId, name }: { isAdmin: boolean; userId: string; name: string }) {
  const { signOut } = useAuth()
  const queryClient = useQueryClient()
  const [view, setView] = useState<View>('search')
  const products = useQuery({ queryKey: ['products'], queryFn: loadProducts, staleTime: 5 * 60 * 1000 })

  async function handleSignOut() {
    // Los precios son confidenciales: no se dejan en el teléfono al salir.
    clearProductCache()
    queryClient.clear()
    await signOut()
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <header className="bg-slate-900 text-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="text-emerald-400" size={22} />
            <div><strong>PECARSYS Móvil</strong><span className="block max-w-[11rem] truncate text-xs text-slate-400">{name}</span></div>
          </div>
          <button onClick={handleSignOut} className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-slate-300 hover:bg-slate-800">
            <LogOut size={14} /> Salir
          </button>
        </div>
        <nav className="mx-auto flex max-w-5xl gap-1 px-4 pb-3">
          <NavButton active={view === 'search'} onClick={() => setView('search')} icon={<Search size={16} />}>Consultar</NavButton>
          {isAdmin && <NavButton active={view === 'import'} onClick={() => setView('import')} icon={<FileSpreadsheet size={16} />}>Importar</NavButton>}
          {isAdmin && <NavButton active={view === 'users'} onClick={() => setView('users')} icon={<Users size={16} />}>Usuarios</NavButton>}
          <NavButton active={view === 'account'} onClick={() => setView('account')} icon={<UserCog size={16} />}>Cuenta</NavButton>
        </nav>
      </header>
      <main className="mx-auto max-w-5xl space-y-4 p-4">
        {view === 'import' && isAdmin ? (
          <ImportPanel
            snapshots={products.data?.snapshots ?? []}
            onImported={() => queryClient.invalidateQueries({ queryKey: ['products'] })}
            onGoToSearch={() => setView('search')}
          />
        ) : view === 'users' && isAdmin ? (
          <UsersPanel currentUserId={userId} />
        ) : view === 'account' ? (
          <AccountPanel />
        ) : (
          <SearchPage query={products} isAdmin={isAdmin} onGoToImport={() => setView('import')} />
        )}
      </main>
    </div>
  )
}

function FullScreenMessage({ children }: { children: ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center bg-slate-900 p-6 text-center text-sm text-slate-200">{children}</div>
}

function NavButton({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: ReactNode; children: ReactNode }) {
  return <button onClick={onClick} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${active ? 'bg-emerald-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`}>{icon}{children}</button>
}

export default App
