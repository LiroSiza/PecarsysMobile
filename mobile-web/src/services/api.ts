import type { ImportResponse } from '../types/domain'
import { supabase } from './supabase'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000'

export async function processExcelFiles(inventoryFile: File, pricesFile: File): Promise<ImportResponse> {
  const formData = new FormData()
  formData.append('inventory_file', inventoryFile)
  formData.append('prices_file', pricesFile)

  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Tu sesión expiró. Vuelve a iniciar sesión.')

  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}/api/v1/import`, {
      method: 'POST',
      body: formData,
      headers: { Authorization: `Bearer ${token}` },
    })
  } catch {
    throw new Error('No hay conexión con el servidor. Revisa tu internet e intenta de nuevo.')
  }
  const body = (await response.json()) as ImportResponse | { detail?: string }
  if (!response.ok) {
    throw new Error('detail' in body && body.detail ? body.detail : 'Error al procesar los archivos.')
  }
  return body as ImportResponse
}
