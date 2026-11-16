// routes/empenio.js
import express from 'express';
import { pool } from '../db.js';

let transaccionesLossColumnReady = null;

async function ensureTransaccionesLossColumn() {
  if (!transaccionesLossColumnReady) {
    transaccionesLossColumnReady = (async () => {
      const [rows] = await pool.query(
        `SELECT COUNT(*) AS total
           FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'Transacciones'
            AND COLUMN_NAME = 'monto_perdida'`
      );

      if (!rows[0]?.total) {
        await pool.query(
          'ALTER TABLE Transacciones ADD COLUMN monto_perdida DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER monto_ganancia'
        );
      }
    })();
  }

  return transaccionesLossColumnReady;
}

let transaccionesEstadoReady = null;

async function ensureTransaccionesEstadoColumn() {
  if (!transaccionesEstadoReady) {
    transaccionesEstadoReady = (async () => {
      const [rows] = await pool.query(
        `SELECT COUNT(*) AS total
           FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'Transacciones'
            AND COLUMN_NAME = 'estado'`
      );
      if (!rows[0]?.total) {
        await pool.query(
          "ALTER TABLE Transacciones ADD COLUMN estado ENUM('activa','anulada') NOT NULL DEFAULT 'activa' AFTER id_empenio"
        );
      }
    })();
  }
  return transaccionesEstadoReady;
}

const app = express();

app.use(express.urlencoded({ extended: true })); // Para datos de formularios
app.use(express.json()); // Para datos en formato JSON

// Búsqueda de empeños activos para selector (autocomplete)
app.get('/buscar', async (req, res) => {
  const term = (req.query.term || '').trim();
  if (!term) {
    return res.json([]);
  }

  try {
    const like = `%${term}%`;
    const [rows] = await pool.execute(
      `SELECT idEmpenios, Nombres_Cliente, Apellidos_Cliente, Artefacto, Marca, Monto
         FROM Empenios
        WHERE empresaId = ?
          AND LOWER(Estado) = 'activo'
          AND (
              Nombres_Cliente LIKE ?
              OR Apellidos_Cliente LIKE ?
              OR Artefacto LIKE ?
              OR Marca LIKE ?
              OR Monto LIKE ?
          )
        ORDER BY idEmpenios DESC
        LIMIT 20`,
      [req.session.user.empresaId, like, like, like, like, like]
    );

    res.json(rows);
  } catch (error) {
    console.error('Error al buscar empeños:', error);
    res.status(500).json({ error: 'Error al buscar empeños' });
  }
});

