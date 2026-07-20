const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { requireSuperAdmin } = require('../middleware/roles');
const { sanitize, sanitizeStr } = require('../utils/sanitize');
const { emit } = require('../services/socketEmitter');

// ========== HOJAS ==========

router.get('/estadisticos-genero-hojas', async (req, res) => {
    try {
        const [rows] = await db.execute('SELECT * FROM estadisticos_genero_hojas ORDER BY created_at DESC');
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('Error al obtener hojas:', error);
        res.status(500).json({ success: false, error: 'Error al obtener hojas' });
    }
});

router.post('/estadisticos-genero-hojas', requireSuperAdmin, async (req, res) => {
    try {
        sanitize(req.body, { nombre: sanitizeStr });
        const { nombre } = req.body;
        const [result] = await db.execute(
            'INSERT INTO estadisticos_genero_hojas (nombre) VALUES (?)',
            [nombre || '']
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
        sanitize(req.body, { nombre: sanitizeStr });
        const { nombre } = req.body;
        await db.execute(
            'UPDATE estadisticos_genero_hojas SET nombre = ? WHERE id = ?',
            [nombre ?? '', req.params.id]
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

router.get('/estadisticos-genero-hojas/:id', async (req, res) => {
    try {
        const [hojaRows] = await db.execute('SELECT * FROM estadisticos_genero_hojas WHERE id = ?', [req.params.id]);
        if (hojaRows.length === 0) {
            return res.status(404).json({ success: false, error: 'Hoja no encontrada' });
        }
        const [columnas] = await db.execute(
            'SELECT * FROM estadisticos_genero_columnas WHERE hoja_id = ? ORDER BY orden ASC, id ASC',
            [req.params.id]
        );
        const [filas] = await db.execute(
            'SELECT * FROM estadisticos_genero_filas WHERE hoja_id = ? ORDER BY orden ASC, id ASC',
            [req.params.id]
        );
        res.json({ success: true, data: { ...hojaRows[0], columnas, filas } });
    } catch (error) {
        console.error('Error al obtener hoja:', error);
        res.status(500).json({ success: false, error: 'Error al obtener hoja' });
    }
});

// ========== COLUMNAS ==========

router.get('/estadisticos-genero-columnas', async (req, res) => {
    try {
        const { hoja_id } = req.query;
        let query = 'SELECT * FROM estadisticos_genero_columnas';
        let params = [];
        if (hoja_id) {
            query += ' WHERE hoja_id = ?';
            params.push(hoja_id);
        }
        query += ' ORDER BY orden ASC, id ASC';
        const [columnas] = await db.execute(query, params);
        res.json({ success: true, data: columnas });
    } catch (error) {
        console.error('Error al obtener columnas:', error);
        res.status(500).json({ success: false, error: 'Error al obtener columnas' });
    }
});

router.post('/estadisticos-genero-columnas', requireSuperAdmin, async (req, res) => {
    try {
        sanitize(req.body, { nombre: sanitizeStr });
        const { nombre, tipo_dato, hoja_id } = req.body;
        if (!nombre || !nombre.trim()) {
            return res.status(400).json({ success: false, error: 'El nombre es requerido' });
        }
        if (!hoja_id) {
            return res.status(400).json({ success: false, error: 'hoja_id es requerido' });
        }
        const tipo = ['texto', 'numero', 'decimal'].includes(tipo_dato) ? tipo_dato : 'texto';
        const [result] = await db.execute(
            'INSERT INTO estadisticos_genero_columnas (hoja_id, nombre, tipo_dato) VALUES (?, ?, ?)',
            [hoja_id, nombre.trim(), tipo]
        );
        res.status(201).json({ success: true, message: 'Columna creada', columnaId: result.insertId });
        emit('estadisticos-genero:updated', { type: 'columna:created', id: result.insertId });
    } catch (error) {
        console.error('Error al crear columna:', error);
        res.status(500).json({ success: false, error: 'Error al crear la columna' });
    }
});

router.put('/estadisticos-genero-columnas/:id', requireSuperAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        sanitize(req.body, { nombre: sanitizeStr });
        const { nombre, tipo_dato } = req.body;
        if (!nombre || !nombre.trim()) {
            return res.status(400).json({ success: false, error: 'El nombre es requerido' });
        }
        const tipo = ['texto', 'numero', 'decimal'].includes(tipo_dato) ? tipo_dato : 'texto';
        const [result] = await db.execute(
            'UPDATE estadisticos_genero_columnas SET nombre = ?, tipo_dato = ? WHERE id = ?',
            [nombre.trim(), tipo, id]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, error: 'Columna no encontrada' });
        }
        const [updated] = await db.execute('SELECT * FROM estadisticos_genero_columnas WHERE id = ?', [id]);
        res.json({ success: true, data: updated[0], message: 'Columna actualizada' });
        emit('estadisticos-genero:updated', { type: 'columna:updated', id: parseInt(req.params.id) });
    } catch (error) {
        console.error('Error al actualizar columna:', error);
        res.status(500).json({ success: false, error: 'Error al actualizar la columna' });
    }
});

router.delete('/estadisticos-genero-columnas/:id', requireSuperAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const [result] = await db.execute('DELETE FROM estadisticos_genero_columnas WHERE id = ?', [id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, error: 'Columna no encontrada' });
        }
        res.json({ success: true, message: 'Columna eliminada' });
        emit('estadisticos-genero:updated', { type: 'columna:deleted', id: parseInt(req.params.id) });
    } catch (error) {
        console.error('Error al eliminar columna:', error);
        res.status(500).json({ success: false, error: 'Error al eliminar la columna' });
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
