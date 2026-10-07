# Documento de Requerimientos y Arquitectura de Software (PRD)

## 0. Resumen Ejecutivo y Análisis de Fuentes Originales

### 0.1 Contexto y Declaración del Problema
El cliente gestiona un negocio de comercialización de llantas y requiere una herramienta digital moderna, rápida y ágil para consultar existencias y precios desde dispositivos móviles (celulares). 

Anteriormente, el flujo operativo dependía de una plantilla de Excel en la laptop que combinaba datos mediante macros y fórmulas de búsqueda (`BUSCARV`/`XLOOKUP`). Sin embargo, este archivo **no es compatible con dispositivos móviles**, impidiendo a los vendedores en campo o mostrador consultar inventarios y precios en tiempo real de forma práctica.

### 0.2 Objetivo del Proyecto
Desarrollar una aplicación web progresiva (**PWA - Progressive Web App**) con enfoque *Mobile-First* que reemplace el uso de archivos Excel con macros en el celular. La solución permitirá:
1. Sincronizar fácilmente la información diaria de inventarios y precios mediante la carga de reportes (o API a futuro).
2. Cruzar automáticamente ambas fuentes de datos usando el código **Pecarsys** como llave primaria.
3. Brindar consultas instantáneas por medida, marca o código desde el celular.
4. Mantener la confidencialidad de la información comercial mediante un control de usuarios con aprobación manual obligatoria por parte del Administrador.

---

### 0.3 Análisis de Fuentes de Datos Recibidas

Se analizaron el libro `FILTRO INVENTARIO-PRECIOS 0110.xlsm`, la presentación `PROGRAMADOR.pptx` y capturas de los tres archivos que usa el cliente.

#### 1. Reporte de Existencias del Sistema Interno (ERP)
* **Origen:** Sistema ERP interno (se usa para pedidos y ventas). Es la **fuente oficial de existencia real** y puede generarse en cualquier momento.
* **Formato (archivo `EXIST 0710.xlsx`):** La fila 1 es un título del reporte (`EXISTENCIA SOLO POSITIVOS | Sucursal: VERACRUZ | Fecha de impresion:07/10/2026   Hora: 04:48:43p. m.`); los encabezados de columna están en la fila 2. Todas las celdas vienen como texto (`'4.000'`, `'0.00'`) y el reporte sólo incluye artículos con existencia positiva.
* **Columnas:** `Articulo` (clave *Pecarsys*), `Descripcion`, `Linea`, `Marca`, `Existencia`, `Apartados`.
* **Observaciones:**
  * No existe columna de medida: la medida está al inicio de `Descripcion` (ej. `175 65 R14 …`, `11R22.5 …`).
  * Los códigos son alfanuméricos (`RA15061`, `38013`) y los numéricos cortos llegan con **ceros a la izquierda** (`00501`, `02327`), mientras la lista de precios los trae como número (`501`). Se tratan como texto y se eliminan los ceros a la izquierda de los códigos puramente numéricos.
  * La marca del ERP difiere de la lista de precios (ej. `LCH TBR`, `GALLANT TBR`); el cruce se hace sólo por código.
  * Los apartados reducen lo vendible (ej. `35632`: existencia 9, apartados 9 → disponible 0).

#### 2. Lista Diaria de Precios
* **Origen:** Archivo Excel enviado casi a diario, con **varias pestañas** (ej. `LLANTAS`, `CAMION`).
* **Columnas comunes:** `PECARSIS` (clave), `MEDIDA`, `MARCA`, `MODELO`, `INDICE`, `INVENTARIO` (stock de matriz, sólo informativo).
* **Dos esquemas de precio según la pestaña:**
  * **Escalones por volumen de compra** (pestaña de llantas):

    | Columna original | Campo | Significado |
    |---|---|---|
    | `$1.00 A $199,999` | `precio_1` | Compra acumulada hasta $199,999 |
    | `$200,000 A $499,999` | `precio_2` | Compra acumulada de $200,000 a $499,999 |
    | `$500,000 O MAS ACUMULATIVO` | `precio_3` | Compra acumulada desde $500,000 |
    | `$1,000,000 O MAS ACUMULATIVO` | `precio_4` | Compra acumulada desde $1,000,000 |
    | `$1,500,000 (1 EXHIBICION)` | `precio_5` | $1,500,000 en una sola exhibición |
    | `ESPECIAL (Inventario Matriz)` | `precio_especial` | Precio especial (≈15% de los productos; significado por confirmar) |

    Se ignoran `ITEM` (código del proveedor), `53HQ`, `HQ%` (contiene `#DIV/0!`) y `PEDIDO` (vacía). Los precios son fórmulas con muchos decimales y se redondean a 2.
  * **Precio único** (pestaña `CAMION`): una sola columna `PRECIO UNICO`, que se guarda como `precio_1`.
