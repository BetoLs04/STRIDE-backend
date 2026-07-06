const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const db = require('../config/database');
const { uploadActividades, uploadDir } = require('../middleware/upload');
const { requireRole } = require('../middleware/roles');
const { sanitize, sanitizeStr } = require('../utils/sanitize');

router.post('/actividades', requireRole('superadmin', 'directivo'), uploadActividades.array('imagenes', 5), async (req, res) => {
    try {
        sanitize(req.body, { titulo: sanitizeStr, descripcion: sanitizeStr, tipo_actividad: sanitizeStr });
        const { titulo, descripcion, tipo_actividad, fecha_inicio, fecha_fin, direccion_id, creado_por_id, creado_por_tipo } = req.body;
        console.log('📝 Datos recibidos:', { titulo, descripcion, tipo_actividad, fecha_inicio, fecha_fin, direccion_id, creado_por_id, creado_por_tipo });
        console.log('📸 Archivos recibidos:', req.files ? req.files.length : 0);
        if (!titulo || !tipo_actividad || !fecha_inicio || !direccion_id || !creado_por_id || !creado_por_tipo) {
            if (req.files && req.files.length > 0) {
                req.files.forEach(file => { try { fs.unlinkSync(file.path); } catch (err) {} });
            }
            return res.status(400).json({ success: false, error: 'Título, tipo de actividad, fecha de inicio, dirección, creador y tipo son requeridos' });
        }
        if (fecha_fin && new Date(fecha_fin) < new Date(fecha_inicio)) {
            if (req.files && req.files.length > 0) {
                req.files.forEach(file => { try { fs.unlinkSync(file.path); } catch (err) {} });
            }
            return res.status(400).json({ success: false, error: 'La fecha de fin no puede ser anterior a la fecha de inicio' });
        }
        const [result] = await db.execute(
            `INSERT INTO actividades (titulo, descripcion, tipo_actividad, fecha_inicio, fecha_fin, direccion_id, creado_por_id, creado_por_tipo, estado) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pendiente')`,
            [titulo, descripcion || null, tipo_actividad, fecha_inicio, fecha_fin || null, direccion_id, creado_por_id, creado_por_tipo]
        );
        const actividadId = result.insertId;
        if (req.files && req.files.length > 0) {
            for (const file of req.files) {
                await db.execute(
                    `INSERT INTO actividad_imagenes (actividad_id, nombre_archivo, ruta_archivo, tipo_mime, tamano) VALUES (?, ?, ?, ?, ?)`,
                    [actividadId, file.originalname, file.filename, file.mimetype, file.size]
                );
            }
        }
        res.status(201).json({ success: true, message: 'Actividad creada exitosamente', actividadId: actividadId, imagenesCount: req.files ? req.files.length : 0 });
    } catch (error) {
        console.error('❌ Error al crear actividad:', error);
        if (req.files && req.files.length > 0) {
            req.files.forEach(file => { try { fs.unlinkSync(file.path); } catch (err) {} });
        }
        res.status(500).json({ success: false, error: error.message || 'Error al crear la actividad' });
    }
});

router.put('/actividades/:id/estado', requireRole('superadmin', 'directivo'), async (req, res) => {
    try {
        const { id } = req.params;
        const { estado } = req.body;
        const estadosValidos = ['pendiente', 'en_progreso', 'completada'];
        if (!estado || !estadosValidos.includes(estado)) {
            return res.status(400).json({ success: false, error: 'Estado inválido' });
        }
        const [result] = await db.execute('UPDATE actividades SET estado = ? WHERE id = ?', [estado, id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, error: 'Actividad no encontrada' });
        }
        res.json({ success: true, message: 'Estado actualizado', affectedRows: result.affectedRows });
    } catch (error) {
        console.error('Error al actualizar estado:', error);
        res.status(500).json({ success: false, error: 'Error al actualizar estado' });
    }
});

