const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const db = require('./config/database');
const { setIO } = require('./config/socket');
const { verifyToken } = require('./middleware/auth');

// ========== ROUTE FILES ==========
const uploadsRoutes = require('./routes/uploads.routes');
const authRoutes = require('./routes/auth.routes');
const direccionesRoutes = require('./routes/direcciones.routes');
const directivosRoutes = require('./routes/directivos.routes');
const personalRoutes = require('./routes/personal.routes');
const actividadesRoutes = require('./routes/actividades.routes');
const comunicadosRoutes = require('./routes/comunicados.routes');
const tareasRoutes = require('./routes/tareas.routes');
const logosRoutes = require('./routes/logos.routes');
const matrizRoutes = require('./routes/matriz.routes');
const smoaRoutes = require('./routes/smoa.routes');
const sepladeRoutes = require('./routes/seplade.routes');
const poaRoutes = require('./routes/poa.routes');
const estadisticosGeneroRoutes = require('./routes/estadisticos_genero.routes');

// ========== MIGRATIONS ==========
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
    try {
        await db.execute("ALTER TABLE smoa_columnas ADD COLUMN tipo_dato VARCHAR(20) DEFAULT 'texto' AFTER activa");
        console.log('✅ Columna tipo_dato agregada a smoa_columnas');
    } catch (_) {}
    try {
        await db.execute("ALTER TABLE smoa_columnas ADD COLUMN permiso_subida VARCHAR(20) DEFAULT 'todos' AFTER tipo_dato");
        console.log('✅ Columna permiso_subida agregada a smoa_columnas');
    } catch (_) {}
    try {
        await db.execute("ALTER TABLE smoa_encabezado ADD COLUMN imagen_ancho INT DEFAULT NULL");
        console.log('✅ Columna imagen_ancho agregada a smoa_encabezado');
    } catch (_) {}
    try {
        await db.execute("ALTER TABLE smoa_encabezado ADD COLUMN imagen_alineacion VARCHAR(20) DEFAULT 'center'");
        console.log('✅ Columna imagen_alineacion agregada a smoa_encabezado');
    } catch (_) {}
    try {
        await db.execute(`CREATE TABLE IF NOT EXISTS actividad_lectura (
            id INT AUTO_INCREMENT PRIMARY KEY,
            actividad_id INT NOT NULL,
            super_user_id INT NOT NULL,
            leido TINYINT(1) DEFAULT 0,
            fecha_lectura TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY unique_lectura (actividad_id, super_user_id),
            FOREIGN KEY (actividad_id) REFERENCES actividades(id) ON DELETE CASCADE,
            FOREIGN KEY (super_user_id) REFERENCES super_users(id) ON DELETE CASCADE
        )`);
        console.log('✅ Tabla actividad_lectura creada/verificada');
    } catch (_) {}
    try {
        await db.execute(`CREATE TABLE IF NOT EXISTS periodos_actividades (
            id INT AUTO_INCREMENT PRIMARY KEY,
            anio INT NOT NULL,
            periodo VARCHAR(30) NOT NULL,
            activo TINYINT(1) DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY unique_periodo (anio, periodo)
        )`);
        console.log('✅ Tabla periodos_actividades creada/verificada');
    } catch (_) {}
    try {
        await db.execute('ALTER TABLE actividades ADD COLUMN periodo_id INT DEFAULT NULL AFTER estado');
        console.log('✅ Columna periodo_id agregada a actividades');
    } catch (_) {}
    try {
        await db.execute('ALTER TABLE actividades ADD FOREIGN KEY (periodo_id) REFERENCES periodos_actividades(id) ON DELETE SET NULL');
        console.log('✅ FK periodo_id agregada a actividades');
    } catch (_) {}
}

const app = express();
const PORT = process.env.PORT || 5000;

// ✅ Recrear symlink de uploads automáticamente después de cada deploy
const uploadsDir = path.join(__dirname, 'uploads');
const persistentePath = '/home/u124063683/uploads_persistentes';

try {
    if (fs.existsSync(uploadsDir) && !fs.lstatSync(uploadsDir).isSymbolicLink()) {
        fs.rmSync(uploadsDir, { recursive: true });
        execSync(`ln -s ${persistentePath} ${uploadsDir}`);
        console.log('✅ Symlink de uploads recreado (carpeta normal reemplazada)');
    } else if (!fs.existsSync(uploadsDir)) {
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

app.use(cors({
    origin: 'https://strideutmat.com',
    credentials: true
}));

app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: false
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
    maxAge: '30d',
    etag: true,
    setHeaders: (res, filePath) => {
        res.set('Access-Control-Allow-Origin', 'https://strideutmat.com');
        res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    }
}));

// ========== MOUNT ROUTES ==========

// Public routes (no auth needed) + mixed (uploads has internal verifyToken)
app.use('/api/university', authRoutes);
app.use('/api/university', uploadsRoutes);

// Protected routes (all require authentication)
app.use('/api/university', verifyToken);
app.use('/api/university', direccionesRoutes);
app.use('/api/university', directivosRoutes);
app.use('/api/university', personalRoutes);
app.use('/api/university', actividadesRoutes);
app.use('/api/university', comunicadosRoutes);
app.use('/api/university', tareasRoutes);
app.use('/api/university', logosRoutes);
app.use('/api/university', matrizRoutes);
app.use('/api/university', smoaRoutes);
app.use('/api/university', sepladeRoutes);
app.use('/api/university', poaRoutes);
app.use('/api/university', estadisticosGeneroRoutes);

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
