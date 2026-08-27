# Sistema de Empeños

Aplicación web para administrar una casa de empeños. Permite registrar empeños, préstamos, recogidas, ventas, intereses y otros movimientos de caja, además de consultar reportes y gestionar la configuración de la caja diaria.

## Características

- Autenticación de usuarios mediante sesiones.
- Gestión de empeños y estados del artículo.
- Registro de transacciones de entrada y salida.
- Asociación entre préstamos y empeños.
- Registro, edición y consulta de intereses.
- Flujo de caja con filtros por día y mes.
- Cierre y resumen diario de caja.
- Reportes de movimientos, ganancias, pérdidas y capital.
- Soporte para varias empresas mediante `empresaId`.
- Roles de administrador y usuario normal.
- Anulación lógica de transacciones, conservando el historial.
- Las transacciones anuladas y los empeños anulados no se muestran a usuarios no administradores.

## Tecnologías

- Node.js
- Express 4
- EJS
- MySQL 8 o compatible
- `mysql2`
- `express-session` y `express-mysql-session`
- Bootstrap 5
- Chart.js
- Font Awesome

## Requisitos

- Node.js 18 o superior recomendado.
- MySQL en ejecución.
- Una base de datos llamada `mydb` o el nombre definido en las variables de entorno.
- La estructura de tablas esperada por la aplicación, incluyendo `usuarios`, `empresa`, `Empenios`, `transacciones`, `config_caja` y `caja_diaria`.

## Instalación

1. Instalar las dependencias:

```bash
npm install
```

2. Crear el archivo `.env` a partir de `.env.example`:

```bash
PORT=3000
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=tu_password
DB_NAME=mydb
SESSION_SECRET=cambia_este_secreto_largo
```

3. Crear o preparar la base de datos MySQL con las tablas requeridas.

La aplicación realiza algunas migraciones automáticas al iniciar o al usar determinadas funciones, como agregar columnas para el estado de las transacciones, pérdidas y fecha de inicio del sistema. Se recomienda respaldar la base de datos antes de ejecutarla en producción.

4. Iniciar el servidor:

```bash
npm start
```

La aplicación estará disponible en:

```text
http://localhost:3000
```

## Configuración de base de datos

Si no se define un valor en `.env`, se utilizan estos valores predeterminados:

| Variable | Predeterminado |
|---|---|
| `PORT` | `3000` |
| `DB_HOST` | `localhost` |
| `DB_PORT` | `3306` |
| `DB_USER` | `root` |
| `DB_PASSWORD` | `1234` |
| `DB_NAME` | `mydb` |
| `SESSION_SECRET` | Valor predeterminado de desarrollo |

En producción se deben definir explícitamente todas las variables, especialmente `DB_PASSWORD` y `SESSION_SECRET`.

## Módulos principales

- **Dashboard**: resumen general de la empresa y del capital disponible.
- **Flujo de Caja**: registro y consulta de entradas y salidas, filtros, edición, anulación y cierre diario.
- **Empeños**: alta, búsqueda, edición, consulta de detalles y asociación con operaciones.
- **Intereses**: registro y administración de intereses asociados a un empeño.
- **Reportes**: consultas de resultados y movimientos financieros.
- **Configuración**: saldo inicial, autorización de cierre y fecha de inicio del sistema.

## Roles y permisos

El rol se obtiene de la columna `rol` de la tabla `usuarios`.

- **Administrador**: puede consultar la información administrativa y operar sobre los registros según las reglas de la aplicación.
- **Usuario normal**: trabaja dentro de su empresa y no visualiza transacciones con estado `anulada` ni empeños con estado `Anulado`.
- Para usuarios normales, los botones de edición y anulación del flujo de caja se muestran únicamente para transacciones del día actual.
- Las operaciones `entrada/empenio` (recogida) y `entrada/venta` no muestran el botón de anulación a usuarios normales, aunque sí pueden editarse cuando corresponda.

## Rutas principales

### Aplicación

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/` | Página de inicio de sesión |
| `POST` | `/login` | Autenticación |
| `GET` | `/logout` | Cierre de sesión |
| `GET` | `/dashboard` | Dashboard |
| `GET` | `/interests` | Página de intereses |
| `GET` | `/reports` | Reportes |
| `GET` | `/settings` | Configuración |

### Flujo de caja

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/cashflow` | Historial con filtros por día o mes |
| `POST` | `/cashflow/guardar-transaccion` | Crear una transacción |
| `POST` | `/cashflow/editar-transaccion` | Editar una transacción |
| `POST` | `/cashflow/anular-transaccion` | Anular una transacción sin eliminarla |
| `GET` | `/cashflow/transacciones-dia-actual` | Transacciones del día actual |
| `GET` | `/cashflow/transacciones-mes-actual` | Transacciones del mes actual |
| `GET` | `/cashflow/resumen-dia` | Resumen diario |
| `POST` | `/cashflow/cierre-caja` | Cerrar la caja del día |
| `GET` | `/cashflow/totales` | Totales para reportes |

