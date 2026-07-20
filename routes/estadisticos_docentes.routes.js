const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { requireSuperAdmin } = require('../middleware/roles');
const { TIPOS_USUARIO_VALIDOS } = require('../utils/constants');
const { sanitize, sanitizeStr } = require('../utils/sanitize');
const { emit } = require('../services/socketEmitter');

// ========== HOJAS ==========

router.get('/estadisticos-docentes-hojas', async (req, res) => {
    try {
        const { anio } = req.query;
        let query = 'SELECT * FROM estadisticos_docentes_hojas';
        let params = [];
        if (anio) { query += ' WHERE anio = ?'; params.push(anio); }
        query += ' ORDER BY anio DESC, id DESC';
        const [rows] = await db.execute(query, params);
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('Error al obtener hojas:', error);
        res.status(500).json({ success: false, error: 'Error al obtener hojas' });
    }
});

router.get('/estadisticos-docentes-hojas-anios', async (req, res) => {
    try {
        const [rows] = await db.execute('SELECT DISTINCT anio FROM estadisticos_docentes_hojas WHERE anio IS NOT NULL AND anio != \'\' ORDER BY anio DESC');
        res.json({ success: true, data: rows.map(r => r.anio) });
    } catch (error) {
        console.error('Error al obtener años:', error);
        res.status(500).json({ success: false, error: 'Error al obtener años' });
    }
});

router.post('/estadisticos-docentes-hojas', requireSuperAdmin, async (req, res) => {
    try {
        sanitize(req.body, { cuatrimestre: sanitizeStr, anio: sanitizeStr });
        const { cuatrimestre, anio } = req.body;
        const [result] = await db.execute(
            'INSERT INTO estadisticos_docentes_hojas (cuatrimestre, anio) VALUES (?, ?)',
            [cuatrimestre || '', anio || '']
        );
        const [rows] = await db.execute('SELECT * FROM estadisticos_docentes_hojas WHERE id = ?', [result.insertId]);
        res.json({ success: true, data: rows[0] });
        emit('estadisticos-docentes:updated', { type: 'hoja:created', id: result.insertId });
    } catch (error) {
        console.error('Error al crear hoja:', error);
        res.status(500).json({ success: false, error: 'Error al crear hoja' });
    }
});

router.put('/estadisticos-docentes-hojas/:id', requireSuperAdmin, async (req, res) => {
    try {
        sanitize(req.body, { cuatrimestre: sanitizeStr, anio: sanitizeStr });
        const { cuatrimestre, anio } = req.body;
        const sets = []; const vals = [];
        if (cuatrimestre !== undefined) { sets.push('cuatrimestre = ?'); vals.push(cuatrimestre); }
        if (anio !== undefined) { sets.push('anio = ?'); vals.push(anio); }
        if (sets.length === 0) return res.status(400).json({ success: false, error: 'Sin campos' });
        vals.push(req.params.id);
        await db.execute(`UPDATE estadisticos_docentes_hojas SET ${sets.join(', ')} WHERE id = ?`, vals);
        const [rows] = await db.execute('SELECT * FROM estadisticos_docentes_hojas WHERE id = ?', [req.params.id]);
        res.json({ success: true, data: rows[0] });
        emit('estadisticos-docentes:updated', { type: 'hoja:updated', id: parseInt(req.params.id) });
    } catch (error) {
        console.error('Error al actualizar hoja:', error);
        res.status(500).json({ success: false, error: 'Error al actualizar hoja' });
    }
});

