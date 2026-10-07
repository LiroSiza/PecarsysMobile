
# PECARSYS Mobile API

Backend de FastAPI para validar y conciliar los reportes de inventario y precios.

## Stack

- Python 3.12
- FastAPI y Uvicorn
- Pandas y Openpyxl
- Pydantic

## Estructura actual

```text
backend/
├── main.py          # Aplicación HTTP y contrato del endpoint
├── processing.py    # Lectura, normalización y conciliación de archivos
└── readme.md
```

La API todavía no persiste datos. La respuesta de importación sirve como
previsualización hasta conectar PostgreSQL/Supabase.

## Ejecución local

Desde `backend/`:

```powershell
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload
```

El endpoint disponible es:

```text
POST /api/v1/process-excel
```

Recibe `inventory_file` (reporte de existencias del ERP) y `prices_file`
(lista de precios). Acepta `.xlsx`, `.xlsm`, `.xls` y `.csv`.

- La fila de encabezados se localiza automáticamente (`Articulo` en el
  inventario, `PECARSIS`/`PECARSYS` en precios). Las filas previas del reporte
  ERP se usan para obtener la sucursal (`metadata`).
- De la lista de precios se leen todas las pestañas que tengan columna
  `PECARSIS`; la pestaña de origen se devuelve en `categoria`.
- Los escalones `$1.00 A $199,999` … `$1,500,000 (1 EXHIBICION)` se mapean a
  `precio_1` … `precio_5`; `PRECIO UNICO` se mapea a `precio_1` y `ESPECIAL` a
  `precio_especial`.
- Los códigos repetidos o inválidos no bloquean la importación: se conserva la
  primera aparición y se reportan en `warnings`.
