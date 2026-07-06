const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../config/database');
const { requireSuperAdmin } = require('../middleware/roles');
const { sanitize, sanitizeStr, sanitizeEmail, isValidEmail } = require('../utils/sanitize');

router.get('/directivos', async (req, res) => {
    try {
        const [directivos] = await db.execute(
            'SELECT d.*, dir.nombre as direccion_nombre FROM directivos d LEFT JOIN direcciones dir ON d.direccion_id = dir.id ORDER BY d.nombre_completo'
        );
        res.json({ success: true, data: directivos });
    } catch (error) {
        console.error('Error al obtener directivos:', error);
        res.status(500).json({ success: false, error: 'Error al obtener directivos' });
    }
});

router.post('/directivos', requireSuperAdmin, async (req, res) => {
    try {
        sanitize(req.body, { nombre_completo: sanitizeStr, cargo: sanitizeStr, email: sanitizeEmail });
        const { nombre_completo, cargo, direccion_id, email, password } = req.body;
        if (!nombre_completo || !cargo || !direccion_id || !email || !password) {
            return res.status(400).json({ success: false, error: 'Todos los campos son requeridos' });
        }
        if (!isValidEmail(email)) {
            return res.status(400).json({ success: false, error: 'Correo electrónico inválido' });
        }
        const hashedPassword = await bcrypt.hash(password, 12);
        const [result] = await db.execute(
            'INSERT INTO directivos (nombre_completo, cargo, direccion_id, email, password) VALUES (?, ?, ?, ?, ?)',
            [nombre_completo, cargo, direccion_id, email, hashedPassword]
        );
        res.status(201).json({ success: true, message: 'Directivo creado exitosamente', directivoId: result.insertId });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ success: false, error: 'El email ya está registrado' });
        }
        console.error('Error al crear directivo:', error);
        res.status(500).json({ success: false, error: 'Error al crear el directivo' });
    }
});

router.put('/directivos/:id', requireSuperAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        sanitize(req.body, { nombre_completo: sanitizeStr, cargo: sanitizeStr, email: sanitizeEmail });
        const { nombre_completo, cargo, direccion_id, email, password } = req.body;
        if (!nombre_completo || !cargo || !direccion_id || !email) {
            return res.status(400).json({ success: false, error: 'Nombre, cargo, dirección y email son requeridos' });
        }
        if (!isValidEmail(email)) {
            return res.status(400).json({ success: false, error: 'Correo electrónico inválido' });
        }
        let updateQuery, updateParams;
        if (password && password.trim() !== '') {
            const hashedPassword = await bcrypt.hash(password, 12);
            updateQuery = `UPDATE directivos SET nombre_completo = ?, cargo = ?, direccion_id = ?, email = ?, password = ? WHERE id = ?`;
            updateParams = [nombre_completo, cargo, direccion_id, email, hashedPassword, id];
        } else {
            updateQuery = `UPDATE directivos SET nombre_completo = ?, cargo = ?, direccion_id = ?, email = ? WHERE id = ?`;
            updateParams = [nombre_completo, cargo, direccion_id, email, id];
        }
        const [result] = await db.execute(updateQuery, updateParams);
        if (result.affectedRows === 0) { return res.status(404).json({ success: false, error: 'Directivo no encontrado' }); }
        res.json({ success: true, message: 'Directivo actualizado exitosamente' });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') { return res.status(400).json({ success: false, error: 'El email ya está registrado' }); }
        console.error('Error al editar directivo:', error);
        res.status(500).json({ success: false, error: 'Error al editar el directivo' });
    }
});

router.delete('/directivos/:id', requireSuperAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const [directivos] = await db.execute('SELECT * FROM directivos WHERE id = ?', [id]);
        if (directivos.length === 0) { return res.status(404).json({ success: false, error: 'Directivo no encontrado' }); }
        await db.execute('DELETE FROM directivos WHERE id = ?', [id]);
        res.json({ success: true, message: 'Directivo eliminado exitosamente' });
    } catch (error) {
        console.error('Error al eliminar directivo:', error);
        res.status(500).json({ success: false, error: 'Error al eliminar el directivo' });
    }
});

module.exports = router;
