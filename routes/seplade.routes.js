const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { TIPOS_USUARIO_VALIDOS } = require('../utils/constants');

// ========== HOJAS ==========

router.get('/seplade-hojas', async (req, res) => {
    try {
        const [rows] = await db.execute('SELECT * FROM seplade_hojas ORDER BY created_at DESC');
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('Error al obtener hojas SEPLADE:', error);
        res.status(500).json({ success: false, error: 'Error al obtener hojas' });
    }
});

router.post('/seplade-hojas', async (req, res) => {
    try {
        const { titulo, subtitulo, nombre } = req.body;
        const [result] = await db.execute(
            'INSERT INTO seplade_hojas (titulo, subtitulo, nombre) VALUES (?, ?, ?)',
            [titulo || '', subtitulo || '', nombre || '']
        );
        const [rows] = await db.execute('SELECT * FROM seplade_hojas WHERE id = ?', [result.insertId]);
        res.json({ success: true, data: rows[0] });
    } catch (error) {
        console.error('Error al crear hoja SEPLADE:', error);
        res.status(500).json({ success: false, error: 'Error al crear hoja' });
    }
});

router.put('/seplade-hojas/:id', async (req, res) => {
    try {
        const { titulo, subtitulo, nombre } = req.body;
        await db.execute(
            'UPDATE seplade_hojas SET titulo = ?, subtitulo = ?, nombre = ? WHERE id = ?',
            [titulo ?? '', subtitulo ?? '', nombre ?? '', req.params.id]
        );
        const [rows] = await db.execute('SELECT * FROM seplade_hojas WHERE id = ?', [req.params.id]);
        res.json({ success: true, data: rows[0] });
    } catch (error) {
        console.error('Error al actualizar hoja SEPLADE:', error);
        res.status(500).json({ success: false, error: 'Error al actualizar hoja' });
    }
});

