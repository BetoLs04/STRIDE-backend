const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { emit } = require('../services/socketEmitter');
const { TIPOS_USUARIO_VALIDOS } = require('../utils/constants');
const { requireSuperAdmin } = require('../middleware/roles');
const { sanitize, sanitizeStr } = require('../utils/sanitize');

// ========== USUARIOS DISPONIBLES ==========

router.get('/poa-usuarios', requireSuperAdmin, async (req, res) => {
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

router.get('/poa-secciones', async (req, res) => {
    try {
        const [secciones] = await db.execute(`
            SELECT ps.*,
                   COUNT(psu.id) AS total_usuarios
            FROM poa_secciones ps
            LEFT JOIN poa_seccion_usuarios psu ON ps.id = psu.seccion_id
            GROUP BY ps.id
            ORDER BY ps.nombre
        `);
        for (let seccion of secciones) {
            const [usuarios] = await db.execute(`
                SELECT psu.id as asignacion_id, psu.usuario_id, psu.usuario_tipo,
                       CASE WHEN psu.usuario_tipo = 'directivo' THEN d.nombre_completo
                            WHEN psu.usuario_tipo = 'personal' THEN p.nombre_completo
                       END as nombre
                FROM poa_seccion_usuarios psu
                LEFT JOIN directivos d ON psu.usuario_id = d.id AND psu.usuario_tipo = 'directivo'
                LEFT JOIN personal p ON psu.usuario_id = p.id AND psu.usuario_tipo = 'personal'
                WHERE psu.seccion_id = ?
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

router.post('/poa-secciones', requireSuperAdmin, async (req, res) => {
    try {
        sanitize(req.body, { nombre: sanitizeStr });
        const { nombre } = req.body;
        if (!nombre || !nombre.trim()) {
            return res.status(400).json({ success: false, error: 'El nombre es requerido' });
        }
        const [result] = await db.execute('INSERT INTO poa_secciones (nombre) VALUES (?)', [nombre.trim()]);
        res.status(201).json({ success: true, message: 'Sección creada', seccionId: result.insertId });
        emit('poa:updated', { type: 'seccion:created', id: result.insertId });
    } catch (error) {
        console.error('Error al crear sección:', error);
        res.status(500).json({ success: false, error: 'Error al crear la sección' });
    }
});

router.put('/poa-secciones/:id', requireSuperAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        sanitize(req.body, { nombre: sanitizeStr });
        const { nombre } = req.body;
        if (!nombre || !nombre.trim()) {
            return res.status(400).json({ success: false, error: 'El nombre es requerido' });
        }
        const [result] = await db.execute('UPDATE poa_secciones SET nombre = ? WHERE id = ?', [nombre.trim(), id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, error: 'Sección no encontrada' });
        }
        res.json({ success: true, message: 'Sección actualizada' });
        emit('poa:updated', { type: 'seccion:updated', id: parseInt(req.params.id) });
    } catch (error) {
        console.error('Error al actualizar sección:', error);
        res.status(500).json({ success: false, error: 'Error al actualizar la sección' });
    }
});

router.delete('/poa-secciones/:id', requireSuperAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const [result] = await db.execute('DELETE FROM poa_secciones WHERE id = ?', [id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, error: 'Sección no encontrada' });
        }
        res.json({ success: true, message: 'Sección eliminada' });
        emit('poa:updated', { type: 'seccion:deleted', id: parseInt(req.params.id) });
    } catch (error) {
        console.error('Error al eliminar sección:', error);
        res.status(500).json({ success: false, error: 'Error al eliminar la sección' });
    }
});

// ========== ASIGNACIÓN DE USUARIOS ==========

router.post('/poa-secciones/:id/usuarios', requireSuperAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { usuario_id, usuario_tipo } = req.body;
        if (!usuario_id || !usuario_tipo) {
            return res.status(400).json({ success: false, error: 'El usuario y tipo son requeridos' });
        }
        if (!TIPOS_USUARIO_VALIDOS.includes(usuario_tipo)) {
            return res.status(400).json({ success: false, error: 'Tipo de usuario inválido' });
        }
        const [existe] = await db.execute('SELECT id FROM poa_secciones WHERE id = ?', [id]);
        if (existe.length === 0) {
            return res.status(404).json({ success: false, error: 'Sección no encontrada' });
        }
        await db.execute(
            'INSERT INTO poa_seccion_usuarios (seccion_id, usuario_id, usuario_tipo) VALUES (?, ?, ?)',
            [id, usuario_id, usuario_tipo]
        );
        res.status(201).json({ success: true, message: 'Usuario asignado a la sección' });
        emit('poa:updated', { type: 'usuario:asignado', seccionId: parseInt(req.params.id) });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ success: false, error: 'El usuario ya está asignado a esta sección' });
        }
        console.error('Error al asignar usuario:', error);
        res.status(500).json({ success: false, error: 'Error al asignar el usuario' });
    }
});

router.delete('/poa-secciones/:id/usuarios/:usuarioId/:usuarioTipo', requireSuperAdmin, async (req, res) => {
    try {
        const { id, usuarioId, usuarioTipo } = req.params;
        if (!TIPOS_USUARIO_VALIDOS.includes(usuarioTipo)) {
            return res.status(400).json({ success: false, error: 'Tipo de usuario inválido' });
        }
        const [result] = await db.execute(
            'DELETE FROM poa_seccion_usuarios WHERE seccion_id = ? AND usuario_id = ? AND usuario_tipo = ?',
            [id, usuarioId, usuarioTipo]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, error: 'Asignación no encontrada' });
        }
        res.json({ success: true, message: 'Usuario quitado de la sección' });
        emit('poa:updated', { type: 'usuario:quitado', seccionId: parseInt(req.params.id) });
    } catch (error) {
        console.error('Error al quitar usuario:', error);
        res.status(500).json({ success: false, error: 'Error al quitar el usuario' });
    }
});

// ========== DATOS (AÑO) ==========

router.get('/poa-encabezado', async (req, res) => {
    try {
        let [rows] = await db.execute('SELECT * FROM poa_encabezado LIMIT 1');
        if (rows.length === 0) {
            const [result] = await db.execute(
                "INSERT INTO poa_encabezado (anio) VALUES ('')"
            );
            const [newRows] = await db.execute('SELECT * FROM poa_encabezado WHERE id = ?', [result.insertId]);
            rows = newRows;
        }
        res.json({ success: true, data: rows[0] });
    } catch (error) {
        console.error('Error al obtener datos:', error);
        res.status(500).json({ success: false, error: 'Error al obtener datos' });
    }
});

router.put('/poa-encabezado', requireSuperAdmin, async (req, res) => {
    try {
        sanitize(req.body, { anio: sanitizeStr });
        const { anio } = req.body;
        let [rows] = await db.execute('SELECT id FROM poa_encabezado LIMIT 1');
        if (rows.length === 0) {
            const [result] = await db.execute(
                'INSERT INTO poa_encabezado (anio) VALUES (?)',
                [anio || '']
            );
        } else {
            await db.execute(
                'UPDATE poa_encabezado SET anio = ? WHERE id = ?',
                [anio || '', rows[0].id]
            );
        }
        const [updated] = await db.execute('SELECT * FROM poa_encabezado LIMIT 1');
        res.json({ success: true, data: updated[0], message: 'Año guardado' });
        emit('poa:updated', { type: 'encabezado:updated' });
    } catch (error) {
        console.error('Error al guardar año:', error);
        res.status(500).json({ success: false, error: 'Error al guardar año' });
    }
});

// ========== FILAS DE DATOS ==========

router.get('/poa-filas/:seccionId', async (req, res) => {
    try {
        const { seccionId } = req.params;
        const [filas] = await db.execute('SELECT * FROM poa_filas WHERE seccion_id = ? ORDER BY orden ASC, id ASC', [seccionId]);
        res.json({ success: true, data: filas });
    } catch (error) {
        console.error('Error al obtener filas:', error);
        res.status(500).json({ success: false, error: 'Error al obtener filas' });
    }
});

router.post('/poa-filas', async (req, res) => {
    try {
        const { seccion_id, valores } = req.body;
        if (!seccion_id) {
            return res.status(400).json({ success: false, error: 'La sección es requerida' });
        }
        const [result] = await db.execute(
            'INSERT INTO poa_filas (seccion_id, valores) VALUES (?, ?)',
            [seccion_id, JSON.stringify(valores || {})]
        );
        const [nueva] = await db.execute('SELECT * FROM poa_filas WHERE id = ?', [result.insertId]);
        res.status(201).json({ success: true, data: nueva[0], message: 'Fila agregada' });
        emit('poa:updated', { type: 'fila:created', id: result.insertId });
    } catch (error) {
        console.error('Error al crear fila:', error);
        res.status(500).json({ success: false, error: 'Error al crear la fila' });
    }
});

router.put('/poa-filas/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { valores } = req.body;
        const [result] = await db.execute(
            'UPDATE poa_filas SET valores = ? WHERE id = ?',
            [JSON.stringify(valores || {}), id]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, error: 'Fila no encontrada' });
        }
        const [updated] = await db.execute('SELECT * FROM poa_filas WHERE id = ?', [id]);
        res.json({ success: true, data: updated[0], message: 'Fila actualizada' });
        emit('poa:updated', { type: 'fila:updated', id: parseInt(req.params.id) });
    } catch (error) {
        console.error('Error al actualizar fila:', error);
        res.status(500).json({ success: false, error: 'Error al actualizar la fila' });
    }
});

router.delete('/poa-filas/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const [result] = await db.execute('DELETE FROM poa_filas WHERE id = ?', [id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, error: 'Fila no encontrada' });
        }
        res.json({ success: true, message: 'Fila eliminada' });
        emit('poa:updated', { type: 'fila:deleted', id: parseInt(req.params.id) });
    } catch (error) {
        console.error('Error al eliminar fila:', error);
        res.status(500).json({ success: false, error: 'Error al eliminar la fila' });
    }
});

module.exports = router;
