const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const db = require('../config/database');
const { verifyToken } = require('../middleware/auth');
const { smoaDir, smoaColDir, smoaEditorImgDir, personalDir, tareasDir } = require('../middleware/upload');

// Helper: prevenir path traversal
function safeFilename(filename) {
    if (!filename || typeof filename !== 'string') return null;
    const cleaned = path.basename(filename);
    if (cleaned === '.' || cleaned === '..' || cleaned.includes('\0') || !/^[a-zA-Z0-9._-]+$/.test(cleaned)) return null;
    return cleaned;
}

function safePath(baseDir, filename) {
    const safe = safeFilename(filename);
    if (!safe) return null;
    const resolved = path.join(baseDir, safe);
    if (!resolved.startsWith(path.resolve(baseDir))) return null;
    return resolved;
}

// Rutas públicas (sin auth)
router.get('/smoa-uploads/:filename', (req, res) => {
    try {
        const filePath = safePath(smoaDir, req.params.filename);
        if (!filePath || !fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'Archivo no encontrado' });
        }
        res.download(filePath, path.basename(filePath));
    } catch (error) {
        console.error('Error al servir archivo SMOA:', error);
        res.status(500).json({ error: 'Error al cargar el archivo' });
    }
});

router.get('/smoa-uploads/col/:filename', (req, res) => {
    try {
        const filePath = safePath(smoaColDir, req.params.filename);
        if (!filePath || !fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'Archivo no encontrado' });
        }
        res.download(filePath, path.basename(filePath));
    } catch (error) {
        console.error('Error al servir archivo columna SMOA:', error);
        res.status(500).json({ error: 'Error al cargar el archivo' });
    }
});

router.get('/smoa-editor-images/:filename', (req, res) => {
    try {
        const filePath = safePath(smoaEditorImgDir, req.params.filename);
        if (!filePath || !fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'Imagen no encontrada' });
        }
        res.sendFile(filePath);
    } catch (error) {
        console.error('Error al servir imagen:', error);
        res.status(500).json({ error: 'Error al cargar la imagen' });
    }
});

const DEFAULT_AVATAR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="50" fill="#e0e0e0"/>
  <circle cx="50" cy="38" r="18" fill="#b0b0b0"/>
  <path d="M22 82c0-15.5 12.5-28 28-28s28 12.5 28 28" fill="#b0b0b0"/>
</svg>`;

router.get('/personal/foto/:filename', (req, res) => {
    try {
        const filePath = safePath(personalDir, req.params.filename);
        if (filePath && fs.existsSync(filePath)) {
            return res.sendFile(filePath);
        }
        res.set('Content-Type', 'image/svg+xml');
        res.set('Cache-Control', 'public, max-age=86400');
        res.send(DEFAULT_AVATAR_SVG);
    } catch (error) {
        console.error('Error al servir foto:', error);
        res.status(500).json({ error: 'Error al cargar la foto' });
    }
});

router.get('/tareas/archivo/:filename', (req, res) => {
    try {
        const filePath = safePath(tareasDir, req.params.filename);
        if (!filePath || !fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'Archivo no encontrado' });
        }
        res.sendFile(filePath);
    } catch (error) {
        console.error('Error al servir archivo:', error);
        res.status(500).json({ error: 'Error al cargar el archivo' });
    }
});

// Rutas protegidas (require auth)
router.use(verifyToken);

router.get('/estadisticas', async (req, res) => {
    try {
        const [[{ total_usuarios }]] = await db.execute('SELECT COUNT(*) as total_usuarios FROM super_users');
        const [[{ total_direcciones }]] = await db.execute('SELECT COUNT(*) as total_direcciones FROM direcciones');
        const [[{ total_directivos }]] = await db.execute('SELECT COUNT(*) as total_directivos FROM directivos');
        const [[{ total_personal }]] = await db.execute('SELECT COUNT(*) as total_personal FROM personal');
        const [[{ total_comunicados }]] = await db.execute("SELECT COUNT(*) as total_comunicados FROM comunicados WHERE estado = 'publicado'");
        res.json({ success: true, data: { usuarios: total_usuarios, direcciones: total_direcciones, directivos: total_directivos, personal: total_personal, comunicados: total_comunicados } });
    } catch (error) {
        console.error('Error al obtener estadísticas:', error);
        res.status(500).json({ success: false, error: 'Error al obtener estadísticas' });
    }
});

router.get('/test', async (req, res) => {
    try {
        const [result] = await db.execute('SELECT 1 + 1 as test');
        res.json({ success: true, message: 'API funcionando correctamente', dbTest: result[0].test, timestamp: new Date().toISOString() });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Error de conexión a la base de datos' });
    }
});

module.exports = router;