* **Calidad de datos detectada:** códigos repetidos con precios distintos (`2035`, `38157`), códigos inválidos (`|`), filas ocultas o de altura irregular e `INDICE` mayormente vacío.

#### 3. Herramienta Actual en Laptop (Excel con Macros)
* **Hoja `FILTRO`:** columnas `Articulo`…`Apartado` pegadas del reporte ERP; `Precio 1…5` son fórmulas `=IFERROR(VLOOKUP(VALUE($A5),PRECIOS!$B:$L,7..11,0),0)`.
* **Hoja `PRECIOS`:** el cliente pega aquí las pestañas de la lista de precios, una debajo de otra.
* **Macro (VBA):** un cuadro de texto ActiveX (`TextBox1_Change`) aplica un autofiltro `*texto*` **sólo sobre `Descripcion`** en cada pulsación; el botón `LIMPIAR` vacía el cuadro.
* **Fallas del modelo actual:**
  * Las macros VBA/ActiveX no se ejecutan en Excel móvil.
  * `VALUE()` falla con códigos alfanuméricos y devuelve $0.
  * Si una pestaña de precios no se pega, sus productos aparecen en $0 (en el archivo analizado, 98 de 459 artículos).
  * `VLOOKUP` toma silenciosamente el primer código repetido.
  * Los escalones inexistentes se muestran como `$0.00`.

---

## 1. Resumen del Proyecto y Contexto del Negocio

### 1.1 Problema

Actualmente, las consultas de inventario y precios en el punto de venta y campo se realizan utilizando un archivo de Excel con macros y fórmulas dinámicas (`BUSCARV`/`XLOOKUP`). Este archivo une manualmente dos fuentes de información:

1. **Reporte de Inventario/Existencias:** Generado desde el sistema ERP interno por sucursal (ej. Veracruz), que contiene códigos de artículo (*Pecarsys*), descripciones, líneas, marcas, existencias reales y apartados.

2. **Reporte Diario de Precios:** Un archivo en Excel con la lista de precios actualizada (con niveles de Precio 1 a Precio 5) indexado por el código *Pecarsys*.

**Limitación Principal:** El archivo de Excel con macros no es ejecutable ni funcional en dispositivos móviles (smartphones Android/iOS), lo que dificulta a los vendedores consultar datos frescos, existencias y precios en tiempo real de forma ágil frente a los clientes.

### 1.2 Solución Propuesta

Desarrollar una aplicación web progresiva (**PWA - Progressive Web App**) con enfoque *Mobile-First*, accesible desde cualquier dispositivo táctil y optimizada para agregar un acceso directo en la pantalla de inicio del teléfono. La aplicación permitirá:

* Sincronización diaria masiva mediante la carga manual de archivos Excel (con soporte futuro para conexión vía API).

* Cruce automático de inventarios y precios utilizando el código único **Pecarsys** como llave relacional.

* Consultas instantáneas de existencias y niveles de precios desde dispositivos móviles.

* Sistema estricto de autenticación y control de accesos con **aprobación manual de nuevos usuarios por parte del Administrador**.

## 2. Decisiones de Arquitectura y Stack Tecnológico

La solución adopta una **Arquitectura en 3 Capas Desacopladas** (Frontend, Backend, Base de Datos) para garantizar escalabilidad, seguridad, bajo costo operativo y facilidad de mantenimiento.

### 2.1 Stack Tecnológico Seleccionado

* **Frontend:** React (usando Vite) + Tailwind CSS + PWA Support (Web App instalable en Android/iOS sin necesidad de distribución vía Play Store/App Store).

* **Backend / API Service:** Python (FastAPI + Pandas/Openpyxl) para el procesamiento de archivos Excel/CSV y lógica de negocio.

* **Base de Datos & Auth (BaaS):** **Supabase (PostgreSQL)**.

  * *Módulo de Autenticación:* Supabase Auth.

  * *Base de Datos Relacional:* PostgreSQL gestionado en la nube.

* **Alojamiento (Cloud Hosting):**

  * *Frontend:* Vercel (Capa Gratuita / HTTPS automático).

  * *Backend Service:* Render / Railway.

## 3. Seguridad y Gestión de Usuarios (RBAC)

Dado que la información de inventarios y niveles de precios es confidencial, la aplicación implementa un control de acceso basado en roles (**RBAC - Role-Based Access Control**) respaldado por una política de aprobación manual.

