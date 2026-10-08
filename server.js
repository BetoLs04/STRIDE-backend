const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();

// Debug: verificar si las variables de entorno del panel llegan
console.log('=== DEBUG ENV ===');
console.log('DB_HOST:', process.env.DB_HOST || '❌ NO DEFINIDO');
console.log('DB_USER:', process.env.DB_USER || '❌ NO DEFINIDO');
console.log('DB_NAME:', process.env.DB_NAME || '❌ NO DEFINIDO');
console.log('DB_PORT:', process.env.DB_PORT || '❌ NO DEFINIDO');
console.log('PORT:', process.env.PORT || '❌ NO DEFINIDO');
console.log('JWT_SECRET:', process.env.JWT_SECRET ? '✅ DEFINIDO' : '❌ NO DEFINIDO');
console.log('=================');

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
const estadisticosDocentesRoutes = require('./routes/estadisticos_docentes.routes');

// ========== ENSURE UPLOAD DIRECTORIES ==========
const uploadsBase = path.join(__dirname, 'uploads');
const uploadDirs = [
    uploadsBase,
    path.join(uploadsBase, 'actividades'),
    path.join(uploadsBase, 'tareas'),
    path.join(uploadsBase, 'personal'),
    path.join(uploadsBase, 'logos'),
    path.join(uploadsBase, 'comunicados'),
    path.join(uploadsBase, 'smoa'),
    path.join(uploadsBase, 'smoa', 'columnas'),
    path.join(uploadsBase, 'smoa-editor')
];
uploadDirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`📁 Directorio creado: ${dir}`);
    }
});

// ========== MIGRATIONS ==========
function warnMigration(err) {
    const ignorables = ['ER_DUP_FIELDNAME', 'ER_DUP_KEYNAME', 'ER_TABLE_EXISTS_ERROR'];
    if (err && ignorables.includes(err.code)) return;
    console.warn('⚠️ Migración no aplicada:', err && err.message ? err.message : err);
}

