import express from 'express';
import mysql from 'mysql2/promise';

const router = express.Router();

// Configuración de la conexión a la base de datos (debería estar en un archivo separado)
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

const todayAsDateString = () => new Date().toLocaleDateString('en-CA');

async function getConfigCaja(empresaId) {
    const [rows] = await pool.query(
        'SELECT saldo_inicial_manual, cierre_autorizado FROM config_caja WHERE empresaId = ? LIMIT 1',
        [empresaId]
    );
    return rows[0] || { saldo_inicial_manual: null, cierre_autorizado: 0 };
}

// Listar transacciones
router.get('/', async (req, res) => {
    try {
        const empresaId = req.session.user.empresaId;
        let { filtro, fecha, mes, nuevoEmpenio, montoEmpenio, fechaEmpenio } = req.query;
        const today = new Date();
        let rows = [];
        let fechaValue = fecha;
        let mesValue = mes;
        console.log('Filtro:', filtro, 'Fecha:', fecha, 'Mes:', mes);
        if (!filtro || filtro === 'dia') {
            // Filtro por día (por defecto)
            if (!fecha) {
                fechaValue = today.toLocaleDateString('en-CA');
                console.log('Fecha por defecto usada:', fechaValue);
            }
            [rows] = await pool.query(
                'SELECT * FROM Transacciones WHERE DATE(fecha) = ? AND empresaId=' + req.session.user.empresaId + ' ORDER BY fecha ASC',
                [fechaValue]
            );
        } else if (filtro === 'mes') {
            // Filtro por mes
            if (!mes) {
                // Si no se selecciona mes, usar el mes actual
                const year = today.getFullYear();
                const month = String(today.getMonth() + 1).padStart(2, '0');
                mesValue = `${year}-${month}`;
            }
            const [year, month] = mesValue.split('-');
            [rows] = await pool.query(
                'SELECT * FROM Transacciones WHERE YEAR(fecha) = ? AND MONTH(fecha) = ?' + ' AND empresaId=' + req.session.user.empresaId + ' ORDER BY fecha ASC',
                [year, month]
            );
            
        }
        //quiero mandar como parametro el nombre del usuario que realizó cada transacción para mostrarlo en la tabla, el id del usuario está en la tabla transacciones pero no su nombre, entonces tengo que hacer un join con la tabla usuarios para obtener el nombre del usuario asociado a cada transacción
        rows = await Promise.all(rows.map(async (transaccion) => {
            const [usuarioRows] = await pool.query('SELECT nombre FROM usuarios WHERE id = ? LIMIT 1', [transaccion.usuarioId]);
            const nombreUsuario = usuarioRows.length ? usuarioRows[0].nombre : 'Desconocido';
            return { ...transaccion, nombreUsuario };
        }));
        console.log('Transacciones obtenidas:', rows.length);
        console.log('Usuario en sesión:', req.session.user.nombre);
        const configCaja = await getConfigCaja(empresaId);
        const [cierreHoyRows] = await pool.query(
            'SELECT * FROM caja_diaria WHERE empresaId = ? AND fecha = ? LIMIT 1',
            [empresaId, todayAsDateString()]
        );
        const cierreHoy = cierreHoyRows[0] || null;
        
        res.render('cashflow.ejs', {
            transacciones: rows,
            filtro: filtro || 'dia',
            fecha: fechaValue,
            mes: mesValue,
            nuevoEmpenio: nuevoEmpenio === '1',
            montoEmpenio: montoEmpenio || '',
            fechaEmpenio: fechaEmpenio || '',
            cierreAutorizado: !!configCaja.cierre_autorizado,
            cajaCerradaHoy: !!cierreHoy,
            resumenCaja: cierreHoy || null
        });
    } catch (error) {
        console.error('Error en la consulta:', error);
        res.status(500).send('Error al obtener los datos');
    }
});

//listar transacciones del mes actual en orden ascendente por fecha
router.get('/transacciones-mes-actual', async (req, res) => {
    try {
        const today = new Date();
        const year = today.getFullYear();
        const month = today.getMonth() + 1;
        const [rows] = await pool.query(
            'SELECT * FROM Transacciones WHERE YEAR(fecha) = ? AND MONTH(fecha) = ?'+' AND empresaId='+req.session.user.empresaId+' ORDER BY fecha ASC',
            [year, month]
        );
        console.log('Usuario en sesión:', req.session.user.nombre); // Imprime el usuario en sesión para verificar
        const nombreUsuario = req.session.user.nombre;
        // Devuelve las transacciones en formato JSON y el nombre del usuario asociado
        res.json({
            transacciones: rows,
            usuario: nombreUsuario
        });
    
    } catch (error) {
        console.error('Error en la consulta:', error);
        res.status(500).json({ error: 'Error al obtener los datos' });
    }  
});

