const currency = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })

export function formatMoney(value: number): string {
  return currency.format(value)
}

export function formatCorte(isoDate: string | null | undefined): string {
  if (!isoDate) return 'fecha desconocida'
  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) return isoDate
  return date.toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// Ignora mayúsculas, acentos y espacios repetidos, igual que el filtro del Excel.
export function normalizeSearch(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}
