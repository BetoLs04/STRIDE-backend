const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { getIO } = require('../config/socket');
const { emit } = require('../services/socketEmitter');
const { CAMPOS_BLOQUEO_MAP, TIPOS_USUARIO_VALIDOS, ALINEACIONES_VALIDAS } = require('../utils/constants');
const { requireSuperAdmin } = require('../middleware/roles');
const { sanitize, sanitizeStr } = require('../utils/sanitize');

// ========== USUARIOS DISPONIBLES ==========

router.get('/matriz-usuarios', requireSuperAdmin, async (req, res) => {
    try {
        const [directivos] = await db.execute('SELECT id, nombre_completo as nombre, direccion_id FROM directivos ORDER BY nombre_completo');
        const [personal] = await db.execute('SELECT id, nombre_completo as nombre, direccion_id FROM personal ORDER BY nombre_completo');
        const directivosConTipo = directivos.map(d => ({ ...d, tipo: 'directivo' }));
        const personalConTipo = personal.map(p => ({ ...p, tipo: 'personal' }));
        res.json({ success: true, data: [...directivosConTipo, ...personalConTipo] });
    } catch (error) {
        console.error('Error al obtener usuarios:', error);
        res.status(500).json({ success: false, error: 'Error al obtener usuarios' });
    }
});

// ========== SECCIONES ==========

router.get('/matriz-secciones', async (req, res) => {
    try {
        const [secciones] = await db.execute(`
            SELECT ms.*,
                   COUNT(msu.id) AS total_usuarios
            FROM matriz_secciones ms
            LEFT JOIN matriz_seccion_usuarios msu ON ms.id = msu.seccion_id
            GROUP BY ms.id
            ORDER BY ms.nombre
        `);
        for (let seccion of secciones) {
            const [usuarios] = await db.execute(`
                SELECT msu.id as asignacion_id, msu.usuario_id, msu.usuario_tipo,
                       CASE WHEN msu.usuario_tipo = 'directivo' THEN d.nombre_completo
                            WHEN msu.usuario_tipo = 'personal' THEN p.nombre_completo
                       END as nombre
                FROM matriz_seccion_usuarios msu
                LEFT JOIN directivos d ON msu.usuario_id = d.id AND msu.usuario_tipo = 'directivo'
                LEFT JOIN personal p ON msu.usuario_id = p.id AND msu.usuario_tipo = 'personal'
                WHERE msu.seccion_id = ?
                ORDER BY nombre
            `, [seccion.id]);
            seccion.usuarios = usuarios;
        }
        res.json({ success: true, data: secciones });
    } catch (error) {
        console.error('Error al obtener secciones:', error);
        res.status(500).json({ success: false, error: 'Error al obtener secciones' });
    }
});

router.post('/matriz-secciones', requireSuperAdmin, async (req, res) => {
    try {
        sanitize(req.body, { nombre: sanitizeStr });
        const { nombre } = req.body;
        if (!nombre || !nombre.trim()) {
            return res.status(400).json({ success: false, error: 'El nombre es requerido' });
        }
        const [result] = await db.execute('INSERT INTO matriz_secciones (nombre) VALUES (?)', [nombre.trim()]);
        res.status(201).json({ success: true, message: 'Sección creada', seccionId: result.insertId });
        emit('matriz:updated', { type: 'seccion:created', id: result.insertId });
    } catch (error) {
        console.error('Error al crear sección:', error);
        res.status(500).json({ success: false, error: 'Error al crear la sección' });
    }
});

router.put('/matriz-secciones/:id', requireSuperAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        sanitize(req.body, { nombre: sanitizeStr });
        const { nombre } = req.body;
        if (!nombre || !nombre.trim()) {
            return res.status(400).json({ success: false, error: 'El nombre es requerido' });
        }
        const [result] = await db.execute('UPDATE matriz_secciones SET nombre = ? WHERE id = ?', [nombre.trim(), id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, error: 'Sección no encontrada' });
        }
        res.json({ success: true, message: 'Sección actualizada' });
        emit('matriz:updated', { type: 'seccion:updated', id: parseInt(req.params.id) });
    } catch (error) {
        console.error('Error al actualizar sección:', error);
        res.status(500).json({ success: false, error: 'Error al actualizar la sección' });
    }
});

router.delete('/matriz-secciones/:id', requireSuperAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const [result] = await db.execute('DELETE FROM matriz_secciones WHERE id = ?', [id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, error: 'Sección no encontrada' });
        }
        res.json({ success: true, message: 'Sección eliminada' });
        emit('matriz:updated', { type: 'seccion:deleted', id: parseInt(req.params.id) });
    } catch (error) {
        console.error('Error al eliminar sección:', error);
        res.status(500).json({ success: false, error: 'Error al eliminar la sección' });
    }
});