router.put('/actividades/:id', requireRole('superadmin', 'directivo'), uploadActividades.array('imagenes', 5), async (req, res) => {
    try {
        const { id } = req.params;
        sanitize(req.body, { titulo: sanitizeStr, descripcion: sanitizeStr, tipo_actividad: sanitizeStr });
        const { titulo, descripcion, tipo_actividad, fecha_inicio, fecha_fin, creado_por_id } = req.body;
        console.log('✏️ Editando actividad ID:', id);
        if (!titulo || !tipo_actividad || !fecha_inicio) {
            if (req.files && req.files.length > 0) {
                req.files.forEach(file => { try { fs.unlinkSync(file.path); } catch (err) {} });
            }
            return res.status(400).json({ success: false, error: 'Título, tipo de actividad y fecha de inicio son requeridos' });
        }
        const [actividades] = await db.execute('SELECT * FROM actividades WHERE id = ?', [id]);
        if (actividades.length === 0) {
            if (req.files && req.files.length > 0) {
                req.files.forEach(file => { try { fs.unlinkSync(file.path); } catch (err) {} });
            }
            return res.status(404).json({ success: false, error: 'Actividad no encontrada' });
        }
        const actividad = actividades[0];
        if (String(actividad.creado_por_id) !== String(creado_por_id)) {
            if (req.files && req.files.length > 0) {
                req.files.forEach(file => { try { fs.unlinkSync(file.path); } catch (err) {} });
            }
            return res.status(403).json({ success: false, error: 'No tienes permiso para editar esta actividad' });
        }
        if (fecha_fin && new Date(fecha_fin) < new Date(fecha_inicio)) {
            if (req.files && req.files.length > 0) {
                req.files.forEach(file => { try { fs.unlinkSync(file.path); } catch (err) {} });
            }
            return res.status(400).json({ success: false, error: 'La fecha de fin no puede ser anterior a la fecha de inicio' });
        }
        await db.execute(
            `UPDATE actividades SET titulo = ?, descripcion = ?, tipo_actividad = ?, fecha_inicio = ?, fecha_fin = ? WHERE id = ?`,
            [titulo, descripcion || null, tipo_actividad, fecha_inicio, fecha_fin || null, id]
        );
        let imagenesAgregadas = 0;
        if (req.files && req.files.length > 0) {
            const [imagenesActuales] = await db.execute(
                'SELECT COUNT(*) as total FROM actividad_imagenes WHERE actividad_id = ?', [id]
            );
            const totalActual = imagenesActuales[0].total;
            const espacioDisponible = 5 - totalActual;
            if (req.files.length > espacioDisponible) {
                req.files.forEach(file => { try { fs.unlinkSync(file.path); } catch (err) {} });
                return res.status(400).json({
                    success: false,
                    error: `Solo puedes agregar ${espacioDisponible} imagen(es) más. Ya tienes ${totalActual} de 5.`
                });
            }
            for (const file of req.files) {
                await db.execute(
                    `INSERT INTO actividad_imagenes (actividad_id, nombre_archivo, ruta_archivo, tipo_mime, tamano) VALUES (?, ?, ?, ?, ?)`,
                    [id, file.originalname, file.filename, file.mimetype, file.size]
                );
                imagenesAgregadas++;
            }
        }
        console.log(`✅ Actividad ${id} editada exitosamente`);
        res.json({ success: true, message: 'Actividad actualizada exitosamente', actividadId: id, imagenesAgregadas: imagenesAgregadas });
    } catch (error) {
        console.error('❌ Error al editar actividad:', error);
        if (req.files && req.files.length > 0) {
            req.files.forEach(file => { try { fs.unlinkSync(file.path); } catch (err) {} });
        }
        res.status(500).json({ success: false, error: error.message || 'Error al editar la actividad' });
    }
});

router.delete('/actividades/imagen/:imagenId', requireRole('superadmin', 'directivo'), async (req, res) => {
    try {
        const { imagenId } = req.params;
        const { creado_por_id } = req.body;
        console.log('🗑️ Eliminando imagen ID:', imagenId);
        const [imagenes] = await db.execute(
            'SELECT ai.*, a.creado_por_id FROM actividad_imagenes ai INNER JOIN actividades a ON ai.actividad_id = a.id WHERE ai.id = ?',
            [imagenId]
        );
        if (imagenes.length === 0) {
            return res.status(404).json({ success: false, error: 'Imagen no encontrada' });
        }
        const imagen = imagenes[0];
        if (creado_por_id && String(imagen.creado_por_id) !== String(creado_por_id)) {
            return res.status(403).json({ success: false, error: 'No tienes permiso para eliminar esta imagen' });
        }
        const filePath = path.join(uploadDir, imagen.ruta_archivo);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log('✅ Archivo físico eliminado:', filePath);
        }
        await db.execute('DELETE FROM actividad_imagenes WHERE id = ?', [imagenId]);
        console.log(`✅ Imagen ${imagenId} eliminada exitosamente`);
        res.json({ success: true, message: 'Imagen eliminada exitosamente', imagenId: imagenId });
    } catch (error) {
        console.error('❌ Error al eliminar imagen:', error);
        res.status(500).json({ success: false, error: error.message || 'Error al eliminar la imagen' });
    }
});