async function runMigrations() {
    try {
        await db.execute('ALTER TABLE matriz_columnas ADD COLUMN bloqueada TINYINT(1) DEFAULT 0 AFTER activa');
        console.log('✅ Columna bloqueada agregada a matriz_columnas');
    } catch (e) { warnMigration(e); }
    try {
        await db.execute('ALTER TABLE matriz_encabezado ADD COLUMN bloqueo_1er_cuatrimestre TINYINT(1) DEFAULT 0');
        console.log('✅ Columna bloqueo_1er_cuatrimestre agregada a matriz_encabezado');
    } catch (e) { warnMigration(e); }
    try {
        await db.execute('ALTER TABLE matriz_encabezado ADD COLUMN bloqueo_2do_cuatrimestre TINYINT(1) DEFAULT 0');
        console.log('✅ Columna bloqueo_2do_cuatrimestre agregada a matriz_encabezado');
    } catch (e) { warnMigration(e); }
    try {
        await db.execute('ALTER TABLE matriz_encabezado ADD COLUMN bloqueo_3er_cuatrimestre TINYINT(1) DEFAULT 0');
        console.log('✅ Columna bloqueo_3er_cuatrimestre agregada a matriz_encabezado');
    } catch (e) { warnMigration(e); }
    try {
        await db.execute('ALTER TABLE matriz_encabezado ADD COLUMN bloqueo_anual TINYINT(1) DEFAULT 0');
        console.log('✅ Columna bloqueo_anual agregada a matriz_encabezado');
    } catch (e) { warnMigration(e); }
    try {
        await db.execute('ALTER TABLE matriz_encabezado ADD COLUMN bloqueo_filas TINYINT(1) DEFAULT 0');
        console.log('✅ Columna bloqueo_filas agregada a matriz_encabezado');
    } catch (e) { warnMigration(e); }
    try {
        await db.execute("ALTER TABLE smoa_columnas ADD COLUMN tipo_dato VARCHAR(20) DEFAULT 'texto' AFTER activa");
        console.log('✅ Columna tipo_dato agregada a smoa_columnas');
    } catch (e) { warnMigration(e); }
    try {
        await db.execute("ALTER TABLE smoa_columnas ADD COLUMN permiso_subida VARCHAR(20) DEFAULT 'todos' AFTER tipo_dato");
        console.log('✅ Columna permiso_subida agregada a smoa_columnas');
    } catch (e) { warnMigration(e); }
    try {
        await db.execute("ALTER TABLE smoa_encabezado ADD COLUMN imagen_ancho INT DEFAULT NULL");
        console.log('✅ Columna imagen_ancho agregada a smoa_encabezado');
    } catch (e) { warnMigration(e); }
    try {
        await db.execute("ALTER TABLE smoa_encabezado ADD COLUMN imagen_alineacion VARCHAR(20) DEFAULT 'center'");
        console.log('✅ Columna imagen_alineacion agregada a smoa_encabezado');
    } catch (e) { warnMigration(e); }
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
    } catch (e) { warnMigration(e); }
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
    } catch (e) { warnMigration(e); }
    try {
        await db.execute('ALTER TABLE actividades ADD COLUMN periodo_id INT DEFAULT NULL AFTER estado');
        console.log('✅ Columna periodo_id agregada a actividades');
    } catch (e) { warnMigration(e); }
    try {
        await db.execute('ALTER TABLE actividades ADD FOREIGN KEY (periodo_id) REFERENCES periodos_actividades(id) ON DELETE SET NULL');
        console.log('✅ FK periodo_id agregada a actividades');
    } catch (e) { warnMigration(e); }
    try {
        await db.execute(`CREATE TABLE IF NOT EXISTS estadisticos_genero_fila_usuarios (
            id INT AUTO_INCREMENT PRIMARY KEY,
            fila_id INT NOT NULL,
            usuario_id INT NOT NULL,
            usuario_tipo ENUM('directivo', 'personal') NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uk_fila_usuario (fila_id, usuario_id, usuario_tipo),
            FOREIGN KEY (fila_id) REFERENCES estadisticos_genero_filas(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
        console.log('✅ Tabla estadisticos_genero_fila_usuarios creada/verificada');
    } catch (e) { warnMigration(e); }
}

const app = express();
const PORT = process.env.PORT || 5000;
app.set('trust proxy', 1);

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

// Orígenes permitidos (CORS)
const ALLOWED_ORIGINS = [
    'https://strideutmat.com',
    'https://www.strideutmat.com',
    'http://localhost:3000',
    'http://localhost:5000'
];

// Orígenes extra opcionales vía variable de entorno (separados por coma)
if (process.env.ALLOWED_ORIGINS) {
    process.env.ALLOWED_ORIGINS.split(',').forEach((o) => {
        const origin = o.trim();
        if (origin && !ALLOWED_ORIGINS.includes(origin)) {
            ALLOWED_ORIGINS.push(origin);
        }
    });
}

const isAllowedOrigin = (origin) => !origin || ALLOWED_ORIGINS.includes(origin);

// Middleware para manejar preflight OPTIONS
app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (isAllowedOrigin(origin)) {
        res.header('Access-Control-Allow-Origin', origin || ALLOWED_ORIGINS[0]);
        res.header('Vary', 'Origin');
    }
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, Origin, X-Requested-With');
    res.header('Access-Control-Allow-Credentials', 'true');
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    next();
});

app.use(cors({
    origin: (origin, callback) => callback(null, isAllowedOrigin(origin)),
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
        res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    }
}));

// ========== MOUNT ROUTES ==========
// Health público: diagnóstico sin token (soporte/monitoreo)
app.get('/api/university/health', (req, res) => {
    res.json({
        success: true,
        status: 'ok',
        service: 'stride-api',
        time: new Date().toISOString(),
        uptime_seconds: Math.round(process.uptime())
    });
});

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
app.use('/api/university', estadisticosDocentesRoutes);

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: ALLOWED_ORIGINS,
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
    const uploadsPath = path.join(__dirname, 'uploads');
    const uploadsExists = fs.existsSync(uploadsPath);
    const isSymlink = uploadsExists ? fs.lstatSync(uploadsPath).isSymbolicLink() : false;
    res.json({ 
        message: 'API Sistema Universitario STRIDE',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        uploadsPath,
        uploadsExists,
        isSymlink
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
    const uploadsPathRoot = path.join(__dirname, 'uploads');
    const isSymlink = fs.existsSync(uploadsPathRoot) ? fs.lstatSync(uploadsPathRoot).isSymbolicLink() : false;
    res.json({
        success: true,
        totalArchivos: files.length,
        archivos: fileDetails,
        uploadsUrl: `https://api1.strideutmat.com/uploads/actividades/`,
        isSymlink
    });
});

runMigrations().then(() => {
    server.listen(PORT, () => {
    console.log(`🎓 Sistema Universitario corriendo en puerto ${PORT}`);
    console.log(`📁 Servidor de archivos en: https://api1.strideutmat.com/uploads/`);
    const uploadsPathLog = path.join(__dirname, 'uploads');
    console.log(`📂 Ruta física: ${uploadsPathLog}`);
    console.log(`🔗 Es symlink: ${fs.existsSync(uploadsPathLog) ? fs.lstatSync(uploadsPathLog).isSymbolicLink() : 'directorio no encontrado'}`);
    });
});
