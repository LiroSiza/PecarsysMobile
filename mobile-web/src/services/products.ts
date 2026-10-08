import type { InventorySnapshot, ProductData, TireRecord } from '../types/domain'
import { supabase } from './supabase'

// PostgREST devuelve como máximo 1,000 filas por petición.
const PAGE_SIZE = 1000
const CACHE_KEY = 'pecarsys:products-cache'

async function fetchAllProducts(): Promise<TireRecord[]> {
  const rows: TireRecord[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('product_search')
      .select('*')
      .order('pecarsys')
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(error.message)
    rows.push(...(data as TireRecord[]))
    if (data.length < PAGE_SIZE) return rows
  }
}

async function fetchSnapshots(): Promise<InventorySnapshot[]> {
  const { data, error } = await supabase.from('inventory_snapshots').select('*')
  if (error) throw new Error(error.message)
  return data as InventorySnapshot[]
}

function readCache(): ProductData | null {
  try {
    const stored = localStorage.getItem(CACHE_KEY)
    return stored ? (JSON.parse(stored) as ProductData) : null
  } catch {
    return null
  }
}

function writeCache(data: ProductData) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data))
  } catch {
    // Sin almacenamiento: la próxima vez se descarga de nuevo.
  }
}

export function clearProductCache() {
  try {
    localStorage.removeItem(CACHE_KEY)
  } catch {
    // Nada que limpiar.
  }
}

// Sin señal, se muestra la última información descargada en este teléfono.
export async function loadProducts(): Promise<ProductData> {
  try {
    const [products, snapshots] = await Promise.all([fetchAllProducts(), fetchSnapshots()])
    const data: ProductData = { products, snapshots, fetchedAt: new Date().toISOString(), offline: false }
    writeCache(data)
    return data
  } catch (cause) {
    const cached = readCache()
    if (cached) return { ...cached, offline: true }
    throw cause
  }
}
