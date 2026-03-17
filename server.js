import express from 'express';
import mysql from 'mysql2/promise';
import path from 'path';
import session from 'express-session';
import bcrypt from 'bcryptjs';
import cashflowRouter from './routes/cashflow.js';
import empenioRouter from './routes/empenio.js';

const app = express();
const PORT = 3000;

app.use(express.urlencoded({ extended: true })); // Para datos de formularios
app.use(express.json()); // Para datos en formato JSON
app.use(express.static('public'));

// Configuración de sesión para manejo de login
app.use(
  session({
    secret: 'empenios_app_secret_key',
    resave: false,
    saveUninitialized: false,
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
const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  port: 3306,
  password: '1234',
  database: 'mydb',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

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
    res.render('dashboard.ejs');
  } catch (error) {
    console.error('Error al cargar el dashboard:', error);
    res.status(500).send('Error al obtener los datos');
  }
});
app.get('/prueba', requireAuth, async (req, res) => {
  try {
    res.render('Empenios_copy.ejs');
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
    res.render('reports.ejs');
  } catch (error) {
    console.error('Error al cargar la página de reportes:', error);
    res.status(500).send('Error al obtener los datos');
  }
});

app.get('/settings', requireAuth, async (req, res) => {
  try {
    const empresaId = req.session.user.empresaId;
    const [configRows] = await pool.query(
      'SELECT saldo_inicial_manual, cierre_autorizado FROM config_caja WHERE empresaId = ? LIMIT 1',
      [empresaId]
    );

    const config = configRows[0] || { saldo_inicial_manual: null, cierre_autorizado: 0 };

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
  const { saldo_inicial_manual, cierre_autorizado } = req.body;

  const saldoInicial = saldo_inicial_manual === '' || saldo_inicial_manual === undefined
    ? null
    : parseFloat(saldo_inicial_manual);

  const autorizado = cierre_autorizado ? 1 : 0;

  try {
    await pool.query(
      `INSERT INTO config_caja (empresaId, saldo_inicial_manual, cierre_autorizado)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE
         saldo_inicial_manual = VALUES(saldo_inicial_manual),
         cierre_autorizado = VALUES(cierre_autorizado)`,
      [empresaId, saldoInicial, autorizado]
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