router.delete('/seplade-hojas/:id', async (req, res) => {
    try {
        await db.execute('DELETE FROM seplade_hojas WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'Hoja eliminada' });
    } catch (error) {
        console.error('Error al eliminar hoja SEPLADE:', error);
        res.status(500).json({ success: false, error: 'Error al eliminar hoja' });
    }
});

router.get('/seplade-hojas/:id', async (req, res) => {
    try {
        const [hojaRows] = await db.execute('SELECT * FROM seplade_hojas WHERE id = ?', [req.params.id]);
        if (hojaRows.length === 0) {
            return res.status(404).json({ success: false, error: 'Hoja no encontrada' });
        }
        const [indicadores] = await db.execute(
            'SELECT * FROM seplade_indicadores WHERE hoja_id = ? ORDER BY orden ASC, id ASC',
            [req.params.id]
        );
        const indicadorIds = indicadores.map(i => i.id);
        let valores = [];
        let notas = [];
        let usuariosAsignados = [];
        if (indicadorIds.length > 0) {
            const placeholders = indicadorIds.map(() => '?').join(',');
            const [vRows] = await db.execute(
                `SELECT * FROM seplade_valores WHERE indicador_id IN (${placeholders}) ORDER BY indicador_id, mes, tipo`,
                indicadorIds
            );
            valores = vRows;
            const [nRows] = await db.execute(
                `SELECT * FROM seplade_notas WHERE indicador_id IN (${placeholders}) ORDER BY indicador_id, mes`,
                indicadorIds
            );
            notas = nRows;
            const [uRows] = await db.execute(
                `SELECT siu.*,
                        CASE WHEN siu.usuario_tipo = 'directivo' THEN d.nombre_completo
                             WHEN siu.usuario_tipo = 'personal' THEN p.nombre_completo
                        END as nombre
                 FROM seplade_indicador_usuarios siu
                 LEFT JOIN directivos d ON siu.usuario_id = d.id AND siu.usuario_tipo = 'directivo'
                 LEFT JOIN personal p ON siu.usuario_id = p.id AND siu.usuario_tipo = 'personal'
                 WHERE siu.indicador_id IN (${placeholders})
                 ORDER BY siu.indicador_id, nombre`,
                indicadorIds
            );
            usuariosAsignados = uRows;
        }
        res.json({ success: true, data: { ...hojaRows[0], indicadores, valores, notas, usuarios_asignados: usuariosAsignados } });
    } catch (error) {
        console.error('Error al obtener hoja SEPLADE:', error);
        res.status(500).json({ success: false, error: 'Error al obtener hoja' });
    }
});

// ========== INDICADORES ==========

router.post('/seplade-indicadores', async (req, res) => {
    try {
        const { hoja_id } = req.body;
        if (!hoja_id) {
            return res.status(400).json({ success: false, error: 'hoja_id es requerido' });
        }
        const [result] = await db.execute(
            'INSERT INTO seplade_indicadores (hoja_id, nombre) VALUES (?, ?)',
            [hoja_id, 'Nuevo indicador']
        );
        const values = [];
        for (let mes = 1; mes <= 12; mes++) {
            values.push([result.insertId, mes, 'programado', '']);
            values.push([result.insertId, mes, 'realizado', '']);
        }
        const placeholders = values.map(() => '(?, ?, ?, ?)').join(',');
        const flatValues = values.flat();
        await db.execute(
            `INSERT INTO seplade_valores (indicador_id, mes, tipo, valor) VALUES ${placeholders}`,
            flatValues
        );
        const [rows] = await db.execute('SELECT * FROM seplade_indicadores WHERE id = ?', [result.insertId]);
        res.json({ success: true, data: rows[0] });
    } catch (error) {
        console.error('Error al crear indicador SEPLADE:', error);
        res.status(500).json({ success: false, error: 'Error al crear indicador' });
    }
});

router.put('/seplade-indicadores/:id', async (req, res) => {
    try {
        const allowed = ['nombre', 'nivel', 'unidad_medida', 'meta_anual', 'encargado', 'evidencia_fisica', 'evidencia_online'];
        const sets = [];
        const values = [];
        for (const field of allowed) {
            if (req.body[field] !== undefined) {
                sets.push(`${field} = ?`);
                values.push(req.body[field] ?? '');
            }
        }
        if (sets.length === 0) {
            return res.status(400).json({ success: false, error: 'No hay campos para actualizar' });
        }
        values.push(req.params.id);
        await db.execute(
            `UPDATE seplade_indicadores SET ${sets.join(', ')} WHERE id = ?`,
            values
        );
        const [rows] = await db.execute('SELECT * FROM seplade_indicadores WHERE id = ?', [req.params.id]);
        res.json({ success: true, data: rows[0] });
    } catch (error) {
        console.error('Error al actualizar indicador SEPLADE:', error);
        res.status(500).json({ success: false, error: 'Error al actualizar indicador' });
    }
});

router.delete('/seplade-indicadores/:id', async (req, res) => {
    try {
        await db.execute('DELETE FROM seplade_indicadores WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'Indicador eliminado' });
    } catch (error) {
        console.error('Error al eliminar indicador SEPLADE:', error);
        res.status(500).json({ success: false, error: 'Error al eliminar indicador' });
    }
});

// ========== NOTAS ==========

router.get('/seplade-notas/:indicador_id/:mes', async (req, res) => {
    try {
        const [rows] = await db.execute(
            'SELECT * FROM seplade_notas WHERE indicador_id = ? AND mes = ?',
            [req.params.indicador_id, req.params.mes]
        );
        res.json({ success: true, data: rows[0] || { indicador_id: parseInt(req.params.indicador_id), mes: parseInt(req.params.mes), nota: '' } });
    } catch (error) {
        console.error('Error al obtener nota SEPLADE:', error);
        res.status(500).json({ success: false, error: 'Error al obtener nota' });
    }
});

router.put('/seplade-notas/:indicador_id/:mes', async (req, res) => {
    try {
        const { nota } = req.body;
        await db.execute(
            `INSERT INTO seplade_notas (indicador_id, mes, nota) VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE nota = VALUES(nota)`,
            [req.params.indicador_id, req.params.mes, nota ?? '']
        );
        res.json({ success: true, message: 'Nota guardada' });
    } catch (error) {
        console.error('Error al guardar nota SEPLADE:', error);
        res.status(500).json({ success: false, error: 'Error al guardar nota' });
    }
});

// ========== VALORES ==========

router.put('/seplade-valores/:indicador_id', async (req, res) => {
    try {
        const { mes, tipo, valor } = req.body;
        if (!mes || !tipo) {
            return res.status(400).json({ success: false, error: 'mes y tipo son requeridos' });
        }
        if (tipo === 'programado' || tipo === 'realizado') {
            if (valor !== '' && !/^\d+(\.\d+)?$/.test(valor)) {
                return res.status(400).json({ success: false, error: 'El valor debe ser numérico' });
            }
        }
        await db.execute(
            'UPDATE seplade_valores SET valor = ? WHERE indicador_id = ? AND mes = ? AND tipo = ?',
            [valor ?? '', req.params.indicador_id, mes, tipo]
        );
        res.json({ success: true, message: 'Valor actualizado' });
    } catch (error) {
        console.error('Error al actualizar valor SEPLADE:', error);
        res.status(500).json({ success: false, error: 'Error al actualizar valor' });
    }
});

// ========== ASIGNACIÓN DE USUARIOS ==========

router.get('/seplade-usuarios', async (req, res) => {
    try {
        const [directivos] = await db.execute('SELECT id, nombre_completo as nombre, direccion_id FROM directivos ORDER BY nombre_completo');
        const [personal] = await db.execute('SELECT id, nombre_completo as nombre, direccion_id FROM personal ORDER BY nombre_completo');
        const directivosConTipo = directivos.map(d => ({ ...d, tipo: 'directivo' }));
        const personalConTipo = personal.map(p => ({ ...p, tipo: 'personal' }));
        res.json({ success: true, data: [...directivosConTipo, ...personalConTipo] });
    } catch (error) {
        console.error('Error al obtener usuarios SEPLADE:', error);
        res.status(500).json({ success: false, error: 'Error al obtener usuarios' });
    }
});

router.post('/seplade-indicadores/:id/usuarios', async (req, res) => {
    try {
        const { id } = req.params;
        const { usuario_id, usuario_tipo } = req.body;
        if (!usuario_id || !usuario_tipo) {
            return res.status(400).json({ success: false, error: 'El usuario y tipo son requeridos' });
        }
        if (!TIPOS_USUARIO_VALIDOS.includes(usuario_tipo)) {
            return res.status(400).json({ success: false, error: 'Tipo de usuario inválido' });
        }
        const [existe] = await db.execute('SELECT id FROM seplade_indicadores WHERE id = ?', [id]);
        if (existe.length === 0) {
            return res.status(404).json({ success: false, error: 'Indicador no encontrado' });
        }
        await db.execute(
            'INSERT INTO seplade_indicador_usuarios (indicador_id, usuario_id, usuario_tipo) VALUES (?, ?, ?)',
            [id, usuario_id, usuario_tipo]
        );
        res.status(201).json({ success: true, message: 'Usuario asignado al indicador' });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ success: false, error: 'El usuario ya está asignado a este indicador' });
        }
        console.error('Error al asignar usuario:', error);
        res.status(500).json({ success: false, error: 'Error al asignar el usuario' });
    }
});

router.delete('/seplade-indicadores/:id/usuarios/:usuarioId/:usuarioTipo', async (req, res) => {
    try {
        const { id, usuarioId, usuarioTipo } = req.params;
        if (!TIPOS_USUARIO_VALIDOS.includes(usuarioTipo)) {
            return res.status(400).json({ success: false, error: 'Tipo de usuario inválido' });
        }
        const [result] = await db.execute(
            'DELETE FROM seplade_indicador_usuarios WHERE indicador_id = ? AND usuario_id = ? AND usuario_tipo = ?',
            [id, usuarioId, usuarioTipo]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, error: 'Asignación no encontrada' });
        }
        res.json({ success: true, message: 'Usuario quitado del indicador' });
    } catch (error) {
        console.error('Error al quitar usuario:', error);
        res.status(500).json({ success: false, error: 'Error al quitar el usuario' });
    }
});

module.exports = router;