// ========== ASIGNACIÓN DE USUARIOS ==========

router.post('/matriz-secciones/:id/usuarios', requireSuperAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { usuario_id, usuario_tipo } = req.body;
        if (!usuario_id || !usuario_tipo) {
            return res.status(400).json({ success: false, error: 'El usuario y tipo son requeridos' });
        }
        if (!TIPOS_USUARIO_VALIDOS.includes(usuario_tipo)) {
            return res.status(400).json({ success: false, error: 'Tipo de usuario inválido' });
        }
        const [existe] = await db.execute('SELECT id FROM matriz_secciones WHERE id = ?', [id]);
        if (existe.length === 0) {
            return res.status(404).json({ success: false, error: 'Sección no encontrada' });
        }
        await db.execute(
            'INSERT INTO matriz_seccion_usuarios (seccion_id, usuario_id, usuario_tipo) VALUES (?, ?, ?)',
            [id, usuario_id, usuario_tipo]
        );
        res.status(201).json({ success: true, message: 'Usuario asignado a la sección' });
        emit('matriz:updated', { type: 'usuario:asignado', seccionId: parseInt(req.params.id) });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ success: false, error: 'El usuario ya está asignado a esta sección' });
        }
        console.error('Error al asignar usuario:', error);
        res.status(500).json({ success: false, error: 'Error al asignar el usuario' });
    }
});

router.delete('/matriz-secciones/:id/usuarios/:usuarioId/:usuarioTipo', requireSuperAdmin, async (req, res) => {
    try {
        const { id, usuarioId, usuarioTipo } = req.params;
        if (!TIPOS_USUARIO_VALIDOS.includes(usuarioTipo)) {
            return res.status(400).json({ success: false, error: 'Tipo de usuario inválido' });
        }
        const [result] = await db.execute(
            'DELETE FROM matriz_seccion_usuarios WHERE seccion_id = ? AND usuario_id = ? AND usuario_tipo = ?',
            [id, usuarioId, usuarioTipo]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, error: 'Asignación no encontrada' });
        }
        res.json({ success: true, message: 'Usuario quitado de la sección' });
        emit('matriz:updated', { type: 'usuario:quitado', seccionId: parseInt(req.params.id) });
    } catch (error) {
        console.error('Error al quitar usuario:', error);
        res.status(500).json({ success: false, error: 'Error al quitar el usuario' });
    }
});

// ========== ENCABEZADO ==========

router.get('/matriz-encabezado', async (req, res) => {
    try {
        let [rows] = await db.execute('SELECT * FROM matriz_encabezado LIMIT 1');
        if (rows.length === 0) {
            const [result] = await db.execute(
                'INSERT INTO matriz_encabezado (codigo, revision, fecha_actualizacion, fecha_revision_indicadores, responsable, anio) VALUES (\'\', \'\', \'\', \'\', \'\', \'\')'
            );
            const [newRows] = await db.execute('SELECT * FROM matriz_encabezado WHERE id = ?', [result.insertId]);
            rows = newRows;
        }
        res.json({ success: true, data: rows[0] });
    } catch (error) {
        console.error('Error al obtener encabezado:', error);
        res.status(500).json({ success: false, error: 'Error al obtener encabezado' });
    }
});

router.put('/matriz-encabezado', requireSuperAdmin, async (req, res) => {
    try {
        sanitize(req.body, { codigo: sanitizeStr, revision: sanitizeStr, fecha_actualizacion: sanitizeStr, fecha_revision_indicadores: sanitizeStr, responsable: sanitizeStr, anio: sanitizeStr });
        const { codigo, revision, fecha_actualizacion, fecha_revision_indicadores, responsable, anio } = req.body;
        let [rows] = await db.execute('SELECT id FROM matriz_encabezado LIMIT 1');
        if (rows.length === 0) {
            const [result] = await db.execute(
                'INSERT INTO matriz_encabezado (codigo, revision, fecha_actualizacion, fecha_revision_indicadores, responsable, anio) VALUES (?, ?, ?, ?, ?, ?)',
                [codigo || '', revision || '', fecha_actualizacion || '', fecha_revision_indicadores || '', responsable || '', anio || '']
            );
        } else {
            await db.execute(
                'UPDATE matriz_encabezado SET codigo = ?, revision = ?, fecha_actualizacion = ?, fecha_revision_indicadores = ?, responsable = ?, anio = ? WHERE id = ?',
                [codigo || '', revision || '', fecha_actualizacion || '', fecha_revision_indicadores || '', responsable || '', anio || '', rows[0].id]
            );
        }
        const [updated] = await db.execute('SELECT * FROM matriz_encabezado LIMIT 1');
        res.json({ success: true, data: updated[0], message: 'Encabezado guardado' });
        emit('matriz:updated', { type: 'encabezado:updated' });
    } catch (error) {
        console.error('Error al guardar encabezado:', error);
        res.status(500).json({ success: false, error: 'Error al guardar encabezado' });
    }
});

