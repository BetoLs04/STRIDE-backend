const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const db = require('../config/database');
const { verifyToken } = require('../middleware/auth');
const { smoaDir, smoaColDir, smoaEditorImgDir } = require('../middleware/upload');

// Rutas públicas (sin auth)
router.get('/smoa-uploads/:filename', (req, res) => {
    try {
        const { filename } = req.params;
        const filePath = path.join(smoaDir, filename);
        if (fs.existsSync(filePath)) {
            res.download(filePath, filename);
        } else {
            res.status(404).json({ error: 'Archivo no encontrado' });
        }
    } catch (error) {
        console.error('Error al servir archivo SMOA:', error);
        res.status(500).json({ error: 'Error al cargar el archivo' });
    }
});

router.get('/smoa-uploads/col/:filename', (req, res) => {
    try {
        const { filename } = req.params;
        const filePath = path.join(smoaColDir, filename);
        if (fs.existsSync(filePath)) {
            res.download(filePath, filename);
        } else {
            res.status(404).json({ error: 'Archivo no encontrado' });
        }
    } catch (error) {
        console.error('Error al servir archivo columna SMOA:', error);
        res.status(500).json({ error: 'Error al cargar el archivo' });
    }
});

router.get('/smoa-editor-images/:filename', (req, res) => {
    try {
        const { filename } = req.params;
        const filePath = path.resolve(smoaEditorImgDir, filename);
        if (fs.existsSync(filePath)) {
            res.sendFile(filePath);
        } else {
            res.status(404).json({ error: 'Imagen no encontrada' });
        }
    } catch (error) {
        console.error('Error al servir imagen:', error);
        res.status(500).json({ error: 'Error al cargar la imagen' });
    }
});

router.get('/personal/foto/:filename', (req, res) => {
    try {
        const { filename } = req.params;
        const filePath = path.join('uploads/personal', filename);
        if (fs.existsSync(filePath)) {
            res.sendFile(path.resolve(filePath));
        } else {
            const defaultAvatar = path.join(__dirname, '../public/default-avatar.png');
            if (fs.existsSync(defaultAvatar)) {
                res.sendFile(defaultAvatar);
            } else {
                res.status(404).json({ error: 'Foto no encontrada' });
            }
        }
    } catch (error) {
        console.error('Error al servir foto:', error);
        res.status(500).json({ error: 'Error al cargar la foto' });
    }
});

router.get('/personal/debug-fotos', async (req, res) => {
    try {
        const dir = 'uploads/personal';
        if (!fs.existsSync(dir)) {
            return res.json({ success: false, message: 'Directorio uploads/personal no existe' });
        }
        const files = fs.readdirSync(dir);
        res.json({ success: true, archivos: files, ruta: path.resolve(dir) });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/debug/uploads', (req, res) => {
    const uploadsPath = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadsPath)) {
        return res.json({ exists: false, path: uploadsPath });
    }
    const items = fs.readdirSync(uploadsPath).map(item => {
        const itemPath = path.join(uploadsPath, item);
        const stat = fs.statSync(itemPath);
        return { nombre: item, esDirectorio: stat.isDirectory(), tamaño: stat.size };
    });
    res.json({ exists: true, path: path.resolve(uploadsPath), contenido: items });
});

router.get('/tareas/archivo/:filename', (req, res) => {
    try {
        const { filename } = req.params;
        const filePath = path.join('uploads/tareas', filename);
        if (fs.existsSync(filePath)) { res.sendFile(path.resolve(filePath)); }
        else { res.status(404).json({ error: 'Archivo no encontrado' }); }
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
