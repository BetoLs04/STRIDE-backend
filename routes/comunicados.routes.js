const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const db = require('../config/database');
const { uploadComunicados, comunicadosDir } = require('../middleware/upload');
const { API_BASE_URL } = require('../utils/constants');

router.post('/comunicados', uploadComunicados.array('archivos', 5), async (req, res) => {
    try {
        const { titulo, contenido, link_externo, publicado_por_id } = req.body;
        console.log('📝 Creando comunicado:', { titulo, publicado_por_id });
        if (!titulo || !contenido || !publicado_por_id) {
            return res.status(400).json({ success: false, error: 'Título, contenido y creador son requeridos' });
        }
        const [result] = await db.execute(
            `INSERT INTO comunicados (titulo, contenido, link_externo, publicado_por_id, estado) VALUES (?, ?, ?, ?, 'publicado')`,
            [titulo, contenido, link_externo || null, publicado_por_id]
        );
        const comunicadoId = result.insertId;
        if (req.files && req.files.length > 0) {
            for (const file of req.files) {
                await db.execute(
                    `INSERT INTO comunicados_archivos (comunicado_id, nombre_original, nombre_archivo, ruta_archivo, tipo_mime, tamano) VALUES (?, ?, ?, ?, ?, ?)`,
                    [comunicadoId, file.originalname, file.filename, file.filename, file.mimetype, file.size]
                );
            }
        }
        res.status(201).json({ success: true, message: 'Comunicado publicado exitosamente', comunicadoId });
    } catch (error) {
        console.error('❌ Error al crear comunicado:', error);
        res.status(500).json({ success: false, error: error.message || 'Error al crear el comunicado' });
    }
});

router.get('/comunicados', async (req, res) => {
    try {
        const [comunicados] = await db.execute(`
            SELECT c.*, su.username as publicado_por_nombre
            FROM comunicados c
            LEFT JOIN super_users su ON c.publicado_por_id = su.id
            WHERE c.estado = 'publicado'
            ORDER BY c.fecha_publicacion DESC
        `);
        for (let c of comunicados) {
            const [archivos] = await db.execute(`SELECT * FROM comunicados_archivos WHERE comunicado_id = ?`, [c.id]);
            c.archivos = archivos.map(a => ({ ...a, url: `${API_BASE_URL}/uploads/comunicados/${a.ruta_archivo}` }));
        }
        res.json({ success: true, data: comunicados });
    } catch (error) {
        console.error('❌ Error al obtener comunicados:', error);
        res.status(500).json({ success: false, error: 'Error al obtener comunicados' });
    }
});

router.get('/comunicados-admin', async (req, res) => {
    try {
        const [comunicados] = await db.execute(`
            SELECT c.*, su.username as publicado_por_nombre
            FROM comunicados c
            LEFT JOIN super_users su ON c.publicado_por_id = su.id
            ORDER BY c.fecha_publicacion DESC
        `);
        for (let c of comunicados) {
            const [archivos] = await db.execute(`SELECT * FROM comunicados_archivos WHERE comunicado_id = ?`, [c.id]);
            c.archivos = archivos.map(a => ({ ...a, url: `${API_BASE_URL}/uploads/comunicados/${a.ruta_archivo}` }));
        }
        res.json({ success: true, data: comunicados });
    } catch (error) {
        console.error('❌ Error al obtener comunicados para admin:', error);
        res.status(500).json({ success: false, error: 'Error al obtener comunicados' });
    }
});

