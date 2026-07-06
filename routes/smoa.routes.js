const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const db = require('../config/database');
const { uploadSmoa, uploadSmoaCol, uploadSmoaEditorImg, smoaEditorImgDir } = require('../middleware/upload');
const { API_BASE_URL, TIPOS_USUARIO_VALIDOS, TIPOS_DATO_SMOA, PERMISOS_SUBIDA_SMOA } = require('../utils/constants');

// ========== ENCABEZADO ==========

router.get('/smoa-encabezado', async (req, res) => {
    try {
        let [rows] = await db.execute('SELECT * FROM smoa_encabezado LIMIT 1');
        if (rows.length === 0) {
            const [result] = await db.execute('INSERT INTO smoa_encabezado (contenido) VALUES (\'\')');
            const [newRows] = await db.execute('SELECT * FROM smoa_encabezado WHERE id = ?', [result.insertId]);
            rows = newRows;
        }
        res.json({ success: true, data: rows[0] });
    } catch (error) {
        console.error('Error al obtener encabezado SMOA:', error);
        res.status(500).json({ success: false, error: 'Error al obtener encabezado SMOA' });
    }
});

router.put('/smoa-encabezado', async (req, res) => {
    try {
        const { contenido, imagen, imagen_ancho, imagen_alineacion } = req.body;
        let [rows] = await db.execute('SELECT * FROM smoa_encabezado LIMIT 1');
        const oldImagen = rows[0]?.imagen;
        const finalImagen = imagen === undefined ? oldImagen : (imagen || null);
        const finalAncho = imagen_ancho !== undefined ? (imagen_ancho || null) : (rows[0]?.imagen_ancho || null);
        const finalAlineacion = imagen_alineacion !== undefined ? (imagen_alineacion || 'center') : (rows[0]?.imagen_alineacion || 'center');
        if (rows.length === 0) {
            await db.execute('INSERT INTO smoa_encabezado (contenido, imagen, imagen_ancho, imagen_alineacion) VALUES (?, ?, ?, ?)', [contenido || '', finalImagen, finalAncho, finalAlineacion]);
        } else {
            await db.execute('UPDATE smoa_encabezado SET contenido = ?, imagen = ?, imagen_ancho = ?, imagen_alineacion = ? WHERE id = ?', [contenido || '', finalImagen, finalAncho, finalAlineacion, rows[0].id]);
        }
        if (oldImagen && oldImagen !== finalImagen) {
            const oldPath = path.join(smoaEditorImgDir, oldImagen);
            if (fs.existsSync(oldPath)) { fs.unlinkSync(oldPath); }
        }
        const [updated] = await db.execute('SELECT * FROM smoa_encabezado LIMIT 1');
        res.json({ success: true, data: updated[0], message: 'Encabezado SMOA guardado' });
    } catch (error) {
        console.error('Error al guardar encabezado SMOA:', error);
        res.status(500).json({ success: false, error: 'Error al guardar encabezado SMOA' });
    }
});

// ========== USUARIOS ==========

router.get('/smoa-usuarios-disponibles', async (req, res) => {
    try {
        const [directivos] = await db.execute('SELECT id, nombre_completo as nombre, direccion_id FROM directivos ORDER BY nombre_completo');
        const [personal] = await db.execute('SELECT id, nombre_completo as nombre, direccion_id FROM personal ORDER BY nombre_completo');
        const directivosConTipo = directivos.map(d => ({ ...d, tipo: 'directivo' }));
        const personalConTipo = personal.map(p => ({ ...p, tipo: 'personal' }));
        res.json({ success: true, data: [...directivosConTipo, ...personalConTipo] });
    } catch (error) {
        console.error('Error al obtener usuarios SMOA:', error);
        res.status(500).json({ success: false, error: 'Error al obtener usuarios' });
    }
});

router.get('/smoa-usuarios', async (req, res) => {
    try {
        const [usuarios] = await db.execute(`
            SELECT su.id as asignacion_id, su.usuario_id, su.usuario_tipo,
                   CASE WHEN su.usuario_tipo = 'directivo' THEN d.nombre_completo
                        WHEN su.usuario_tipo = 'personal' THEN p.nombre_completo
                   END as nombre
            FROM smoa_usuarios su
            LEFT JOIN directivos d ON su.usuario_id = d.id AND su.usuario_tipo = 'directivo'
            LEFT JOIN personal p ON su.usuario_id = p.id AND su.usuario_tipo = 'personal'
            ORDER BY nombre
        `);
        res.json({ success: true, data: usuarios });
    } catch (error) {
        console.error('Error al obtener usuarios asignados SMOA:', error);
        res.status(500).json({ success: false, error: 'Error al obtener usuarios asignados' });
    }
});

