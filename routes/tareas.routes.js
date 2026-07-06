const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const db = require('../config/database');
const { uploadTareas } = require('../middleware/upload');
const { requireSuperAdmin } = require('../middleware/roles');
const { sanitize, sanitizeStr } = require('../utils/sanitize');
const { emit } = require('../services/socketEmitter');

router.get('/tareas/usuarios-disponibles', async (req, res) => {
    try {
        const [personal] = await db.execute(`
            SELECT p.id, p.nombre_completo as nombre, 'personal' as tipo, p.puesto as cargo, dir.nombre as direccion_nombre
            FROM personal p
            LEFT JOIN direcciones dir ON p.direccion_id = dir.id
            ORDER BY p.nombre_completo
        `);
        res.json({ success: true, data: personal, metadata: { total: personal.length } });
    } catch (error) {
        console.error('❌ Error al obtener personal:', error);
        res.status(500).json({ success: false, error: 'Error al obtener personal' });
    }
});

router.post('/tareas', requireSuperAdmin, uploadTareas.array('archivos', 5), async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        sanitize(req.body, { titulo: sanitizeStr, descripcion: sanitizeStr });
        const { titulo, descripcion, fecha_entrega, asignaciones } = req.body;
        const creado_por_id = req.body.creado_por_id;
        const creado_por_tipo = req.body.creado_por_tipo || 'superadmin';
        if (!titulo || !fecha_entrega || !creado_por_id || !asignaciones) {
            if (req.files && req.files.length > 0) { req.files.forEach(file => fs.unlinkSync(file.path)); }
            await connection.rollback(); connection.release();
            return res.status(400).json({ success: false, error: 'Todos los campos son requeridos' });
        }
        let asignacionesArray;
        try {
            asignacionesArray = JSON.parse(asignaciones);
            if (!Array.isArray(asignacionesArray) || asignacionesArray.length === 0) { throw new Error('Debe asignar al menos un usuario'); }
        } catch (e) {
            if (req.files && req.files.length > 0) { req.files.forEach(file => fs.unlinkSync(file.path)); }
            await connection.rollback(); connection.release();
            return res.status(400).json({ success: false, error: 'Formato de asignaciones inválido' });
        }
        const [tareaResult] = await connection.execute(
            `INSERT INTO tareas (titulo, descripcion, fecha_entrega, creado_por_id, creado_por_tipo) VALUES (?, ?, ?, ?, ?)`,
            [titulo, descripcion || null, fecha_entrega, creado_por_id, creado_por_tipo]
        );
        const tareaId = tareaResult.insertId;
        for (const asig of asignacionesArray) {
            await connection.execute(
                `INSERT INTO tareas_asignaciones (tarea_id, usuario_id, usuario_tipo, estado) VALUES (?, ?, ?, 'pendiente')`,
                [tareaId, asig.usuario_id, asig.usuario_tipo]
            );
        }
        if (req.files && req.files.length > 0) {
            for (const file of req.files) {
                await connection.execute(
                    `INSERT INTO tareas_archivos (tarea_id, nombre_original, nombre_archivo, ruta_archivo, tipo_mime, tamano) VALUES (?, ?, ?, ?, ?, ?)`,
                    [tareaId, file.originalname, file.filename, file.filename, file.mimetype, file.size]
                );
            }
        }
        await connection.execute(
            `INSERT INTO tareas_historial (tarea_id, usuario_id, usuario_tipo, accion, descripcion) VALUES (?, ?, ?, 'creada', ?)`,
            [tareaId, creado_por_id, creado_por_tipo, `Tarea creada con ${asignacionesArray.length} asignaciones`]
        );
        await connection.commit();
        emit('tarea:created', { id: tareaId });
        connection.release();
        res.status(201).json({ success: true, message: 'Tarea creada exitosamente', tareaId: tareaId, asignaciones: asignacionesArray.length, archivos: req.files?.length || 0 });
    } catch (error) {
        await connection.rollback(); connection.release();
        if (req.files && req.files.length > 0) { req.files.forEach(file => { try { fs.unlinkSync(file.path); } catch (err) {} }); }
        console.error('❌ Error al crear tarea:', error);
        res.status(500).json({ success: false, error: error.message || 'Error al crear la tarea' });
    }
});

