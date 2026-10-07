import { FileSpreadsheet, Search, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import type { ReactNode } from 'react'
import ImportPanel from './components/ImportPanel'
import SearchPage from './components/SearchPage'
import type { ImportResponse, UserRole } from './types/domain'

type View = 'search' | 'import'

// Temporal hasta conectar Supabase: conserva la última carga en este navegador.
const STORAGE_KEY = 'pecarsys:last-import'

function loadStoredImport(): ImportResponse | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? (JSON.parse(stored) as ImportResponse) : null
  } catch {
    return null
  }
}

function App() {
  const [role] = useState<UserRole>('admin')
  const [view, setView] = useState<View>('search')
  const [lastImport, setLastImport] = useState<ImportResponse | null>(loadStoredImport)

  function handleImported(result: ImportResponse) {
    setLastImport(result)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(result))
    } catch {
      // Sin almacenamiento disponible: los datos sólo duran en esta sesión.
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <header className="bg-slate-900 text-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="text-emerald-400" size={22} />
            <div><strong>PECARSYS Móvil</strong><span className="block text-xs text-slate-400">Consulta de inventario</span></div>
          </div>
          <span className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-300">{role}</span>
        </div>
        <nav className="mx-auto flex max-w-5xl gap-2 px-4 pb-3">
          <NavButton active={view === 'search'} onClick={() => setView('search')} icon={<Search size={16} />}>Consultar</NavButton>
          {role === 'admin' && <NavButton active={view === 'import'} onClick={() => setView('import')} icon={<FileSpreadsheet size={16} />}>Importar</NavButton>}
        </nav>
      </header>
      <main className="mx-auto max-w-5xl space-y-4 p-4">
        {view === 'import' && role === 'admin' ? (
          <ImportPanel lastImport={lastImport} onImported={handleImported} onGoToSearch={() => setView('search')} />
        ) : (
          <SearchPage tires={lastImport?.records ?? []} metadata={lastImport?.metadata ?? null} onGoToImport={() => setView('import')} />
        )}
      </main>
    </div>
  )
}

function NavButton({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: ReactNode; children: ReactNode }) {
  return <button onClick={onClick} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${active ? 'bg-emerald-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`}>{icon}{children}</button>
}

export default App