### 3.1 Flujo de Registro y Verificación Manual

1. **Registro:** Un nuevo usuario (ej. vendedor) descarga/abre la PWA y completa el formulario de registro (Nombre, Correo, Contraseña).

2. **Estado Pendiente (`is_active = false`):** La cuenta se crea en el proveedor de identidad de Supabase y en la tabla `profiles`, pero con el parámetro `is_active` establecido en `false`.

3. **Pantalla de Bloqueo:** Al intentar iniciar sesión, la app detecta que `is_active == false` y muestra un mensaje informativo: *"Tu cuenta ha sido creada exitosamente. Un administrador debe autorizar tu acceso antes de que puedas ingresar."*

4. **Autorización del Administrador:** El usuario con rol `admin` recibe notificación / visualiza en su panel la lista de usuarios pendientes y presiona **"Aprobar"** (`is_active = true`).

5. **Acceso Concedido:** Una vez aprobado, el usuario puede iniciar sesión y realizar consultas.

### 3.2 Roles de Usuario

* **Administrador (`admin`):**

  * Gestión de usuarios (Aprobar/Bloquear/Eliminar accesos).

  * Módulo de Carga de Archivos (Subida e importación de reportes de inventario y precios).

  * Acceso total a consultas.

* **Vendedor / Consultor (`vendedor`):**

  * Exclusivamente acceso al motor de búsqueda de existencias y precios.

  * Sin acceso al panel de administración o módulo de carga.

## 4. Modelo y Esquema de Base de Datos (PostgreSQL / Supabase)

El modelo de datos se basa en la relacionabilidad mediante la clave **Pecarsys** (siempre `TEXT`).

