const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { requireSuperAdmin } = require('../middleware/roles');
const { TIPOS_USUARIO_VALIDOS } = require('../utils/constants');
const { sanitize, sanitizeStr } = require('../utils/sanitize');
const { emit } = require('../services/socketEmitter');

// ========== HOJAS ==========

router.get('/estadisticos-genero-hojas', async (req, res) => {
    try {
        const { anio } = req.query;
        let query = 'SELECT * FROM estadisticos_genero_hojas';
        let params = [];
        if (anio) {
            query += ' WHERE anio = ?';
            params.push(anio);
        }
        query += ' ORDER BY anio DESC, id DESC';
        const [rows] = await db.execute(query, params);
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('Error al obtener hojas:', error);
        res.status(500).json({ success: false, error: 'Error al obtener hojas' });
    }
});

router.get('/estadisticos-genero-hojas-anios', async (req, res) => {
    try {
        const [rows] = await db.execute('SELECT DISTINCT anio FROM estadisticos_genero_hojas WHERE anio IS NOT NULL AND anio != \'\' ORDER BY anio DESC');
        const anios = rows.map(r => r.anio);
        res.json({ success: true, data: anios });
    } catch (error) {
        console.error('Error al obtener años:', error);
        res.status(500).json({ success: false, error: 'Error al obtener años' });
    }
});

router.post('/estadisticos-genero-hojas', requireSuperAdmin, async (req, res) => {
    try {
        sanitize(req.body, { cuatrimestre: sanitizeStr, anio: sanitizeStr });
        const { cuatrimestre, anio } = req.body;
        const [result] = await db.execute(
            'INSERT INTO estadisticos_genero_hojas (cuatrimestre, anio) VALUES (?, ?)',
            [cuatrimestre || '', anio || '']
        );
        const [rows] = await db.execute('SELECT * FROM estadisticos_genero_hojas WHERE id = ?', [result.insertId]);
        res.json({ success: true, data: rows[0] });
        emit('estadisticos-genero:updated', { type: 'hoja:created', id: result.insertId });
    } catch (error) {
        console.error('Error al crear hoja:', error);
        res.status(500).json({ success: false, error: 'Error al crear hoja' });
    }
});

router.put('/estadisticos-genero-hojas/:id', requireSuperAdmin, async (req, res) => {
    try {
        sanitize(req.body, { cuatrimestre: sanitizeStr, anio: sanitizeStr });
        const { cuatrimestre, anio } = req.body;
        await db.execute(
            'UPDATE estadisticos_genero_hojas SET cuatrimestre = ?, anio = ? WHERE id = ?',
            [cuatrimestre ?? '', anio ?? '', req.params.id]
        );
        const [rows] = await db.execute('SELECT * FROM estadisticos_genero_hojas WHERE id = ?', [req.params.id]);
        res.json({ success: true, data: rows[0] });
        emit('estadisticos-genero:updated', { type: 'hoja:updated', id: parseInt(req.params.id) });
    } catch (error) {
        console.error('Error al actualizar hoja:', error);
        res.status(500).json({ success: false, error: 'Error al actualizar hoja' });
    }
});

