const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const db = require('../config/database');
const { uploadActividades, uploadDir } = require('../middleware/upload');
const { requireRole } = require('../middleware/roles');
const { sanitize, sanitizeStr } = require('../utils/sanitize');
const { emit } = require('../services/socketEmitter');

router.post('/actividades', requireRole('superadmin', 'personal'), uploadActividades.array('imagenes', 5), async (req, res) => {
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
        const [periodoActivo] = await db.execute(
            'SELECT id FROM periodos_actividades WHERE activo = 1 ORDER BY anio DESC, FIELD(periodo, "enero-abril","mayo-agosto","septiembre-diciembre") DESC LIMIT 1'
        );
        const periodoId = periodoActivo.length > 0 ? periodoActivo[0].id : null;
        const [result] = await db.execute(
            `INSERT INTO actividades (titulo, descripcion, tipo_actividad, fecha_inicio, fecha_fin, direccion_id, creado_por_id, creado_por_tipo, estado, periodo_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pendiente', ?)`,
            [titulo, descripcion || null, tipo_actividad, fecha_inicio, fecha_fin || null, direccion_id, creado_por_id, creado_por_tipo, periodoId]
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
        emit('actividad:created', { id: actividadId });
    } catch (error) {
        console.error('❌ Error al crear actividad:', error);
        if (req.files && req.files.length > 0) {
            req.files.forEach(file => { try { fs.unlinkSync(file.path); } catch (err) {} });
        }
        res.status(500).json({ success: false, error: error.message || 'Error al crear la actividad' });
    }
});

router.put('/actividades/:id/estado', requireRole('superadmin', 'personal'), async (req, res) => {
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
        emit('actividad:estado-changed', { id: parseInt(req.params.id), estado });
    } catch (error) {
        console.error('Error al actualizar estado:', error);
        res.status(500).json({ success: false, error: 'Error al actualizar estado' });
    }
});

router.put('/actividades/:id', requireRole('superadmin', 'directivo', 'personal'), uploadActividades.array('imagenes', 5), async (req, res) => {
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
        const [periodoEdit] = await db.execute(
            'SELECT id FROM periodos_actividades WHERE activo = 1 ORDER BY anio DESC, FIELD(periodo, "enero-abril","mayo-agosto","septiembre-diciembre") DESC LIMIT 1'
        );
        const periodoEditId = periodoEdit.length > 0 ? periodoEdit[0].id : null;
        await db.execute(
            `UPDATE actividades SET titulo = ?, descripcion = ?, tipo_actividad = ?, fecha_inicio = ?, fecha_fin = ?, periodo_id = ? WHERE id = ?`,
            [titulo, descripcion || null, tipo_actividad, fecha_inicio, fecha_fin || null, periodoEditId, id]
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
        emit('actividad:updated', { id: parseInt(req.params.id) });
    } catch (error) {
        console.error('❌ Error al editar actividad:', error);
        if (req.files && req.files.length > 0) {
            req.files.forEach(file => { try { fs.unlinkSync(file.path); } catch (err) {} });
        }
        res.status(500).json({ success: false, error: error.message || 'Error al editar la actividad' });
    }
});