```sql
-- 1. Tabla de Perfiles de Usuario
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'vendedor')),
    is_active BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Catálogo y precios (lista diaria de precios)
CREATE TABLE catalog (
    pecarsys TEXT PRIMARY KEY,         -- Clave única de búsqueda
    medida TEXT,                       -- Ej: "11 R22.5"
    marca TEXT,                        -- Marca según lista de precios
    modelo TEXT,                       -- Ej: "LINEAL ZF151"
    indice TEXT,                       -- Ej: "20PR", "91V"
    categoria TEXT,                    -- Pestaña de origen: "LLANTAS", "CAMION"
    inventario_matriz INT DEFAULT 0,   -- Informativo; no es la existencia real
    precio_1 NUMERIC(12, 2),           -- $1 a $199,999 / PRECIO UNICO
    precio_2 NUMERIC(12, 2),           -- $200,000 a $499,999
    precio_3 NUMERIC(12, 2),           -- $500,000 o más acumulativo
    precio_4 NUMERIC(12, 2),           -- $1,000,000 o más acumulativo
    precio_5 NUMERIC(12, 2),           -- $1,500,000 en 1 exhibición
    precio_especial NUMERIC(12, 2),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Existencias por sucursal (reporte ERP)
CREATE TABLE inventory (
    pecarsys TEXT NOT NULL,            -- Sin FK: puede existir inventario sin precio
    sucursal TEXT NOT NULL DEFAULT 'VERACRUZ',
    descripcion TEXT NOT NULL,
    linea TEXT,
    marca TEXT,                        -- Marca según ERP (la que ve el vendedor)
    existencia INT NOT NULL DEFAULT 0,
    apartados INT NOT NULL DEFAULT 0,
    report_taken_at TIMESTAMP WITH TIME ZONE, -- Fecha/hora del corte del reporte
    PRIMARY KEY (pecarsys, sucursal)
);

-- 4. Bitácora de importaciones
CREATE TABLE import_log (
    id BIGSERIAL PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('inventory', 'prices')),
    filename TEXT,
    summary JSONB,
    warnings JSONB,
    imported_by UUID REFERENCES profiles(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

Los precios ausentes se guardan como `NULL` (no `0`) y la interfaz los oculta. `disponible = existencia - apartados` se calcula al consultar.

## 5. Lógica de Negocio y Procesamiento de Datos

### 5.1 Proceso de Carga y Sincronización (Modo Manual y Futura API)

1. El Administrador ingresa al módulo `/admin/upload`. Se aceptan `.xlsx`, `.xlsm`, `.xls` y `.csv`.

2. **Archivo A (Reporte ERP)**, que se puede subir varias veces al día:
   * Se localiza la fila de encabezados buscando la columna `Articulo` (las filas previas son el título del reporte).
   * Del título se extraen la **sucursal** y la **fecha/hora del corte**.
   * Se descartan las filas sin código (totales, vacías).

3. **Archivo B (Lista de Precios)**, casi diario:
   * Se leen **todas las pestañas**. En cada una se localiza la fila que contiene `PECARSIS`/`PECARSYS`; las pestañas sin esa columna se omiten con aviso.
   * Los encabezados se mapean según la tabla de la sección 0.3 (escalones o `PRECIO UNICO`).
   * Cada producto conserva su pestaña de origen como `categoria`.

4. **Reglas de limpieza:**
   * Código como texto, sin espacios y en mayúsculas; los enteros leídos como `2216.0` se convierten a `2216`.
   * Los códigos inválidos (ej. `|`) se omiten con aviso.
   * Los códigos repetidos (dentro de una pestaña o entre pestañas) **no bloquean** la importación: se conserva la primera aparición y se reporta.
   * Los valores numéricos no válidos o negativos se tratan como 0 / sin precio.
   * Los espacios múltiples en textos se colapsan.

5. **Artículos sin precio:** se conservan y se muestran como "Sin precio en la lista actual". Las cargas hacen *upsert* (nunca borran el catálogo), de modo que cuando un código llegue en una lista posterior su precio queda guardado. Los precios sin inventario no generan aviso: la lista de precios es general.

6. **Reporte de importación:** filas leídas, coincidencias, artículos de inventario sin precio, precios sin inventario, códigos repetidos u omitidos y pestañas omitidas.

7. **Soporte de API Futura:** la arquitectura permite sustituir la subida manual por un endpoint REST (`POST /api/v1/sync/inventory`) al cual el ERP pueda enviar datos mediante Webhook o tarea programada (CRON).

## 6. Especificaciones de la Interfaz de Usuario (UI/UX)

### 6.1 Vista del Vendedor (Mobile-First)

* **Buscador Dinámico:** un único campo que filtra **mientras se escribe**, igual que el cuadro de texto actual del Excel. Busca coincidencias parciales en descripción, medida, marca, modelo y código, ignorando mayúsculas, acentos y espacios múltiples (ej. `RX307`, `DEPRED`, `175 65 R14`).

* **Filtros opcionales:** categoría (Llantas/Camión) y "sólo con disponibilidad".

* **Tarjeta de Resultado (Card Design):**

  * **Encabezado:** Descripción (ERP) o Medida + Marca + Modelo; código Pecarsys.

  * **Disponibilidad:** `Disponible` destacado (existencia − apartados), con `Existencia | Apartados` como detalle.

  * **Precios:** tabla con los escalones por volumen que existan para el producto, rotulados por rango de compra; si sólo hay `PRECIO UNICO`, se muestra un solo precio. Se ocultan los escalones vacíos y, si no hay ningún precio, se muestra "Sin precio".

* **Vigencia de datos:** encabezado con la sucursal y la fecha/hora del último corte de inventario y de la última lista de precios.

### 6.2 Vista de Administración

* **Panel de Control de Usuarios:** Tabla con lista de usuarios registrados, botón para alternar el estado de activación (`Aprobar`/`Inactivar`) y cambio de rol.

* **Panel de Importación de Datos:** dos pasos numerados y rotulados (1. Existencias del sistema, 2. Lista de precios) con descripción y ejemplo de nombre de archivo; si los archivos se suben invertidos se indica cuál va en cada paso. Al terminar muestra sucursal, fecha del corte, artículos con/sin precio y avisos. Los archivos se suben tal como se reciben, sin depuración manual.

## 7. Hoja de Ruta de Implementación (Roadmap)

1. **Fase 1: Infraestructura y Base de Datos**

   * Configuración del proyecto en Supabase (Tablas, RLS - Row Level Security, Triggers de Auth).

   * Despliegue de la API de Backend (Python/FastAPI) para procesamiento de archivos Excel.

2. **Fase 2: Gestión de Usuarios y Seguridad**

   * Implementación de flujos de registro, login y middleware de validación para cuentas activas (`is_active`).

   * Construcción del panel de aprobación de usuarios para el Administrador.

3. **Fase 3: Módulo de Carga e Integración de Datos**

   * Algoritmo de parseo de archivos Excel y lógica de cruce por clave *Pecarsys*.

   * Actualización masiva en base de datos.

4. **Fase 4: Frontend Móvil (PWA) e Interfaz de Consulta**

   * Desarrollo de la interfaz de usuario responsiva.

   * Configuración de Manifest PWA y Service Workers para instalación en pantalla de inicio.

5. **Fase 5: Pruebas y Despliegue**

   * Pruebas de usabilidad en dispositivos Android y iOS.

   * Despliegue a producción en Vercel y Render.