// Listar transacciones del día actual en orden ascendente por fecha
router.get('/transacciones-dia-actual', async (req, res) => {
    try {
        const today = new Date();
        const fechaHoy = today.toLocaleDateString('en-CA'); // yyyy-mm-dd en la zona local
        const [rows] = await pool.query(
            'SELECT * FROM Transacciones WHERE DATE(fecha) = ?' + ' AND empresaId=' + req.session.user.empresaId + ' ORDER BY fecha ASC',
            [fechaHoy]
        );

        const nombreUsuario = req.session.user.nombre;
        res.json({
            transacciones: rows,
            usuario: nombreUsuario,
            fecha: fechaHoy
        });
    } catch (error) {
        console.error('Error en la consulta:', error);
        res.status(500).json({ error: 'Error al obtener los datos del día' });
    }
});

// Crear nueva transacción
router.post('/guardar-transaccion', async (req, res) => {
    const { tipo, categoria, monto, ganancia, descripcion, fecha, nota, id_empenio } = req.body;
    const isRecogida = tipo === 'entrada' && categoria === 'empenio';
    const isInteres = tipo === 'entrada' && categoria === 'interes';

    if ((isRecogida || isInteres) && !id_empenio) {
        return res.status(400).send('Debe seleccionar el empeño asociado.');
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        await connection.execute(
            'INSERT INTO transacciones (tipo, monto_total, monto_ganancia, descripcion, categoria, fecha, usuarioId, empresaId, nota, id_empenio) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
                tipo,
                monto,
                ganancia,
                descripcion,
                categoria,
                fecha,
                req.session.user.id,
                req.session.user.empresaId,
                nota || null,
                (isRecogida || isInteres) ? id_empenio : null
            ]
        );

        if (isRecogida) {
            await connection.execute(
                'UPDATE Empenios SET Estado = ? WHERE idEmpenios = ? AND empresaId = ?',
                ['Recogido', id_empenio, req.session.user.empresaId]
            );
        }

        if (isInteres) {
            await connection.execute(
                'INSERT INTO Interes (id, Monto, Descripcion, Fecha) VALUES (?, ?, ?, ?)',
                [id_empenio, monto, descripcion || 'Interés', fecha]
            );
        }

        await connection.commit();

        if (tipo === 'salida' && categoria === 'prestamo') {
            const params = [];
            params.push('nuevoEmpenio=1');
            if (monto) {
                params.push(`montoEmpenio=${encodeURIComponent(monto)}`);
            }
            if (fecha) {
                params.push(`fechaEmpenio=${encodeURIComponent(fecha)}`);
            }
            const queryString = params.join('&');
            return res.redirect(`/cashflow?${queryString}`);
        }

        res.redirect('/cashflow');
    } catch (error) {
        await connection.rollback();
        console.error('Error al guardar la transacción:', error);
        res.status(500).send('Error al guardar los datos');
    } finally {
        connection.release();
    }
});

// Editar transacción
router.post('/editar-transaccion', async (req, res) => {
    const { id, tipo, categoria, monto, ganancia, descripcion, fecha, nota } = req.body;
    console.log(req.body);
    try {
        await pool.execute(
            'UPDATE transacciones SET tipo = ?, categoria = ?, monto_total = ?, monto_ganancia = ?, descripcion = ?, fecha = ?, nota = ? WHERE id = ?',
            [tipo, categoria, monto, ganancia, descripcion, fecha, nota || null, id]
        );
        res.redirect('/cashflow');
    } catch (error) {
        console.error('Error al editar la transacción:', error);
        res.status(500).send('Error al editar la transacción');
    }
});