router.get('/comunicados/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const [comunicados] = await db.execute(`
            SELECT c.*, su.username as publicado_por_nombre
            FROM comunicados c
            LEFT JOIN super_users su ON c.publicado_por_id = su.id
            WHERE c.id = ?
        `, [id]);
        if (comunicados.length === 0) {
            return res.status(404).json({ success: false, error: 'Comunicado no encontrado' });
        }
        const c = comunicados[0];
        const [archivos] = await db.execute(`SELECT * FROM comunicados_archivos WHERE comunicado_id = ?`, [id]);
        c.archivos = archivos.map(a => ({ ...a, url: `${API_BASE_URL}/uploads/comunicados/${a.ruta_archivo}` }));
        res.json({ success: true, data: c });
    } catch (error) {
        console.error('Error al obtener comunicado:', error);
        res.status(500).json({ success: false, error: 'Error al obtener comunicado' });
    }
});

router.put('/comunicados/:id', uploadComunicados.array('archivos', 5), async (req, res) => {
    try {
        const { id } = req.params;
        const { titulo, contenido, link_externo, estado } = req.body;
        const [result] = await db.execute(
            `UPDATE comunicados SET titulo = ?, contenido = ?, link_externo = ?, estado = ? WHERE id = ?`,
            [titulo, contenido, link_externo || null, estado, id]
        );
        if (result.affectedRows === 0) { return res.status(404).json({ success: false, error: 'Comunicado no encontrado' }); }
        if (req.files && req.files.length > 0) {
            for (const file of req.files) {
                await db.execute(
                    `INSERT INTO comunicados_archivos (comunicado_id, nombre_original, nombre_archivo, ruta_archivo, tipo_mime, tamano) VALUES (?, ?, ?, ?, ?, ?)`,
                    [id, file.originalname, file.filename, file.filename, file.mimetype, file.size]
                );
            }
        }
        res.json({ success: true, message: 'Comunicado actualizado exitosamente' });
    } catch (error) {
        console.error('Error al actualizar comunicado:', error);
        res.status(500).json({ success: false, error: 'Error al actualizar comunicado' });
    }
});

router.delete('/comunicados/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const [archivos] = await db.execute(`SELECT * FROM comunicados_archivos WHERE comunicado_id = ?`, [id]);
        for (const arch of archivos) {
            const filePath = path.join(comunicadosDir, arch.ruta_archivo);
            if (fs.existsSync(filePath)) { fs.unlinkSync(filePath); }
        }
        const [result] = await db.execute('DELETE FROM comunicados WHERE id = ?', [id]);
        if (result.affectedRows === 0) { return res.status(404).json({ success: false, error: 'Comunicado no encontrado' }); }
        res.json({ success: true, message: 'Comunicado eliminado exitosamente' });
    } catch (error) {
        console.error('Error al eliminar comunicado:', error);
        res.status(500).json({ success: false, error: 'Error al eliminar comunicado' });
    }
});

router.delete('/comunicados/:id/archivo/:archivoId', async (req, res) => {
    try {
        const { id, archivoId } = req.params;
        const [archivos] = await db.execute(`SELECT * FROM comunicados_archivos WHERE id = ? AND comunicado_id = ?`, [archivoId, id]);
        if (archivos.length === 0) { return res.status(404).json({ success: false, error: 'Archivo no encontrado' }); }
        const arch = archivos[0];
        const filePath = path.join(comunicadosDir, arch.ruta_archivo);
        if (fs.existsSync(filePath)) { fs.unlinkSync(filePath); }
        await db.execute(`DELETE FROM comunicados_archivos WHERE id = ?`, [archivoId]);
        res.json({ success: true, message: 'Archivo eliminado exitosamente' });
    } catch (error) {
        console.error('Error al eliminar archivo:', error);
        res.status(500).json({ success: false, error: 'Error al eliminar archivo' });
    }
});

router.get('/comunicados-recientes', async (req, res) => {
    try {
        const limitParam = req.query.limit;
        let limit = 5;
        if (limitParam !== undefined && limitParam !== null && limitParam !== '') {
            const parsed = parseInt(limitParam, 10);
            if (!isNaN(parsed) && parsed > 0) { limit = Math.min(parsed, 100); }
        }
        console.log(`📢 Obteniendo ${limit} comunicados recientes...`);
        const [comunicados] = await db.execute(
            `SELECT c.*, su.username as publicado_por_nombre
            FROM comunicados c
            LEFT JOIN super_users su ON c.publicado_por_id = su.id
            WHERE c.estado = 'publicado'
            ORDER BY c.fecha_publicacion DESC
            LIMIT ?`,
            [limit]
        );
        for (let c of comunicados) {
            const [archivos] = await db.execute(`SELECT * FROM comunicados_archivos WHERE comunicado_id = ?`, [c.id]);
            c.archivos = archivos.map(a => ({ ...a, url: `${API_BASE_URL}/uploads/comunicados/${a.ruta_archivo}` }));
        }
        res.json({ success: true, data: comunicados, limit: limit });
    } catch (error) {
        console.error('❌ Error al obtener comunicados recientes:', error);
        res.status(500).json({ success: false, error: 'Error al obtener comunicados', details: process.env.NODE_ENV === 'development' ? error.message : undefined });
    }
});

router.get('/comunicados-recientes-alt', async (req, res) => {
    try {
        const limitParam = req.query.limit || 5;
        const limit = Math.min(parseInt(limitParam) || 5, 100);
        const [comunicados] = await db.execute(
            `SELECT c.*, su.username as publicado_por_nombre
            FROM comunicados c
            LEFT JOIN super_users su ON c.publicado_por_id = su.id
            WHERE c.estado = 'publicado'
            ORDER BY c.fecha_publicacion DESC
            LIMIT ?`,
            [limit]
        );
        for (let c of comunicados) {
            const [archivos] = await db.execute(`SELECT * FROM comunicados_archivos WHERE comunicado_id = ?`, [c.id]);
            c.archivos = archivos.map(a => ({ ...a, url: `${API_BASE_URL}/uploads/comunicados/${a.ruta_archivo}` }));
        }
        res.json({ success: true, data: comunicados, limit: limit });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ success: false, error: 'Error al obtener comunicados' });
    }
});

module.exports = router;