router.post('/smoa-usuarios', async (req, res) => {
    try {
        const { usuario_id, usuario_tipo } = req.body;
        if (!usuario_id || !usuario_tipo) {
            return res.status(400).json({ success: false, error: 'El usuario y tipo son requeridos' });
        }
        if (!TIPOS_USUARIO_VALIDOS.includes(usuario_tipo)) {
            return res.status(400).json({ success: false, error: 'Tipo de usuario inválido' });
        }
        await db.execute(
            'INSERT INTO smoa_usuarios (usuario_id, usuario_tipo) VALUES (?, ?)',
            [usuario_id, usuario_tipo]
        );
        res.status(201).json({ success: true, message: 'Usuario asignado a SMOA' });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ success: false, error: 'El usuario ya está asignado' });
        }
        console.error('Error al asignar usuario SMOA:', error);
        res.status(500).json({ success: false, error: 'Error al asignar el usuario' });
    }
});

router.delete('/smoa-usuarios/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const [result] = await db.execute('DELETE FROM smoa_usuarios WHERE id = ?', [id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, error: 'Asignación no encontrada' });
        }
        res.json({ success: true, message: 'Usuario quitado de SMOA' });
    } catch (error) {
        console.error('Error al quitar usuario SMOA:', error);
        res.status(500).json({ success: false, error: 'Error al quitar el usuario' });
    }
});

// ========== COLUMNAS ==========

router.get('/smoa-columnas', async (req, res) => {
    try {
        const [columnas] = await db.execute('SELECT * FROM smoa_columnas ORDER BY orden ASC, id ASC');
        res.json({ success: true, data: columnas });
    } catch (error) {
        console.error('Error al obtener columnas SMOA:', error);
        res.status(500).json({ success: false, error: 'Error al obtener columnas' });
    }
});

router.post('/smoa-columnas', async (req, res) => {
    try {
        const { nombre, tipo_dato, permiso_subida } = req.body;
        if (!nombre || !nombre.trim()) {
            return res.status(400).json({ success: false, error: 'El nombre es requerido' });
        }
        const tipo = TIPOS_DATO_SMOA.includes(tipo_dato) ? tipo_dato : 'texto';
        const permiso = PERMISOS_SUBIDA_SMOA.includes(permiso_subida) ? permiso_subida : 'todos';
        const [result] = await db.execute('INSERT INTO smoa_columnas (nombre, tipo_dato, permiso_subida) VALUES (?, ?, ?)', [nombre.trim(), tipo, permiso]);
        res.status(201).json({ success: true, message: 'Columna SMOA creada', columnaId: result.insertId });
    } catch (error) {
        console.error('Error al crear columna SMOA:', error);
        res.status(500).json({ success: false, error: 'Error al crear la columna' });
    }
});

router.put('/smoa-columnas/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre, tipo_dato, permiso_subida } = req.body;
        if (!nombre || !nombre.trim()) {
            return res.status(400).json({ success: false, error: 'El nombre es requerido' });
        }
        const tipo = TIPOS_DATO_SMOA.includes(tipo_dato) ? tipo_dato : 'texto';
        const permiso = PERMISOS_SUBIDA_SMOA.includes(permiso_subida) ? permiso_subida : 'todos';
        const [result] = await db.execute('UPDATE smoa_columnas SET nombre = ?, tipo_dato = ?, permiso_subida = ? WHERE id = ?', [nombre.trim(), tipo, permiso, id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, error: 'Columna no encontrada' });
        }
        const [updated] = await db.execute('SELECT * FROM smoa_columnas WHERE id = ?', [id]);
        res.json({ success: true, data: updated[0], message: 'Columna SMOA actualizada' });
    } catch (error) {
        console.error('Error al actualizar columna SMOA:', error);
        res.status(500).json({ success: false, error: 'Error al actualizar la columna' });
    }
});

router.delete('/smoa-columnas/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const [result] = await db.execute('DELETE FROM smoa_columnas WHERE id = ?', [id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, error: 'Columna no encontrada' });
        }
        res.json({ success: true, message: 'Columna SMOA eliminada' });
    } catch (error) {
        console.error('Error al eliminar columna SMOA:', error);
        res.status(500).json({ success: false, error: 'Error al eliminar la columna' });
    }
});

// ========== FILAS ==========

router.get('/smoa-filas', async (req, res) => {
    try {
        const [filas] = await db.execute('SELECT * FROM smoa_filas ORDER BY orden ASC, id ASC');
        res.json({ success: true, data: filas });
    } catch (error) {
        console.error('Error al obtener filas SMOA:', error);
        res.status(500).json({ success: false, error: 'Error al obtener filas' });
    }
});

