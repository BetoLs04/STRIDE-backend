const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Directorios de subida
const uploadDir = 'uploads/actividades';
const personalDir = 'uploads/personal';
const comunicadosDir = 'uploads/comunicados';
const tareasDir = 'uploads/tareas';
const smoaDir = 'uploads/smoa';
const smoaColDir = 'uploads/smoa/columnas';
const smoaEditorImgDir = 'uploads/smoa-editor';
const logoDir = 'uploads/logos';

// Asegurar directorios
[uploadDir, personalDir, comunicadosDir, tareasDir, smoaDir, smoaColDir, smoaEditorImgDir, logoDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// Actividades
const actividadesStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'actividad-' + uniqueSuffix + path.extname(file.originalname));
    }
});
const uploadActividades = multer({
    storage: actividadesStorage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Solo se permiten imágenes'), false);
        }
    },
    limits: { fileSize: 5 * 1024 * 1024, files: 5 }
});

// Personal (foto)
const personalStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, personalDir),
    filename: (req, file, cb) => {
        cb(null, 'personal-' + Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname));
    }
});
const uploadPersonal = multer({
    storage: personalStorage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Solo se permiten imágenes'), false);
        }
    },
    limits: { fileSize: 2 * 1024 * 1024 }
});

// Comunicados
const comunicadosStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, comunicadosDir),
    filename: (req, file, cb) => {
        cb(null, 'comunicado-' + Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname));
    }
});
const uploadComunicados = multer({
    storage: comunicadosStorage,
    limits: { fileSize: 10 * 1024 * 1024, files: 5 }
});

// Tareas
const tareasStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, tareasDir),
    filename: (req, file, cb) => {
        cb(null, 'tarea-' + Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname));
    }
});
const uploadTareas = multer({
    storage: tareasStorage,
    limits: { fileSize: 10 * 1024 * 1024, files: 5 }
});

// SMOA pptx
const smoaStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, smoaDir),
    filename: (req, file, cb) => {
        cb(null, 'smoa-' + Date.now() + '-' + Math.round(Math.random() * 1E9) + '.pptx');
    }
});
const uploadSmoa = multer({
    storage: smoaStorage,
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (ext === '.pptx') {
            cb(null, true);
        } else {
            cb(new Error('Solo se permiten archivos .pptx'), false);
        }
    },
    limits: { fileSize: 50 * 1024 * 1024 }
});

// SMOA column file uploads
const smoaColStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, smoaColDir),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'col-' + uniqueSuffix + path.extname(file.originalname).toLowerCase());
    }
});
const uploadSmoaCol = multer({
    storage: smoaColStorage,
    limits: { fileSize: 50 * 1024 * 1024 }
});

// SMOA editor images
const smoaEditorStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, smoaEditorImgDir),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, 'smoa-img-' + Date.now() + '-' + Math.round(Math.random() * 1E9) + ext);
    }
});
const uploadSmoaEditorImg = multer({
    storage: smoaEditorStorage,
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
        if (allowed.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error('Solo se permiten imágenes (jpg, png, gif, webp, svg)'), false);
        }
    },
    limits: { fileSize: 10 * 1024 * 1024 }
});

module.exports = {
    uploadActividades,
    uploadPersonal,
    uploadComunicados,
    uploadTareas,
    uploadSmoa,
    uploadSmoaCol,
    uploadSmoaEditorImg,
    uploadDir,
    personalDir,
    comunicadosDir,
    tareasDir,
    smoaDir,
    smoaColDir,
    smoaEditorImgDir,
    logoDir
};