router.get('/actividades/direccion/:direccion_id', async (req, res) => {
    try {
        const { direccion_id } = req.params;
        console.log(`📋 Obteniendo actividades para dirección: ${direccion_id}`);
        const [actividades] = await db.execute(`
            SELECT a.*, 
                   d.nombre as direccion_nombre,
                   CASE 
                     WHEN a.creado_por_tipo = 'directivo' THEN dir.nombre_completo
                     WHEN a.creado_por_tipo = 'personal' THEN per.nombre_completo
                     ELSE 'Sistema'
                   END as creado_por_nombre
            FROM actividades a
            LEFT JOIN direcciones d ON a.direccion_id = d.id
            LEFT JOIN directivos dir ON a.creado_por_id = dir.id AND a.creado_por_tipo = 'directivo'
            LEFT JOIN personal per ON a.creado_por_id = per.id AND a.creado_por_tipo = 'personal'
            WHERE a.direccion_id = ?
            ORDER BY a.fecha_creacion DESC
        `, [direccion_id]);
        console.log(`📊 Actividades encontradas: ${actividades.length}`);
        for (let actividad of actividades) {
            const [imagenes] = await db.execute(
                `SELECT id, actividad_id, nombre_archivo, ruta_archivo, tipo_mime, tamano, fecha_subida FROM actividad_imagenes WHERE actividad_id = ?`,
                [actividad.id]
            );
            actividad.imagenes = imagenes.map(img => ({ ...img, url: `/uploads/actividades/${img.ruta_archivo}` }));
        }
        res.json({ success: true, data: actividades });
    } catch (error) {
        console.error('Error al obtener actividades:', error);
        res.status(500).json({ success: false, error: 'Error al obtener actividades' });
    }
});

router.get('/actividades/todas', async (req, res) => {
    try {
        console.log('📋 Obteniendo TODAS las actividades del sistema');
        const [actividades] = await db.execute(`
            SELECT a.*, 
                   d.nombre as direccion_nombre,
                   CASE 
                     WHEN a.creado_por_tipo = 'directivo' THEN dir.nombre_completo
                     WHEN a.creado_por_tipo = 'personal' THEN per.nombre_completo
                     ELSE 'Sistema'
                   END as creado_por_nombre
            FROM actividades a
            LEFT JOIN direcciones d ON a.direccion_id = d.id
            LEFT JOIN directivos dir ON a.creado_por_id = dir.id AND a.creado_por_tipo = 'directivo'
            LEFT JOIN personal per ON a.creado_por_id = per.id AND a.creado_por_tipo = 'personal'
            ORDER BY a.fecha_creacion DESC
        `);
        console.log(`📊 Total actividades encontradas: ${actividades.length}`);
        for (let actividad of actividades) {
            const [imagenes] = await db.execute(
                `SELECT id, actividad_id, nombre_archivo, ruta_archivo, tipo_mime, tamano, fecha_subida FROM actividad_imagenes WHERE actividad_id = ?`,
                [actividad.id]
            );
            actividad.imagenes = imagenes.map(img => ({ ...img, url: `/uploads/actividades/${img.ruta_archivo}` }));
        }
        res.json({ success: true, data: actividades, total: actividades.length, timestamp: new Date().toISOString() });
    } catch (error) {
        console.error('Error al obtener todas las actividades:', error);
        res.status(500).json({ success: false, error: 'Error al obtener actividades' });
    }
});

router.delete('/actividades/:id', requireRole('superadmin', 'directivo'), async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`🗑️ Solicitando eliminación de actividad ID: ${id}`);
        const [actividades] = await db.execute('SELECT * FROM actividades WHERE id = ?', [id]);
        if (actividades.length === 0) {
            return res.status(404).json({ success: false, error: 'Actividad no encontrada' });
        }
        const actividad = actividades[0];
        const [imagenes] = await db.execute('SELECT * FROM actividad_imagenes WHERE actividad_id = ?', [id]);
        console.log(`📸 Imágenes a eliminar: ${imagenes.length}`);
        let imagenesEliminadas = 0;
        for (const imagen of imagenes) {
            try {
                const filePath = path.join(uploadDir, imagen.ruta_archivo);
                if (fs.existsSync(filePath)) { fs.unlinkSync(filePath); imagenesEliminadas++; }
            } catch (fileError) {
                console.error(`   ⚠️ Error eliminando archivo: ${fileError.message}`);
            }
        }
        await db.execute('DELETE FROM actividad_imagenes WHERE actividad_id = ?', [id]);
        const [result] = await db.execute('DELETE FROM actividades WHERE id = ?', [id]);
        if (result.affectedRows === 0) {
            return res.status(500).json({ success: false, error: 'No se pudo eliminar la actividad' });
        }
        console.log(`✅ Actividad ${id} eliminada exitosamente`);
        res.json({ success: true, message: 'Actividad eliminada exitosamente', actividadId: id, titulo: actividad.titulo, imagenesEliminadas: imagenesEliminadas, registrosEliminados: result.affectedRows });
    } catch (error) {
        console.error('❌ Error al eliminar actividad:', error);
        res.status(500).json({ success: false, error: error.message || 'Error al eliminar la actividad' });
    }
});

module.exports = router;