router.post('/smoa-filas', async (req, res) => {
    try {
        const { valores } = req.body;
        const [result] = await db.execute(
            'INSERT INTO smoa_filas (valores) VALUES (?)',
            [JSON.stringify(valores || {})]
        );
        const [nueva] = await db.execute('SELECT * FROM smoa_filas WHERE id = ?', [result.insertId]);
        res.status(201).json({ success: true, data: nueva[0], message: 'Fila SMOA agregada' });
    } catch (error) {
        console.error('Error al crear fila SMOA:', error);
        res.status(500).json({ success: false, error: 'Error al crear la fila' });
    }
});

router.put('/smoa-filas/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { valores } = req.body;
        const [result] = await db.execute(
            'UPDATE smoa_filas SET valores = ? WHERE id = ?',
            [JSON.stringify(valores || {}), id]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, error: 'Fila no encontrada' });
        }
        const [updated] = await db.execute('SELECT * FROM smoa_filas WHERE id = ?', [id]);
        res.json({ success: true, data: updated[0], message: 'Fila SMOA actualizada' });
    } catch (error) {
        console.error('Error al actualizar fila SMOA:', error);
        res.status(500).json({ success: false, error: 'Error al actualizar la fila' });
    }
});

router.delete('/smoa-filas/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const [result] = await db.execute('DELETE FROM smoa_filas WHERE id = ?', [id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, error: 'Fila no encontrada' });
        }
        res.json({ success: true, message: 'Fila SMOA eliminada' });
    } catch (error) {
        console.error('Error al eliminar fila SMOA:', error);
        res.status(500).json({ success: false, error: 'Error al eliminar la fila' });
    }
});

// ========== PPTX POR FILA ==========

router.put('/smoa-filas/:id/pptx', (req, res, next) => {
    const contentType = req.headers['content-type'] || '';
    if (contentType.includes('multipart/form-data')) {
        uploadSmoa.single('pptx')(req, res, (err) => {
            if (err) {
                if (err.code === 'LIMIT_FILE_SIZE') {
                    return res.status(400).json({ success: false, error: 'El archivo no puede superar los 50MB' });
                }
                return res.status(400).json({ success: false, error: err.message || 'Error al subir el archivo' });
            }
            next();
        });
    } else {
        next();
    }
}, async (req, res) => {
    try {
        const { id } = req.params;
        const [filas] = await db.execute('SELECT * FROM smoa_filas WHERE id = ?', [id]);
        if (filas.length === 0) {
            return res.status(404).json({ success: false, error: 'Fila no encontrada' });
        }
        const fila = filas[0];
        let valores;
        try {
            valores = typeof fila.valores === 'string' ? JSON.parse(fila.valores) : (fila.valores || {});
        } catch {
            valores = {};
        }
        if (req.file) {
            valores.pres_archivo = req.file.filename;
        } else if (req.body && (req.body.eliminar === true || req.body.eliminar === 'true')) {
            delete valores.pres_archivo;
        } else {
            return res.status(400).json({ success: false, error: 'Envíe un archivo .pptx o { eliminar: true }' });
        }
        await db.execute('UPDATE smoa_filas SET valores = ? WHERE id = ?', [JSON.stringify(valores), id]);
        const [updated] = await db.execute('SELECT * FROM smoa_filas WHERE id = ?', [id]);
        res.json({ success: true, data: updated[0], message: 'Presentación actualizada' });
    } catch (error) {
        console.error('Error al actualizar presentación SMOA:', error);
        res.status(500).json({ success: false, error: 'Error al actualizar presentación' });
    }
});

// ========== SUBIDA DE ARCHIVOS A COLUMNAS ==========

router.post('/smoa-filas/:filaId/columna/:columnaId/subir', uploadSmoaCol.single('archivo'), async (req, res) => {
    try {
        const { filaId, columnaId } = req.params;
        const usuarioId = req.body.usuario_id;
        const usuarioTipo = req.body.usuario_tipo;
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No se recibió ningún archivo' });
        }
        const [filas] = await db.execute('SELECT * FROM smoa_filas WHERE id = ?', [filaId]);
        if (filas.length === 0) {
            return res.status(404).json({ success: false, error: 'Fila no encontrada' });
        }
        const fila = filas[0];
        let valores;
        try {
            valores = typeof fila.valores === 'string' ? JSON.parse(fila.valores) : (fila.valores || {});
        } catch {
            valores = {};
        }
        const key = `d_${columnaId}`;
        valores[key] = req.file.filename;
        valores[`${key}_uploaded_by`] = `${usuarioId}_${usuarioTipo}`;
        await db.execute('UPDATE smoa_filas SET valores = ? WHERE id = ?', [JSON.stringify(valores), filaId]);
        const [updated] = await db.execute('SELECT * FROM smoa_filas WHERE id = ?', [filaId]);
        res.json({ success: true, data: updated[0], filename: req.file.filename, message: 'Archivo subido exitosamente' });
    } catch (error) {
        console.error('Error al subir archivo a columna:', error);
        res.status(500).json({ success: false, error: error.message || 'Error al subir archivo' });
    }
});