router.delete('/estadisticos-docentes-hojas/:id', requireSuperAdmin, async (req, res) => {
    try {
        await db.execute('DELETE FROM estadisticos_docentes_hojas WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'Hoja eliminada' });
        emit('estadisticos-docentes:updated', { type: 'hoja:deleted', id: parseInt(req.params.id) });
    } catch (error) {
        console.error('Error al eliminar hoja:', error);
        res.status(500).json({ success: false, error: 'Error al eliminar hoja' });
    }
});

// ========== NOTAS GLOBALES ==========

router.get('/estadisticos-docentes-notas', async (req, res) => {
    try {
        let [rows] = await db.execute('SELECT * FROM estadisticos_docentes_notas LIMIT 1');
        if (rows.length === 0) {
            const [result] = await db.execute('INSERT INTO estadisticos_docentes_notas (contenido) VALUES (\'\')');
            const [newRows] = await db.execute('SELECT * FROM estadisticos_docentes_notas WHERE id = ?', [result.insertId]);
            rows = newRows;
        }
        res.json({ success: true, data: rows[0] });
    } catch (error) {
        console.error('Error al obtener notas:', error);
        res.status(500).json({ success: false, error: 'Error al obtener notas' });
    }
});

router.put('/estadisticos-docentes-notas', requireSuperAdmin, async (req, res) => {
    try {
        const { contenido } = req.body;
        let [rows] = await db.execute('SELECT * FROM estadisticos_docentes_notas LIMIT 1');
        if (rows.length === 0) {
            await db.execute('INSERT INTO estadisticos_docentes_notas (contenido) VALUES (?)', [contenido || '']);
        } else {
            await db.execute('UPDATE estadisticos_docentes_notas SET contenido = ? WHERE id = ?', [contenido || '', rows[0].id]);
        }
        const [updated] = await db.execute('SELECT * FROM estadisticos_docentes_notas LIMIT 1');
        res.json({ success: true, data: updated[0], message: 'Notas guardadas' });
        emit('estadisticos-docentes:updated', { type: 'notas:updated' });
    } catch (error) {
        console.error('Error al guardar notas:', error);
        res.status(500).json({ success: false, error: 'Error al guardar notas' });
    }
});

// ========== SECCIONES ==========

router.get('/estadisticos-docentes-secciones', async (req, res) => {
    try {
        const { hoja_id } = req.query;
        let query = 'SELECT * FROM estadisticos_docentes_secciones';
        let params = [];
        if (hoja_id) { query += ' WHERE hoja_id = ?'; params.push(hoja_id); }
        query += ' ORDER BY orden ASC, id ASC';
        const [rows] = await db.execute(query, params);
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('Error al obtener secciones:', error);
        res.status(500).json({ success: false, error: 'Error al obtener secciones' });
    }
});

router.post('/estadisticos-docentes-secciones', requireSuperAdmin, async (req, res) => {
    try {
        sanitize(req.body, { nombre: sanitizeStr, tipo: sanitizeStr });
        const { hoja_id, nombre, tipo } = req.body;
        if (!hoja_id) return res.status(400).json({ success: false, error: 'hoja_id requerido' });
        const [result] = await db.execute(
            'INSERT INTO estadisticos_docentes_secciones (hoja_id, nombre, tipo) VALUES (?, ?, ?)',
            [hoja_id, nombre || 'Nueva sección', tipo || 'generico']
        );
        const [rows] = await db.execute('SELECT * FROM estadisticos_docentes_secciones WHERE id = ?', [result.insertId]);
        res.json({ success: true, data: rows[0] });
        emit('estadisticos-docentes:updated', { type: 'seccion:created', id: result.insertId });
    } catch (error) {
        console.error('Error al crear sección:', error);
        res.status(500).json({ success: false, error: 'Error al crear sección' });
    }
});

router.put('/estadisticos-docentes-secciones/:id', requireSuperAdmin, async (req, res) => {
    try {
        sanitize(req.body, { nombre: sanitizeStr });
        const { nombre } = req.body;
        await db.execute('UPDATE estadisticos_docentes_secciones SET nombre = ? WHERE id = ?', [nombre ?? '', req.params.id]);
        const [rows] = await db.execute('SELECT * FROM estadisticos_docentes_secciones WHERE id = ?', [req.params.id]);
        res.json({ success: true, data: rows[0] });
        emit('estadisticos-docentes:updated', { type: 'seccion:updated', id: parseInt(req.params.id) });
    } catch (error) {
        console.error('Error al actualizar sección:', error);
        res.status(500).json({ success: false, error: 'Error al actualizar sección' });
    }
});

// ========== FILAS ==========

router.get('/estadisticos-docentes-filas', async (req, res) => {
    try {
        const { seccion_id } = req.query;
        let query = 'SELECT * FROM estadisticos_docentes_filas';
        let params = [];
        if (seccion_id) { query += ' WHERE seccion_id = ?'; params.push(seccion_id); }
        query += ' ORDER BY orden ASC, id ASC';
        const [filas] = await db.execute(query, params);
        res.json({ success: true, data: filas });
    } catch (error) {
        console.error('Error al obtener filas:', error);
        res.status(500).json({ success: false, error: 'Error al obtener filas' });
    }
});

router.post('/estadisticos-docentes-filas', requireSuperAdmin, async (req, res) => {
    try {
        const { seccion_id, nombre_fila, valores } = req.body;
        if (!seccion_id) return res.status(400).json({ success: false, error: 'seccion_id requerido' });
        const [result] = await db.execute(
            'INSERT INTO estadisticos_docentes_filas (seccion_id, nombre_fila, valores) VALUES (?, ?, ?)',
            [seccion_id, nombre_fila || '', JSON.stringify(valores || {})]
        );
        const [nueva] = await db.execute('SELECT * FROM estadisticos_docentes_filas WHERE id = ?', [result.insertId]);
        res.status(201).json({ success: true, data: nueva[0] });
        emit('estadisticos-docentes:updated', { type: 'fila:created', id: result.insertId });
    } catch (error) {
        console.error('Error al crear fila:', error);
        res.status(500).json({ success: false, error: 'Error al crear la fila' });
    }
});

router.put('/estadisticos-docentes-filas/:id', requireSuperAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre_fila, valores } = req.body;
        const sets = []; const vals = [];
        if (nombre_fila !== undefined) { sets.push('nombre_fila = ?'); vals.push(nombre_fila); }
        if (valores !== undefined) { sets.push('valores = ?'); vals.push(JSON.stringify(valores)); }
        if (sets.length === 0) return res.status(400).json({ success: false, error: 'Sin campos' });
        vals.push(id);
        await db.execute(`UPDATE estadisticos_docentes_filas SET ${sets.join(', ')} WHERE id = ?`, vals);
        const [updated] = await db.execute('SELECT * FROM estadisticos_docentes_filas WHERE id = ?', [id]);
        res.json({ success: true, data: updated[0] });
        emit('estadisticos-docentes:updated', { type: 'fila:updated', id: parseInt(req.params.id) });
    } catch (error) {
        console.error('Error al actualizar fila:', error);
        res.status(500).json({ success: false, error: 'Error al actualizar la fila' });
    }
});

