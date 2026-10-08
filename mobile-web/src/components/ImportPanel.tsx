import { AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, Search, Upload } from 'lucide-react'
import { useState } from 'react'
import type { FormEvent } from 'react'
import type { ImportResponse, InventorySnapshot } from '../types/domain'
import { processExcelFiles } from '../services/api'
import { formatCorte } from '../services/format'

interface ImportPanelProps {
  snapshots: InventorySnapshot[]
  onImported: (result: ImportResponse) => void
  onGoToSearch: () => void
}

export default function ImportPanel({ snapshots, onImported, onGoToSearch }: ImportPanelProps) {
  const [inventoryFile, setInventoryFile] = useState<File | null>(null)
  const [pricesFile, setPricesFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ImportResponse | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!inventoryFile && !pricesFile) {
      setError('Selecciona al menos un archivo.')
      return
    }

    setLoading(true)
    setError(null)
    try {
      const imported = await processExcelFiles(inventoryFile, pricesFile)
      setResult(imported)
      onImported(imported)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible procesar los archivos.')
    } finally {
      setLoading(false)
    }
  }

  function startOver() {
    setResult(null)
    setInventoryFile(null)
    setPricesFile(null)
  }

  if (result) {
    return <ImportResult result={result} onGoToSearch={onGoToSearch} onStartOver={startOver} />
  }

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900">Actualizar existencias y precios</h2>
        <p className="mt-1 text-sm text-slate-600">
          Sube <strong>uno o ambos</strong> archivos, tal como los recibes: no hace falta quitar títulos, imágenes ni convertir columnas.
          Las existencias puedes actualizarlas varias veces al día sin volver a subir la lista de precios.
        </p>
        {snapshots.map((snapshot) => (
          <p key={snapshot.sucursal} className="mt-2 text-xs text-slate-500">
            Información actual: {snapshot.sucursal} · existencias al {formatCorte(snapshot.taken_at)}
          </p>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <FileStep
          step={1}
          title="Existencias del sistema"
          description="El reporte EXISTENCIA que exportas del sistema interno. Trae Articulo, Descripcion, Linea, Marca, Existencia y Apartados."
          example="EXIST 0710.xlsx"
          file={inventoryFile}
          onChange={(file) => { setInventoryFile(file); setError(null) }}
        />
        <FileStep
          step={2}
          title="Lista de precios"
          description="El Excel que te mandan casi a diario, con sus pestañas (LLANTAS, CAMION…). Trae PECARSIS, MEDIDA, MARCA, MODELO y los precios."
          example="LISTA PRECIOS … 07-OCT-26.xlsx"
          file={pricesFile}
          onChange={(file) => { setPricesFile(file); setError(null) }}
        />
        {error && (
          <p className="flex gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700">
            <AlertTriangle className="shrink-0" size={18} /> {error}
          </p>
        )}
        <button
          type="submit"
          disabled={loading || (!inventoryFile && !pricesFile)}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-4 text-base font-semibold text-white transition hover:bg-emerald-500 disabled:bg-slate-300"
        >
          {loading ? <Loader2 className="animate-spin" size={20} /> : <Upload size={20} />}
          {loading ? 'Procesando...' : submitLabel(inventoryFile, pricesFile)}
        </button>
      </form>
    </section>
  )
}

function submitLabel(inventoryFile: File | null, pricesFile: File | null): string {
  if (inventoryFile && pricesFile) return 'Actualizar existencias y precios'
  if (inventoryFile) return 'Actualizar existencias'
  if (pricesFile) return 'Actualizar precios'
  return 'Selecciona al menos un archivo'
}

interface FileStepProps {
  step: number
  title: string
  description: string
  example: string
  file: File | null
  onChange: (file: File | null) => void
}

function FileStep({ step, title, description, example, file, onChange }: FileStepProps) {
  return (
    <label className={`block cursor-pointer rounded-2xl border-2 bg-white p-4 shadow-sm transition ${file ? 'border-emerald-500' : 'border-dashed border-slate-300 hover:border-emerald-400'}`}>
      <div className="flex items-start gap-3">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${file ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700'}`}>
          {file ? <CheckCircle2 size={18} /> : step}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Paso {step} · opcional</p>
          <h3 className="font-bold text-slate-900">{title}</h3>
          <p className="mt-1 text-sm text-slate-600">{description}</p>
          <p className="mt-1 text-xs text-slate-400">Ejemplo: {example}</p>
          <div className={`mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${file ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
            <FileSpreadsheet className="shrink-0" size={18} />
            <span className="truncate">{file ? file.name : 'Toca para elegir el archivo'}</span>
            {file && (
              <button
                type="button"
                onClick={(event) => { event.preventDefault(); onChange(null) }}
                className="ml-auto shrink-0 text-xs underline"
              >
                Quitar
              </button>
            )}
          </div>
        </div>
      </div>
      <input
        type="file"
        accept=".xlsx,.xlsm,.csv"
        onChange={(event) => onChange(event.target.files?.[0] ?? null)}
        // Permite volver a elegir el mismo archivo después de quitarlo.
        onClick={(event) => { event.currentTarget.value = '' }}
        className="sr-only"
      />
    </label>
  )
}

interface ImportResultProps {
  result: ImportResponse
  onGoToSearch: () => void
  onStartOver: () => void
}

function ImportResult({ result, onGoToSearch, onStartOver }: ImportResultProps) {
  const { summary, metadata, warnings, updated } = result
  const title = updated.length === 2 ? 'Existencias y precios actualizados' : updated[0] === 'inventory' ? 'Existencias actualizadas' : 'Precios actualizados'
  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2 text-emerald-700">
          <CheckCircle2 size={22} />
          <h2 className="text-lg font-bold">{title}</h2>
        </div>
        {updated.includes('inventory') && (
          <p className="mt-1 text-sm text-slate-600">
            {metadata.sucursal ?? 'Sucursal'} · existencias al {formatCorte(metadata.fecha_corte)}
          </p>
        )}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Stat label="Artículos en existencias" value={summary.inventory_rows} />
          <Stat label="Con precio" value={summary.matched_rows} tone="good" />
          <Stat label="Sin precio en la lista" value={summary.inventory_without_price} tone={summary.inventory_without_price ? 'warn' : undefined} />
          <Stat label="Precios en la lista" value={summary.price_rows} />
        </div>
      </div>

      {warnings.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <h3 className="flex items-center gap-2 font-semibold text-amber-800"><AlertTriangle size={18} /> Avisos</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900">
            {warnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        </div>
      )}

      <button onClick={onGoToSearch} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-4 text-base font-semibold text-white hover:bg-emerald-500">
        <Search size={20} /> Ir a consultar
      </button>
      <button onClick={onStartOver} className="w-full rounded-xl px-4 py-3 text-sm font-medium text-slate-600 hover:bg-slate-100">
        Subir otros archivos
      </button>
    </section>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'good' | 'warn' }) {
  const color = tone === 'good' ? 'text-emerald-700' : tone === 'warn' ? 'text-amber-700' : 'text-slate-900'
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <span className="block text-xs text-slate-500">{label}</span>
      <strong className={`text-2xl ${color}`}>{value.toLocaleString('es-MX')}</strong>
    </div>
  )
}