router.delete('/smoa-filas/:filaId/columna/:columnaId/eliminar', async (req, res) => {
    try {
        const { filaId, columnaId } = req.params;
        const [filas] = await db.execute('SELECT * FROM smoa_filas WHERE id = ?', [filaId]);
        if (filas.length === 0) {
            return res.status(404).json({ success: false, error: 'Fila no encontrada' });
        }
        const fila = filas[0];
        let valores;
        try {
            valores = typeof fila.valores === 'string' ? JSON.parse(fila.valores) : (fila.valores || {});
        } catch {
            valores = {};
        }
        const key = `d_${columnaId}`;
        delete valores[key];
        delete valores[`${key}_uploaded_by`];
        await db.execute('UPDATE smoa_filas SET valores = ? WHERE id = ?', [JSON.stringify(valores), filaId]);
        const [updated] = await db.execute('SELECT * FROM smoa_filas WHERE id = ?', [filaId]);
        res.json({ success: true, data: updated[0], message: 'Archivo eliminado' });
    } catch (error) {
        console.error('Error al eliminar archivo de columna:', error);
        res.status(500).json({ success: false, error: error.message || 'Error al eliminar archivo' });
    }
});

router.post('/smoa-upload', uploadSmoa.single('archivo'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No se recibió ningún archivo' });
        }
        res.json({ success: true, filename: req.file.filename, message: 'Archivo subido exitosamente' });
    } catch (error) {
        console.error('Error al subir archivo SMOA:', error);
        res.status(500).json({ success: false, error: error.message || 'Error al subir el archivo' });
    }
});

// ========== PERMISOS DE PRESENTACIONES SMOA ==========

router.get('/smoa-permisos-pptx', async (req, res) => {
    try {
        const [permisos] = await db.execute('SELECT * FROM smoa_permisos_pptx');
        const agrupados = {};
        for (const p of permisos) {
            if (!agrupados[p.fila_id]) agrupados[p.fila_id] = [];
            agrupados[p.fila_id].push(p);
        }
        res.json({ success: true, data: agrupados });
    } catch (error) {
        console.error('Error al obtener permisos pptx:', error);
        res.status(500).json({ success: false, error: 'Error al obtener permisos' });
    }
});

router.get('/smoa-filas/:id/permisos-pptx', async (req, res) => {
    try {
        const { id } = req.params;
        const [permisos] = await db.execute(
            'SELECT sp.*, CASE WHEN sp.usuario_tipo = \'directivo\' THEN d.nombre_completo WHEN sp.usuario_tipo = \'personal\' THEN p.nombre_completo END as nombre FROM smoa_permisos_pptx sp LEFT JOIN directivos d ON sp.usuario_id = d.id AND sp.usuario_tipo = \'directivo\' LEFT JOIN personal p ON sp.usuario_id = p.id AND sp.usuario_tipo = \'personal\' WHERE sp.fila_id = ? ORDER BY nombre',
            [id]
        );
        res.json({ success: true, data: permisos });
    } catch (error) {
        console.error('Error al obtener permisos pptx de fila:', error);
        res.status(500).json({ success: false, error: 'Error al obtener permisos' });
    }
});

router.put('/smoa-filas/:id/permisos-pptx', async (req, res) => {
    const { id } = req.params;
    const { permisos } = req.body;
    try {
        await db.execute('DELETE FROM smoa_permisos_pptx WHERE fila_id = ?', [id]);
        if (permisos && Array.isArray(permisos) && permisos.length > 0) {
            for (const p of permisos) {
                await db.execute(
                    'INSERT INTO smoa_permisos_pptx (fila_id, usuario_id, usuario_tipo, puede_subir, puede_cambiar, puede_eliminar) VALUES (?, ?, ?, ?, ?, ?)',
                    [id, p.usuario_id, p.usuario_tipo, p.puede_subir ? 1 : 0, p.puede_cambiar ? 1 : 0, p.puede_eliminar ? 1 : 0]
                );
            }
        }
        res.json({ success: true, message: 'Permisos actualizados' });
    } catch (error) {
        console.error('Error al actualizar permisos pptx:', error);
        res.status(500).json({ success: false, error: 'Error al actualizar permisos' });
    }
});

// ========== SUBIDA DE IMÁGENES PARA EL EDITOR SMOA ==========

router.post('/smoa-upload-image', uploadSmoaEditorImg.single('imagen'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No se recibió ninguna imagen' });
        }
        const url = `${API_BASE_URL}/api/university/smoa-editor-images/${req.file.filename}`;
        res.json({ success: true, url, filename: req.file.filename });
    } catch (error) {
        console.error('Error al subir imagen:', error);
        res.status(500).json({ success: false, error: error.message || 'Error al subir imagen' });
    }
});

module.exports = router;