// Listar transacciones
app.get('/', async (req, res) => {
  const { nombres, apellidos, artefacto, marca, fecha, monto, showAll } = req.query;
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(10, Number.parseInt(req.query.limit, 10) || 25));

  // Only allow showAll for admin users
  const allowShowAll = showAll === '1' && req.session.user.isAdminUser;

  let query = `SELECT emp.*, e.nombre AS empresaNombre
                 FROM Empenios emp
            LEFT JOIN empresa e ON e.id = emp.empresaId
                WHERE 1=1`;
  let params = [];

  // Filter by empresa (unless admin and requesting showAll)
  if (!allowShowAll) {
    query += ' AND emp.empresaId = ?';
    params.push(req.session.user.empresaId);
  }

  // Non-admin users don't see anulated empeños
  if (!req.session.user.isAdminUser) {
    query += " AND LOWER(emp.Estado) != 'anulado'";
  }

  if (nombres) {
    query += ' AND emp.Nombres_Cliente LIKE ?';
    params.push(`%${nombres}%`);
  }
  if (apellidos) {
    query += ' AND emp.Apellidos_Cliente LIKE ?';
    params.push(`%${apellidos}%`);
  }
  if (artefacto) {
    query += ' AND emp.Artefacto LIKE ?';
    params.push(`%${artefacto}%`);
  }
  if (marca) {
    query += ' AND emp.Marca LIKE ?';
    params.push(`%${marca}%`);
  }
  if (fecha) {
    query += ' AND emp.Fecha = ?';
    params.push(fecha);
  }
  if (monto) {
    query += ' AND emp.Monto = ?';
    params.push(monto);
  }

  try {
    const countQuery = query.replace(
      'SELECT emp.*, e.nombre AS empresaNombre',
      'SELECT COUNT(*) AS total'
    );
    const [countRows] = await pool.execute(countQuery, params);
    const total = Number(countRows[0]?.total || 0);
    const summaryQuery = countQuery.replace(
      'SELECT COUNT(*) AS total',
      `SELECT
         COALESCE(SUM(CASE WHEN LOWER(emp.Estado) = 'activo' THEN emp.Monto ELSE 0 END), 0) AS totalMontoActivos,
         COALESCE(SUM(CASE WHEN LOWER(emp.Estado) = 'activo' THEN 1 ELSE 0 END), 0) AS totalActivos`
    );
    const [summaryRows] = await pool.execute(summaryQuery, params);
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const currentPage = Math.min(page, totalPages);
    query += ` ORDER BY emp.idEmpenios DESC LIMIT ${limit} OFFSET ${(currentPage - 1) * limit}`;
    const [rows] = await pool.execute(query, params);
    const queryParams = new URLSearchParams();
    for (const [key, value] of Object.entries({ nombres, apellidos, artefacto, marca, fecha, monto, showAll: allowShowAll ? '1' : '' })) {
      if (value) queryParams.set(key, value);
    }
    queryParams.set('limit', String(limit));
    const urlForPage = (targetPage) => {
      const next = new URLSearchParams(queryParams);
      next.set('page', String(targetPage));
      return `/empenio?${next.toString()}`;
    };
    res.render('Empe.ejs', {
      empenios: rows,
      nombres,
      apellidos,
      artefacto,
      marca,
      fecha,
      monto,
      currentEmpresaId: req.session.user.empresaId,
      showAll: allowShowAll,
      pagination: {
        page: currentPage,
        limit,
        total,
        totalPages,
        urls: Object.fromEntries(Array.from({ length: totalPages }, (_, index) => [index + 1, urlForPage(index + 1)])),
        previousUrl: urlForPage(Math.max(1, currentPage - 1)),
        nextUrl: urlForPage(Math.min(totalPages, currentPage + 1))
      },
      totalMontoActivos: Number(summaryRows[0]?.totalMontoActivos || 0),
      totalActivos: Number(summaryRows[0]?.totalActivos || 0),
      str: ""
    });
  } catch (error) {
    console.error('Error al obtener los empeños:', error);
    res.status(500).send('Error al obtener los datos');
  }
});

app.post('/actualizar-empenio/:id', async (req, res) => {
  const { id } = req.params;
  const { nombres, apellidos, artefacto, marca, fecha, monto, descripcion, estado } = req.body;
  const montoNumerico = Number(monto);
  const estadosValidos = ['Activo', 'Recogido', 'En venta', 'Vendido', 'Finalizado', 'Anulado'];
  if (!nombres?.trim() || !apellidos?.trim() || !artefacto?.trim() || !marca?.trim()
      || !fecha || !Number.isFinite(montoNumerico) || montoNumerico < 0
      || !estadosValidos.includes(estado)) {
    return res.status(400).send('Los datos del empeño no son válidos.');
  }
  try {
    const [result] = await pool.query(
      'UPDATE Empenios SET Nombres_Cliente = ?, Apellidos_Cliente = ?, Artefacto = ?, Marca = ?, Fecha = ?, Monto = ?, Detalles=?, Estado=? WHERE idEmpenios = ? AND empresaId = ?',
      [nombres, apellidos, artefacto, marca, fecha, montoNumerico, descripcion, estado, id, req.session.user.empresaId]
    );

    if (result.affectedRows === 0) {
      return res.status(403).send('No tienes permiso para editar este empeño');
    }

    res.redirect(req.get("Referrer") || "/empenio");
  } catch (error) {
    console.error('Error al actualizar el empeño:', error);
    res.status(500).send('Error al actualizar los datos');
  }
});