router.get('/tareas', async (req, res) => {
    try {
        const [tareas] = await db.execute(`
            SELECT t.*,
                   CASE 
                     WHEN t.creado_por_tipo = 'superadmin' THEN su.username
                     WHEN t.creado_por_tipo = 'directivo' THEN d.nombre_completo
                     WHEN t.creado_por_tipo = 'personal' THEN p.nombre_completo
                   END as creado_por_nombre,
                   COUNT(DISTINCT ta.id) as total_asignaciones,
                   SUM(CASE WHEN ta.estado = 'completada' THEN 1 ELSE 0 END) as completadas,
                   SUM(CASE WHEN ta.estado = 'pendiente' THEN 1 ELSE 0 END) as pendientes,
                   SUM(CASE WHEN ta.estado = 'en_progreso' THEN 1 ELSE 0 END) as en_progreso
            FROM tareas t
            LEFT JOIN super_users su ON t.creado_por_id = su.id AND t.creado_por_tipo = 'superadmin'
            LEFT JOIN directivos d ON t.creado_por_id = d.id AND t.creado_por_tipo = 'directivo'
            LEFT JOIN personal p ON t.creado_por_id = p.id AND t.creado_por_tipo = 'personal'
            LEFT JOIN tareas_asignaciones ta ON t.id = ta.tarea_id
            GROUP BY t.id
            ORDER BY t.fecha_entrega ASC, t.fecha_creacion DESC
        `);
        for (let tarea of tareas) {
            const [asignaciones] = await db.execute(`
                SELECT ta.*,
                       CASE WHEN ta.usuario_tipo = 'directivo' THEN d.nombre_completo WHEN ta.usuario_tipo = 'personal' THEN p.nombre_completo END as usuario_nombre,
                       CASE WHEN ta.usuario_tipo = 'directivo' THEN d.cargo WHEN ta.usuario_tipo = 'personal' THEN p.puesto END as usuario_cargo,
                       dir.nombre as direccion_nombre
                FROM tareas_asignaciones ta
                LEFT JOIN directivos d ON ta.usuario_id = d.id AND ta.usuario_tipo = 'directivo'
                LEFT JOIN personal p ON ta.usuario_id = p.id AND ta.usuario_tipo = 'personal'
                LEFT JOIN direcciones dir ON (ta.usuario_tipo = 'directivo' AND d.direccion_id = dir.id) OR (ta.usuario_tipo = 'personal' AND p.direccion_id = dir.id)
                WHERE ta.tarea_id = ?
                ORDER BY ta.estado, usuario_nombre
            `, [tarea.id]);
            tarea.asignaciones = asignaciones;
            const [archivos] = await db.execute(`SELECT * FROM tareas_archivos WHERE tarea_id = ?`, [tarea.id]);
            tarea.archivos = archivos.filter(a => !a.asignacion_id).map(archivo => ({ ...archivo, url: `/uploads/tareas/${archivo.ruta_archivo}` }));
            for (let asig of tarea.asignaciones) {
              asig.archivos_respuesta = archivos
                .filter(a => a.asignacion_id === asig.id)
                .map(archivo => ({ ...archivo, url: `/uploads/tareas/${archivo.ruta_archivo}` }));
            }
            tarea.progreso = tarea.total_asignaciones > 0 ? Math.round((tarea.completadas / tarea.total_asignaciones) * 100) : 0;
        }
        res.json({ success: true, data: tareas, total: tareas.length });
    } catch (error) {
        console.error('❌ Error al obtener tareas:', error);
        res.status(500).json({ success: false, error: 'Error al obtener tareas' });
    }
});

router.get('/tareas/personal/:personalId/conteo', async (req, res) => {
  try {
    const { personalId } = req.params;
    const [result] = await db.execute(`
      SELECT COUNT(*) as pendientes FROM tareas_asignaciones ta
      WHERE ta.usuario_id = ? AND ta.usuario_tipo = 'personal' AND ta.estado IN ('pendiente', 'en_progreso')
    `, [personalId]);
    res.json({ success: true, data: { pendientes: result[0].pendientes } });
  } catch (error) {
    console.error('Error al obtener conteo:', error);
    res.status(500).json({ success: false, error: 'Error al obtener conteo' });
  }
});

