# PECARSYS Mobile Frontend (PWA)

Aplicación mobile-first desarrollada en React, TypeScript, Vite y Tailwind
CSS para la consulta rápida de inventarios, existencias y precios de llantas.

## Stack

- React 19 con TypeScript
- Vite
- Tailwind CSS
- Lucide React
- Vite PWA Plugin

## Estructura

```text
mobile-web/
├── src/
│   ├── components/
│   │   ├── ImportPanel.tsx   # Importación y validación de archivos
│   │   └── SearchPage.tsx    # Consulta y tarjetas de productos
│   ├── services/api.ts       # Cliente HTTP tipado
│   ├── types/domain.ts       # Contratos del dominio
│   ├── App.tsx               # Navegación temporal y estado de sesión
│   ├── index.css             # Estilos globales
│   └── main.tsx              # Punto de montaje
├── package.json
└── vite.config.ts
```

## Ejecución

```powershell
npm install
npm run dev
npm run build
```

La URL del backend se puede cambiar con `VITE_API_BASE_URL`. Si no se define,
se utiliza `http://127.0.0.1:8000`.

## Estado de permisos

El rol `admin` mostrado actualmente en `App.tsx` es sólo un adaptador local
para separar la navegación administrativa durante el desarrollo. No representa
autorización de seguridad. La autenticación y los permisos reales se
implementarán después mediante Supabase Auth y validación equivalente en
FastAPI.
