import type { UseQueryResult } from '@tanstack/react-query'
import { Loader2, Package, RefreshCw, Search, WifiOff, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { ProductData, TireRecord } from '../types/domain'
import { formatCorte, formatMoney, normalizeSearch } from '../services/format'

const PAGE_SIZE = 50

// Escalones de la lista de precios: dependen del monto acumulado de compra del cliente.
const PRICE_TIERS = [
  { field: 'precio_1', label: 'Hasta $199,999' },
  { field: 'precio_2', label: '$200,000 a $499,999' },
  { field: 'precio_3', label: '$500,000 o más (acum.)' },
  { field: 'precio_4', label: '$1,000,000 o más (acum.)' },
  { field: 'precio_5', label: '$1,500,000 (1 exhibición)' },
  { field: 'precio_especial', label: 'Especial' },
] as const

interface SearchPageProps {
  query: UseQueryResult<ProductData>
  isAdmin: boolean
  onGoToImport: () => void
}

export default function SearchPage({ query, isAdmin, onGoToImport }: SearchPageProps) {
  if (query.isPending) {
    return <div className="flex flex-col items-center gap-2 p-10 text-slate-500"><Loader2 className="animate-spin" /> Cargando existencias y precios…</div>
  }
  if (query.isError) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-700">
        No fue posible cargar la información. Revisa tu conexión.
        <button onClick={() => query.refetch()} className="mx-auto mt-3 flex items-center gap-2 rounded-xl bg-white px-4 py-2 font-medium text-red-700 shadow-sm">
          <RefreshCw size={16} /> Reintentar
        </button>
      </div>
    )
  }
  return <ProductSearch data={query.data} isAdmin={isAdmin} refreshing={query.isFetching} onRefresh={() => query.refetch()} onGoToImport={onGoToImport} />
}

interface ProductSearchProps {
  data: ProductData
  isAdmin: boolean
  refreshing: boolean
  onRefresh: () => void
  onGoToImport: () => void
}

function ProductSearch({ data, isAdmin, refreshing, onRefresh, onGoToImport }: ProductSearchProps) {
  const tires = data.products
  const [searchTerm, setSearchTerm] = useState('')
  const [onlyInStock, setOnlyInStock] = useState(true)
  const [visible, setVisible] = useState(PAGE_SIZE)

  const indexed = useMemo(
    () => tires.map((tire) => ({
      tire,
      text: normalizeSearch([tire.pecarsys, tire.descripcion, tire.medida, tire.marca, tire.modelo].filter(Boolean).join(' ')),
    })),
    [tires],
  )

  const filteredTires = useMemo(() => {
    const term = normalizeSearch(searchTerm)
    return indexed
      .filter(({ tire, text }) => (!onlyInStock || tire.match_status !== 'right_only') && (!term || text.includes(term)))
      .map(({ tire }) => tire)
  }, [indexed, searchTerm, onlyInStock])

  if (tires.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
        <p className="text-slate-600">Todavía no hay información cargada.</p>
        {isAdmin && (
          <button onClick={onGoToImport} className="mt-4 rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white hover:bg-emerald-500">
            Subir existencias y precios
          </button>
        )}
      </div>
    )
  }

  return (
    <section>
      {data.offline && (
        <p className="mb-3 flex items-center gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
          <WifiOff className="shrink-0" size={18} /> Sin conexión: mostrando la información descargada el {formatCorte(data.fetchedAt)}.
        </p>
      )}
      <div className="mb-3 flex items-center gap-2 px-1 text-xs text-slate-500">
        <span className="flex-1">
          {data.snapshots.map((snapshot) => `${snapshot.sucursal} · existencias al ${formatCorte(snapshot.taken_at)}`).join(' · ') || 'Sin corte de existencias'}
        </span>
        <button onClick={onRefresh} disabled={refreshing} aria-label="Actualizar" className="rounded-lg p-1.5 hover:bg-slate-200 disabled:opacity-50">
          <RefreshCw className={refreshing ? 'animate-spin' : ''} size={16} />
        </button>
      </div>
      <div className="sticky top-0 z-10 -mx-4 bg-slate-50 px-4 pb-3 pt-1">
        <div className="relative">
          <Search className="absolute left-3 top-3.5 text-slate-400" size={20} />
          <input
            value={searchTerm}
            onChange={(event) => { setSearchTerm(event.target.value); setVisible(PAGE_SIZE) }}
            placeholder="Ej. 175 65 R14, RX307, JOYROAD..."
            className="w-full rounded-xl border border-slate-300 bg-white py-3 pl-10 pr-10 text-base outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} aria-label="Limpiar búsqueda" className="absolute right-2 top-2 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
              <X size={20} />
            </button>
          )}
        </div>
        <label className="mt-2 flex items-center gap-2 px-1 text-sm text-slate-600">
          <input type="checkbox" checked={onlyInStock} onChange={(event) => setOnlyInStock(event.target.checked)} className="h-4 w-4 accent-emerald-600" />
          Sólo artículos en existencia
        </label>
      </div>

      <p className="mb-3 px-1 text-sm text-slate-500">{filteredTires.length.toLocaleString('es-MX')} resultados</p>
      {filteredTires.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">
          No hay resultados para "{searchTerm}".
        </div>
      ) : (
        <div className="space-y-3">
          {filteredTires.slice(0, visible).map((tire) => <TireCard key={tire.pecarsys} tire={tire} />)}
          {filteredTires.length > visible && (
            <button onClick={() => setVisible(visible + PAGE_SIZE)} className="w-full rounded-xl border border-slate-300 bg-white py-3 text-sm font-medium text-slate-700 hover:bg-slate-100">
              Ver más ({filteredTires.length - visible} restantes)
            </button>
          )}
        </div>
      )}
    </section>
  )
}