// ========== COLUMNAS ==========

router.get('/matriz-columnas', async (req, res) => {
    try {
        const [columnas] = await db.execute('SELECT * FROM matriz_columnas ORDER BY orden ASC, id ASC');
        res.json({ success: true, data: columnas });
    } catch (error) {
        console.error('Error al obtener columnas:', error);
        res.status(500).json({ success: false, error: 'Error al obtener columnas' });
    }
});

router.post('/matriz-columnas', requireSuperAdmin, async (req, res) => {
    try {
        sanitize(req.body, { nombre: sanitizeStr });
        const { nombre } = req.body;
        if (!nombre || !nombre.trim()) {
            return res.status(400).json({ success: false, error: 'El nombre es requerido' });
        }
        const [result] = await db.execute('INSERT INTO matriz_columnas (nombre) VALUES (?)', [nombre.trim()]);
        res.status(201).json({ success: true, message: 'Columna creada', columnaId: result.insertId });
        emit('matriz:updated', { type: 'columna:created', id: result.insertId });
    } catch (error) {
        console.error('Error al crear columna:', error);
        res.status(500).json({ success: false, error: 'Error al crear la columna' });
    }
});

router.put('/matriz-columnas/:id', requireSuperAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        sanitize(req.body, { nombre: sanitizeStr });
        const { nombre, alineacion } = req.body;
        if (!nombre || !nombre.trim()) {
            return res.status(400).json({ success: false, error: 'El nombre es requerido' });
        }
        const alineacionVal = ALINEACIONES_VALIDAS.includes(alineacion) ? alineacion : 'center';
        const [result] = await db.execute('UPDATE matriz_columnas SET nombre = ?, alineacion = ? WHERE id = ?', [nombre.trim(), alineacionVal, id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, error: 'Columna no encontrada' });
        }
        const [updated] = await db.execute('SELECT * FROM matriz_columnas WHERE id = ?', [id]);
        res.json({ success: true, data: updated[0], message: 'Columna actualizada' });
        emit('matriz:updated', { type: 'columna:updated', id: parseInt(req.params.id) });
    } catch (error) {
        console.error('Error al actualizar columna:', error);
        res.status(500).json({ success: false, error: 'Error al actualizar la columna' });
    }
});

router.put('/matriz-columnas/:id/alineacion', requireSuperAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { alineacion } = req.body;
        if (!ALINEACIONES_VALIDAS.includes(alineacion)) {
            return res.status(400).json({ success: false, error: 'Alineación inválida' });
        }
        const [result] = await db.execute('UPDATE matriz_columnas SET alineacion = ? WHERE id = ?', [alineacion, id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, error: 'Columna no encontrada' });
        }
        const [updated] = await db.execute('SELECT * FROM matriz_columnas WHERE id = ?', [id]);
        const io = getIO();
        if (io) io.emit('matriz-update', { type: 'alineacion-change', columnaId: parseInt(id) });
        res.json({ success: true, data: updated[0], message: 'Alineación actualizada' });
        emit('matriz:updated', { type: 'columna:alineacion', id: parseInt(req.params.id) });
    } catch (error) {
        console.error('Error al actualizar alineación:', error);
        res.status(500).json({ success: false, error: 'Error al actualizar alineación' });
    }
});

router.put('/matriz-columnas/:id/toggle', requireSuperAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const [columna] = await db.execute('SELECT bloqueada FROM matriz_columnas WHERE id = ?', [id]);
        if (columna.length === 0) {
            return res.status(404).json({ success: false, error: 'Columna no encontrada' });
        }
        const nuevaBloqueada = columna[0].bloqueada ? 0 : 1;
        await db.execute('UPDATE matriz_columnas SET bloqueada = ? WHERE id = ?', [nuevaBloqueada, id]);
        const io = getIO();
        if (io) io.emit('matriz-update', { type: 'columna-toggle', columnaId: parseInt(id) });
        res.json({ success: true, message: nuevaBloqueada ? 'Columna bloqueada' : 'Columna desbloqueada', bloqueada: !!nuevaBloqueada });
        emit('matriz:updated', { type: 'columna:toggle', id: parseInt(req.params.id) });
    } catch (error) {
        console.error('Error al toggle columna:', error);
        res.status(500).json({ success: false, error: 'Error al cambiar estado de la columna' });
    }
});

