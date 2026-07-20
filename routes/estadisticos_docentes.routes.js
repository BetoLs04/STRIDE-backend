const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { requireSuperAdmin } = require('../middleware/roles');
const { TIPOS_USUARIO_VALIDOS } = require('../utils/constants');
const { sanitize, sanitizeStr } = require('../utils/sanitize');
const { emit } = require('../services/socketEmitter');

// ========== HOJAS ==========

router.get('/estadisticos-docentes-hojas', async (req, res) => {
    try {
        const { anio } = req.query;
        let q = 'SELECT * FROM estadisticos_docentes_hojas';
        const p = [];
        if (anio) { q += ' WHERE anio = ?'; p.push(anio); }
        q += ' ORDER BY anio DESC, id DESC';
        const [r] = await db.execute(q, p);
        res.json({ success: true, data: r });
    } catch (e) { console.error(e); res.status(500).json({ success: false, error: 'Error al obtener hojas' }); }
});

router.get('/estadisticos-docentes-hojas-anios', async (req, res) => {
    try {
        const [r] = await db.execute("SELECT DISTINCT anio FROM estadisticos_docentes_hojas WHERE anio IS NOT NULL AND anio != '' ORDER BY anio DESC");
        res.json({ success: true, data: r.map(x => x.anio) });
    } catch (e) { console.error(e); res.status(500).json({ success: false, error: 'Error al obtener años' }); }
});

router.post('/estadisticos-docentes-hojas', requireSuperAdmin, async (req, res) => {
    try {
        sanitize(req.body, { cuatrimestre: sanitizeStr, anio: sanitizeStr });
        const { cuatrimestre, anio } = req.body;
        const [r] = await db.execute('INSERT INTO estadisticos_docentes_hojas (cuatrimestre, anio) VALUES (?, ?)', [cuatrimestre || '', anio || '']);
        const [rows] = await db.execute('SELECT * FROM estadisticos_docentes_hojas WHERE id = ?', [r.insertId]);
        res.json({ success: true, data: rows[0] });
        emit('estadisticos-docentes:updated', { type: 'hoja:created', id: r.insertId });
    } catch (e) { console.error(e); res.status(500).json({ success: false, error: 'Error al crear hoja' }); }
});

router.put('/estadisticos-docentes-hojas/:id', requireSuperAdmin, async (req, res) => {
    try {
        sanitize(req.body, { cuatrimestre: sanitizeStr, anio: sanitizeStr });
        const { cuatrimestre, anio } = req.body;
        const s = []; const v = [];
        if (cuatrimestre !== undefined) { s.push('cuatrimestre = ?'); v.push(cuatrimestre); }
        if (anio !== undefined) { s.push('anio = ?'); v.push(anio); }
        if (s.length === 0) return res.status(400).json({ success: false, error: 'Sin campos' });
        v.push(req.params.id);
        await db.execute(`UPDATE estadisticos_docentes_hojas SET ${s.join(', ')} WHERE id = ?`, v);
        const [rows] = await db.execute('SELECT * FROM estadisticos_docentes_hojas WHERE id = ?', [req.params.id]);
        res.json({ success: true, data: rows[0] });
        emit('estadisticos-docentes:updated', { type: 'hoja:updated', id: parseInt(req.params.id) });
    } catch (e) { console.error(e); res.status(500).json({ success: false, error: 'Error al actualizar hoja' }); }
});