app.post('/guardar-empenio', async (req, res) => {
  const { nombres, apellidos, artefacto, marca, fecha, monto, descripcion } = req.body;
  const montoNumerico = Number(monto);
  if (!nombres?.trim() || !apellidos?.trim() || !artefacto?.trim() || !marca?.trim()
      || !fecha || !Number.isFinite(montoNumerico) || montoNumerico < 0) {
    return res.status(400).send('Los datos del empeño no son válidos.');
  }

  try {
    await pool.execute(
      'INSERT INTO Empenios (Nombres_Cliente, Apellidos_Cliente, Artefacto, Marca, Fecha, Monto, Detalles, usuarioId, empresaId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [nombres, apellidos, artefacto, marca, fecha, montoNumerico, descripcion, req.session.user.id, req.session.user.empresaId]
    );

    res.redirect('/cashflow'); // Redirige a la lista de transacciones después de guardar
  } catch (error) {
    console.error('Error al guardar el empeño:', error);
    res.status(500).send('Error al guardar los datos');
  }
});



app.post('/:id/interes', async (req, res) => {
  const { id } = req.params;
  const { monto, descripcion, fecha } = req.body;
  const montoNumerico = Number(monto);
  if (!fecha || !Number.isFinite(montoNumerico) || montoNumerico <= 0 || !descripcion?.trim()) {
    return res.status(400).json({ error: 'Los datos del interés no son válidos' });
  }

  try {
    // Verify empeño ownership
    const [empenios] = await pool.execute('SELECT idEmpenios FROM Empenios WHERE idEmpenios = ? AND empresaId = ?', [id, req.session.user.empresaId]);

    if (empenios.length === 0) {
      return res.status(403).json({ error: 'No tienes permiso para agregar intereses a este empeño' });
    }

    await ensureTransaccionesLossColumn();
    await ensureTransaccionesEstadoColumn();

    await pool.execute(
      `INSERT INTO Transacciones
        (tipo, categoria, monto_total, monto_ganancia, monto_perdida, descripcion, fecha, usuarioId, empresaId, id_empenio, estado)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['entrada', 'interes', montoNumerico, 0, 0, descripcion, fecha, req.session.user.id, req.session.user.empresaId, id, 'activa']
    );

    return res.status(201).json({ message: 'Interés agregado correctamente' });
  } catch (error) {
    console.error('Error al agregar interés:', error);
    return res.status(500).json({ error: 'Error al agregar interés' });
  }
});

// Actualizar un interés existente asociado a un empeño
app.put('/:id/interes', async (req, res) => {
  const { id } = req.params;
  const { originalFecha, originalMonto, originalDescripcion, fecha, monto, descripcion } = req.body;
  const montoNumerico = Number(monto);

  if (!originalFecha || !originalMonto || !originalDescripcion
      || !fecha || !Number.isFinite(montoNumerico) || montoNumerico <= 0 || !descripcion?.trim()) {
    return res.status(400).json({ error: 'Datos originales del interés incompletos' });
  }

  try {
    // Verify empeño ownership
    const [empenios] = await pool.execute('SELECT idEmpenios FROM Empenios WHERE idEmpenios = ? AND empresaId = ?', [id, req.session.user.empresaId]);

    if (empenios.length === 0) {
      return res.status(403).json({ error: 'No tienes permiso para actualizar intereses en este empeño' });
    }

    await ensureTransaccionesLossColumn();

    const [matchRows] = await pool.execute(
      `SELECT id
         FROM Transacciones
        WHERE id_empenio = ?
          AND categoria = 'interes'
          AND DATE(fecha) = ?
          AND monto_total = ?
           AND descripcion = ?
           AND empresaId = ?
        ORDER BY id DESC
        LIMIT 1`,
      [id, originalFecha, originalMonto, originalDescripcion, req.session.user.empresaId]
    );

    if (matchRows.length === 0) {
      return res.status(404).json({ error: 'Interés no encontrado para actualizar' });
    }

    const [result] = await pool.execute(
      `UPDATE Transacciones
          SET fecha = ?, monto_total = ?, descripcion = ?
         WHERE id = ? AND empresaId = ?`,
      [fecha, montoNumerico, descripcion, matchRows[0].id, req.session.user.empresaId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Interés no encontrado para actualizar' });
    }

    res.json({ message: 'Interés actualizado correctamente' });
  } catch (error) {
    console.error('Error al actualizar el interés:', error);
    res.status(500).json({ error: 'Error al actualizar el interés' });
  }
});

// Eliminar un interés asociado a un empeño
app.delete('/:id/interes', async (req, res) => {
  const { id } = req.params;
  const { fecha, monto, descripcion } = req.body;

  if (!fecha || !monto || !descripcion) {
    return res.status(400).json({ error: 'Datos del interés incompletos para eliminar' });
  }

  try {
    // Verify empeño ownership
    const [empenios] = await pool.execute('SELECT idEmpenios FROM Empenios WHERE idEmpenios = ? AND empresaId = ?', [id, req.session.user.empresaId]);

    if (empenios.length === 0) {
      return res.status(403).json({ error: 'No tienes permiso para eliminar intereses en este empeño' });
    }

    await ensureTransaccionesLossColumn();

    const [matchRows] = await pool.execute(
      `SELECT id
         FROM Transacciones
        WHERE id_empenio = ?
          AND categoria = 'interes'
          AND DATE(fecha) = ?
          AND monto_total = ?
           AND descripcion = ?
           AND empresaId = ?
        ORDER BY id DESC
        LIMIT 1`,
      [id, fecha, monto, descripcion, req.session.user.empresaId]
    );

    if (matchRows.length === 0) {
      return res.status(404).json({ error: 'Interés no encontrado para eliminar' });
    }

    const [result] = await pool.execute(
      "UPDATE Transacciones SET estado = 'anulada' WHERE id = ? AND empresaId = ?",
      [matchRows[0].id, req.session.user.empresaId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Interés no encontrado para anular' });
    }

    res.json({ message: 'Interés anulado correctamente' });
  } catch (error) {
    console.error('Error al anular el interés:', error);
    res.status(500).json({ error: 'Error al anular el interés' });
  }
});
app.get('/:id/detalle', async (req, res) => {
  const { id } = req.params;

  try {
    await ensureTransaccionesLossColumn();
    const [empenioData] = await pool.execute(
      `SELECT emp.*, e.nombre AS empresaNombre
         FROM Empenios emp
    LEFT JOIN empresa e ON e.id = emp.empresaId
        WHERE emp.idEmpenios = ? AND emp.empresaId = ?`,
      [id, req.session.user.empresaId]
    );
    const [interesesData] = await pool.execute(
      `SELECT
          DATE(fecha) AS Fecha,
          monto_total AS Monto,
          descripcion AS Descripcion
         FROM Transacciones
        WHERE id_empenio = ? AND empresaId = ?
          AND categoria = 'interes'
        ORDER BY fecha ASC, id ASC`,
      [id, req.session.user.empresaId]
    );

    if (empenioData.length === 0) {
      return res.status(404).send('Empeño no encontrado');
    }

    let empenio = empenioData[0];
    empenio.Fecha = empenio.Fecha.toISOString().split('T')[0];
    empenio.isEditable = empenio.empresaId === req.session.user.empresaId;

    return res.json({
      empenio,
      intereses: interesesData
    });

  } catch (error) {
    console.error('Error al obtener los detalles:', error);
    res.status(500).send('Error en el servidor');
  }
});

// Obtener totales por mes
app.get('/totales', async (req, res) => {
  try {
    await ensureTransaccionesLossColumn();
    const [capital] = await pool.query(`
      SELECT YEAR(fecha) as year, MONTH(fecha) as month, SUM(monto_total - monto_ganancia - COALESCE(monto_perdida, 0)) AS capital
            FROM Transacciones
            WHERE tipo = "entrada" AND empresaId = ? AND estado = 'activa'
            GROUP BY YEAR(fecha), MONTH(fecha)
            ORDER BY YEAR(fecha), MONTH(fecha)
        `, [req.session.user.empresaId]);
    const [ganancias] = await pool.query(`
            SELECT YEAR(fecha) as year, MONTH(fecha) as month, SUM(monto_ganancia) AS ganancias
            FROM Transacciones
            WHERE empresaId = ? AND estado = 'activa'
            GROUP BY YEAR(fecha), MONTH(fecha)
            ORDER BY YEAR(fecha), MONTH(fecha)
        `, [req.session.user.empresaId]);
    const [entradas] = await pool.query(`
            SELECT YEAR(fecha) as year, MONTH(fecha) as month, SUM(monto_total) AS entradas
            FROM Transacciones
            WHERE tipo = "entrada" AND empresaId = ? AND estado = 'activa'
            GROUP BY YEAR(fecha), MONTH(fecha)
            ORDER BY YEAR(fecha), MONTH(fecha)
        `, [req.session.user.empresaId]);
    const [salidas] = await pool.query(`
            SELECT YEAR(fecha) as year, MONTH(fecha) as month, SUM(monto_total) AS salidas
            FROM Transacciones
            WHERE tipo = "salida" AND empresaId = ? AND estado = 'activa'
            GROUP BY YEAR(fecha), MONTH(fecha)
            ORDER BY YEAR(fecha), MONTH(fecha)
        `, [req.session.user.empresaId]);

    res.json({
      capital,
      ganancias,
      entradas,
      salidas
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener totales por mes' });
  }
});

// Guardar empeño + transacción de préstamo en una sola operación atómica
app.post('/guardar-empenio-con-transaccion', async (req, res) => {
  const {
    nombres, apellidos, artefacto, marca, fecha_empenio, monto_empenio, descripcion_empenio,
    monto_prestamo, fecha_prestamo, descripcion_prestamo, nota
  } = req.body;
  const montoEmpenioNumerico = Number(monto_empenio);
  const montoPrestamoNumerico = Number(monto_prestamo);
  if (!nombres?.trim() || !apellidos?.trim() || !artefacto?.trim() || !marca?.trim()
      || !fecha_empenio || !fecha_prestamo
      || !Number.isFinite(montoEmpenioNumerico) || montoEmpenioNumerico < 0
      || !Number.isFinite(montoPrestamoNumerico) || montoPrestamoNumerico < 0) {
    return res.status(400).send('Los datos del empeño y préstamo no son válidos.');
  }

  const connection = await pool.getConnection();
  try {
    await ensureTransaccionesLossColumn();
    await ensureTransaccionesEstadoColumn();
    await connection.beginTransaction();

    const [resultEmp] = await connection.execute(
      'INSERT INTO Empenios (Nombres_Cliente, Apellidos_Cliente, Artefacto, Marca, Fecha, Monto, Detalles, Estado, usuarioId, empresaId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [nombres, apellidos, artefacto, marca, fecha_empenio, montoEmpenioNumerico, descripcion_empenio || '', 'Activo', req.session.user.id, req.session.user.empresaId]
    );

    const empenioId = resultEmp.insertId;

    await connection.execute(
      `INSERT INTO Transacciones (tipo, categoria, monto_total, monto_ganancia, monto_perdida, descripcion, fecha, usuarioId, empresaId, nota, id_empenio, estado)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['salida', 'prestamo', montoPrestamoNumerico, 0, 0, descripcion_prestamo || '', fecha_prestamo, req.session.user.id, req.session.user.empresaId, nota || null, empenioId, 'activa']
    );

    await connection.commit();
    res.redirect('/cashflow');
  } catch (error) {
    await connection.rollback();
    console.error('Error al guardar empeño con transacción:', error);
    res.status(500).send('Error al guardar los datos');
  } finally {
    connection.release();
  }
});

export default app;
