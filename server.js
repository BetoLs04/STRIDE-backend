const express = require('express');
const cors = require('cors');
require('dotenv').config();
const universityRoutes = require('./routes/universityRoutes');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const app = express();
const PORT = process.env.PORT || 5000;

// ✅ Recrear symlink de uploads automáticamente después de cada deploy
const uploadsDir = path.join(__dirname, 'uploads');
const persistentePath = '/home/u124063683/uploads_persistentes';

try {
    if (fs.existsSync(uploadsDir) && !fs.lstatSync(uploadsDir).isSymbolicLink()) {
        // Existe como carpeta normal (recién deployado), borrarla y crear symlink
        fs.rmSync(uploadsDir, { recursive: true });
        execSync(`ln -s ${persistentePath} ${uploadsDir}`);
        console.log('✅ Symlink de uploads recreado (carpeta normal reemplazada)');
    } else if (!fs.existsSync(uploadsDir)) {
        // No existe, crear symlink
        execSync(`ln -s ${persistentePath} ${uploadsDir}`);
        console.log('✅ Symlink de uploads creado');
    } else {
        console.log('✅ Symlink de uploads ya existe, no se toca');
    }
} catch (err) {
    console.error('❌ Error al crear symlink de uploads:', err.message);
}

// Middleware para manejar preflight OPTIONS
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', 'https://strideutmat.com');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, Origin, X-Requested-With');
    res.header('Access-Control-Allow-Credentials', 'true');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    next();
});

// CORS adicional para otras peticiones
app.use(cors({
    origin: 'https://strideutmat.com',
    credentials: true
}));

// Aumentar límite de payload para JSON
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Logs
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// Servir archivos estáticos desde la carpeta uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
    maxAge: '30d',
    etag: true,
    setHeaders: (res, filePath) => {
        res.set('Access-Control-Allow-Origin', 'https://strideutmat.com');
        res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    }
}));

// Rutas
app.use('/api/university', universityRoutes);

// Ruta de prueba
app.get('/', (req, res) => {
    res.json({ 
        message: 'API Sistema Universitario STRIDE',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        uploadsPath: path.join(__dirname, 'uploads'),
        isSymlink: fs.lstatSync(path.join(__dirname, 'uploads')).isSymbolicLink()
    });
});

// Ruta para verificar archivos estáticos
app.get('/check-uploads', (req, res) => {
    const uploadsPath = path.join(__dirname, 'uploads', 'actividades');
    
    if (!fs.existsSync(uploadsPath)) {
        return res.json({
            success: false,
            message: 'Directorio no existe',
            path: uploadsPath
        });
    }
    
    const files = fs.readdirSync(uploadsPath);
    const fileDetails = files.map(file => {
        const filePath = path.join(uploadsPath, file);
        const stats = fs.statSync(filePath);
        return {
            nombre: file,
            tamaño: stats.size,
            url: `https://api1.strideutmat.com/uploads/actividades/${file}`
        };
    });
    
    res.json({
        success: true,
        totalArchivos: files.length,
        archivos: fileDetails,
        uploadsUrl: `https://api1.strideutmat.com/uploads/actividades/`,
        isSymlink: fs.lstatSync(path.join(__dirname, 'uploads')).isSymbolicLink()
    });
});

app.listen(PORT, () => {
    console.log(`🎓 Sistema Universitario corriendo en puerto ${PORT}`);
    console.log(`📁 Servidor de archivos en: https://api1.strideutmat.com/uploads/`);
    console.log(`📂 Ruta física: ${path.join(__dirname, 'uploads')}`);
    console.log(`🔗 Es symlink: ${fs.lstatSync(path.join(__dirname, 'uploads')).isSymbolicLink()}`);
});