router.put('/matriz-encabezado/toggle-bloqueo/:campo', requireSuperAdmin, async (req, res) => {
    try {
        const campo = CAMPOS_BLOQUEO_MAP[req.params.campo];
        if (!campo) {
            return res.status(400).json({ success: false, error: 'Campo de bloqueo inválido' });
        }
        let [rows] = await db.execute(`SELECT id, \`${campo}\` FROM matriz_encabezado LIMIT 1`);
        if (rows.length === 0) {
            const [result] = await db.execute('INSERT INTO matriz_encabezado (codigo) VALUES (\'\')');
            rows = [{ id: result.insertId, [campo]: 0 }];
        }
        const nuevoValor = rows[0][campo] ? 0 : 1;
        await db.execute(`UPDATE matriz_encabezado SET \`${campo}\` = ? WHERE id = ?`, [nuevoValor, rows[0].id]);
        const io = getIO();
        if (io) io.emit('matriz-update', { type: 'bloqueo-change', campo });
        res.json({ success: true, [campo]: !!nuevoValor, message: nuevoValor ? 'Columna bloqueada' : 'Columna desbloqueada' });
        emit('matriz:updated', { type: 'bloqueo:toggle', campo });
    } catch (error) {
        console.error('Error al toggle bloqueo:', error);
        res.status(500).json({ success: false, error: 'Error al cambiar bloqueo' });
    }
});

router.delete('/matriz-columnas/:id', requireSuperAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const [result] = await db.execute('DELETE FROM matriz_columnas WHERE id = ?', [id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, error: 'Columna no encontrada' });
        }
        res.json({ success: true, message: 'Columna eliminada' });
        emit('matriz:updated', { type: 'columna:deleted', id: parseInt(req.params.id) });
    } catch (error) {
        console.error('Error al eliminar columna:', error);
        res.status(500).json({ success: false, error: 'Error al eliminar la columna' });
    }
});

// ========== FILAS DE DATOS ==========

router.get('/matriz-filas/:seccionId', async (req, res) => {
    try {
        const { seccionId } = req.params;
        const { direccion_id } = req.query;
        let query = 'SELECT * FROM matriz_filas WHERE seccion_id = ?';
        let params = [seccionId];
        if (direccion_id) {
            query += ' AND direccion_id = ?';
            params.push(direccion_id);
        }
        query += ' ORDER BY orden ASC, id ASC';
        const [filas] = await db.execute(query, params);
        res.json({ success: true, data: filas });
    } catch (error) {
        console.error('Error al obtener filas:', error);
        res.status(500).json({ success: false, error: 'Error al obtener filas' });
    }
});

router.post('/matriz-filas', async (req, res) => {
    try {
        const { seccion_id, direccion_id, valores } = req.body;
        if (!seccion_id) {
            return res.status(400).json({ success: false, error: 'La sección es requerida' });
        }
        const [result] = await db.execute(
            'INSERT INTO matriz_filas (seccion_id, direccion_id, valores) VALUES (?, ?, ?)',
            [seccion_id, direccion_id || null, JSON.stringify(valores || {})]
        );
        const [nueva] = await db.execute('SELECT * FROM matriz_filas WHERE id = ?', [result.insertId]);
        res.status(201).json({ success: true, data: nueva[0], message: 'Fila agregada' });
        emit('matriz:updated', { type: 'fila:created', id: result.insertId });
    } catch (error) {
        console.error('Error al crear fila:', error);
        res.status(500).json({ success: false, error: 'Error al crear la fila' });
    }
});

router.put('/matriz-filas/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { valores } = req.body;
        const [result] = await db.execute(
            'UPDATE matriz_filas SET valores = ? WHERE id = ?',
            [JSON.stringify(valores || {}), id]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, error: 'Fila no encontrada' });
        }
        const [updated] = await db.execute('SELECT * FROM matriz_filas WHERE id = ?', [id]);
        res.json({ success: true, data: updated[0], message: 'Fila actualizada' });
        emit('matriz:updated', { type: 'fila:updated', id: parseInt(req.params.id) });
    } catch (error) {
        console.error('Error al actualizar fila:', error);
        res.status(500).json({ success: false, error: 'Error al actualizar la fila' });
    }
});

router.delete('/matriz-filas/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const [result] = await db.execute('DELETE FROM matriz_filas WHERE id = ?', [id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, error: 'Fila no encontrada' });
        }
        res.json({ success: true, message: 'Fila eliminada' });
        emit('matriz:updated', { type: 'fila:deleted', id: parseInt(req.params.id) });
    } catch (error) {
        console.error('Error al eliminar fila:', error);
        res.status(500).json({ success: false, error: 'Error al eliminar la fila' });
    }
});

module.exports = router;