router.delete('/estadisticos-genero-hojas/:id', requireSuperAdmin, async (req, res) => {
    try {
        await db.execute('DELETE FROM estadisticos_genero_hojas WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'Hoja eliminada' });
        emit('estadisticos-genero:updated', { type: 'hoja:deleted', id: parseInt(req.params.id) });
    } catch (error) {
        console.error('Error al eliminar hoja:', error);
        res.status(500).json({ success: false, error: 'Error al eliminar hoja' });
    }
});

// ========== FILAS ==========

router.get('/estadisticos-genero-filas', async (req, res) => {
    try {
        const { hoja_id } = req.query;
        let query = 'SELECT * FROM estadisticos_genero_filas';
        let params = [];
        if (hoja_id) {
            query += ' WHERE hoja_id = ?';
            params.push(hoja_id);
        }
        query += ' ORDER BY orden ASC, id ASC';
        const [filas] = await db.execute(query, params);
        res.json({ success: true, data: filas });
    } catch (error) {
        console.error('Error al obtener filas:', error);
        res.status(500).json({ success: false, error: 'Error al obtener filas' });
    }
});

router.post('/estadisticos-genero-filas', requireSuperAdmin, async (req, res) => {
    try {
        const { valores, hoja_id } = req.body;
        if (!hoja_id) {
            return res.status(400).json({ success: false, error: 'hoja_id es requerido' });
        }
        const [result] = await db.execute(
            'INSERT INTO estadisticos_genero_filas (hoja_id, valores) VALUES (?, ?)',
            [hoja_id, JSON.stringify(valores || {})]
        );
        const [nueva] = await db.execute('SELECT * FROM estadisticos_genero_filas WHERE id = ?', [result.insertId]);
        res.status(201).json({ success: true, data: nueva[0], message: 'Fila agregada' });
        emit('estadisticos-genero:updated', { type: 'fila:created', id: result.insertId });
    } catch (error) {
        console.error('Error al crear fila:', error);
        res.status(500).json({ success: false, error: 'Error al crear la fila' });
    }
});

router.put('/estadisticos-genero-filas/:id', requireSuperAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { valores } = req.body;
        const [result] = await db.execute(
            'UPDATE estadisticos_genero_filas SET valores = ? WHERE id = ?',
            [JSON.stringify(valores || {}), id]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, error: 'Fila no encontrada' });
        }
        const [updated] = await db.execute('SELECT * FROM estadisticos_genero_filas WHERE id = ?', [id]);
        res.json({ success: true, data: updated[0], message: 'Fila actualizada' });
        emit('estadisticos-genero:updated', { type: 'fila:updated', id: parseInt(req.params.id) });
    } catch (error) {
        console.error('Error al actualizar fila:', error);
        res.status(500).json({ success: false, error: 'Error al actualizar la fila' });
    }
});

router.patch('/estadisticos-genero-filas/:id/celda', async (req, res) => {
    try {
        const { id } = req.params;
        const { key, value } = req.body;
        if (!key) {
            return res.status(400).json({ success: false, error: 'key es requerido' });
        }
        const [filas] = await db.execute('SELECT * FROM estadisticos_genero_filas WHERE id = ?', [id]);
        if (filas.length === 0) {
            return res.status(404).json({ success: false, error: 'Fila no encontrada' });
        }

        const CAMPOS_EDITABLES_USUARIO = ['grupos', 'cant_hombres', 'cant_mujeres', 'aprov_hombres', 'aprov_mujeres'];

        const esSuperAdmin = req.user?.tipo === 'superadmin';
        if (!esSuperAdmin) {
            if (!CAMPOS_EDITABLES_USUARIO.includes(key)) {
                return res.status(403).json({ success: false, error: 'No tienes permiso para editar este campo' });
            }
            const [asignado] = await db.execute(
                'SELECT 1 FROM estadisticos_genero_usuarios WHERE usuario_id = ? AND usuario_tipo = ? LIMIT 1',
                [req.user?.id, req.user?.tipo]
            );
            if (asignado.length === 0) {
                return res.status(403).json({ success: false, error: 'No tienes acceso' });
            }
        }

        let valores;
        try {
            valores = typeof filas[0].valores === 'string' ? JSON.parse(filas[0].valores) : (filas[0].valores || {});
        } catch {
            valores = {};
        }
        valores[key] = value ?? '';
        await db.execute('UPDATE estadisticos_genero_filas SET valores = ? WHERE id = ?', [JSON.stringify(valores), id]);
        res.json({ success: true, message: 'Celda actualizada' });
        emit('estadisticos-genero:updated', { type: 'fila:celda-updated', id: parseInt(req.params.id) });
    } catch (error) {
        console.error('Error al actualizar celda:', error);
        res.status(500).json({ success: false, error: 'Error al actualizar celda' });
    }
});

