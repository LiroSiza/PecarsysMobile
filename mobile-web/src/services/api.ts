import type { ImportResponse } from '../types/domain'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000'

export async function processExcelFiles(inventoryFile: File, pricesFile: File): Promise<ImportResponse> {
  const formData = new FormData()
  formData.append('inventory_file', inventoryFile)
  formData.append('prices_file', pricesFile)

  const response = await fetch(`${API_BASE_URL}/api/v1/process-excel`, { method: 'POST', body: formData })
  const body = (await response.json()) as ImportResponse | { detail?: string }
  if (!response.ok) {
    throw new Error('detail' in body && body.detail ? body.detail : 'Error al procesar los archivos.')
  }
  return body as ImportResponse
}