### Empeños

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/empenio` | Lista y búsqueda de empeños |
| `POST` | `/empenio/guardar-empenio` | Crear un empeño |
| `POST` | `/empenio/guardar-empenio-con-transaccion` | Crear empeño y préstamo en una operación atómica |
| `POST` | `/empenio/actualizar-empenio/:id` | Actualizar un empeño |
| `GET` | `/empenio/:id/detalle` | Consultar detalles e intereses |
| `GET` | `/empenio/buscar` | Buscar empeños activos |
| `POST` | `/empenio/:id/interes` | Agregar un interés |
| `PUT` | `/empenio/:id/interes` | Editar un interés |
| `DELETE` | `/empenio/:id/interes` | Anular un interés |
| `GET` | `/empenio/totales` | Obtener totales de empeños |

## Estructura del proyecto

```text
.
├── db.js                  # Pool de conexiones MySQL
├── server.js              # Configuración de Express, sesiones y rutas principales
├── routes/
│   ├── cashflow.js        # Flujo de caja y transacciones
│   └── empenio.js         # Empeños e intereses
├── views/                 # Plantillas EJS
│   ├── partials/          # Encabezado, menú, scripts y pie de página
│   ├── cashflow.ejs
│   ├── Empe.ejs
│   ├── dashboard.ejs
│   ├── interests.ejs
│   ├── reports.ejs
│   └── settings.ejs
├── public/
│   └── js/                # JavaScript del cliente
├── .env.example           # Plantilla de configuración
├── package.json
└── README.md
```

## Desarrollo

El proyecto utiliza módulos ES mediante `"type": "module"` en `package.json`. Para iniciar el servidor en desarrollo se utiliza:

```bash
npm start
```

Actualmente no hay una suite de pruebas automatizadas configurada. La orden `npm test` permanece como marcador y termina con error hasta que se incorporen pruebas.

## Despliegue en Railway

El proyecto incluye `railway.toml` y está preparado para desplegarse como un servicio Node.js en Railway.

### 1. Crear el proyecto

1. Crear un proyecto en [Railway](https://railway.com/).
2. Agregar un servicio **MySQL**.
3. Agregar el repositorio GitHub como servicio de aplicación.
4. Railway detectará Node.js y ejecutará `npm start`.

### 2. Configurar variables

En el servicio de la aplicación, crear estas variables. Si el servicio MySQL tiene otro nombre, reemplazar `MySQL` en las referencias:

```text
DB_HOST=${{MySQL.MYSQLHOST}}
DB_PORT=${{MySQL.MYSQLPORT}}
DB_USER=${{MySQL.MYSQLUSER}}
DB_PASSWORD=${{MySQL.MYSQLPASSWORD}}
DB_NAME=${{MySQL.MYSQLDATABASE}}
SESSION_SECRET=un-secreto-largo-y-aleatorio
```

Railway proporciona `PORT` automáticamente. La aplicación escucha en `0.0.0.0` y utiliza ese puerto.

### 3. Importar la base de datos local

Exportar la base de datos local:

```bash
mysqldump -u root -p mydb > backup.sql
```

En Railway, copiar las credenciales del servicio MySQL y ejecutar desde un equipo que tenga el cliente MySQL instalado:

```bash
mysql -h HOST_RAILWAY -P PUERTO_RAILWAY -u USUARIO_RAILWAY -p NOMBRE_BD_RAILWAY < backup.sql
```

No subir `backup.sql` al repositorio si contiene información real. La aplicación incluye migraciones automáticas para algunas columnas, pero no reemplaza el respaldo o la migración inicial de las tablas y datos existentes.

### 4. Publicar y comprobar

Después del deploy, generar un dominio público desde Railway y comprobar:

- Inicio de sesión.
- Dashboard y selección de empresa.
- Registro y consulta de empeños.
- Registro de transacciones e intereses.
- Cierre de caja y reportes.
- Persistencia de sesión después de reiniciar el servicio.

Para producción, usar un `SESSION_SECRET` nuevo y no reutilizar las credenciales locales del archivo `.env`.

## Seguridad

- No subir `.env` al repositorio.
- Cambiar `SESSION_SECRET` por un secreto largo y aleatorio.
- Usar un usuario MySQL con permisos mínimos en producción.
- Realizar respaldos antes de ejecutar migraciones automáticas.
- Configurar HTTPS y controles adicionales de sesión al desplegar públicamente.

## Licencia

El proyecto utiliza actualmente la licencia `ISC`, según `package.json`.