router.delete('/actividades/imagen/:imagenId', requireRole('superadmin', 'directivo', 'personal'), async (req, res) => {
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
                   p.periodo as periodo_nombre,
                   p.anio as periodo_anio,
                   CASE 
                     WHEN a.creado_por_tipo = 'directivo' THEN dir.nombre_completo
                     WHEN a.creado_por_tipo = 'personal' THEN per.nombre_completo
                     ELSE 'Sistema'
                   END as creado_por_nombre
            FROM actividades a
            LEFT JOIN direcciones d ON a.direccion_id = d.id
            LEFT JOIN periodos_actividades p ON a.periodo_id = p.id
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
                   p.periodo as periodo_nombre,
                   p.anio as periodo_anio,
                   CASE 
                     WHEN a.creado_por_tipo = 'directivo' THEN dir.nombre_completo
                     WHEN a.creado_por_tipo = 'personal' THEN per.nombre_completo
                     ELSE 'Sistema'
                   END as creado_por_nombre
            FROM actividades a
            LEFT JOIN direcciones d ON a.direccion_id = d.id
            LEFT JOIN periodos_actividades p ON a.periodo_id = p.id
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

router.delete('/actividades/:id', requireRole('superadmin', 'directivo', 'personal'), async (req, res) => {
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
        emit('actividad:deleted', { id: parseInt(req.params.id) });
    } catch (error) {
        console.error('❌ Error al eliminar actividad:', error);
        res.status(500).json({ success: false, error: error.message || 'Error al eliminar la actividad' });
    }
});

// ========== ESTADO DE LECTURA (Leído / No leído) ==========
router.get('/actividades/lectura', requireRole('superadmin'), async (req, res) => {
    try {
        const superUserId = req.user.id;
        const [lecturas] = await db.execute(
            'SELECT actividad_id, leido FROM actividad_lectura WHERE super_user_id = ?',
            [superUserId]
        );
        res.json({ success: true, data: lecturas });
    } catch (error) {
        console.error('Error al obtener lecturas:', error);
        res.status(500).json({ success: false, error: 'Error al obtener estados de lectura' });
    }
});

router.put('/actividades/:id/lectura', requireRole('superadmin'), async (req, res) => {
    try {
        const { id } = req.params;
        const superUserId = req.user.id;
        const [existing] = await db.execute(
            'SELECT id, leido FROM actividad_lectura WHERE actividad_id = ? AND super_user_id = ?',
            [id, superUserId]
        );
        if (existing.length > 0) {
            const nuevoValor = existing[0].leido ? 0 : 1;
            await db.execute(
                'UPDATE actividad_lectura SET leido = ? WHERE id = ?',
                [nuevoValor, existing[0].id]
            );
            res.json({ success: true, leido: !!nuevoValor, message: nuevoValor ? 'Marcada como leída' : 'Marcada como no leída' });
            emit('actividad:lectura-changed', { actividadId: parseInt(id), superUserId, leido: !!nuevoValor });
        } else {
            await db.execute(
                'INSERT INTO actividad_lectura (actividad_id, super_user_id, leido) VALUES (?, ?, 1)',
                [id, superUserId]
            );
            res.json({ success: true, leido: true, message: 'Marcada como leída' });
            emit('actividad:lectura-changed', { actividadId: parseInt(id), superUserId, leido: true });
        }
    } catch (error) {
        console.error('Error al alternar lectura:', error);
        res.status(500).json({ success: false, error: 'Error al actualizar estado de lectura' });
    }
});

// ========== PERIODOS (Cuatrimestres) ==========
router.get('/actividades/periodos', requireRole('superadmin'), async (req, res) => {
    try {
        const [periodos] = await db.execute(
            'SELECT * FROM periodos_actividades ORDER BY anio ASC, FIELD(periodo, "enero-abril","mayo-agosto","septiembre-diciembre") ASC'
        );
        res.json({ success: true, data: periodos });
    } catch (error) {
        console.error('Error al obtener periodos:', error);
        res.status(500).json({ success: false, error: 'Error al obtener periodos' });
    }
});

router.post('/actividades/periodos/abrir-siguiente', requireRole('superadmin'), async (req, res) => {
    try {
        const [ultimoActivo] = await db.execute(
            'SELECT * FROM periodos_actividades WHERE activo = 1 ORDER BY anio DESC, FIELD(periodo, "enero-abril","mayo-agosto","septiembre-diciembre") DESC LIMIT 1'
        );
        let nuevoAnio, nuevoPeriodo;
        const PERIODOS = ['enero-abril', 'mayo-agosto', 'septiembre-diciembre'];
        if (ultimoActivo.length > 0) {
            const idx = PERIODOS.indexOf(ultimoActivo[0].periodo);
            if (idx < 2) {
                nuevoAnio = ultimoActivo[0].anio;
                nuevoPeriodo = PERIODOS[idx + 1];
            } else {
                nuevoAnio = ultimoActivo[0].anio + 1;
                nuevoPeriodo = PERIODOS[0];
            }
        } else {
            const hoy = new Date();
            const mes = hoy.getMonth() + 1;
            nuevoAnio = hoy.getFullYear();
            if (mes >= 1 && mes <= 4) nuevoPeriodo = 'enero-abril';
            else if (mes >= 5 && mes <= 8) nuevoPeriodo = 'mayo-agosto';
            else nuevoPeriodo = 'septiembre-diciembre';
        }
        const [existente] = await db.execute(
            'SELECT id FROM periodos_actividades WHERE anio = ? AND periodo = ?',
            [nuevoAnio, nuevoPeriodo]
        );
        if (existente.length > 0) {
            await db.execute('UPDATE periodos_actividades SET activo = 1 WHERE id = ?', [existente[0].id]);
        } else {
            await db.execute(
                'INSERT INTO periodos_actividades (anio, periodo, activo) VALUES (?, ?, 1)',
                [nuevoAnio, nuevoPeriodo]
            );
        }
        res.json({ success: true, message: `Periodo ${nuevoPeriodo} ${nuevoAnio} abierto exitosamente` });
        emit('actividad:periodo-abierto', { anio: nuevoAnio, periodo: nuevoPeriodo });
    } catch (error) {
        console.error('Error al abrir siguiente periodo:', error);
        res.status(500).json({ success: false, error: 'Error al abrir el siguiente periodo' });
    }
});

module.exports = router;
