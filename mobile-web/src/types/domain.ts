export type UserRole = 'admin' | 'vendedor'

export interface TireRecord {
  pecarsys: string
  medida: string
  marca: string
  modelo: string
  descripcion: string
  linea: string
  indice: string
  categoria: string
  esquema_precio: 'escalones' | 'unico' | null
  existencia: number
  apartados: number
  disponible: number
  inventario_matriz: number
  precio_1: number
  precio_2: number
  precio_3: number
  precio_4: number
  precio_5: number
  precio_especial: number
  match_status: 'both' | 'left_only' | 'right_only'
}

export interface ImportSummary {
  inventory_rows: number
  price_rows: number
  matched_rows: number
  inventory_without_price: number
  price_without_inventory: number
  total_rows: number
}

export interface ImportMetadata {
  sucursal: string | null
  fecha_corte: string | null
  encabezado_reporte: string | null
}

export interface ImportResponse {
  status: 'success'
  summary: ImportSummary
  warnings: string[]
  metadata: ImportMetadata
  records: TireRecord[]
}
