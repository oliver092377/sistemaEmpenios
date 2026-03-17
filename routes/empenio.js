// routes/cashflow.js
import express from 'express';
import mysql from 'mysql2/promise';

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
  const { nombres, apellidos, artefacto, marca, fecha, monto, propietario } = req.query;

  let query = 'SELECT * FROM Empenios WHERE 1=1';
  let params = [];

  if (nombres) {
    query += ' AND Nombres_Cliente LIKE ?';
    params.push(`%${nombres}%`);
  }
  if (apellidos) {
    query += ' AND Apellidos_Cliente LIKE ?';
    params.push(`%${apellidos}%`);
  }
  if (artefacto) {
    query += ' AND Artefacto LIKE ?';
    params.push(`%${artefacto}%`);
  }
  if (marca) {
    query += ' AND Marca LIKE ?';
    params.push(`%${marca}%`);
  }
  if (fecha) {
    query += ' AND Fecha = ?';
    params.push(fecha);
  }
  if (monto) {
    query += ' AND Monto = ?';
    params.push(monto);
  }
  if (propietario) {
    query += ' AND Propietario LIKE ?';
    params.push(`%${propietario}%`);
  }

  try {
    query += ' ORDER BY idEmpenios DESC';
    const [rows] = await pool.execute(query, params);
    res.render('Empe.ejs', { empenios: rows, nombres, apellidos, artefacto, marca, fecha, monto, propietario, str: "" });
  } catch (error) {
    console.error('Error al obtener los empeños:', error);
    res.status(500).send('Error al obtener los datos');
  }
});


app.get('/nuevo-empenio', (req, res) => {
  res.render('nuevo_empenio');
});

app.get('/editar-empenio/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await pool.query('SELECT * FROM Empenios WHERE idEmpenios = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).send('Empeño no encontrado');
    }
    let empenio = rows[0];
    empenio.Fecha = empenio.Fecha.toISOString().split('T')[0];
    res.render('editar_empenio', { empenio: rows[0] });
  } catch (error) {
    console.error('Error al obtener el empeño:', error);
    res.status(500).send('Error al cargar la página de edición');
  }
});
app.post('/actualizar-empenio/:id', async (req, res) => {
  const { id } = req.params;
  console.log(id)
  const { nombres, apellidos, artefacto, marca, fecha, monto, propietario, descripcion, estado } = req.body;
  console.log("estado: ", estado)
  try {
    await pool.query(
      'UPDATE Empenios SET Nombres_Cliente = ?, Apellidos_Cliente = ?, Artefacto = ?, Marca = ?, Fecha = ?, Monto = ?, Propietario = ?, Detalles=?, Estado=? WHERE idEmpenios = ?',
      [nombres, apellidos, artefacto, marca, fecha, monto, propietario, descripcion, estado, id]
    );

    res.redirect('back'); 
  } catch (error) {
    console.error('Error al actualizar el empeño:', error);
    res.status(500).send('Error al actualizar los datos');
  }
});

app.post('/guardar-empenio', async (req, res) => {
  const { nombres, apellidos, artefacto, marca, fecha, monto, propietario, descripcion } = req.body;

  try {
    await pool.execute(
      'INSERT INTO Empenios (Nombres_Cliente, Apellidos_Cliente, Artefacto, Marca, Fecha, Monto, Propietario, Detalles, usuarioId, empresaId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [nombres, apellidos, artefacto, marca, fecha, monto, propietario, descripcion, req.session.user.id, req.session.user.empresaId]
    );

    res.redirect('/cashflow'); // Redirige a la lista de transacciones después de guardar
  } catch (error) {
    console.error('Error al guardar el empeño:', error);
    res.status(500).send('Error al guardar los datos');
  }
});

app.get('/agregar-interes/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await pool.query('SELECT * FROM Empenios WHERE idEmpenios = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).send('Empeño no encontrado');
    }
    let empenio = rows[0];
    empenio.Fecha = empenio.Fecha.toISOString().split('T')[0];
    res.render('agregar_interes', { empenio: rows[0] });
  } catch (error) {
    console.error('Error al obtener el empeño:', error);
    res.status(500).send('Error al cargar la página de edición');
  }
});




