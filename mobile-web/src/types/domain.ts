export type UserRole = 'admin' | 'vendedor'

export interface Profile {
  id: string
  email: string
  full_name: string
  role: UserRole
  is_active: boolean
  created_at: string
}

// Fila de la vista product_search de Supabase.
export interface TireRecord {
  pecarsys: string
  sucursal: string | null
  descripcion: string
  marca: string | null
  linea: string | null
  medida: string | null
  modelo: string | null
  indice: string | null
  categoria: string | null
  esquema_precio: 'escalones' | 'unico' | null
  existencia: number
  apartados: number
  disponible: number
  inventario_matriz: number | null
  precio_1: number | null
  precio_2: number | null
  precio_3: number | null
  precio_4: number | null
  precio_5: number | null
  precio_especial: number | null
  match_status: 'both' | 'left_only' | 'right_only'
}

export interface InventorySnapshot {
  sucursal: string
  taken_at: string | null
  imported_at: string
  row_count: number
}

export interface ProductData {
  products: TireRecord[]
  snapshots: InventorySnapshot[]
  fetchedAt: string
  offline: boolean
}

export interface ImportSummary {
  inventory_rows: number
  price_rows: number
  matched_rows: number
  inventory_without_price: number
}

export interface ImportMetadata {
  sucursal: string | null
  fecha_corte: string | null
  encabezado_reporte?: string | null
}

export interface ImportResponse {
  status: 'success'
  updated: ('inventory' | 'prices')[]
  summary: ImportSummary
  warnings: string[]
  metadata: ImportMetadata
}
