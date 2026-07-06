const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const db = require('../config/database');
const { uploadPersonal } = require('../middleware/upload');
const { requireSuperAdmin } = require('../middleware/roles');
const { sanitize, sanitizeStr, sanitizeEmail, isValidEmail } = require('../utils/sanitize');

router.get('/personal', async (req, res) => {
    try {
        console.log('📋 Obteniendo todos los registros de personal...');
        const [personal] = await db.execute(
            'SELECT p.*, dir.nombre as direccion_nombre FROM personal p LEFT JOIN direcciones dir ON p.direccion_id = dir.id ORDER BY p.nombre_completo'
        );
        console.log(`✅ Personal encontrado: ${personal.length} registros`);
        const personalConFotos = personal.map(persona => {
            const fotoUrl = persona.foto_perfil
                ? `http://strideutmat.com:5000/api/university/personal/foto/${persona.foto_perfil}`
                : `http://strideutmat.com:5000/api/university/personal/foto/default-avatar.png`;
            return { ...persona, foto_url: fotoUrl };
        });
        res.json({ success: true, data: personalConFotos, metadata: { total: personalConFotos.length, conFoto: personal.filter(p => p.foto_perfil).length, sinFoto: personal.filter(p => !p.foto_perfil).length } });
    } catch (error) {
        console.error('❌ Error al obtener personal:', error);
        res.status(500).json({ success: false, error: 'Error al obtener personal' });
    }
});

router.get('/personal/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const [personal] = await db.execute(
            `SELECT p.*, dir.nombre as direccion_nombre FROM personal p LEFT JOIN direcciones dir ON p.direccion_id = dir.id WHERE p.id = ?`,
            [id]
        );
        if (personal.length === 0) {
            return res.status(404).json({ success: false, error: 'Personal no encontrado' });
        }
        const persona = personal[0];
        const personaConFoto = { ...persona, foto_url: persona.foto_perfil ? `http://strideutmat.com:5000/api/university/personal/foto/${persona.foto_perfil}` : null };
        res.json({ success: true, data: personaConFoto });
    } catch (error) {
        console.error('Error al obtener personal:', error);
        res.status(500).json({ success: false, error: 'Error al obtener personal' });
    }
});

router.post('/personal', requireSuperAdmin, uploadPersonal.single('foto'), async (req, res) => {
    try {
        console.log('📝 Cuerpo recibido:', req.body);
        console.log('📸 Archivo recibido:', req.file);
        if (!req.body || Object.keys(req.body).length === 0) {
            return res.status(400).json({ success: false, error: 'Los datos deben enviarse como JSON o form-urlencoded' });
        }
        sanitize(req.body, { nombre_completo: sanitizeStr, puesto: sanitizeStr, email: sanitizeEmail });
        const { nombre_completo, puesto, direccion_id, email, password } = req.body;
        const foto = req.file;
        if (!nombre_completo || !puesto || !direccion_id || !email || !password) {
            if (foto) { try { fs.unlinkSync(foto.path); } catch (err) {} }
            return res.status(400).json({ success: false, error: 'Todos los campos son requeridos', campos_recibidos: { nombre_completo, puesto, direccion_id, email } });
        }
        if (!isValidEmail(email)) {
            if (foto) { try { fs.unlinkSync(foto.path); } catch (err) {} }
            return res.status(400).json({ success: false, error: 'Correo electrónico inválido' });
        }
        const hashedPassword = await bcrypt.hash(password, 12);
        const [result] = await db.execute(
            'INSERT INTO personal (nombre_completo, puesto, direccion_id, email, password, foto_perfil) VALUES (?, ?, ?, ?, ?, ?)',
            [nombre_completo, puesto, direccion_id, email, hashedPassword, foto ? foto.filename : null]
        );
        res.status(201).json({ success: true, message: 'Personal creado exitosamente', personalId: result.insertId, tieneFoto: !!foto });
    } catch (error) {
        if (req.file) { try { fs.unlinkSync(req.file.path); } catch (err) {} }
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ success: false, error: 'El email ya está registrado' });
        }
        console.error('Error al crear personal:', error);
        res.status(500).json({ success: false, error: 'Error al crear el personal', detalle: error.message });
    }
});

router.put('/personal/:id', requireSuperAdmin, uploadPersonal.single('foto'), async (req, res) => {
    try {
        const { id } = req.params;
        sanitize(req.body, { nombre_completo: sanitizeStr, puesto: sanitizeStr, email: sanitizeEmail });
        const { nombre_completo, puesto, direccion_id, email, password } = req.body;
        if (!nombre_completo || !puesto || !direccion_id || !email) {
            if (req.file) fs.unlinkSync(req.file.path);
            return res.status(400).json({ success: false, error: 'Nombre, puesto, dirección y email son requeridos' });
        }
        if (!isValidEmail(email)) {
            if (req.file) { try { fs.unlinkSync(req.file.path); } catch (err) {} }
            return res.status(400).json({ success: false, error: 'Correo electrónico inválido' });
        }
        const [personalActual] = await db.execute('SELECT * FROM personal WHERE id = ?', [id]);
        if (personalActual.length === 0) {
            if (req.file) fs.unlinkSync(req.file.path);
            return res.status(404).json({ success: false, error: 'Personal no encontrado' });
        }
        const persona = personalActual[0];
        let nuevaFoto = persona.foto_perfil;
        if (req.file) {
            if (persona.foto_perfil) {
                const fotoAnterior = path.join('uploads/personal', persona.foto_perfil);
                if (fs.existsSync(fotoAnterior)) { fs.unlinkSync(fotoAnterior); }
            }
            nuevaFoto = req.file.filename;
        }
        let updateQuery, updateParams;
        if (password && password.trim() !== '') {
            const hashedPassword = await bcrypt.hash(password, 12);
            updateQuery = `UPDATE personal SET nombre_completo = ?, puesto = ?, direccion_id = ?, email = ?, password = ?, foto_perfil = ? WHERE id = ?`;
            updateParams = [nombre_completo, puesto, direccion_id, email, hashedPassword, nuevaFoto, id];
        } else {
            updateQuery = `UPDATE personal SET nombre_completo = ?, puesto = ?, direccion_id = ?, email = ?, foto_perfil = ? WHERE id = ?`;
            updateParams = [nombre_completo, puesto, direccion_id, email, nuevaFoto, id];
        }
        await db.execute(updateQuery, updateParams);
        res.json({ success: true, message: 'Personal actualizado exitosamente' });
    } catch (error) {
        if (req.file) { try { fs.unlinkSync(req.file.path); } catch (e) {} }
        if (error.code === 'ER_DUP_ENTRY') { return res.status(400).json({ success: false, error: 'El email ya está registrado' }); }
        console.error('Error al editar personal:', error);
        res.status(500).json({ success: false, error: 'Error al editar el personal' });
    }
});

router.delete('/personal/:id', requireSuperAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const [personalList] = await db.execute('SELECT * FROM personal WHERE id = ?', [id]);
        if (personalList.length === 0) { return res.status(404).json({ success: false, error: 'Personal no encontrado' }); }
        const persona = personalList[0];
        if (persona.foto_perfil) {
            const fotoPath = path.join('uploads/personal', persona.foto_perfil);
            if (fs.existsSync(fotoPath)) { fs.unlinkSync(fotoPath); }
        }
        await db.execute('DELETE FROM personal WHERE id = ?', [id]);
        res.json({ success: true, message: 'Personal eliminado exitosamente' });
    } catch (error) {
        console.error('Error al eliminar personal:', error);
        res.status(500).json({ success: false, error: 'Error al eliminar el personal' });
    }
});

module.exports = router;
