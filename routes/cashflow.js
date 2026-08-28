import express from 'express';
import { pool } from '../db.js';

const router = express.Router();

const todayAsDateString = () => new Date().toLocaleDateString('en-CA');

let transaccionesLossColumnReady = null;

async function ensureTransaccionesLossColumn() {
    if (!transaccionesLossColumnReady) {
        transaccionesLossColumnReady = (async () => {
            const [rows] = await pool.query(
                `SELECT COUNT(*) AS total
                   FROM INFORMATION_SCHEMA.COLUMNS
                  WHERE TABLE_SCHEMA = DATABASE()
                    AND TABLE_NAME = 'transacciones'
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

let configFechaInicioReady = null;

async function ensureFechaInicioSistemaColumn() {
    if (!configFechaInicioReady) {
        configFechaInicioReady = (async () => {
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
        })();
    }

    return configFechaInicioReady;
}

let transaccionesEstadoColumnReady = null;

async function ensureTransaccionesEstadoColumn() {
    if (!transaccionesEstadoColumnReady) {
        transaccionesEstadoColumnReady = (async () => {
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

    return transaccionesEstadoColumnReady;
}

async function adjustEmpresaCapital(connection, empresaId, deltaCapital) {
    const delta = Number(deltaCapital || 0);

    if (delta === 0) {
        return;
    }

    const [result] = await connection.execute(
        'UPDATE empresa SET capital = capital + ? WHERE id = ? AND (capital + ?) >= 0',
        [delta, empresaId, delta]
    );

    if (result.affectedRows === 0) {
        throw new Error('CAPITAL_INSUFICIENTE');
    }
}

async function resolveSaldoInicial(empresaId, fecha) {
    const config = await getConfigCaja(empresaId);
    const [ultimoCierre] = await pool.query(
        'SELECT capital_final FROM caja_diaria WHERE empresaId = ? AND fecha < ? ORDER BY fecha DESC LIMIT 1',
        [empresaId, fecha]
    );

    if (ultimoCierre.length) {
        return { saldoInicial: Number(ultimoCierre[0].capital_final || 0), config };
    }

    if (config.saldo_inicial_manual !== null && config.saldo_inicial_manual !== undefined) {
        return { saldoInicial: Number(config.saldo_inicial_manual || 0), config };
    }

    return { saldoInicial: null, config };
}

async function getConfigCaja(empresaId) {
    const [rows] = await pool.query(
        'SELECT saldo_inicial_manual, cierre_autorizado, fecha_inicio_sistema FROM config_caja WHERE empresaId = ? LIMIT 1',
        [empresaId]
    );
    return rows[0] || { saldo_inicial_manual: null, cierre_autorizado: 0, fecha_inicio_sistema: null };
}

// Listar transacciones
router.get('/', async (req, res) => {
    try {
        const empresaId = req.session.user.empresaId;
        let { filtro, fecha, mes } = req.query;
        const today = new Date();
        let rows = [];
        let fechaValue = fecha;
        let mesValue = mes;
        console.log('Filtro:', filtro, 'Fecha:', fecha, 'Mes:', mes);
        const isAdmin = req.session.user.isAdminUser;
        const estadoFilter = isAdmin ? '' : " AND estado = 'activa'";
        if (!filtro || filtro === 'dia') {
            // Filtro por día (por defecto)
            if (!fecha) {
                fechaValue = today.toLocaleDateString('en-CA');
            }
            [rows] = await pool.query(
                'SELECT * FROM Transacciones WHERE DATE(fecha) = ? AND empresaId=?' + estadoFilter + ' ORDER BY fecha ASC',
                [fechaValue, req.session.user.empresaId]
            );
        } else if (filtro === 'mes') {
            // Filtro por mes
            if (!mes) {
                const year = today.getFullYear();
                const month = String(today.getMonth() + 1).padStart(2, '0');
                mesValue = `${year}-${month}`;
            }
            const [year, month] = mesValue.split('-');
            [rows] = await pool.query(
                'SELECT * FROM Transacciones WHERE YEAR(fecha) = ? AND MONTH(fecha) = ? AND empresaId=?' + estadoFilter + ' ORDER BY fecha ASC',
                [year, month, req.session.user.empresaId]
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
        await ensureFechaInicioSistemaColumn();
        const { saldoInicial, config } = await resolveSaldoInicial(empresaId, todayAsDateString());
        const [cierreHoyRows] = await pool.query(
            'SELECT * FROM caja_diaria WHERE empresaId = ? AND fecha = ? LIMIT 1',
            [empresaId, todayAsDateString()]
        );
        const cierreHoy = cierreHoyRows[0] || null;

        const fechaHoy = today.toLocaleDateString('en-CA');

        res.render('cashflow.ejs', {
            transacciones: rows,
            filtro: filtro || 'dia',
            fecha: fechaValue,
            mes: mesValue,
            fechaHoy,
            cierreAutorizado: !!config.cierre_autorizado,
            cajaCerradaHoy: !!cierreHoy,
            resumenCaja: cierreHoy || null,
            saldoInicialDia: saldoInicial,
            fechaInicioSistema: config.fecha_inicio_sistema || null
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
        const estadoFilter = req.session.user.isAdminUser ? '' : " AND t.estado = 'activa'";
        const [rows] = await pool.query(
            'SELECT t.*, u.nombre AS nombreUsuario FROM Transacciones t LEFT JOIN usuarios u ON t.usuarioId = u.id WHERE YEAR(t.fecha) = ? AND MONTH(t.fecha) = ? AND t.empresaId = ?' + estadoFilter + ' ORDER BY t.fecha ASC',
            [year, month, req.session.user.empresaId]
        );
        res.json({ transacciones: rows });
    
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
        const estadoFilter = req.session.user.isAdminUser ? '' : " AND t.estado = 'activa'";
        const [rows] = await pool.query(
            'SELECT t.*, u.nombre AS nombreUsuario FROM Transacciones t LEFT JOIN usuarios u ON t.usuarioId = u.id WHERE DATE(t.fecha) = ? AND t.empresaId = ?' + estadoFilter + ' ORDER BY t.fecha ASC',
            [fechaHoy, req.session.user.empresaId]
        );

        res.json({ transacciones: rows, fecha: fechaHoy });
    } catch (error) {
        console.error('Error en la consulta:', error);
        res.status(500).json({ error: 'Error al obtener los datos del día' });
    }
});

// Crear nueva transacción
router.post('/guardar-transaccion', async (req, res) => {
    const { tipo, categoria, monto, monto_resultado, resultado_tipo_final, ganancia, perdida, descripcion, fecha, nota, id_empenio, sin_empenio } = req.body;
    const sinEmpenio = sin_empenio === 'true';
    const empenioId = id_empenio ? Number(id_empenio) : null;
    const isRecogida = tipo === 'entrada' && categoria === 'empenio';
    const isVenta = tipo === 'entrada' && categoria === 'venta';
    const isInteres = tipo === 'entrada' && categoria === 'interes';
    const montoGanancia = Number(ganancia || 0);
    const montoPerdida = Number(perdida || 0);
    const montoResultado = Number(monto_resultado || 0);
    const resultadoTipo = (resultado_tipo_final || 'ganancia').toLowerCase();
    const resultadoEsPerdida = tipo === 'entrada' && (isRecogida || isVenta) && resultadoTipo === 'perdida';
    const montoGananciaFinal = resultadoEsPerdida ? 0 : (monto_resultado !== undefined ? montoResultado : montoGanancia);
    const montoPerdidaFinal = resultadoEsPerdida ? (monto_resultado !== undefined ? montoResultado : montoPerdida) : montoPerdida;
    const perdidaAplicada = tipo === 'entrada' ? montoPerdidaFinal : 0;

    if ((isRecogida || isVenta || isInteres) && !empenioId && !sinEmpenio) {
        return res.status(400).send('Debe seleccionar el empeño asociado.');
    }

    if (Number.isNaN(montoGananciaFinal) || Number.isNaN(montoPerdidaFinal) || Number.isNaN(montoResultado)) {
        return res.status(400).send('Los montos ingresados no son válidos.');
    }

    const connection = await pool.getConnection();
    try {
        await ensureTransaccionesLossColumn();
        await ensureTransaccionesEstadoColumn();
        await connection.beginTransaction();

        await connection.execute(
            'INSERT INTO Transacciones (tipo, monto_total, monto_ganancia, monto_perdida, descripcion, categoria, fecha, usuarioId, empresaId, nota, id_empenio, estado) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
                tipo,
                monto,
                montoGananciaFinal,
                perdidaAplicada,
                descripcion,
                categoria,
                fecha,
                req.session.user.id,
                req.session.user.empresaId,
                nota || null,
                empenioId,
                'activa'
            ]
        );

        if (perdidaAplicada > 0) {
            await adjustEmpresaCapital(connection, req.session.user.empresaId, -perdidaAplicada);
        }

        if (isRecogida && empenioId) {
            await connection.execute(
                'UPDATE Empenios SET Estado = ? WHERE idEmpenios = ? AND empresaId = ?',
                ['Recogido', empenioId, req.session.user.empresaId]
            );
        }
        if (isVenta && empenioId) {
            await connection.execute(
                'UPDATE Empenios SET Estado = ? WHERE idEmpenios = ? AND empresaId = ?',
                ['Vendido', empenioId, req.session.user.empresaId]
            );
        }

        await connection.commit();
        res.redirect('/cashflow');
    } catch (error) {
        await connection.rollback();
        if (error.message === 'CAPITAL_INSUFICIENTE') {
            return res.status(400).send('El capital de la empresa no es suficiente para registrar esa pérdida.');
        }
        console.error('Error al guardar la transacción:', error);
        res.status(500).send('Error al guardar los datos');
    } finally {
        connection.release();
    }
});

// Editar transacción
router.post('/editar-transaccion', async (req, res) => {
    const { id, tipo, categoria, monto, ganancia, perdida, descripcion, fecha, nota } = req.body;
    console.log(req.body);
    try {
        await ensureTransaccionesLossColumn();

        const [currentRows] = await pool.execute(
            'SELECT empresaId, COALESCE(monto_perdida, 0) AS monto_perdida FROM Transacciones WHERE id = ? LIMIT 1',
            [id]
        );

        if (currentRows.length === 0) {
            return res.status(404).send('La transacción no existe.');
        }

        const currentRow = currentRows[0];
        const montoGanancia = Number(ganancia || 0);
        const montoPerdida = tipo === 'entrada' ? Number(perdida || 0) : 0;

        if (Number.isNaN(montoGanancia) || Number.isNaN(montoPerdida)) {
            return res.status(400).send('Los montos ingresados no son válidos.');
        }

        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            await connection.execute(
                'UPDATE Transacciones SET tipo = ?, categoria = ?, monto_total = ?, monto_ganancia = ?, monto_perdida = ?, descripcion = ?, fecha = ?, nota = ? WHERE id = ?',
                [tipo, categoria, monto, montoGanancia, montoPerdida, descripcion, fecha, nota || null, id]
            );

            const deltaCapital = Number(currentRow.monto_perdida || 0) - montoPerdida;
            if (deltaCapital !== 0) {
                await adjustEmpresaCapital(connection, currentRow.empresaId, deltaCapital);
            }

            await connection.commit();
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
        res.redirect('/cashflow');
    } catch (error) {
        if (error.message === 'CAPITAL_INSUFICIENTE') {
            return res.status(400).send('No se puede registrar la pérdida porque el capital de la empresa quedaría negativo.');
        }
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
        await ensureTransaccionesLossColumn();
        const { saldoInicial, config } = await resolveSaldoInicial(empresaId, hoy);
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

        if (saldoInicial === null) {
            return res.status(400).json({ error: 'Defina el saldo inicial en Configuración antes del primer cierre.' });
        }

        const [totalesRows] = await pool.query(
            `SELECT
                IFNULL(SUM(CASE WHEN tipo = 'entrada' THEN monto_total ELSE 0 END), 0) AS total_entradas,
                IFNULL(SUM(CASE WHEN tipo = 'salida' THEN monto_total ELSE 0 END), 0) AS total_salidas,
                IFNULL(SUM(CASE WHEN tipo = 'entrada' THEN monto_ganancia ELSE 0 END), 0) AS ganancia_dia,
                                IFNULL(SUM(CASE WHEN tipo = 'entrada' THEN COALESCE(monto_perdida, 0) ELSE 0 END), 0) AS perdida_dia,
                                IFNULL(SUM(CASE WHEN tipo = 'entrada' THEN (monto_total - monto_ganancia - COALESCE(monto_perdida, 0)) ELSE -monto_total END), 0) AS delta_capital
              FROM Transacciones
              WHERE empresaId = ? AND DATE(fecha) = ? AND estado = 'activa'`,
            [empresaId, hoy]
        );

        const totales = totalesRows[0] || {};
        const totalEntradas = Number(totales.total_entradas || 0);
        const totalSalidas = Number(totales.total_salidas || 0);
        const gananciaDia = Number(totales.ganancia_dia || 0);
        const perdidaDia = Number(totales.perdida_dia || 0);
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
                perdida_dia: perdidaDia,
                capital_final: capitalFinal,
                saldo_final: saldoFinal
            }
        });
    } catch (error) {
        console.error('Error al cerrar la caja:', error);
        return res.status(500).json({ error: 'No se pudo cerrar la caja. Intente nuevamente.' });
    }
});

// Resumen diario sin cierre (solo lectura)
router.get('/resumen-dia', async (req, res) => {
    const empresaId = req.session.user.empresaId;
    const hoy = todayAsDateString();

    try {
        await ensureTransaccionesLossColumn();
        const { saldoInicial } = await resolveSaldoInicial(empresaId, hoy);
        if (saldoInicial === null) {
            return res.status(400).json({ error: 'Defina el saldo inicial en Configuración antes del primer cierre.' });
        }

        const [totalesRows] = await pool.query(
            `SELECT
                IFNULL(SUM(CASE WHEN tipo = 'entrada' THEN monto_total ELSE 0 END), 0) AS total_entradas,
                IFNULL(SUM(CASE WHEN tipo = 'salida' THEN monto_total ELSE 0 END), 0) AS total_salidas,
                IFNULL(SUM(CASE WHEN tipo = 'entrada' THEN monto_ganancia ELSE 0 END), 0) AS ganancia_dia,
                                IFNULL(SUM(CASE WHEN tipo = 'entrada' THEN COALESCE(monto_perdida, 0) ELSE 0 END), 0) AS perdida_dia,
                                IFNULL(SUM(CASE WHEN tipo = 'entrada' THEN (monto_total - monto_ganancia ) ELSE -monto_total END), 0) AS delta_capital
              FROM Transacciones
              WHERE empresaId = ? AND DATE(fecha) = ? AND estado = 'activa'`,
            [empresaId, hoy]
        );
        console.log('Totales del día:', totalesRows[0]);
        const totales = totalesRows[0] || {};
        const totalEntradas = Number(totales.total_entradas || 0);
        const totalSalidas = Number(totales.total_salidas || 0);
        const gananciaDia = Number(totales.ganancia_dia || 0);
        const perdidaDia = Number(totales.perdida_dia || 0);
        const deltaCapital = Number(totales.delta_capital || 0);

        const capitalFinal = saldoInicial + deltaCapital;
        const saldoFinal = capitalFinal + gananciaDia;

        return res.json({
            fecha: hoy,
            saldo_inicial: saldoInicial,
            total_entradas: totalEntradas,
            total_salidas: totalSalidas,
            ganancia_dia: gananciaDia,
            perdida_dia: perdidaDia,
            capital_final: capitalFinal,
            saldo_final: saldoFinal
        });
    } catch (error) {
        console.error('Error al obtener resumen diario:', error);
        return res.status(500).json({ error: 'No se pudo obtener el resumen del dia.' });
    }
});

// Anular transacción (en vez de eliminar)
router.post('/anular-transaccion', async (req, res) => {
    const { id } = req.body;
    try {
        await ensureTransaccionesLossColumn();
        await ensureTransaccionesEstadoColumn();
        const [rows] = await pool.execute(
            'SELECT * FROM Transacciones WHERE id = ? LIMIT 1',
            [id]
        );

        if (rows.length === 0) {
            return res.status(404).send('La transacción no existe.');
        }

        const transaccion = rows[0];

        if (transaccion.estado === 'anulada') {
            return res.status(400).send('La transacción ya está anulada.');
        }

        const esPrestamo = transaccion.tipo === 'salida' && transaccion.categoria === 'prestamo';
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            if (esPrestamo && transaccion.id_empenio) {
                const [otrasOps] = await connection.execute(
                    `SELECT COUNT(*) AS total FROM Transacciones
                     WHERE id_empenio = ? AND id != ? AND estado = 'activa'`,
                    [transaccion.id_empenio, id]
                );

                if (otrasOps[0].total > 0) {
                    await connection.rollback();
                    return res.status(400).send('Este empeño tiene operaciones asociadas y no puede ser anulado.');
                }

                await connection.execute(
                    "UPDATE Empenios SET Estado = 'Anulado' WHERE idEmpenios = ? AND empresaId = ?",
                    [transaccion.id_empenio, transaccion.empresaId]
                );
            }

            await connection.execute(
                "UPDATE Transacciones SET estado = 'anulada' WHERE id = ?",
                [id]
            );

            if (Number(transaccion.monto_perdida || 0) > 0) {
                await adjustEmpresaCapital(connection, transaccion.empresaId, Number(transaccion.monto_perdida || 0));
            }

            await connection.commit();
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
        res.redirect('/cashflow');
    } catch (error) {
        console.error('Error al anular la transacción:', error);
        res.status(500).send('Error al anular la transacción');
    }
});
// Obtener totales por mes
router.get('/totales', async (req, res) => {
    try {
        await ensureTransaccionesLossColumn();
        const empresaId = req.session.user.empresaId;

        const [yearsRows] = await pool.query(
            'SELECT DISTINCT YEAR(fecha) AS year FROM Transacciones WHERE empresaId = ? ORDER BY year ASC',
            [empresaId]
        );
        const years = yearsRows.map((r) => r.year);
        if (years.length === 0) {
            years.push(new Date().getFullYear());
        }

        let selectedYear = Number(req.query.year);
        if (!selectedYear || !years.includes(selectedYear)) {
            selectedYear = years[years.length - 1];
        }

        const [capital] = await pool.query(`
            SELECT YEAR(fecha) as year, MONTH(fecha) as month, SUM(monto_total - monto_ganancia - COALESCE(monto_perdida, 0)) AS capital
            FROM Transacciones
            WHERE tipo = "entrada" AND empresaId = ? AND YEAR(fecha) = ? AND estado = 'activa'
            GROUP BY YEAR(fecha), MONTH(fecha)
            ORDER BY YEAR(fecha), MONTH(fecha)
        `, [empresaId, selectedYear]);
        const [ganancias] = await pool.query(`
            SELECT YEAR(fecha) as year, MONTH(fecha) as month, SUM(monto_ganancia) AS ganancias
            FROM Transacciones
            WHERE empresaId = ? AND YEAR(fecha) = ? AND estado = 'activa'
            GROUP BY YEAR(fecha), MONTH(fecha)
            ORDER BY YEAR(fecha), MONTH(fecha)
        `, [empresaId, selectedYear]);
        const [perdidas] = await pool.query(`
            SELECT YEAR(fecha) as year, MONTH(fecha) as month, SUM(monto_perdida) AS perdidas
            FROM Transacciones
            WHERE tipo = "entrada" AND empresaId = ? AND YEAR(fecha) = ? AND estado = 'activa'
            GROUP BY YEAR(fecha), MONTH(fecha)
            ORDER BY YEAR(fecha), MONTH(fecha)
        `, [empresaId, selectedYear]);
        const [entradas] = await pool.query(`
            SELECT YEAR(fecha) as year, MONTH(fecha) as month, SUM(monto_total) AS entradas
            FROM Transacciones
            WHERE tipo = "entrada" AND empresaId = ? AND YEAR(fecha) = ? AND estado = 'activa'
            GROUP BY YEAR(fecha), MONTH(fecha)
            ORDER BY YEAR(fecha), MONTH(fecha)
        `, [empresaId, selectedYear]);
        const [salidas] = await pool.query(`
            SELECT YEAR(fecha) as year, MONTH(fecha) as month, SUM(monto_total) AS salidas
            FROM Transacciones
            WHERE tipo = "salida" AND empresaId = ? AND YEAR(fecha) = ? AND estado = 'activa'
            GROUP BY YEAR(fecha), MONTH(fecha)
            ORDER BY YEAR(fecha), MONTH(fecha)
        `, [empresaId, selectedYear]);

        res.json({
            capital,
            ganancias,
            perdidas,
            entradas,
            salidas,
            years,
            selectedYear
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al obtener totales por mes' });
    }
});
export default router;