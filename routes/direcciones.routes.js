const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { requireSuperAdmin } = require('../middleware/roles');
const { sanitize } = require('../utils/sanitize');
const { emit } = require('../services/socketEmitter');

router.get('/direcciones', async (req, res) => {
    try {
        const [direcciones] = await db.execute('SELECT * FROM direcciones ORDER BY nombre');
        res.json({ success: true, data: direcciones });
    } catch (error) {
        console.error('Error al obtener direcciones:', error);
        res.status(500).json({ success: false, error: 'Error al obtener direcciones' });
    }
});

router.post('/direcciones', requireSuperAdmin, async (req, res) => {
    try {
        const { nombre } = sanitize(req.body, { nombre: s => s.trim().substring(0, 255) });
        if (!nombre) {
            return res.status(400).json({ success: false, error: 'El nombre es requerido' });
        }
        const [result] = await db.execute('INSERT INTO direcciones (nombre) VALUES (?)', [nombre]);
        res.status(201).json({ success: true, message: 'Dirección creada exitosamente', direccionId: result.insertId });
        emit('direccion:created', { id: result.insertId });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ success: false, error: 'Esta dirección ya existe' });
        }
        console.error('Error al crear dirección:', error);
        res.status(500).json({ success: false, error: 'Error al crear la dirección' });
    }
});

module.exports = router;
