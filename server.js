import express from 'express';
import path from 'path';
import session from 'express-session';
import MySQLStoreFactory from 'express-mysql-session';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { pool } from './db.js';
import cashflowRouter from './routes/cashflow.js';
import empenioRouter from './routes/empenio.js';

dotenv.config({ quiet: true });

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true })); // Para datos de formularios
app.use(express.json()); // Para datos en formato JSON
app.use(express.static('public'));

async function ensureFechaInicioSistemaColumn() {
    try {
        const [rows] = await pool.query(
            `SELECT COUNT(*) AS total
               FROM INFORMATION_SCHEMA.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE()
                AND TABLE_NAME = 'config_caja'
                AND COLUMN_NAME = 'fecha_inicio_sistema'`
        );
        if (!rows[0]?.total) {
            await pool.query(
                "ALTER TABLE config_caja ADD COLUMN fecha_inicio_sistema DATE NULL AFTER cierre_autorizado"
            );
        }
    } catch (e) {
        console.error('Error ensuring fecha_inicio_sistema column:', e);
    }
}

// Configuración de sesión para manejo de login
const MySQLStore = MySQLStoreFactory(session);
const sessionStore = new MySQLStore({
  host: process.env.DB_HOST || process.env.MYSQLHOST || 'localhost',
  port: Number(process.env.DB_PORT || process.env.MYSQLPORT || 3306),
  user: process.env.DB_USER || process.env.MYSQLUSER || 'root',
  password: process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || '1234',
  database: process.env.DB_NAME || process.env.MYSQLDATABASE || 'mydb',
  createDatabaseTable: true,
});

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'empenios_app_secret_key',
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
  })
);

// Hacer disponible el usuario logueado en todas las vistas EJS
app.use((req, res, next) => {
  res.locals.user = req.session?.user || null;
  next();
});

// Configurar EJS como motor de plantillas
app.set('view engine', 'ejs');
app.set('views', path.resolve('views')); // Carpeta donde estarán las vistas

// Configuración de la conexión con MySQL
// El pool de conexiones se importa desde ./db.js (configuración centralizada)

const isAdminUser = (req) => (req.session?.user?.rol || '').toLowerCase() === 'admin';

// Middleware para proteger rutas que requieren autenticación
function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.redirect('/');
  }
  next();
}

// Rutas montadas que requieren autenticación
app.use('/cashflow', requireAuth, cashflowRouter);
app.use('/empenio', requireAuth, empenioRouter);

// Página de login (vista principal "/")
app.get('/', async (req, res) => {
  try {
    const { error } = req.query;
    res.render('login.ejs', { error: error || null });
  } catch (error) {
    console.error('Error al cargar la página de login:', error);
    res.status(500).send('Error al cargar la página de login');
  }
});

// Procesar login
app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.render('login.ejs', { error: 'Ingrese usuario y contraseña.' });
  }

  try {
    const [rows] = await pool.query('SELECT * FROM usuarios WHERE username = ?', [username]);
    if (rows.length === 0) {
      return res.render('login.ejs', { error: 'Usuario o contraseña incorrectos.' });
    }
    const user = rows[0];

    // Verificar estado del usuario
    if (user.estado && user.estado !== 'activo') {
      return res.render('login.ejs', { error: 'El usuario está inactivo.' });
    }
    //imprime el hash de la contraseña: "user123" con bcrypt
    //console.log('Hash de la contraseña para "user123":', await bcrypt.hash('user123', 10));
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.render('login.ejs', { error: 'Usuario o contraseña incorrectos.' });
    }

    // Guardar datos mínimos en sesión
    req.session.user = {
      id: user.id,
      username: user.username,
      rol: user.rol,
      nombre: user.nombre,
      empresaId: user.empresaId,
      isAdminUser: isAdminUser({ session: { user } })
      
    };

    return res.redirect('/dashboard');
  } catch (error) {
    console.error('Error en el proceso de login:', error);
    return res.status(500).send('Error en el servidor durante el login');
  }
});

// Cerrar sesión
app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