function TireCard({ tire }: { tire: TireRecord }) {
  const title = tire.descripcion || [tire.medida, tire.marca, tire.modelo].filter(Boolean).join(' ')
  const prices = PRICE_TIERS.filter(({ field }) => (tire[field] ?? 0) > 0)
  const singlePrice = tire.esquema_precio === 'unico' || (prices.length === 1 && prices[0].field === 'precio_1')

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-md bg-slate-100 px-2 py-1 font-semibold text-slate-700">{tire.pecarsys}</span>
        {tire.marca && <span className="text-slate-500">{tire.marca}</span>}
        {tire.categoria && <span className="rounded-md bg-sky-50 px-2 py-0.5 text-sky-700">{tire.categoria}</span>}
      </div>
      <h2 className="mt-2 font-bold leading-snug text-slate-900">{title || 'Llanta'}</h2>

      <div className="mt-3 flex items-center gap-3 rounded-xl bg-slate-50 p-3">
        <Package className={tire.disponible > 0 ? 'text-emerald-600' : 'text-slate-400'} size={22} />
        <div>
          <span className="block text-xs text-slate-500">Disponible</span>
          <strong className={`text-xl ${tire.disponible > 0 ? 'text-emerald-700' : 'text-slate-500'}`}>{tire.disponible}</strong>
        </div>
        <span className="ml-auto text-right text-xs text-slate-500">
          Existencia {tire.existencia}<br />Apartados {tire.apartados}
        </span>
      </div>

      {prices.length === 0 ? (
        <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm font-medium text-amber-800">Sin precio en la lista actual</p>
      ) : singlePrice ? (
        <div className="mt-3 flex items-baseline justify-between rounded-xl bg-emerald-50 p-3">
          <span className="text-sm text-emerald-800">Precio</span>
          <strong className="text-xl text-emerald-800">{formatMoney(tire.precio_1 ?? 0)}</strong>
        </div>
      ) : (
        <table className="mt-3 w-full text-sm">
          <tbody>
            {prices.map(({ field, label }) => (
              <tr key={field} className="border-t border-slate-100 first:border-t-0">
                <td className="py-1.5 text-slate-600">{label}</td>
                <td className="py-1.5 text-right font-semibold text-slate-900">{formatMoney(tire[field] ?? 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </article>
  )
}