router.patch('/estadisticos-docentes-filas/:id/celda', async (req, res) => {
    try {
        const { id } = req.params;
        const { key, value } = req.body;
        if (!key) return res.status(400).json({ success: false, error: 'key es requerido' });
        const [filas] = await db.execute('SELECT * FROM estadisticos_docentes_filas WHERE id = ?', [id]);
        if (filas.length === 0) return res.status(404).json({ success: false, error: 'Fila no encontrada' });
        const esSuperAdmin = req.user?.tipo === 'superadmin';
        if (!esSuperAdmin) {
            const [sRows] = await db.execute('SELECT hoja_id FROM estadisticos_docentes_secciones WHERE id = ?', [filas[0].seccion_id]);
            if (sRows.length === 0) return res.status(404).json({ success: false, error: 'Sección no encontrada' });
            const [asignado] = await db.execute(
                'SELECT 1 FROM estadisticos_docentes_usuarios WHERE hoja_id = ? AND usuario_id = ? AND usuario_tipo = ? LIMIT 1',
                [sRows[0].hoja_id, req.user?.id, req.user?.tipo]
            );
            if (asignado.length === 0) return res.status(403).json({ success: false, error: 'No tienes acceso' });
        }
        let valores;
        try { valores = typeof filas[0].valores === 'string' ? JSON.parse(filas[0].valores) : (filas[0].valores || {}); }
        catch { valores = {}; }
        valores[key] = value ?? '';
        await db.execute('UPDATE estadisticos_docentes_filas SET valores = ? WHERE id = ?', [JSON.stringify(valores), id]);
        res.json({ success: true, message: 'Celda actualizada' });
        emit('estadisticos-docentes:updated', { type: 'fila:celda-updated', id: parseInt(req.params.id) });
    } catch (error) {
        console.error('Error al actualizar celda:', error);
        res.status(500).json({ success: false, error: 'Error al actualizar celda' });
    }
});

router.delete('/estadisticos-docentes-filas/:id', requireSuperAdmin, async (req, res) => {
    try {
        const [result] = await db.execute('DELETE FROM estadisticos_docentes_filas WHERE id = ?', [req.params.id]);
        if (result.affectedRows === 0) return res.status(404).json({ success: false, error: 'Fila no encontrada' });
        res.json({ success: true, message: 'Fila eliminada' });
        emit('estadisticos-docentes:updated', { type: 'fila:deleted', id: parseInt(req.params.id) });
    } catch (error) {
        console.error('Error al eliminar fila:', error);
        res.status(500).json({ success: false, error: 'Error al eliminar fila' });
    }
});

