const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
require('dotenv').config();
const universityRoutes = require('./routes/universityRoutes');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const db = require('./config/database');
const { setIO } = require('./config/socket');

async function runMigrations() {
    try {
        await db.execute('ALTER TABLE matriz_columnas ADD COLUMN bloqueada TINYINT(1) DEFAULT 0 AFTER activa');
        console.log('✅ Columna bloqueada agregada a matriz_columnas');
    } catch (_) {}
    try {
        await db.execute('ALTER TABLE matriz_encabezado ADD COLUMN bloqueo_1er_cuatrimestre TINYINT(1) DEFAULT 0');
        console.log('✅ Columna bloqueo_1er_cuatrimestre agregada a matriz_encabezado');
    } catch (_) {}
    try {
        await db.execute('ALTER TABLE matriz_encabezado ADD COLUMN bloqueo_2do_cuatrimestre TINYINT(1) DEFAULT 0');
        console.log('✅ Columna bloqueo_2do_cuatrimestre agregada a matriz_encabezado');
    } catch (_) {}
    try {
        await db.execute('ALTER TABLE matriz_encabezado ADD COLUMN bloqueo_3er_cuatrimestre TINYINT(1) DEFAULT 0');
        console.log('✅ Columna bloqueo_3er_cuatrimestre agregada a matriz_encabezado');
    } catch (_) {}
    try {
        await db.execute('ALTER TABLE matriz_encabezado ADD COLUMN bloqueo_anual TINYINT(1) DEFAULT 0');
        console.log('✅ Columna bloqueo_anual agregada a matriz_encabezado');
    } catch (_) {}
    try {
        await db.execute('ALTER TABLE matriz_encabezado ADD COLUMN bloqueo_filas TINYINT(1) DEFAULT 0');
        console.log('✅ Columna bloqueo_filas agregada a matriz_encabezado');
    } catch (_) {}
}

const app = express();
//Puerto
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
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: 'https://strideutmat.com',
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        credentials: true
    }
});
setIO(io);

io.on('connection', (socket) => {
    console.log('⚡ Cliente conectado:', socket.id);
    socket.on('disconnect', () => {
        console.log('⚡ Cliente desconectado:', socket.id);
    });
});

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

runMigrations().then(() => {
    server.listen(PORT, () => {
    console.log(`🎓 Sistema Universitario corriendo en puerto ${PORT}`);
    console.log(`📁 Servidor de archivos en: https://api1.strideutmat.com/uploads/`);
    console.log(`📂 Ruta física: ${path.join(__dirname, 'uploads')}`);
    console.log(`🔗 Es symlink: ${fs.lstatSync(path.join(__dirname, 'uploads')).isSymbolicLink()}`);
    });
});