// Cerrar caja diaria
router.post('/cierre-caja', async (req, res) => {
    const empresaId = req.session.user.empresaId;
    const usuarioId = req.session.user.id;
    const hoy = todayAsDateString();

    try {
        const config = await getConfigCaja(empresaId);
        if (!config.cierre_autorizado) {
            return res.status(403).json({ error: 'El administrador aún no autoriza el cierre de caja.' });
        }

        const [cierreExistente] = await pool.query(
            'SELECT id, capital_final, ganancia_dia, saldo_final FROM caja_diaria WHERE empresaId = ? AND fecha = ? LIMIT 1',
            [empresaId, hoy]
        );

        if (cierreExistente.length) {
            return res.status(400).json({
                error: 'La caja ya fue cerrada para el día de hoy.',
                data: cierreExistente[0]
            });
        }

        const [ultimoCierre] = await pool.query(
            'SELECT capital_final FROM caja_diaria WHERE empresaId = ? AND fecha < ? ORDER BY fecha DESC LIMIT 1',
            [empresaId, hoy]
        );
        console.log('Último cierre encontrado:', ultimoCierre);

        let saldoInicial;
        if (ultimoCierre.length) {
            saldoInicial = Number(ultimoCierre[0].capital_final || 0);
        } else if (config.saldo_inicial_manual !== null && config.saldo_inicial_manual !== undefined) {
            saldoInicial = Number(config.saldo_inicial_manual || 0);
        } else {
            return res.status(400).json({ error: 'Defina el saldo inicial en Configuración antes del primer cierre.' });
        }

        const [totalesRows] = await pool.query(
            `SELECT
                IFNULL(SUM(CASE WHEN tipo = 'entrada' THEN monto_total ELSE 0 END), 0) AS total_entradas,
                IFNULL(SUM(CASE WHEN tipo = 'salida' THEN monto_total ELSE 0 END), 0) AS total_salidas,
                IFNULL(SUM(CASE WHEN tipo = 'entrada' THEN monto_ganancia ELSE 0 END), 0) AS ganancia_dia,
                IFNULL(SUM(CASE WHEN tipo = 'entrada' THEN (monto_total - monto_ganancia) ELSE -monto_total END), 0) AS delta_capital
              FROM transacciones
              WHERE empresaId = ? AND DATE(fecha) = ?`,
            [empresaId, hoy]
        );

        const totales = totalesRows[0] || {};
        const totalEntradas = Number(totales.total_entradas || 0);
        const totalSalidas = Number(totales.total_salidas || 0);
        const gananciaDia = Number(totales.ganancia_dia || 0);
        const deltaCapital = Number(totales.delta_capital || 0);

        const capitalFinal = saldoInicial + deltaCapital;
        const saldoFinal = capitalFinal + gananciaDia;

        await pool.query(
            `INSERT INTO caja_diaria (
                empresaId, fecha, saldo_inicial, total_entradas, total_salidas, ganancia_dia, capital_final, saldo_final, usuarioId
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                empresaId,
                hoy,
                saldoInicial,
                totalEntradas,
                totalSalidas,
                gananciaDia,
                capitalFinal,
                saldoFinal,
                usuarioId
            ]
        );

        return res.json({
            message: 'Caja cerrada correctamente.',
            data: {
                fecha: hoy,
                saldo_inicial: saldoInicial,
                total_entradas: totalEntradas,
                total_salidas: totalSalidas,
                ganancia_dia: gananciaDia,
                capital_final: capitalFinal,
                saldo_final: saldoFinal
            }
        });
    } catch (error) {
        console.error('Error al cerrar la caja:', error);
        return res.status(500).json({ error: 'No se pudo cerrar la caja. Intente nuevamente.' });
    }
});

//creame una ruta para eliminar una transaccion
router.post('/eliminar-transaccion', async (req, res) => { 
    const { id } = req.body;
    try {
        await pool.execute('DELETE FROM transacciones WHERE id = ?', [id]);
        res.redirect('/cashflow');
    } catch (error) {
        console.error('Error al eliminar la transacción:', error);
        res.status(500).send('Error al eliminar la transacción');
    }
});
// Obtener totales por mes
router.get('/totales', async (req, res) => {
    try {
        const [capital] = await pool.query(`
            SELECT YEAR(fecha) as year, MONTH(fecha) as month, SUM(monto_total - monto_ganancia) AS capital
            FROM transacciones
            WHERE tipo = "entrada" and  empresaId=`+req.session.user.empresaId+`
            GROUP BY YEAR(fecha), MONTH(fecha)
            ORDER BY YEAR(fecha), MONTH(fecha)
        `);
        const [ganancias] = await pool.query(`
            SELECT YEAR(fecha) as year, MONTH(fecha) as month, SUM(monto_ganancia) AS ganancias
            FROM transacciones 
            WHERE  empresaId=`+req.session.user.empresaId+`
            GROUP BY YEAR(fecha), MONTH(fecha)
            ORDER BY YEAR(fecha), MONTH(fecha)
        `);
        const [entradas] = await pool.query(`
            SELECT YEAR(fecha) as year, MONTH(fecha) as month, SUM(monto_total) AS entradas
            FROM transacciones
            WHERE tipo = "entrada" and  empresaId=`+req.session.user.empresaId+`
            GROUP BY YEAR(fecha), MONTH(fecha)
            ORDER BY YEAR(fecha), MONTH(fecha)
        `);
        const [salidas] = await pool.query(`
            SELECT YEAR(fecha) as year, MONTH(fecha) as month, SUM(monto_total) AS salidas
            FROM transacciones
            WHERE tipo = "salida" and  empresaId=`+req.session.user.empresaId+`
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
export default router;