// ========== USUARIOS (POR HOJA) ==========

router.get('/estadisticos-docentes-usuarios-disponibles', async (req, res) => {
    try {
        const [d] = await db.execute('SELECT id, nombre_completo as nombre, direccion_id FROM directivos ORDER BY nombre_completo');
        const [p] = await db.execute('SELECT id, nombre_completo as nombre, direccion_id FROM personal ORDER BY nombre_completo');
        res.json({ success: true, data: [...d.map(x => ({ ...x, tipo: 'directivo' })), ...p.map(x => ({ ...x, tipo: 'personal' }))] });
    } catch (error) {
        console.error('Error al obtener usuarios:', error);
        res.status(500).json({ success: false, error: 'Error al obtener usuarios' });
    }
});

router.get('/estadisticos-docentes-hojas/:id/usuarios', async (req, res) => {
    try {
        const [rows] = await db.execute(`
            SELECT edu.id as asignacion_id, edu.usuario_id, edu.usuario_tipo,
                   CASE WHEN edu.usuario_tipo = 'directivo' THEN d.nombre_completo WHEN edu.usuario_tipo = 'personal' THEN p.nombre_completo END as nombre
            FROM estadisticos_docentes_usuarios edu
            LEFT JOIN directivos d ON edu.usuario_id = d.id AND edu.usuario_tipo = 'directivo'
            LEFT JOIN personal p ON edu.usuario_id = p.id AND edu.usuario_tipo = 'personal'
            WHERE edu.hoja_id = ? ORDER BY nombre`, [req.params.id]);
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('Error al obtener usuarios asignados:', error);
        res.status(500).json({ success: false, error: 'Error al obtener usuarios asignados' });
    }
});

router.post('/estadisticos-docentes-usuarios', requireSuperAdmin, async (req, res) => {
    try {
        const { hoja_id, usuario_id, usuario_tipo } = req.body;
        if (!hoja_id || !usuario_id || !usuario_tipo) return res.status(400).json({ success: false, error: 'Faltan campos' });
        if (!TIPOS_USUARIO_VALIDOS.includes(usuario_tipo)) return res.status(400).json({ success: false, error: 'Tipo inválido' });
        await db.execute('INSERT INTO estadisticos_docentes_usuarios (hoja_id, usuario_id, usuario_tipo) VALUES (?, ?, ?)', [hoja_id, usuario_id, usuario_tipo]);
        res.status(201).json({ success: true, message: 'Usuario asignado' });
        emit('estadisticos-docentes:updated', { type: 'usuario:created' });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') return res.status(400).json({ success: false, error: 'El usuario ya está asignado' });
        console.error('Error al asignar usuario:', error);
        res.status(500).json({ success: false, error: 'Error al asignar usuario' });
    }
});

router.delete('/estadisticos-docentes-usuarios/:id', requireSuperAdmin, async (req, res) => {
    try {
        const [result] = await db.execute('DELETE FROM estadisticos_docentes_usuarios WHERE id = ?', [req.params.id]);
        if (result.affectedRows === 0) return res.status(404).json({ success: false, error: 'Asignación no encontrada' });
        res.json({ success: true, message: 'Usuario quitado' });
        emit('estadisticos-docentes:updated', { type: 'usuario:deleted' });
    } catch (error) {
        console.error('Error al quitar usuario:', error);
        res.status(500).json({ success: false, error: 'Error al quitar usuario' });
    }
});

router.get('/estadisticos-docentes-mis-hojas', async (req, res) => {
    try {
        const { usuario_id, usuario_tipo } = req.query;
        if (!usuario_id || !usuario_tipo) return res.status(400).json({ success: false, error: 'Faltan parámetros' });
        const [rows] = await db.execute(`
            SELECT eh.* FROM estadisticos_docentes_hojas eh
            INNER JOIN estadisticos_docentes_usuarios edu ON edu.hoja_id = eh.id
            WHERE edu.usuario_id = ? AND edu.usuario_tipo = ?
            ORDER BY eh.anio DESC, eh.id DESC`, [usuario_id, usuario_tipo]);
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('Error al obtener hojas del usuario:', error);
        res.status(500).json({ success: false, error: 'Error al obtener hojas del usuario' });
    }
});

module.exports = router;