router.delete('/estadisticos-genero-filas/:id', requireSuperAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const [result] = await db.execute('DELETE FROM estadisticos_genero_filas WHERE id = ?', [id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, error: 'Fila no encontrada' });
        }
        res.json({ success: true, message: 'Fila eliminada' });
        emit('estadisticos-genero:updated', { type: 'fila:deleted', id: parseInt(req.params.id) });
    } catch (error) {
        console.error('Error al eliminar fila:', error);
        res.status(500).json({ success: false, error: 'Error al eliminar la fila' });
    }
});

// ========== ASIGNACIÓN DE USUARIOS (GLOBAL) ==========

router.get('/estadisticos-genero-usuarios-disponibles', async (req, res) => {
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

router.get('/estadisticos-genero-usuarios', async (req, res) => {
    try {
        const [usuarios] = await db.execute(`
            SELECT egu.id as asignacion_id, egu.usuario_id, egu.usuario_tipo,
                   CASE WHEN egu.usuario_tipo = 'directivo' THEN d.nombre_completo
                        WHEN egu.usuario_tipo = 'personal' THEN p.nombre_completo
                   END as nombre
            FROM estadisticos_genero_usuarios egu
            LEFT JOIN directivos d ON egu.usuario_id = d.id AND egu.usuario_tipo = 'directivo'
            LEFT JOIN personal p ON egu.usuario_id = p.id AND egu.usuario_tipo = 'personal'
            ORDER BY nombre
        `);
        res.json({ success: true, data: usuarios });
    } catch (error) {
        console.error('Error al obtener usuarios asignados:', error);
        res.status(500).json({ success: false, error: 'Error al obtener usuarios asignados' });
    }
});

router.post('/estadisticos-genero-usuarios', requireSuperAdmin, async (req, res) => {
    try {
        const { usuario_id, usuario_tipo } = req.body;
        if (!usuario_id || !usuario_tipo) {
            return res.status(400).json({ success: false, error: 'usuario_id y usuario_tipo son requeridos' });
        }
        if (!TIPOS_USUARIO_VALIDOS.includes(usuario_tipo)) {
            return res.status(400).json({ success: false, error: 'Tipo de usuario inválido' });
        }
        await db.execute(
            'INSERT INTO estadisticos_genero_usuarios (usuario_id, usuario_tipo) VALUES (?, ?)',
            [usuario_id, usuario_tipo]
        );
        res.status(201).json({ success: true, message: 'Usuario asignado' });
        emit('estadisticos-genero:updated', { type: 'usuario:created' });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ success: false, error: 'El usuario ya está asignado' });
        }
        console.error('Error al asignar usuario:', error);
        res.status(500).json({ success: false, error: 'Error al asignar usuario' });
    }
});

router.delete('/estadisticos-genero-usuarios/:id', requireSuperAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const [result] = await db.execute('DELETE FROM estadisticos_genero_usuarios WHERE id = ?', [id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, error: 'Asignación no encontrada' });
        }
        res.json({ success: true, message: 'Usuario quitado' });
        emit('estadisticos-genero:updated', { type: 'usuario:deleted' });
    } catch (error) {
        console.error('Error al quitar usuario:', error);
        res.status(500).json({ success: false, error: 'Error al quitar usuario' });
    }
});

// ========== ACCESO PARA USUARIOS ASIGNADOS ==========

router.get('/estadisticos-genero-mis-hojas', async (req, res) => {
    try {
        const { usuario_id, usuario_tipo } = req.query;
        if (!usuario_id || !usuario_tipo) {
            return res.status(400).json({ success: false, error: 'usuario_id y usuario_tipo requeridos' });
        }
        const [asignado] = await db.execute(
            'SELECT 1 FROM estadisticos_genero_usuarios WHERE usuario_id = ? AND usuario_tipo = ? LIMIT 1',
            [usuario_id, usuario_tipo]
        );
        if (asignado.length === 0) {
            return res.json({ success: true, data: [] });
        }
        const [rows] = await db.execute(
            'SELECT * FROM estadisticos_genero_hojas ORDER BY anio DESC, id DESC'
        );
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('Error al obtener hojas del usuario:', error);
        res.status(500).json({ success: false, error: 'Error al obtener hojas del usuario' });
    }
});

module.exports = router;
