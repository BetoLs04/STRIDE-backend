const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { requireSuperAdmin } = require('../middleware/roles');
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

router.patch('/estadisticos-genero-filas/:id/celda', requireSuperAdmin, async (req, res) => {
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

module.exports = router;