app.post('/:id/interes', async (req, res) => {
  const { id } = req.params;
  const { monto, descripcion, fecha } = req.body;

  try {
    await pool.execute(
      'INSERT INTO Interes (id, Monto, Descripcion, Fecha) VALUES (?, ?, ?, ?)',
      [id, monto, descripcion, fecha]
    );

    return res.status(201).json({ message: 'Interés agregado correctamente' });
  } catch (error) {
    console.error('Error al agregar interés:', error);
    return res.status(500).json({ error: 'Error al agregar interés' });
  }
});

// Actualizar un interés existente asociado a un empeño
app.put('/:id/interes', async (req, res) => {
  const { id } = req.params; // id del empeño
  const { originalFecha, originalMonto, originalDescripcion, fecha, monto, descripcion } = req.body;

  if (!originalFecha || !originalMonto || !originalDescripcion) {
    return res.status(400).json({ error: 'Datos originales del interés incompletos' });
  }

  try {
    const [result] = await pool.execute(
      'UPDATE Interes SET Fecha = ?, Monto = ?, Descripcion = ? WHERE id = ? AND Fecha = ? AND Monto = ? AND Descripcion = ?',
      [fecha, monto, descripcion, id, originalFecha, originalMonto, originalDescripcion]
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
  const { id } = req.params; // id del empeño
  const { fecha, monto, descripcion } = req.body;

  if (!fecha || !monto || !descripcion) {
    return res.status(400).json({ error: 'Datos del interés incompletos para eliminar' });
  }

  try {
    const [result] = await pool.execute(
      'DELETE FROM Interes WHERE id = ? AND Fecha = ? AND Monto = ? AND Descripcion = ?',
      [id, fecha, monto, descripcion]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Interés no encontrado para eliminar' });
    }

    res.json({ message: 'Interés eliminado correctamente' });
  } catch (error) {
    console.error('Error al eliminar el interés:', error);
    res.status(500).json({ error: 'Error al eliminar el interés' });
  }
});
app.get('/:id/detalle', async (req, res) => {
  const { id } = req.params;

  try {
    const [empenioData] = await pool.execute('SELECT * FROM Empenios WHERE idEmpenios = ?', [id]);
    const [interesesData] = await pool.execute('SELECT * FROM Interes WHERE id = ?', [id]);

    if (empenioData.length === 0) {
      return res.status(404).send('Empeño no encontrado');
    }

    let empenio = empenioData[0];
    empenio.Fecha = empenio.Fecha.toISOString().split('T')[0];
    // Siempre devolvemos los datos en formato JSON (ya no se renderiza la vista "detalle")
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
    const [capital] = await pool.query(`
            SELECT YEAR(fecha) as year, MONTH(fecha) as month, SUM(monto_total - monto_ganancia) AS capital
            FROM transacciones
            WHERE tipo = "entrada"
            GROUP BY YEAR(fecha), MONTH(fecha)
            ORDER BY YEAR(fecha), MONTH(fecha)
        `);
    const [ganancias] = await pool.query(`
            SELECT YEAR(fecha) as year, MONTH(fecha) as month, SUM(monto_ganancia) AS ganancias
            FROM transacciones
            GROUP BY YEAR(fecha), MONTH(fecha)
            ORDER BY YEAR(fecha), MONTH(fecha)
        `);
    const [entradas] = await pool.query(`
            SELECT YEAR(fecha) as year, MONTH(fecha) as month, SUM(monto_total) AS entradas
            FROM transacciones
            WHERE tipo = "entrada"
            GROUP BY YEAR(fecha), MONTH(fecha)
            ORDER BY YEAR(fecha), MONTH(fecha)
        `);
    const [salidas] = await pool.query(`
            SELECT YEAR(fecha) as year, MONTH(fecha) as month, SUM(monto_total) AS salidas
            FROM transacciones
            WHERE tipo = "salida"
            GROUP BY YEAR(fecha), MONTH(fecha)
            ORDER BY YEAR(fecha), MONTH(fecha)
        `);

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
export default app;