router.get('/tareas/personal/:personalId', async (req, res) => {
  try {
    const { personalId } = req.params;
    const [tareas] = await db.execute(`
      SELECT t.*, ta.id as asignacion_id, ta.estado as asignacion_estado, ta.comentarios as asignacion_comentarios, ta.fecha_completado,
             CASE WHEN t.creado_por_tipo = 'superadmin' THEN su.username WHEN t.creado_por_tipo = 'directivo' THEN d.nombre_completo WHEN t.creado_por_tipo = 'personal' THEN p.nombre_completo END as creado_por_nombre
      FROM tareas t
      INNER JOIN tareas_asignaciones ta ON t.id = ta.tarea_id
      LEFT JOIN super_users su ON t.creado_por_id = su.id AND t.creado_por_tipo = 'superadmin'
      LEFT JOIN directivos d ON t.creado_por_id = d.id AND t.creado_por_tipo = 'directivo'
      LEFT JOIN personal p ON t.creado_por_id = p.id AND t.creado_por_tipo = 'personal'
      WHERE ta.usuario_id = ? AND ta.usuario_tipo = 'personal'
      ORDER BY CASE WHEN ta.estado IN ('pendiente', 'en_progreso') THEN 1 ELSE 2 END, t.fecha_entrega ASC
    `, [personalId]);
    for (let tarea of tareas) {
      const [archivos] = await db.execute(`SELECT * FROM tareas_archivos WHERE tarea_id = ?`, [tarea.id]);
      tarea.archivos = archivos.filter(a => !a.asignacion_id).map(archivo => ({ ...archivo, url: `/uploads/tareas/${archivo.ruta_archivo}` }));
      tarea.archivos_respuesta = archivos
        .filter(a => a.asignacion_id === tarea.asignacion_id)
        .map(archivo => ({ ...archivo, url: `/uploads/tareas/${archivo.ruta_archivo}` }));
      const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
      const entrega = new Date(tarea.fecha_entrega); entrega.setHours(0, 0, 0, 0);
      tarea.dias_restantes = Math.ceil((entrega - hoy) / (1000 * 60 * 60 * 24));
    }
    res.json({ success: true, data: tareas });
  } catch (error) {
    console.error('Error al obtener tareas del personal:', error);
    res.status(500).json({ success: false, error: 'Error al obtener tareas' });
  }
});