// Rutas protegidas
app.get('/dashboard', requireAuth, async (req, res) => {
  try {
    const isAdmin = isAdminUser(req);
    let dashboardData = null;

    if (isAdmin) {
      const empresaId = req.session.user.empresaId;

      const [empresaRows] = await pool.query(
        'SELECT capital, nombre FROM empresa WHERE id = ? LIMIT 1',
        [empresaId]
      );

      const [prestamoRows] = await pool.query(
        `SELECT IFNULL(SUM(Monto), 0) AS dinero_empleado
           FROM Empenios
          WHERE empresaId = ?
            AND LOWER(Estado) = 'activo'`,
        [empresaId]
      );

      const capitalTotal = Number(empresaRows[0]?.capital || 0);
      const dineroEmpleado = Number(prestamoRows[0]?.dinero_empleado || 0);
      const saldoDisponible = capitalTotal - dineroEmpleado;

      dashboardData = {
        empresaNombre: empresaRows[0]?.nombre || 'Empresa',
        capitalTotal,
        dineroEmpleado,
        saldoDisponible,
      };
    }

    res.render('dashboard.ejs', {
      isAdmin,
      dashboardData,
      user: req.session.user
    });
  } catch (error) {
    console.error('Error al cargar el dashboard:', error);
    res.status(500).send('Error al obtener los datos');
  }
});

app.get('/interests', requireAuth, async (req, res) => {
  try {
    res.render('interests.ejs');
  } catch (error) {
    console.error('Error al cargar la página de intereses:', error);
    res.status(500).send('Error al obtener los datos');
  }
});

app.get('/reports', requireAuth, async (req, res) => {
  try {
    res.render('reports.ejs', {
      user: req.session.user,
      isAdmin: isAdminUser(req)
    });
  } catch (error) {
    console.error('Error al cargar la página de reportes:', error);
    res.status(500).send('Error al obtener los datos');
  }
});

app.get('/settings', requireAuth, async (req, res) => {
  try {
    await ensureFechaInicioSistemaColumn();
    const empresaId = req.session.user.empresaId;
    const [configRows] = await pool.query(
      'SELECT saldo_inicial_manual, cierre_autorizado, fecha_inicio_sistema FROM config_caja WHERE empresaId = ? LIMIT 1',
      [empresaId]
    );

    const config = configRows[0] || { saldo_inicial_manual: null, cierre_autorizado: 0, fecha_inicio_sistema: null };

    res.render('settings.ejs', {
      config,
      isAdmin: isAdminUser(req),
      saved: req.query.saved || null,
      error: req.query.error || null
    });
  } catch (error) {
    console.error('Error al cargar la página de configuración:', error);
    res.status(500).send('Error al obtener los datos');
  }
});

// Guardar configuración de caja (solo admin)
app.post('/settings/caja', requireAuth, async (req, res) => {
  if (!isAdminUser(req)) {
    return res.status(403).send('Solo el administrador puede actualizar esta configuración.');
  }

  const empresaId = req.session.user.empresaId;
  const { saldo_inicial_manual, cierre_autorizado, fecha_inicio_sistema } = req.body;

  const saldoInicial = saldo_inicial_manual === '' || saldo_inicial_manual === undefined
    ? null
    : parseFloat(saldo_inicial_manual);

  const autorizado = cierre_autorizado ? 1 : 0;
  const fechaInicio = fecha_inicio_sistema || null;

  try {
    await ensureFechaInicioSistemaColumn();
    await pool.query(
      `INSERT INTO config_caja (empresaId, saldo_inicial_manual, cierre_autorizado, fecha_inicio_sistema)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         saldo_inicial_manual = VALUES(saldo_inicial_manual),
         cierre_autorizado = VALUES(cierre_autorizado),
         fecha_inicio_sistema = VALUES(fecha_inicio_sistema)`,
      [empresaId, saldoInicial, autorizado, fechaInicio]
    );

    res.redirect('/settings?saved=1');
  } catch (error) {
    console.error('Error al guardar la configuración de caja:', error);
    res.redirect('/settings?error=1');
  }
});


// Iniciar el servidor
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
