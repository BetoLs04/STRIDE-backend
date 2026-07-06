const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { logoDir } = require('../middleware/upload');

router.post('/upload-logo', async (req, res) => {
  try {
    console.log('📤 Subiendo logo...');
    if (!req.headers['content-type'] || !req.headers['content-type'].includes('multipart/form-data')) {
      return res.status(400).json({ success: false, error: 'Content-Type debe ser multipart/form-data' });
    }
    const busboy = require('busboy');
    const bb = busboy({ headers: req.headers });
    let fileName = '';
    let fileBuffer = Buffer.from('');
    bb.on('file', (name, file, info) => {
      console.log(`📄 Archivo recibido: ${info.filename}`);
      fileName = info.filename;
      const chunks = [];
      file.on('data', (data) => { chunks.push(data); });
      file.on('end', () => { fileBuffer = Buffer.concat(chunks); });
    });
    bb.on('close', async () => {
      if (!fileBuffer.length || !fileName) {
        return res.status(400).json({ success: false, error: 'No se recibió ningún archivo' });
      }
      if (!fs.existsSync(logoDir)) { fs.mkdirSync(logoDir, { recursive: true }); }
      const ext = path.extname(fileName);
      const newFileName = 'institution-logo' + ext;
      const filePath = path.join(logoDir, newFileName);
      const existingFiles = fs.readdirSync(logoDir);
      existingFiles.forEach(file => {
        if (file.startsWith('institution-logo')) { fs.unlinkSync(path.join(logoDir, file)); }
      });
      fs.writeFileSync(filePath, fileBuffer);
      res.json({ success: true, message: 'Logo subido exitosamente', filename: newFileName, path: filePath });
    });
    req.pipe(bb);
  } catch (error) {
    console.error('❌ Error subiendo logo:', error);
    res.status(500).json({ success: false, error: 'Error al subir el logo' });
  }
});

router.delete('/delete-logo', (req, res) => {
  try {
    if (!fs.existsSync(logoDir)) { return res.json({ success: true, message: 'No hay logo para eliminar' }); }
    const files = fs.readdirSync(logoDir);
    let deletedCount = 0;
    files.forEach(file => {
      if (file.startsWith('institution-logo')) { fs.unlinkSync(path.join(logoDir, file)); deletedCount++; }
    });
    res.json({ success: true, message: 'Logo eliminado', deletedCount: deletedCount });
  } catch (error) {
    console.error('Error eliminando logo:', error);
    res.status(500).json({ success: false, error: 'Error al eliminar logo' });
  }
});

router.get('/check-logo', (req, res) => {
  try {
    if (!fs.existsSync(logoDir)) { return res.json({ success: false, exists: false, message: 'Carpeta de logos no existe' }); }
    const files = fs.readdirSync(logoDir);
    const logoFile = files.find(file => file.startsWith('institution-logo'));
    if (!logoFile) { return res.json({ success: false, exists: false, message: 'No hay logo' }); }
    const filePath = path.join(logoDir, logoFile);
    const stats = fs.statSync(filePath);
    res.json({ success: true, exists: true, filename: logoFile, size: stats.size, path: filePath, url: `http://strideutmat.com:5000/uploads/logos/${logoFile}` });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