router.post('/tareas/completar/:asignacionId', uploadTareas.array('archivos', 5), async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const { asignacionId } = req.params;
    sanitize(req.body, { comentarios: sanitizeStr });
    const { comentarios } = req.body;
    if (!comentarios?.trim() && (!req.files || req.files.length === 0)) {
      await connection.rollback(); connection.release();
      if (req.files && req.files.length > 0) { req.files.forEach(file => fs.unlinkSync(file.path)); }
      return res.status(400).json({ success: false, error: 'Debes agregar una descripción o un archivo para completar la tarea' });
    }
    const [asignaciones] = await connection.execute(
      `SELECT ta.*, t.titulo FROM tareas_asignaciones ta INNER JOIN tareas t ON ta.tarea_id = t.id WHERE ta.id = ?`,
      [asignacionId]
    );
    if (asignaciones.length === 0) {
      await connection.rollback(); connection.release();
      if (req.files && req.files.length > 0) { req.files.forEach(file => fs.unlinkSync(file.path)); }
      return res.status(404).json({ success: false, error: 'Asignación no encontrada' });
    }
    const asignacion = asignaciones[0];
    await connection.execute(
      `UPDATE tareas_asignaciones SET estado = 'completada', comentarios = ?, fecha_completado = NOW() WHERE id = ?`,
      [comentarios || null, asignacionId]
    );
    let archivosGuardados = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const [result] = await connection.execute(
          `INSERT INTO tareas_archivos (tarea_id, nombre_original, nombre_archivo, ruta_archivo, tipo_mime, tamano, asignacion_id) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [asignacion.tarea_id, file.originalname, file.filename, file.filename, file.mimetype, file.size, asignacion.id]
        );
        archivosGuardados.push({ id: result.insertId, nombre: file.originalname });
      }
    }
    await connection.execute(
      `INSERT INTO tareas_historial (tarea_id, usuario_id, usuario_tipo, accion, descripcion) VALUES (?, ?, 'personal', 'completada', ?)`,
      [asignacion.tarea_id, asignacion.usuario_id, `Tarea completada${comentarios ? ' con comentarios' : ''}${req.files?.length > 0 ? ' y ' + req.files.length + ' archivo(s)' : ''}`]
    );
    await connection.commit();
    emit('tarea:completada', { asignacionId: parseInt(asignacionId) });
    connection.release();
    res.json({ success: true, message: '¡Felicidades! Tarea completada exitosamente', data: { tarea: asignacion.titulo, comentarios: comentarios || null, archivos: archivosGuardados.length } });
  } catch (error) {
    await connection.rollback(); connection.release();
    if (req.files && req.files.length > 0) { req.files.forEach(file => { try { fs.unlinkSync(file.path); } catch (err) {} }); }
    console.error('Error al completar tarea:', error);
    res.status(500).json({ success: false, error: 'Error al completar la tarea' });
  }
});

router.put('/tareas/asignacion/:id', requireSuperAdmin, async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const { id } = req.params;
        const { estado, comentarios, usuario_id, usuario_tipo } = req.body;
        const [asignaciones] = await connection.execute('SELECT * FROM tareas_asignaciones WHERE id = ?', [id]);
        if (asignaciones.length === 0) {
            await connection.rollback(); connection.release();
            return res.status(404).json({ success: false, error: 'Asignación no encontrada' });
        }
        const asignacion = asignaciones[0];
        const fechaCompletado = estado === 'completada' ? new Date() : null;
        await connection.execute(
            `UPDATE tareas_asignaciones SET estado = ?, comentarios = ?, fecha_completado = ? WHERE id = ?`,
            [estado, comentarios || null, fechaCompletado, id]
        );
        await connection.execute(
            `INSERT INTO tareas_historial (tarea_id, usuario_id, usuario_tipo, accion, descripcion) VALUES (?, ?, ?, 'actualizacion', ?)`,
            [asignacion.tarea_id, usuario_id || 1, usuario_tipo || 'superadmin', `Estado de asignación actualizado a: ${estado}`]
        );
        await connection.commit();
        emit('tarea:asignacion-updated', { id: parseInt(req.params.id) });
        connection.release();
        res.json({ success: true, message: 'Estado actualizado correctamente' });
    } catch (error) {
        await connection.rollback(); connection.release();
        console.error('Error al actualizar asignación:', error);
        res.status(500).json({ success: false, error: 'Error al actualizar estado' });
    }
});

router.delete('/tareas/archivo/:archivoId', async (req, res) => {
  try {
    const { archivoId } = req.params;
    const [archivos] = await db.execute('SELECT * FROM tareas_archivos WHERE id = ?', [archivoId]);
    if (archivos.length === 0) { return res.status(404).json({ success: false, error: 'Archivo no encontrado' }); }
    const archivo = archivos[0];
    const filePath = path.join('uploads/tareas', archivo.ruta_archivo);
    if (fs.existsSync(filePath)) { fs.unlinkSync(filePath); }
    await db.execute('DELETE FROM tareas_archivos WHERE id = ?', [archivoId]);
    res.json({ success: true, message: 'Archivo eliminado' });
    emit('tarea:archivo-deleted', { archivoId: parseInt(archivoId) });
  } catch (error) {
    console.error('Error eliminando archivo:', error);
    res.status(500).json({ success: false, error: 'Error al eliminar archivo' });
  }
});

router.get('/tareas/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const [tareas] = await db.execute(`
            SELECT t.*,
                   CASE WHEN t.creado_por_tipo = 'superadmin' THEN su.username WHEN t.creado_por_tipo = 'directivo' THEN d.nombre_completo WHEN t.creado_por_tipo = 'personal' THEN p.nombre_completo END as creado_por_nombre
            FROM tareas t
            LEFT JOIN super_users su ON t.creado_por_id = su.id AND t.creado_por_tipo = 'superadmin'
            LEFT JOIN directivos d ON t.creado_por_id = d.id AND t.creado_por_tipo = 'directivo'
            LEFT JOIN personal p ON t.creado_por_id = p.id AND t.creado_por_tipo = 'personal'
            WHERE t.id = ?
        `, [id]);
        if (tareas.length === 0) { return res.status(404).json({ success: false, error: 'Tarea no encontrada' }); }
        const tarea = tareas[0];
        const [asignaciones] = await db.execute(`
            SELECT ta.*,
                   CASE WHEN ta.usuario_tipo = 'directivo' THEN d.nombre_completo WHEN ta.usuario_tipo = 'personal' THEN p.nombre_completo END as usuario_nombre,
                   CASE WHEN ta.usuario_tipo = 'directivo' THEN d.cargo WHEN ta.usuario_tipo = 'personal' THEN p.puesto END as usuario_cargo,
                   dir.nombre as direccion_nombre
            FROM tareas_asignaciones ta
            LEFT JOIN directivos d ON ta.usuario_id = d.id AND ta.usuario_tipo = 'directivo'
            LEFT JOIN personal p ON ta.usuario_id = p.id AND ta.usuario_tipo = 'personal'
            LEFT JOIN direcciones dir ON (ta.usuario_tipo = 'directivo' AND d.direccion_id = dir.id) OR (ta.usuario_tipo = 'personal' AND p.direccion_id = dir.id)
            WHERE ta.tarea_id = ?
        `, [id]);
        tarea.asignaciones = asignaciones;
        const [archivos] = await db.execute(`SELECT * FROM tareas_archivos WHERE tarea_id = ?`, [id]);
        tarea.archivos = archivos.filter(a => !a.asignacion_id).map(archivo => ({ ...archivo, url: `/uploads/tareas/${archivo.ruta_archivo}` }));
        for (let asig of tarea.asignaciones) {
          asig.archivos_respuesta = archivos
            .filter(a => a.asignacion_id === asig.id)
            .map(archivo => ({ ...archivo, url: `/uploads/tareas/${archivo.ruta_archivo}` }));
        }
        const [historial] = await db.execute(`
            SELECT h.*,
                   CASE WHEN h.usuario_tipo = 'superadmin' THEN su.username WHEN h.usuario_tipo = 'directivo' THEN d.nombre_completo WHEN h.usuario_tipo = 'personal' THEN p.nombre_completo END as usuario_nombre
            FROM tareas_historial h
            LEFT JOIN super_users su ON h.usuario_id = su.id AND h.usuario_tipo = 'superadmin'
            LEFT JOIN directivos d ON h.usuario_id = d.id AND h.usuario_tipo = 'directivo'
            LEFT JOIN personal p ON h.usuario_id = p.id AND h.usuario_tipo = 'personal'
            WHERE h.tarea_id = ?
            ORDER BY h.fecha DESC
        `, [id]);
        tarea.historial = historial;
        res.json({ success: true, data: tarea });
    } catch (error) {
        console.error('Error al obtener tarea:', error);
        res.status(500).json({ success: false, error: 'Error al obtener tarea' });
    }
});

router.put('/tareas/:id', requireSuperAdmin, uploadTareas.array('archivos', 5), async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const { id } = req.params;
    sanitize(req.body, { titulo: sanitizeStr, descripcion: sanitizeStr });
    const { titulo, descripcion, fecha_entrega, asignaciones } = req.body;
    await connection.execute(
      `UPDATE tareas SET titulo = ?, descripcion = ?, fecha_entrega = ? WHERE id = ?`,
      [titulo, descripcion || null, fecha_entrega, id]
    );
    if (asignaciones) {
      const nuevasAsignaciones = JSON.parse(asignaciones);
      await connection.execute('DELETE FROM tareas_asignaciones WHERE tarea_id = ?', [id]);
      for (const asig of nuevasAsignaciones) {
        await connection.execute(
          `INSERT INTO tareas_asignaciones (tarea_id, usuario_id, usuario_tipo, estado) VALUES (?, ?, ?, 'pendiente')`,
          [id, asig.usuario_id, asig.usuario_tipo]
        );
      }
    }
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        await connection.execute(
          `INSERT INTO tareas_archivos (tarea_id, nombre_original, nombre_archivo, ruta_archivo, tipo_mime, tamano) VALUES (?, ?, ?, ?, ?, ?)`,
          [id, file.originalname, file.filename, file.filename, file.mimetype, file.size]
        );
      }
    }
    await connection.commit();
    emit('tarea:updated', { id: parseInt(req.params.id) });
    connection.release();
    res.json({ success: true, message: 'Tarea actualizada exitosamente' });
  } catch (error) {
    await connection.rollback(); connection.release();
    console.error('Error editando tarea:', error);
    res.status(500).json({ success: false, error: 'Error al editar la tarea' });
  }
});

router.delete('/tareas/:id', requireSuperAdmin, async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const { id } = req.params;
        const [archivos] = await connection.execute('SELECT * FROM tareas_archivos WHERE tarea_id = ?', [id]);
        for (const archivo of archivos) {
            try {
                const filePath = path.join('uploads/tareas', archivo.ruta_archivo);
                if (fs.existsSync(filePath)) { fs.unlinkSync(filePath); }
            } catch (err) { console.error('Error eliminando archivo:', err); }
        }
        const [result] = await connection.execute('DELETE FROM tareas WHERE id = ?', [id]);
        if (result.affectedRows === 0) {
            await connection.rollback(); connection.release();
            return res.status(404).json({ success: false, error: 'Tarea no encontrada' });
        }
        await connection.commit();
        emit('tarea:deleted', { id: parseInt(req.params.id) });
        connection.release();
        res.json({ success: true, message: 'Tarea eliminada exitosamente', archivosEliminados: archivos.length });
    } catch (error) {
        await connection.rollback(); connection.release();
        console.error('Error al eliminar tarea:', error);
        res.status(500).json({ success: false, error: 'Error al eliminar tarea' });
    }
});

module.exports = router;