router.delete('/estadisticos-docentes-hojas/:id', requireSuperAdmin, async (req, res) => {
    try {
        await db.execute('DELETE FROM estadisticos_docentes_hojas WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'Hoja eliminada' });
        emit('estadisticos-docentes:updated', { type: 'hoja:deleted', id: parseInt(req.params.id) });
    } catch (e) { console.error(e); res.status(500).json({ success: false, error: 'Error al eliminar hoja' }); }
});

// ========== NOTAS GLOBALES ==========

router.get('/estadisticos-docentes-notas', async (req, res) => {
    try {
        let [r] = await db.execute('SELECT * FROM estadisticos_docentes_notas LIMIT 1');
        if (r.length === 0) { await db.execute('INSERT INTO estadisticos_docentes_notas (contenido) VALUES (\'\')'); [r] = await db.execute('SELECT * FROM estadisticos_docentes_notas LIMIT 1'); }
        res.json({ success: true, data: r[0] });
    } catch (e) { console.error(e); res.status(500).json({ success: false, error: 'Error al obtener notas' }); }
});

router.put('/estadisticos-docentes-notas', requireSuperAdmin, async (req, res) => {
    try {
        const { contenido } = req.body;
        let [r] = await db.execute('SELECT * FROM estadisticos_docentes_notas LIMIT 1');
        if (r.length === 0) await db.execute('INSERT INTO estadisticos_docentes_notas (contenido) VALUES (?)', [contenido || '']);
        else await db.execute('UPDATE estadisticos_docentes_notas SET contenido = ? WHERE id = ?', [contenido || '', r[0].id]);
        const [u] = await db.execute('SELECT * FROM estadisticos_docentes_notas LIMIT 1');
        res.json({ success: true, data: u[0] });
        emit('estadisticos-docentes:updated', { type: 'notas:updated' });
    } catch (e) { console.error(e); res.status(500).json({ success: false, error: 'Error al guardar notas' }); }
});

// ========== CARRERAS ==========

router.get('/estadisticos-docentes-carreras', async (req, res) => {
    try {
        const { hoja_id } = req.query;
        let q = 'SELECT * FROM estadisticos_docentes_carreras';
        const p = [];
        if (hoja_id) { q += ' WHERE hoja_id = ?'; p.push(hoja_id); }
        q += ' ORDER BY orden ASC, id ASC';
        const [r] = await db.execute(q, p);
        res.json({ success: true, data: r });
    } catch (e) { console.error(e); res.status(500).json({ success: false, error: 'Error al obtener carreras' }); }
});

router.post('/estadisticos-docentes-carreras', requireSuperAdmin, async (req, res) => {
    try {
        sanitize(req.body, { nombre: sanitizeStr });
        const { hoja_id, nombre } = req.body;
        if (!hoja_id) return res.status(400).json({ success: false, error: 'hoja_id requerido' });
        const [r] = await db.execute('INSERT INTO estadisticos_docentes_carreras (hoja_id, nombre) VALUES (?, ?)', [hoja_id, nombre || 'Nueva carrera']);

        const TIPOS = ['ultimo_grado', 'solo_utma', 'laboral', 'edad', 'investigadores'];
        const NOMBRES = ['Último grado de estudios', 'Sólo en la UTMA', 'Laboral en general', 'Edad', 'Investigadores'];
        for (let i = 0; i < TIPOS.length; i++) {
            const [s] = await db.execute('INSERT INTO estadisticos_docentes_secciones (carrera_id, nombre, tipo, orden) VALUES (?, ?, ?, ?)', [r.insertId, NOMBRES[i], TIPOS[i], i]);
            const NFS = ['Total Acumulado', 'PTC', 'Asignatura'];
            for (let j = 0; j < NFS.length; j++) {
                await db.execute('INSERT INTO estadisticos_docentes_filas (seccion_id, nombre_fila, valores, orden) VALUES (?, ?, ?, ?)', [s.insertId, NFS[j], '{}', j]);
            }
        }

        const [rows] = await db.execute('SELECT * FROM estadisticos_docentes_carreras WHERE id = ?', [r.insertId]);
        res.json({ success: true, data: rows[0] });
        emit('estadisticos-docentes:updated', { type: 'carrera:created', id: r.insertId });
    } catch (e) { console.error(e); res.status(500).json({ success: false, error: 'Error al crear carrera' }); }
});

router.put('/estadisticos-docentes-carreras/:id', requireSuperAdmin, async (req, res) => {
    try {
        sanitize(req.body, { nombre: sanitizeStr });
        const { nombre } = req.body;
        await db.execute('UPDATE estadisticos_docentes_carreras SET nombre = ? WHERE id = ?', [nombre ?? '', req.params.id]);
        const [rows] = await db.execute('SELECT * FROM estadisticos_docentes_carreras WHERE id = ?', [req.params.id]);
        res.json({ success: true, data: rows[0] });
        emit('estadisticos-docentes:updated', { type: 'carrera:updated', id: parseInt(req.params.id) });
    } catch (e) { console.error(e); res.status(500).json({ success: false, error: 'Error al actualizar carrera' }); }
});

router.delete('/estadisticos-docentes-carreras/:id', requireSuperAdmin, async (req, res) => {
    try {
        await db.execute('DELETE FROM estadisticos_docentes_carreras WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'Carrera eliminada' });
        emit('estadisticos-docentes:updated', { type: 'carrera:deleted', id: parseInt(req.params.id) });
    } catch (e) { console.error(e); res.status(500).json({ success: false, error: 'Error al eliminar carrera' }); }
});

// ========== SECCIONES ==========

router.get('/estadisticos-docentes-secciones', async (req, res) => {
    try {
        const { carrera_id } = req.query;
        let q = 'SELECT * FROM estadisticos_docentes_secciones';
        const p = [];
        if (carrera_id) { q += ' WHERE carrera_id = ?'; p.push(carrera_id); }
        q += ' ORDER BY orden ASC, id ASC';
        const [r] = await db.execute(q, p);
        res.json({ success: true, data: r });
    } catch (e) { console.error(e); res.status(500).json({ success: false, error: 'Error al obtener secciones' }); }
});

// ========== FILAS ==========

router.get('/estadisticos-docentes-filas', async (req, res) => {
    try {
        const { seccion_id } = req.query;
        let q = 'SELECT * FROM estadisticos_docentes_filas';
        const p = [];
        if (seccion_id) { q += ' WHERE seccion_id = ?'; p.push(seccion_id); }
        q += ' ORDER BY orden ASC, id ASC';
        const [r] = await db.execute(q, p);
        res.json({ success: true, data: r });
    } catch (e) { console.error(e); res.status(500).json({ success: false, error: 'Error al obtener filas' }); }
});

router.patch('/estadisticos-docentes-filas/:id/celda', async (req, res) => {
    try {
        const { id } = req.params;
        const { key, value } = req.body;
        if (!key) return res.status(400).json({ success: false, error: 'key requerido' });
        const [filas] = await db.execute('SELECT * FROM estadisticos_docentes_filas WHERE id = ?', [id]);
        if (filas.length === 0) return res.status(404).json({ success: false, error: 'Fila no encontrada' });
        const esSuperAdmin = req.user?.tipo === 'superadmin';
        if (!esSuperAdmin) {
            const [s] = await db.execute('SELECT carrera_id FROM estadisticos_docentes_secciones WHERE id = ?', [filas[0].seccion_id]);
            if (s.length === 0) return res.status(404).json({ success: false, error: 'Sección no encontrada' });
            const [asignado] = await db.execute('SELECT 1 FROM estadisticos_docentes_usuarios WHERE carrera_id = ? AND usuario_id = ? AND usuario_tipo = ? LIMIT 1', [s[0].carrera_id, req.user?.id, req.user?.tipo]);
            if (asignado.length === 0) return res.status(403).json({ success: false, error: 'No tienes acceso' });
        }
        let valores;
        try { valores = typeof filas[0].valores === 'string' ? JSON.parse(filas[0].valores) : (filas[0].valores || {}); } catch { valores = {}; }
        valores[key] = value ?? '';
        await db.execute('UPDATE estadisticos_docentes_filas SET valores = ? WHERE id = ?', [JSON.stringify(valores), id]);
        res.json({ success: true, message: 'Celda actualizada' });
        emit('estadisticos-docentes:updated', { type: 'fila:celda-updated', id: parseInt(req.params.id) });
    } catch (e) { console.error(e); res.status(500).json({ success: false, error: 'Error al actualizar celda' }); }
});

// ========== USUARIOS (POR CARRERA) ==========

router.get('/estadisticos-docentes-usuarios-disponibles', async (req, res) => {
    try {
        const [d] = await db.execute('SELECT id, nombre_completo as nombre, direccion_id FROM directivos ORDER BY nombre_completo');
        const [p] = await db.execute('SELECT id, nombre_completo as nombre, direccion_id FROM personal ORDER BY nombre_completo');
        res.json({ success: true, data: [...d.map(x => ({ ...x, tipo: 'directivo' })), ...p.map(x => ({ ...x, tipo: 'personal' }))] });
    } catch (e) { console.error(e); res.status(500).json({ success: false, error: 'Error al obtener usuarios' }); }
});

router.get('/estadisticos-docentes-carreras/:id/usuarios', async (req, res) => {
    try {
        const [r] = await db.execute(`
            SELECT edu.id as asignacion_id, edu.usuario_id, edu.usuario_tipo,
                   CASE WHEN edu.usuario_tipo = 'directivo' THEN d.nombre_completo WHEN edu.usuario_tipo = 'personal' THEN p.nombre_completo END as nombre
            FROM estadisticos_docentes_usuarios edu
            LEFT JOIN directivos d ON edu.usuario_id = d.id AND edu.usuario_tipo = 'directivo'
            LEFT JOIN personal p ON edu.usuario_id = p.id AND edu.usuario_tipo = 'personal'
            WHERE edu.carrera_id = ? ORDER BY nombre`, [req.params.id]);
        res.json({ success: true, data: r });
    } catch (e) { console.error(e); res.status(500).json({ success: false, error: 'Error al obtener usuarios' }); }
});

router.post('/estadisticos-docentes-usuarios', requireSuperAdmin, async (req, res) => {
    try {
        const { carrera_id, usuario_id, usuario_tipo } = req.body;
        if (!carrera_id || !usuario_id || !usuario_tipo) return res.status(400).json({ success: false, error: 'Faltan campos' });
        if (!TIPOS_USUARIO_VALIDOS.includes(usuario_tipo)) return res.status(400).json({ success: false, error: 'Tipo inválido' });
        await db.execute('INSERT INTO estadisticos_docentes_usuarios (carrera_id, usuario_id, usuario_tipo) VALUES (?, ?, ?)', [carrera_id, usuario_id, usuario_tipo]);
        res.status(201).json({ success: true, message: 'Usuario asignado' });
        emit('estadisticos-docentes:updated', { type: 'usuario:created' });
    } catch (e) {
        if (e.code === 'ER_DUP_ENTRY') return res.status(400).json({ success: false, error: 'El usuario ya está asignado' });
        console.error(e); res.status(500).json({ success: false, error: 'Error al asignar usuario' });
    }
});

router.delete('/estadisticos-docentes-usuarios/:id', requireSuperAdmin, async (req, res) => {
    try {
        const [r] = await db.execute('DELETE FROM estadisticos_docentes_usuarios WHERE id = ?', [req.params.id]);
        if (r.affectedRows === 0) return res.status(404).json({ success: false, error: 'Asignación no encontrada' });
        res.json({ success: true, message: 'Usuario quitado' });
        emit('estadisticos-docentes:updated', { type: 'usuario:deleted' });
    } catch (e) { console.error(e); res.status(500).json({ success: false, error: 'Error al quitar usuario' }); }
});

router.get('/estadisticos-docentes-mis-hojas', async (req, res) => {
    try {
        const { usuario_id, usuario_tipo } = req.query;
        if (!usuario_id || !usuario_tipo) return res.status(400).json({ success: false, error: 'Faltan parámetros' });
        const [r] = await db.execute(`
            SELECT DISTINCT eh.* FROM estadisticos_docentes_hojas eh
            INNER JOIN estadisticos_docentes_carreras ec ON ec.hoja_id = eh.id
            INNER JOIN estadisticos_docentes_usuarios edu ON edu.carrera_id = ec.id
            WHERE edu.usuario_id = ? AND edu.usuario_tipo = ?
            ORDER BY eh.anio DESC, eh.id DESC`, [usuario_id, usuario_tipo]);
        res.json({ success: true, data: r });
    } catch (e) { console.error(e); res.status(500).json({ success: false, error: 'Error al obtener hojas' }); }
});

module.exports = router;
