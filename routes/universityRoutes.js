const express = require('express');
const router = express.Router();
const db = require('../config/database');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

// ========== CONFIGURACIÓN DE MULTER ==========

// Crear carpeta de uploads si no existe
const uploadDir = 'uploads/actividades';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Configuración de almacenamiento
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        const filename = 'actividad-' + uniqueSuffix + ext;
        console.log('📸 Guardando imagen:', filename);
        cb(null, filename);
    }
});

// Configuración de multer
const upload = multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Solo se permiten imágenes'), false);
        }
    },
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB por imagen
        files: 5 // Máximo 5 archivos
    }
});

// Configuración de almacenamiento para fotos de personal
const personalStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        const dir = 'uploads/personal';
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        const filename = 'personal-' + uniqueSuffix + ext;
        cb(null, filename);
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
    limits: {
        fileSize: 2 * 1024 * 1024, // 2MB máximo
    }
});

// ========== RUTAS BÁSICAS PARA SUPER USERS ==========

// Crear super usuario
router.post('/create-superuser', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        
        if (!username || !email || !password) {
            return res.status(400).json({ 
                success: false,
                error: 'Todos los campos son obligatorios' 
            });
        }
        
        const hashedPassword = await bcrypt.hash(password, 10);
        
        const [result] = await db.execute(
            'INSERT INTO super_users (username, email, password) VALUES (?, ?, ?)',
            [username, email, hashedPassword]
        );
        
        res.status(201).json({ 
            success: true,
            message: 'Super usuario creado exitosamente',
            userId: result.insertId 
        });
        
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ 
                success: false,
                error: 'El usuario o email ya existe' 
            });
        }
        console.error('Error al crear super user:', error);
        res.status(500).json({ 
            success: false,
            error: 'Error al crear el usuario' 
        });
    }
});

// Login para super users
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        console.log('🔐 Intento de login para:', email);
        
        if (!email || !password) {
            return res.status(400).json({ 
                success: false,
                error: 'Email y contraseña son requeridos' 
            });
        }
        
        const [users] = await db.execute(
            'SELECT * FROM super_users WHERE email = ?',
            [email]
        );
        
        console.log('👤 Usuarios encontrados:', users.length);
        
        if (users.length === 0) {
            return res.status(401).json({ 
                success: false,
                error: 'Credenciales inválidas' 
            });
        }
        
        const user = users[0];
        const isValidPassword = await bcrypt.compare(password, user.password);
        
        if (!isValidPassword) {
            return res.status(401).json({ 
                success: false,
                error: 'Credenciales inválidas' 
            });
        }
        
        const userResponse = {
            id: user.id,
            username: user.username,
            email: user.email,
            tipo: 'superadmin',
            created_at: user.created_at
        };
        
        console.log('✅ Login exitoso para:', user.email);
        
        res.json({ 
            success: true,
            message: 'Login exitoso',
            user: userResponse
        });
        
    } catch (error) {
        console.error('Error en login:', error);
        res.status(500).json({ 
            success: false,
            error: 'Error en el servidor' 
        });
    }
});

// ========== LOGIN GENERAL PARA TODOS LOS TIPOS ==========
router.post('/login-general', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        console.log('🔐 Login general para:', email);
        
        if (!email || !password) {
            return res.status(400).json({ 
                success: false,
                error: 'Email y contraseña son requeridos' 
            });
        }
        
        let user = null;
        let userType = null;
        
        const [superUsers] = await db.execute(
            'SELECT * FROM super_users WHERE email = ?',
            [email]
        );
        
        if (superUsers.length > 0) {
            const superUser = superUsers[0];
            const isValidPassword = await bcrypt.compare(password, superUser.password);
            
            if (isValidPassword) {
                user = {
                    id: superUser.id,
                    nombre: superUser.username,
                    username: superUser.username,
                    email: superUser.email,
                    tipo: 'superadmin',
                    userType: 'superadmin'
                };
                userType = 'superadmin';
            }
        }
        
        if (!user) {
            const [directivos] = await db.execute(
                'SELECT d.*, dir.nombre as direccion_nombre FROM directivos d LEFT JOIN direcciones dir ON d.direccion_id = dir.id WHERE d.email = ?',
                [email]
            );
            
            if (directivos.length > 0) {
                const directivo = directivos[0];
                const isValidPassword = await bcrypt.compare(password, directivo.password);
                
                if (isValidPassword) {
                    user = {
                        id: directivo.id,
                        nombre: directivo.nombre_completo,
                        username: directivo.nombre_completo,
                        email: directivo.email,
                        cargo: directivo.cargo,
                        direccion_id: directivo.direccion_id,
                        direccion_nombre: directivo.direccion_nombre,
                        tipo: 'directivo',
                        userType: 'directivo'
                    };
                    userType = 'directivo';
                }
            }
        }
        
        if (!user) {
            const [personal] = await db.execute(
                'SELECT p.*, dir.nombre as direccion_nombre FROM personal p LEFT JOIN direcciones dir ON p.direccion_id = dir.id WHERE p.email = ?',
                [email]
            );
            
            if (personal.length > 0) {
                const personalUser = personal[0];
                const isValidPassword = await bcrypt.compare(password, personalUser.password);
                
                if (isValidPassword) {
                    user = {
                        id: personalUser.id,
                        nombre: personalUser.nombre_completo,
                        username: personalUser.nombre_completo,
                        email: personalUser.email,
                        puesto: personalUser.puesto,
                        direccion_id: personalUser.direccion_id,
                        direccion_nombre: personalUser.direccion_nombre,
                        tipo: 'personal',
                        userType: 'personal'
                    };
                    userType = 'personal';
                }
            }
        }
        
        if (!user) {
            return res.status(401).json({ 
                success: false,
                error: 'Credenciales inválidas' 
            });
        }
        
        console.log('✅ Login exitoso para:', user.email, 'Tipo:', userType);
        
        res.json({ 
            success: true,
            message: 'Login exitoso',
            user: user,
            userType: userType
        });
        
    } catch (error) {
        console.error('Error en login general:', error);
        res.status(500).json({ 
            success: false,
            error: 'Error en el servidor' 
        });
    }
});

// Obtener todos los super users
router.get('/superusers', async (req, res) => {
    try {
        const [users] = await db.execute(
            'SELECT id, username, email, created_at FROM super_users ORDER BY created_at DESC'
        );
        
        res.json({ 
            success: true,
            data: users 
        });
        
    } catch (error) {
        console.error('Error al obtener usuarios:', error);
        res.status(500).json({ 
            success: false,
            error: 'Error al obtener usuarios' 
        });
    }
});

// ========== ESTADÍSTICAS BÁSICAS ==========
router.get('/estadisticas', async (req, res) => {
    try {
        const [[{ total_usuarios }]] = await db.execute('SELECT COUNT(*) as total_usuarios FROM super_users');
        const [[{ total_direcciones }]] = await db.execute('SELECT COUNT(*) as total_direcciones FROM direcciones');
        const [[{ total_directivos }]] = await db.execute('SELECT COUNT(*) as total_directivos FROM directivos');
        const [[{ total_personal }]] = await db.execute('SELECT COUNT(*) as total_personal FROM personal');
        const [[{ total_comunicados }]] = await db.execute("SELECT COUNT(*) as total_comunicados FROM comunicados WHERE estado = 'publicado'");
        
        res.json({
            success: true,
            data: {
                usuarios: total_usuarios,
                direcciones: total_direcciones,
                directivos: total_directivos,
                personal: total_personal,
                comunicados: total_comunicados
            }
        });
        
    } catch (error) {
        console.error('Error al obtener estadísticas:', error);
        res.status(500).json({ 
            success: false,
            error: 'Error al obtener estadísticas' 
        });
    }
});

// ========== RUTA DE PRUEBA ==========
router.get('/test', async (req, res) => {
    try {
        const [result] = await db.execute('SELECT 1 + 1 as test');
        res.json({ 
            success: true,
            message: 'API funcionando correctamente',
            dbTest: result[0].test,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({ 
            success: false,
            error: 'Error de conexión a la base de datos' 
        });
    }
});

// ========== DIRECCIONES ==========
router.get('/direcciones', async (req, res) => {
    try {
        const [direcciones] = await db.execute(
            'SELECT * FROM direcciones ORDER BY nombre'
        );
        
        res.json({ 
            success: true,
            data: direcciones 
        });
        
    } catch (error) {
        console.error('Error al obtener direcciones:', error);
        res.status(500).json({ 
            success: false,
            error: 'Error al obtener direcciones' 
        });
    }
});

router.post('/direcciones', async (req, res) => {
    try {
        const { nombre } = req.body;
        
        if (!nombre) {
            return res.status(400).json({ 
                success: false,
                error: 'El nombre es requerido' 
            });
        }
        
        const [result] = await db.execute(
            'INSERT INTO direcciones (nombre) VALUES (?)',
            [nombre]
        );
        
        res.status(201).json({ 
            success: true,
            message: 'Dirección creada exitosamente',
            direccionId: result.insertId 
        });
        
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ 
                success: false,
                error: 'Esta dirección ya existe' 
            });
        }
        console.error('Error al crear dirección:', error);
        res.status(500).json({ 
            success: false,
            error: 'Error al crear la dirección' 
        });
    }
});

// ========== DIRECTIVOS ==========
router.get('/directivos', async (req, res) => {
    try {
        const [directivos] = await db.execute(
            'SELECT d.*, dir.nombre as direccion_nombre FROM directivos d LEFT JOIN direcciones dir ON d.direccion_id = dir.id ORDER BY d.nombre_completo'
        );
        
        res.json({ 
            success: true,
            data: directivos 
        });
        
    } catch (error) {
        console.error('Error al obtener directivos:', error);
        res.status(500).json({ 
            success: false,
            error: 'Error al obtener directivos' 
        });
    }
});

router.post('/directivos', async (req, res) => {
    try {
        const { nombre_completo, cargo, direccion_id, email, password } = req.body;
        
        if (!nombre_completo || !cargo || !direccion_id || !email || !password) {
            return res.status(400).json({ 
                success: false,
                error: 'Todos los campos son requeridos' 
            });
        }
        
        const hashedPassword = await bcrypt.hash(password, 10);
        
        const [result] = await db.execute(
            'INSERT INTO directivos (nombre_completo, cargo, direccion_id, email, password) VALUES (?, ?, ?, ?, ?)',
            [nombre_completo, cargo, direccion_id, email, hashedPassword]
        );
        
        res.status(201).json({ 
            success: true,
            message: 'Directivo creado exitosamente',
            directivoId: result.insertId 
        });
        
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ 
                success: false,
                error: 'El email ya está registrado' 
            });
        }
        console.error('Error al crear directivo:', error);
        res.status(500).json({ 
            success: false,
            error: 'Error al crear el directivo' 
        });
    }
});

// ========== PERSONAL ==========
router.get('/personal', async (req, res) => {
    try {
        console.log('📋 Obteniendo todos los registros de personal...');
        
        const [personal] = await db.execute(
            'SELECT p.*, dir.nombre as direccion_nombre FROM personal p LEFT JOIN direcciones dir ON p.direccion_id = dir.id ORDER BY p.nombre_completo'
        );
        
        console.log(`✅ Personal encontrado: ${personal.length} registros`);
        
        if (personal.length > 0) {
            console.log('🔍 Primer registro:', {
                id: personal[0].id,
                nombre: personal[0].nombre_completo,
                foto_perfil: personal[0].foto_perfil,
                tieneFoto: !!personal[0].foto_perfil
            });
        }
        
        // Añadir URL de foto a cada registro
        const personalConFotos = personal.map(persona => {
            const fotoUrl = persona.foto_perfil 
                ? `http://strideutmat.com:5000/api/university/personal/foto/${persona.foto_perfil}`
                : `http://strideutmat.com:5000/api/university/personal/foto/default-avatar.png`;
            
            console.log(`   👤 ${persona.nombre_completo}: ${persona.foto_perfil ? 'Tiene foto' : 'Sin foto'} -> ${fotoUrl}`);
            
            return {
                ...persona,
                foto_url: fotoUrl
            };
        });
        
        res.json({ 
            success: true,
            data: personalConFotos,
            metadata: {
                total: personalConFotos.length,
                conFoto: personal.filter(p => p.foto_perfil).length,
                sinFoto: personal.filter(p => !p.foto_perfil).length
            }
        });
        
    } catch (error) {
        console.error('❌ Error al obtener personal:', error);
        console.error('Error details:', error.message);
        res.status(500).json({ 
            success: false,
            error: 'Error al obtener personal' 
        });
    }
});

// En universityRoutes.js, añade esta ruta de debugging:
router.get('/personal/debug-fotos', async (req, res) => {
    try {
        const [personal] = await db.execute(
            'SELECT id, nombre_completo, foto_perfil FROM personal ORDER BY id'
        );
        
        const resultados = [];
        
        for (const persona of personal) {
            let existeArchivo = false;
            let rutaArchivo = '';
            
            if (persona.foto_perfil) {
                rutaArchivo = path.join('uploads/personal', persona.foto_perfil);
                existeArchivo = fs.existsSync(rutaArchivo);
            }
            
            resultados.push({
                id: persona.id,
                nombre: persona.nombre_completo,
                foto_perfil: persona.foto_perfil,
                existe_archivo: existeArchivo,
                ruta: rutaArchivo,
                url: persona.foto_perfil 
                    ? `http://strideutmat.com:5000/api/university/personal/foto/${persona.foto_perfil}`
                    : 'Sin foto'
            });
        }
        
        res.json({
            success: true,
            data: resultados,
            carpeta: path.resolve('uploads/personal'),
            archivos_en_carpeta: fs.existsSync('uploads/personal') 
                ? fs.readdirSync('uploads/personal')
                : 'Carpeta no existe'
        });
        
    } catch (error) {
        console.error('Error en debug:', error);
        res.status(500).json({ error: error.message });
    }
});

// Obtener un personal específico por ID
router.get('/personal/:id', async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`🔍 Obteniendo personal ID: ${id}`);
        
        const [personal] = await db.execute(
            `SELECT p.*, dir.nombre as direccion_nombre 
             FROM personal p 
             LEFT JOIN direcciones dir ON p.direccion_id = dir.id 
             WHERE p.id = ?`,
            [id]
        );
        
        if (personal.length === 0) {
            return res.status(404).json({ 
                success: false,
                error: 'Personal no encontrado' 
            });
        }
        
        const persona = personal[0];
        
        // Añadir URL de foto si existe
        const personaConFoto = {
            ...persona,
            foto_url: persona.foto_perfil 
                ? `http://strideutmat.com:5000/api/university/personal/foto/${persona.foto_perfil}`
                : null
        };
        
        console.log(`✅ Personal encontrado: ${persona.nombre_completo}`, {
            tieneFoto: !!persona.foto_perfil,
            foto_perfil: persona.foto_perfil
        });
        
        res.json({ 
            success: true,
            data: personaConFoto 
        });
        
    } catch (error) {
        console.error('Error al obtener personal:', error);
        res.status(500).json({ 
            success: false,
            error: 'Error al obtener personal' 
        });
    }
});

// Ruta para servir fotos de personal
router.get('/personal/foto/:filename', (req, res) => {
    try {
        const { filename } = req.params;
        const filePath = path.join('uploads/personal', filename);
        
        if (fs.existsSync(filePath)) {
            res.sendFile(path.resolve(filePath));
        } else {
            // Si no existe la foto, servir una por defecto
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

// Cambia la ruta actual de POST '/personal' por esta:
// Ruta para crear personal con foto - VERSIÓN ACTUALIZADA
router.post('/personal', uploadPersonal.single('foto'), async (req, res) => {
    try {
        // Para debugging: mostrar todo lo que llega
        console.log('📝 Cuerpo recibido:', req.body);
        console.log('📸 Archivo recibido:', req.file);
        
        // Parsear manualmente si es necesario
        let nombre_completo, puesto, direccion_id, email, password;
        
        // Si req.body está vacío, el cliente podría estar enviando FormData
        // En ese caso, los campos vienen en el FormData
        if (!req.body || Object.keys(req.body).length === 0) {
            // Si estamos usando FormData puro, podríamos necesitar otro enfoque
            return res.status(400).json({
                success: false,
                error: 'Los datos deben enviarse como JSON o form-urlencoded'
            });
        }
        
        // Intentar obtener los datos
        try {
            nombre_completo = req.body.nombre_completo;
            puesto = req.body.puesto;
            direccion_id = req.body.direccion_id;
            email = req.body.email;
            password = req.body.password;
        } catch (error) {
            console.error('Error parseando body:', error);
            return res.status(400).json({
                success: false,
                error: 'Error procesando los datos del formulario'
            });
        }
        
        const foto = req.file;
        
        console.log('📝 Datos extraídos:', {
            nombre_completo, puesto, direccion_id, email,
            foto: foto ? foto.filename : 'sin_foto'
        });
        
        if (!nombre_completo || !puesto || !direccion_id || !email || !password) {
            // Limpiar archivo si hay error
            if (foto) {
                try {
                    fs.unlinkSync(foto.path);
                } catch (err) {
                    console.error('Error al limpiar archivo:', err);
                }
            }
            return res.status(400).json({ 
                success: false,
                error: 'Todos los campos son requeridos',
                campos_recibidos: { nombre_completo, puesto, direccion_id, email }
            });
        }
        
        const hashedPassword = await bcrypt.hash(password, 10);

        // Comprimir foto si existe
        let fotoFilename = null;
        if (foto) {
            try {
                const compressedFilename = 'c-' + foto.filename.replace(/\.[^.]+$/, '') + '.jpg';
                const compressedPath = path.join('uploads/personal', compressedFilename);
                await sharp(foto.path)
                    .resize(300, 300, { fit: 'cover' })
                    .jpeg({ quality: 80 })
                    .toFile(compressedPath);
                fs.unlinkSync(foto.path);
                fotoFilename = compressedFilename;
            } catch (sharpError) {
                console.error('Error comprimiendo foto:', sharpError);
                fotoFilename = foto.filename; // usar original si falla
            }
        }
        
        const [result] = await db.execute(
            'INSERT INTO personal (nombre_completo, puesto, direccion_id, email, password, foto_perfil) VALUES (?, ?, ?, ?, ?, ?)',
            [nombre_completo, puesto, direccion_id, email, hashedPassword, fotoFilename]
        );
        
        res.status(201).json({ 
            success: true,
            message: 'Personal creado exitosamente',
            personalId: result.insertId,
            tieneFoto: !!foto
        });
        
    } catch (error) {
        // Limpiar archivo si hay error
        if (req.file) {
            try {
                fs.unlinkSync(req.file.path);
            } catch (err) {
                console.error('Error al limpiar archivo:', err);
            }
        }
        
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ 
                success: false,
                error: 'El email ya está registrado' 
            });
        }
        console.error('Error al crear personal:', error);
        res.status(500).json({ 
            success: false,
            error: 'Error al crear el personal',
            detalle: error.message
        });
    }
});

// ========== ACTIVIDADES CON IMÁGENES ==========

// Crear nueva actividad con imágenes (CON TIPO_ACTIVIDAD)
router.post('/actividades', upload.array('imagenes', 5), async (req, res) => {
    try {
        const { 
            titulo, 
            descripcion, 
            tipo_actividad, // NUEVO: campo de texto para tipo de actividad
            fecha_inicio, 
            fecha_fin, 
            direccion_id, 
            creado_por_id, 
            creado_por_tipo 
        } = req.body;
        
        console.log('📝 Datos recibidos:', {
            titulo, descripcion, tipo_actividad, fecha_inicio, fecha_fin, direccion_id, 
            creado_por_id, creado_por_tipo
        });
        console.log('📸 Archivos recibidos:', req.files ? req.files.length : 0);
        
        if (req.files && req.files.length > 0) {
            req.files.forEach((file, index) => {
                console.log(`  Archivo ${index + 1}:`, file.originalname, '->', file.filename);
            });
        }
        
        // VALIDACIÓN CON TIPO_ACTIVIDAD
        if (!titulo || !tipo_actividad || !fecha_inicio || !direccion_id || !creado_por_id || !creado_por_tipo) {
            // Limpiar archivos si hay error
            if (req.files && req.files.length > 0) {
                req.files.forEach(file => {
                    try {
                        fs.unlinkSync(file.path);
                        console.log('🗑️ Archivo eliminado:', file.path);
                    } catch (err) {
                        console.error('Error al limpiar archivos:', err);
                    }
                });
            }
            return res.status(400).json({ 
                success: false,
                error: 'Título, tipo de actividad, fecha de inicio, dirección, creador y tipo son requeridos' 
            });
        }
        
        // Validar que fecha_fin no sea anterior a fecha_inicio
        if (fecha_fin && new Date(fecha_fin) < new Date(fecha_inicio)) {
            if (req.files && req.files.length > 0) {
                req.files.forEach(file => {
                    try {
                        fs.unlinkSync(file.path);
                    } catch (err) {
                        console.error('Error al limpiar archivos:', err);
                    }
                });
            }
            return res.status(400).json({ 
                success: false,
                error: 'La fecha de fin no puede ser anterior a la fecha de inicio' 
            });
        }
        
        // Insertar actividad CON TIPO_ACTIVIDAD
        const [result] = await db.execute(
            `INSERT INTO actividades 
            (titulo, descripcion, tipo_actividad, fecha_inicio, fecha_fin, direccion_id, creado_por_id, creado_por_tipo, estado) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pendiente')`,
            [titulo, descripcion || null, tipo_actividad, fecha_inicio, fecha_fin || null, direccion_id, creado_por_id, creado_por_tipo]
        );
        
        const actividadId = result.insertId;
        
        // Si hay imágenes, guardar referencias en la base de datos
        if (req.files && req.files.length > 0) {
            for (const file of req.files) {
                await db.execute(
                    `INSERT INTO actividad_imagenes 
                    (actividad_id, nombre_archivo, ruta_archivo, tipo_mime, tamano) 
                    VALUES (?, ?, ?, ?, ?)`,
                    [actividadId, file.originalname, file.filename, file.mimetype, file.size]
                );
                console.log('💾 Imagen guardada en BD:', file.filename);
            }
        }
        
        res.status(201).json({ 
            success: true,
            message: 'Actividad creada exitosamente',
            actividadId: actividadId,
            imagenesCount: req.files ? req.files.length : 0
        });
        
    } catch (error) {
        console.error('❌ Error al crear actividad:', error);
        
        // Si hay error, eliminar archivos subidos
        if (req.files && req.files.length > 0) {
            req.files.forEach(file => {
                try {
                    fs.unlinkSync(file.path);
                } catch (err) {
                    console.error('Error al eliminar archivo:', err);
                }
            });
        }
        
        res.status(500).json({ 
            success: false,
            error: error.message || 'Error al crear la actividad' 
        });
    }
});

// Obtener actividades por dirección
router.get('/actividades/direccion/:direccion_id', async (req, res) => {
    try {
        const { direccion_id } = req.params;
        console.log(`📋 Obteniendo actividades para dirección: ${direccion_id}`);
        
        const [actividades] = await db.execute(`
            SELECT a.*, 
                   d.nombre as direccion_nombre,
                   CASE 
                     WHEN a.creado_por_tipo = 'directivo' THEN dir.nombre_completo
                     WHEN a.creado_por_tipo = 'personal' THEN per.nombre_completo
                     ELSE 'Sistema'
                   END as creado_por_nombre
            FROM actividades a
            LEFT JOIN direcciones d ON a.direccion_id = d.id
            LEFT JOIN directivos dir ON a.creado_por_id = dir.id AND a.creado_por_tipo = 'directivo'
            LEFT JOIN personal per ON a.creado_por_id = per.id AND a.creado_por_tipo = 'personal'
            WHERE a.direccion_id = ?
            ORDER BY a.fecha_creacion DESC
        `, [direccion_id]);
        
        console.log(`📊 Actividades encontradas: ${actividades.length}`);
        
        // Para cada actividad, obtener sus imágenes
        for (let actividad of actividades) {
            const [imagenes] = await db.execute(
                `SELECT id, actividad_id, nombre_archivo, ruta_archivo, tipo_mime, tamano, fecha_subida 
                 FROM actividad_imagenes 
                 WHERE actividad_id = ?`,
                [actividad.id]
            );
            
            // Crear URLs públicas para las imágenes
            actividad.imagenes = imagenes.map(img => ({
                ...img,
                url: `http://strideutmat.com:5000/uploads/actividades/${img.ruta_archivo}`
            }));
            
            // Verificar que los archivos existen
            if (imagenes.length > 0) {
                console.log(`   Actividad ${actividad.id}: ${imagenes.length} imágenes`);
                imagenes.forEach(img => {
                    const filePath = path.join(uploadDir, img.ruta_archivo);
                    const fileExists = fs.existsSync(filePath);
                    console.log(`     - ${img.ruta_archivo}: ${fileExists ? '✅ Existe' : '❌ No existe'}`);
                });
            }
        }
        
        res.json({ 
            success: true,
            data: actividades 
        });
        
    } catch (error) {
        console.error('Error al obtener actividades:', error);
        res.status(500).json({ 
            success: false,
            error: 'Error al obtener actividades' 
        });
    }
});

// Actualizar estado de actividad
router.put('/actividades/:id/estado', async (req, res) => {
    try {
        const { id } = req.params;
        const { estado } = req.body;
        
        const [result] = await db.execute(
            'UPDATE actividades SET estado = ? WHERE id = ?',
            [estado, id]
        );
        
        res.json({ 
            success: true,
            message: 'Estado actualizado',
            affectedRows: result.affectedRows
        });
        
    } catch (error) {
        console.error('Error al actualizar estado:', error);
        res.status(500).json({ 
            success: false,
            error: 'Error al actualizar estado' 
        });
    }
});

// Ruta para verificar archivos subidos
router.get('/debug/uploads', (req, res) => {
    try {
        const uploadDir = 'uploads/actividades';
        
        if (!fs.existsSync(uploadDir)) {
            return res.json({
                success: false,
                message: 'Directorio no existe',
                path: path.resolve(uploadDir)
            });
        }
        
        const files = fs.readdirSync(uploadDir);
        const fileDetails = files.map(file => {
            const filePath = path.join(uploadDir, file);
            const stats = fs.statSync(filePath);
            return {
                nombre: file,
                ruta: filePath,
                tamaño: stats.size,
                url: `http://strideutmat.com:5000/uploads/actividades/${file}`,
                existe: fs.existsSync(filePath)
            };
        });
        
        res.json({
            success: true,
            uploadDir: path.resolve(uploadDir),
            totalArchivos: files.length,
            archivos: fileDetails
        });
        
    } catch (error) {
        console.error('Error al leer directorio:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Obtener TODAS las actividades del sistema
router.get('/actividades/todas', async (req, res) => {
    try {
        console.log('📋 Obteniendo TODAS las actividades del sistema');
        
        const [actividades] = await db.execute(`
            SELECT a.*, 
                   d.nombre as direccion_nombre,
                   CASE 
                     WHEN a.creado_por_tipo = 'directivo' THEN dir.nombre_completo
                     WHEN a.creado_por_tipo = 'personal' THEN per.nombre_completo
                     ELSE 'Sistema'
                   END as creado_por_nombre
            FROM actividades a
            LEFT JOIN direcciones d ON a.direccion_id = d.id
            LEFT JOIN directivos dir ON a.creado_por_id = dir.id AND a.creado_por_tipo = 'directivo'
            LEFT JOIN personal per ON a.creado_por_id = per.id AND a.creado_por_tipo = 'personal'
            ORDER BY a.fecha_creacion DESC
        `);
        
        console.log(`📊 Total actividades encontradas: ${actividades.length}`);
        
        // Para cada actividad, obtener sus imágenes
        for (let actividad of actividades) {
            const [imagenes] = await db.execute(
                `SELECT id, actividad_id, nombre_archivo, ruta_archivo, tipo_mime, tamano, fecha_subida 
                 FROM actividad_imagenes 
                 WHERE actividad_id = ?`,
                [actividad.id]
            );
            
            // Crear URLs públicas para las imágenes
            actividad.imagenes = imagenes.map(img => ({
                ...img,
                url: `http://strideutmat.com:5000/uploads/actividades/${img.ruta_archivo}`
            }));
        }
        
        res.json({ 
            success: true,
            data: actividades,
            total: actividades.length,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('Error al obtener todas las actividades:', error);
        res.status(500).json({ 
            success: false,
            error: 'Error al obtener actividades' 
        });
    }
});

// ========== ELIMINAR ACTIVIDAD ==========

// Eliminar actividad (con todas sus imágenes)
router.delete('/actividades/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        console.log(`🗑️ Solicitando eliminación de actividad ID: ${id}`);
        
        // 1. Obtener información de la actividad
        const [actividades] = await db.execute(
            'SELECT * FROM actividades WHERE id = ?',
            [id]
        );
        
        if (actividades.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Actividad no encontrada'
            });
        }
        
        const actividad = actividades[0];
        
        // 2. Obtener imágenes de la actividad
        const [imagenes] = await db.execute(
            'SELECT * FROM actividad_imagenes WHERE actividad_id = ?',
            [id]
        );
        
        console.log(`📸 Imágenes a eliminar: ${imagenes.length}`);
        
        // 3. Eliminar archivos físicos de las imágenes
        let imagenesEliminadas = 0;
        for (const imagen of imagenes) {
            try {
                const filePath = path.join(uploadDir, imagen.ruta_archivo);
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                    console.log(`   ✅ Archivo eliminado: ${filePath}`);
                    imagenesEliminadas++;
                }
            } catch (fileError) {
                console.error(`   ⚠️ Error eliminando archivo: ${fileError.message}`);
            }
        }
        
        // 4. Eliminar registros de la base de datos
        // Primero las imágenes (por la restricción de clave foránea)
        await db.execute(
            'DELETE FROM actividad_imagenes WHERE actividad_id = ?',
            [id]
        );
        
        // Luego la actividad
        const [result] = await db.execute(
            'DELETE FROM actividades WHERE id = ?',
            [id]
        );
        
        if (result.affectedRows === 0) {
            return res.status(500).json({
                success: false,
                error: 'No se pudo eliminar la actividad'
            });
        }
        
        console.log(`✅ Actividad ${id} eliminada exitosamente`);
        
        res.json({
            success: true,
            message: 'Actividad eliminada exitosamente',
            actividadId: id,
            titulo: actividad.titulo,
            imagenesEliminadas: imagenesEliminadas,
            registrosEliminados: result.affectedRows
        });
        
    } catch (error) {
        console.error('❌ Error al eliminar actividad:', error);
        
        res.status(500).json({
            success: false,
            error: error.message || 'Error al eliminar la actividad'
        });
    }
});

// ========== CONFIGURACIÓN SIMPLE PARA LOGOS ==========

const logoDir = 'uploads/logos';

// Subir logo
router.post('/upload-logo', async (req, res) => {
  try {
    console.log('📤 Subiendo logo...');
    
    // Manejo manual del archivo
    if (!req.headers['content-type'] || !req.headers['content-type'].includes('multipart/form-data')) {
      return res.status(400).json({
        success: false,
        error: 'Content-Type debe ser multipart/form-data'
      });
    }
    
    // Parsear manualmente
    const busboy = require('busboy');
    const bb = busboy({ headers: req.headers });
    let fileName = '';
    let fileBuffer = Buffer.from('');
    
    bb.on('file', (name, file, info) => {
      console.log(`📄 Archivo recibido: ${info.filename}`);
      fileName = info.filename;
      const chunks = [];
      
      file.on('data', (chunk) => {
        chunks.push(chunk);
      });
      
      file.on('end', () => {
        fileBuffer = Buffer.concat(chunks);
      });
    });
    
    bb.on('close', async () => {
      if (!fileBuffer.length || !fileName) {
        return res.status(400).json({
          success: false,
          error: 'No se recibió ningún archivo'
        });
      }
      
      // Asegurar que la carpeta existe
      if (!fs.existsSync(logoDir)) {
        fs.mkdirSync(logoDir, { recursive: true });
      }
      
      // Obtener extensión del archivo original
      const ext = path.extname(fileName);
      
      // Nombre fijo: institution-logo + extensión original
      const newFileName = 'institution-logo' + ext;
      const filePath = path.join(logoDir, newFileName);
      
      // Eliminar logo anterior si existe
      const existingFiles = fs.readdirSync(logoDir);
      existingFiles.forEach(file => {
        if (file.startsWith('institution-logo')) {
          fs.unlinkSync(path.join(logoDir, file));
          console.log('🗑️ Logo anterior eliminado:', file);
        }
      });
      
      // Guardar el nuevo archivo
      fs.writeFileSync(filePath, fileBuffer);
      console.log('💾 Logo guardado:', newFileName, 'tamaño:', fileBuffer.length);
      
      res.json({
        success: true,
        message: 'Logo subido exitosamente',
        filename: newFileName,
        path: filePath
      });
    });
    
    req.pipe(bb);
    
  } catch (error) {
    console.error('❌ Error subiendo logo:', error);
    res.status(500).json({
      success: false,
      error: 'Error al subir el logo'
    });
  }
});

// Eliminar logo
router.delete('/delete-logo', (req, res) => {
  try {
    console.log('🗑️ Eliminando logo...');
    
    if (!fs.existsSync(logoDir)) {
      return res.json({
        success: true,
        message: 'No hay logo para eliminar'
      });
    }
    
    const files = fs.readdirSync(logoDir);
    let deletedCount = 0;
    
    files.forEach(file => {
      if (file.startsWith('institution-logo')) {
        const filePath = path.join(logoDir, file);
        fs.unlinkSync(filePath);
        console.log('✅ Logo eliminado:', file);
        deletedCount++;
      }
    });
    
    res.json({
      success: true,
      message: 'Logo eliminado',
      deletedCount: deletedCount
    });
    
  } catch (error) {
    console.error('Error eliminando logo:', error);
    res.status(500).json({
      success: false,
      error: 'Error al eliminar logo'
    });
  }
});

// Verificar logo (opcional, para debugging)
router.get('/check-logo', (req, res) => {
  try {
    if (!fs.existsSync(logoDir)) {
      return res.json({
        success: false,
        exists: false,
        message: 'Carpeta de logos no existe'
      });
    }
    
    const files = fs.readdirSync(logoDir);
    const logoFile = files.find(file => file.startsWith('institution-logo'));
    
    if (!logoFile) {
      return res.json({
        success: false,
        exists: false,
        message: 'No hay logo'
      });
    }
    
    const filePath = path.join(logoDir, logoFile);
    const stats = fs.statSync(filePath);
    
    res.json({
      success: true,
      exists: true,
      filename: logoFile,
      size: stats.size,
      path: filePath,
      url: `http://strideutmat.com:5000/uploads/logos/${logoFile}`
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ========== COMUNICADOS ==========

// Crear nuevo comunicado
router.post('/comunicados', async (req, res) => {
    try {
        const { 
            titulo, 
            contenido,
            link_externo,
            publicado_por_id
        } = req.body;
        
        console.log('📝 Creando comunicado:', { titulo, publicado_por_id });
        
        if (!titulo || !contenido || !publicado_por_id) {
            return res.status(400).json({ 
                success: false,
                error: 'Título, contenido y creador son requeridos' 
            });
        }
        
        const [result] = await db.execute(
            `INSERT INTO comunicados 
            (titulo, contenido, link_externo, publicado_por_id, estado) 
            VALUES (?, ?, ?, ?, 'publicado')`,
            [titulo, contenido, link_externo || null, publicado_por_id]
        );
        
        res.status(201).json({ 
            success: true,
            message: 'Comunicado publicado exitosamente',
            comunicadoId: result.insertId 
        });
        
    } catch (error) {
        console.error('❌ Error al crear comunicado:', error);
        res.status(500).json({ 
            success: false,
            error: error.message || 'Error al crear el comunicado' 
        });
    }
});

// Obtener todos los comunicados (con nombre del publicador)
router.get('/comunicados', async (req, res) => {
    try {
        console.log('📢 Obteniendo todos los comunicados públicos...');
        
        const [comunicados] = await db.execute(`
            SELECT c.*, 
                   su.username as publicado_por_nombre
            FROM comunicados c
            LEFT JOIN super_users su ON c.publicado_por_id = su.id
            WHERE c.estado = 'publicado'
            ORDER BY c.fecha_publicacion DESC
        `);
        
        console.log(`✅ Comunicados públicos encontrados: ${comunicados.length}`);
        
        res.json({ 
            success: true,
            data: comunicados 
        });
        
    } catch (error) {
        console.error('❌ Error al obtener comunicados:', error);
        res.status(500).json({ 
            success: false,
            error: 'Error al obtener comunicados' 
        });
    }
});

// Obtener comunicados para administración (incluye todos los estados)
router.get('/comunicados-admin', async (req, res) => {
    try {
        console.log('📢 Obteniendo todos los comunicados para administración...');
        
        const [comunicados] = await db.execute(`
            SELECT c.*, 
                   su.username as publicado_por_nombre
            FROM comunicados c
            LEFT JOIN super_users su ON c.publicado_por_id = su.id
            ORDER BY c.fecha_publicacion DESC
        `);
        
        console.log(`✅ Comunicados admin encontrados: ${comunicados.length}`);
        
        res.json({ 
            success: true,
            data: comunicados 
        });
        
    } catch (error) {
        console.error('❌ Error al obtener comunicados para admin:', error);
        res.status(500).json({ 
            success: false,
            error: 'Error al obtener comunicados' 
        });
    }
});

// Obtener comunicado específico
router.get('/comunicados/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const [comunicados] = await db.execute(`
            SELECT c.*, 
                   su.username as publicado_por_nombre
            FROM comunicados c
            LEFT JOIN super_users su ON c.publicado_por_id = su.id
            WHERE c.id = ?
        `, [id]);
        
        if (comunicados.length === 0) {
            return res.status(404).json({ 
                success: false,
                error: 'Comunicado no encontrado' 
            });
        }
        
        res.json({ 
            success: true,
            data: comunicados[0] 
        });
        
    } catch (error) {
        console.error('Error al obtener comunicado:', error);
        res.status(500).json({ 
            success: false,
            error: 'Error al obtener comunicado' 
        });
    }
});

// Actualizar comunicado
router.put('/comunicados/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { titulo, contenido, link_externo, estado } = req.body;
        
        const [result] = await db.execute(
            `UPDATE comunicados 
             SET titulo = ?, contenido = ?, link_externo = ?, estado = ?
             WHERE id = ?`,
            [titulo, contenido, link_externo || null, estado, id]
        );
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ 
                success: false,
                error: 'Comunicado no encontrado' 
            });
        }
        
        res.json({ 
            success: true,
            message: 'Comunicado actualizado exitosamente'
        });
        
    } catch (error) {
        console.error('Error al actualizar comunicado:', error);
        res.status(500).json({ 
            success: false,
            error: 'Error al actualizar comunicado' 
        });
    }
});

// Eliminar comunicado
router.delete('/comunicados/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const [result] = await db.execute(
            'DELETE FROM comunicados WHERE id = ?',
            [id]
        );
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ 
                success: false,
                error: 'Comunicado no encontrado' 
            });
        }
        
        res.json({ 
            success: true,
            message: 'Comunicado eliminado exitosamente'
        });
        
    } catch (error) {
        console.error('Error al eliminar comunicado:', error);
        res.status(500).json({ 
            success: false,
            error: 'Error al eliminar comunicado' 
        });
    }
});

// Obtener comunicados recientes con límite específico - VERSIÓN CORREGIDA
// Obtener comunicados recientes - SOLUCIÓN DEFINITIVA
router.get('/comunicados-recientes', async (req, res) => {
    try {
        // Obtener límite de query string
        const limitParam = req.query.limit;
        
        // Validación y conversión
        let limit = 5; // Valor por defecto
        
        if (limitParam !== undefined && limitParam !== null && limitParam !== '') {
            const parsed = parseInt(limitParam, 10);
            if (!isNaN(parsed) && parsed > 0) {
                limit = Math.min(parsed, 100); // Máximo 100 por seguridad
            }
        }
        
        console.log(`📢 Obteniendo ${limit} comunicados recientes...`);
        
        // CONSULTA DIRECTA - Evitamos parámetros preparados para LIMIT
        // Esto es seguro porque validamos manualmente que limit es un número
        const query = `
            SELECT c.*, 
                   su.username as publicado_por_nombre
            FROM comunicados c
            LEFT JOIN super_users su ON c.publicado_por_id = su.id
            WHERE c.estado = 'publicado'
            ORDER BY c.fecha_publicacion DESC
            LIMIT ${limit}
        `;
        
        const [comunicados] = await db.execute(query);
        
        console.log(`✅ Comunicados recientes encontrados: ${comunicados.length}`);
        
        res.json({ 
            success: true,
            data: comunicados,
            limit: limit
        });
        
    } catch (error) {
        console.error('❌ Error al obtener comunicados recientes:', error);
        
        // Respuesta de error más informativa
        res.status(500).json({ 
            success: false,
            error: 'Error al obtener comunicados',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Versión alternativa con query nativa (más compatible)
router.get('/comunicados-recientes-alt', async (req, res) => {
    try {
        const limitParam = req.query.limit || 5;
        const limit = Math.min(parseInt(limitParam) || 5, 100);
        
        console.log(`📢 Obteniendo ${limit} comunicados (método alternativo)...`);
        
        // Usar query en lugar de execute para evitar problemas con parámetros
        const sql = `
            SELECT c.*, 
                   su.username as publicado_por_nombre
            FROM comunicados c
            LEFT JOIN super_users su ON c.publicado_por_id = su.id
            WHERE c.estado = 'publicado'
            ORDER BY c.fecha_publicacion DESC
            LIMIT ${db.escape(limit)}
        `;
        
        const [comunicados] = await db.query(sql);
        
        res.json({ 
            success: true,
            data: comunicados,
            limit: limit
        });
        
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Error al obtener comunicados' 
        });
    }
});

// ========== CONFIGURACIÓN DE MULTER PARA TAREAS ==========
const tareasStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        const dir = 'uploads/tareas';
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        const filename = 'tarea-' + uniqueSuffix + ext;
        cb(null, filename);
    }
});

const uploadTareas = multer({
    storage: tareasStorage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB por archivo
        files: 5 // Máximo 5 archivos
    }
});

// ========== TAREAS (SUPER ADMIN) ==========

// Obtener todo el personal y directivos para asignaciones
router.get('/tareas/usuarios-disponibles', async (req, res) => {
    try {
        console.log('📋 Obteniendo personal disponible para asignar tareas...');
        
        // SOLO obtener personal, sin directivos
        const [personal] = await db.execute(`
            SELECT p.id, p.nombre_completo as nombre, 'personal' as tipo, 
                   p.puesto as cargo, dir.nombre as direccion_nombre
            FROM personal p
            LEFT JOIN direcciones dir ON p.direccion_id = dir.id
            ORDER BY p.nombre_completo
        `);
        
        console.log(`✅ Personal encontrado: ${personal.length} personas`);
        
        res.json({
            success: true,
            data: personal,
            metadata: {
                total: personal.length
            }
        });
        
    } catch (error) {
        console.error('❌ Error al obtener personal:', error);
        res.status(500).json({
            success: false,
            error: 'Error al obtener personal'
        });
    }
});

// Crear nueva tarea con asignaciones
router.post('/tareas', uploadTareas.array('archivos', 5), async (req, res) => {
    const connection = await db.getConnection();
    
    try {
        await connection.beginTransaction();
        
        const { 
            titulo, 
            descripcion,
            fecha_entrega,
            asignaciones // String JSON con las asignaciones
        } = req.body;
        
        const creado_por_id = req.body.creado_por_id;
        const creado_por_tipo = req.body.creado_por_tipo || 'superadmin';
        
        console.log('📝 Creando tarea:', { titulo, fecha_entrega });
        console.log('👥 Asignaciones recibidas:', asignaciones);
        
        // Validaciones básicas
        if (!titulo || !fecha_entrega || !creado_por_id || !asignaciones) {
            // Limpiar archivos si hay error
            if (req.files && req.files.length > 0) {
                req.files.forEach(file => fs.unlinkSync(file.path));
            }
            
            await connection.rollback();
            connection.release();
            
            return res.status(400).json({
                success: false,
                error: 'Todos los campos son requeridos'
            });
        }
        
        // Parsear asignaciones
        let asignacionesArray;
        try {
            asignacionesArray = JSON.parse(asignaciones);
            if (!Array.isArray(asignacionesArray) || asignacionesArray.length === 0) {
                throw new Error('Debe asignar al menos un usuario');
            }
        } catch (e) {
            // Limpiar archivos
            if (req.files && req.files.length > 0) {
                req.files.forEach(file => fs.unlinkSync(file.path));
            }
            
            await connection.rollback();
            connection.release();
            
            return res.status(400).json({
                success: false,
                error: 'Formato de asignaciones inválido'
            });
        }
        
        // Insertar tarea
        const [tareaResult] = await connection.execute(
            `INSERT INTO tareas 
            (titulo, descripcion, fecha_entrega, creado_por_id, creado_por_tipo) 
            VALUES (?, ?, ?, ?, ?)`,
            [titulo, descripcion || null, fecha_entrega, creado_por_id, creado_por_tipo]
        );
        
        const tareaId = tareaResult.insertId;
        
        // Insertar asignaciones
        for (const asig of asignacionesArray) {
            await connection.execute(
                `INSERT INTO tareas_asignaciones 
                (tarea_id, usuario_id, usuario_tipo, estado) 
                VALUES (?, ?, ?, 'pendiente')`,
                [tareaId, asig.usuario_id, asig.usuario_tipo]
            );
        }
        
        // Guardar archivos si existen
        if (req.files && req.files.length > 0) {
            for (const file of req.files) {
                await connection.execute(
                    `INSERT INTO tareas_archivos 
                    (tarea_id, nombre_original, nombre_archivo, ruta_archivo, tipo_mime, tamano) 
                    VALUES (?, ?, ?, ?, ?, ?)`,
                    [tareaId, file.originalname, file.filename, file.filename, file.mimetype, file.size]
                );
            }
        }
        
        // Registrar en historial
        await connection.execute(
            `INSERT INTO tareas_historial 
            (tarea_id, usuario_id, usuario_tipo, accion, descripcion) 
            VALUES (?, ?, ?, 'creada', ?)`,
            [tareaId, creado_por_id, creado_por_tipo, `Tarea creada con ${asignacionesArray.length} asignaciones`]
        );
        
        await connection.commit();
        connection.release();
        
        console.log(`✅ Tarea ${tareaId} creada exitosamente con ${req.files?.length || 0} archivos`);
        
        res.status(201).json({
            success: true,
            message: 'Tarea creada exitosamente',
            tareaId: tareaId,
            asignaciones: asignacionesArray.length,
            archivos: req.files?.length || 0
        });
        
    } catch (error) {
        await connection.rollback();
        connection.release();
        
        // Limpiar archivos si hay error
        if (req.files && req.files.length > 0) {
            req.files.forEach(file => {
                try { fs.unlinkSync(file.path); } catch (err) {}
            });
        }
        
        console.error('❌ Error al crear tarea:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Error al crear la tarea'
        });
    }
});

// Obtener todas las tareas (para Super Admin)
router.get('/tareas', async (req, res) => {
    try {
        console.log('📋 Obteniendo todas las tareas...');
        
        const [tareas] = await db.execute(`
            SELECT t.*,
                   CASE 
                     WHEN t.creado_por_tipo = 'superadmin' THEN su.username
                     WHEN t.creado_por_tipo = 'directivo' THEN d.nombre_completo
                     WHEN t.creado_por_tipo = 'personal' THEN p.nombre_completo
                   END as creado_por_nombre,
                   COUNT(DISTINCT ta.id) as total_asignaciones,
                   SUM(CASE WHEN ta.estado = 'completada' THEN 1 ELSE 0 END) as completadas,
                   SUM(CASE WHEN ta.estado = 'pendiente' THEN 1 ELSE 0 END) as pendientes,
                   SUM(CASE WHEN ta.estado = 'en_progreso' THEN 1 ELSE 0 END) as en_progreso
            FROM tareas t
            LEFT JOIN super_users su ON t.creado_por_id = su.id AND t.creado_por_tipo = 'superadmin'
            LEFT JOIN directivos d ON t.creado_por_id = d.id AND t.creado_por_tipo = 'directivo'
            LEFT JOIN personal p ON t.creado_por_id = p.id AND t.creado_por_tipo = 'personal'
            LEFT JOIN tareas_asignaciones ta ON t.id = ta.tarea_id
            GROUP BY t.id
            ORDER BY t.fecha_entrega ASC, t.fecha_creacion DESC
        `);
        
        // Para cada tarea, obtener asignaciones detalladas y archivos
        for (let tarea of tareas) {
            // Asignaciones con detalles de usuario
            const [asignaciones] = await db.execute(`
                SELECT ta.*,
                       CASE 
                         WHEN ta.usuario_tipo = 'directivo' THEN d.nombre_completo
                         WHEN ta.usuario_tipo = 'personal' THEN p.nombre_completo
                       END as usuario_nombre,
                       CASE 
                         WHEN ta.usuario_tipo = 'directivo' THEN d.cargo
                         WHEN ta.usuario_tipo = 'personal' THEN p.puesto
                       END as usuario_cargo,
                       dir.nombre as direccion_nombre
                FROM tareas_asignaciones ta
                LEFT JOIN directivos d ON ta.usuario_id = d.id AND ta.usuario_tipo = 'directivo'
                LEFT JOIN personal p ON ta.usuario_id = p.id AND ta.usuario_tipo = 'personal'
                LEFT JOIN direcciones dir ON 
                    (ta.usuario_tipo = 'directivo' AND d.direccion_id = dir.id) OR
                    (ta.usuario_tipo = 'personal' AND p.direccion_id = dir.id)
                WHERE ta.tarea_id = ?
                ORDER BY ta.estado, usuario_nombre
            `, [tarea.id]);
            
            tarea.asignaciones = asignaciones;
            
            // Archivos adjuntos
            const [archivos] = await db.execute(
                `SELECT * FROM tareas_archivos WHERE tarea_id = ?`,
                [tarea.id]
            );
            
            tarea.archivos = archivos.map(archivo => ({
                ...archivo,
                url: `http://strideutmat.com:5000/uploads/tareas/${archivo.ruta_archivo}`
            }));
            
            // Calcular progreso
            tarea.progreso = tarea.total_asignaciones > 0 
                ? Math.round((tarea.completadas / tarea.total_asignaciones) * 100) 
                : 0;
        }
        
        console.log(`✅ Tareas encontradas: ${tareas.length}`);
        
        res.json({
            success: true,
            data: tareas,
            total: tareas.length
        });
        
    } catch (error) {
        console.error('❌ Error al obtener tareas:', error);
        res.status(500).json({
            success: false,
            error: 'Error al obtener tareas'
        });
    }
});

// Obtener una tarea específica
router.get('/tareas/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const [tareas] = await db.execute(`
            SELECT t.*,
                   CASE 
                     WHEN t.creado_por_tipo = 'superadmin' THEN su.username
                     WHEN t.creado_por_tipo = 'directivo' THEN d.nombre_completo
                     WHEN t.creado_por_tipo = 'personal' THEN p.nombre_completo
                   END as creado_por_nombre
            FROM tareas t
            LEFT JOIN super_users su ON t.creado_por_id = su.id AND t.creado_por_tipo = 'superadmin'
            LEFT JOIN directivos d ON t.creado_por_id = d.id AND t.creado_por_tipo = 'directivo'
            LEFT JOIN personal p ON t.creado_por_id = p.id AND t.creado_por_tipo = 'personal'
            WHERE t.id = ?
        `, [id]);
        
        if (tareas.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Tarea no encontrada'
            });
        }
        
        const tarea = tareas[0];
        
        // Obtener asignaciones
        const [asignaciones] = await db.execute(`
            SELECT ta.*,
                   CASE 
                     WHEN ta.usuario_tipo = 'directivo' THEN d.nombre_completo
                     WHEN ta.usuario_tipo = 'personal' THEN p.nombre_completo
                   END as usuario_nombre,
                   CASE 
                     WHEN ta.usuario_tipo = 'directivo' THEN d.cargo
                     WHEN ta.usuario_tipo = 'personal' THEN p.puesto
                   END as usuario_cargo,
                   dir.nombre as direccion_nombre
            FROM tareas_asignaciones ta
            LEFT JOIN directivos d ON ta.usuario_id = d.id AND ta.usuario_tipo = 'directivo'
            LEFT JOIN personal p ON ta.usuario_id = p.id AND ta.usuario_tipo = 'personal'
            LEFT JOIN direcciones dir ON 
                (ta.usuario_tipo = 'directivo' AND d.direccion_id = dir.id) OR
                (ta.usuario_tipo = 'personal' AND p.direccion_id = dir.id)
            WHERE ta.tarea_id = ?
        `, [id]);
        
        tarea.asignaciones = asignaciones;
        
        // Obtener archivos
        const [archivos] = await db.execute(
            `SELECT * FROM tareas_archivos WHERE tarea_id = ?`,
            [id]
        );
        
        tarea.archivos = archivos.map(archivo => ({
            ...archivo,
            url: `http://strideutmat.com:5000/uploads/tareas/${archivo.ruta_archivo}`
        }));
        
        // Obtener historial
        const [historial] = await db.execute(`
            SELECT h.*,
                   CASE 
                     WHEN h.usuario_tipo = 'superadmin' THEN su.username
                     WHEN h.usuario_tipo = 'directivo' THEN d.nombre_completo
                     WHEN h.usuario_tipo = 'personal' THEN p.nombre_completo
                   END as usuario_nombre
            FROM tareas_historial h
            LEFT JOIN super_users su ON h.usuario_id = su.id AND h.usuario_tipo = 'superadmin'
            LEFT JOIN directivos d ON h.usuario_id = d.id AND h.usuario_tipo = 'directivo'
            LEFT JOIN personal p ON h.usuario_id = p.id AND h.usuario_tipo = 'personal'
            WHERE h.tarea_id = ?
            ORDER BY h.fecha DESC
        `, [id]);
        
        tarea.historial = historial;
        
        res.json({
            success: true,
            data: tarea
        });
        
    } catch (error) {
        console.error('Error al obtener tarea:', error);
        res.status(500).json({
            success: false,
            error: 'Error al obtener tarea'
        });
    }
});

// Actualizar estado de una asignación (para cuando el usuario complete)
router.put('/tareas/asignacion/:id', async (req, res) => {
    const connection = await db.getConnection();
    
    try {
        await connection.beginTransaction();
        
        const { id } = req.params;
        const { estado, comentarios, usuario_id, usuario_tipo } = req.body;
        
        // Verificar que la asignación existe
        const [asignaciones] = await connection.execute(
            'SELECT * FROM tareas_asignaciones WHERE id = ?',
            [id]
        );
        
        if (asignaciones.length === 0) {
            await connection.rollback();
            connection.release();
            return res.status(404).json({
                success: false,
                error: 'Asignación no encontrada'
            });
        }
        
        const asignacion = asignaciones[0];
        
        // Actualizar estado
        const fechaCompletado = estado === 'completada' ? new Date() : null;
        
        await connection.execute(
            `UPDATE tareas_asignaciones 
             SET estado = ?, comentarios = ?, fecha_completado = ? 
             WHERE id = ?`,
            [estado, comentarios || null, fechaCompletado, id]
        );
        
        // Registrar en historial
        await connection.execute(
            `INSERT INTO tareas_historial 
            (tarea_id, usuario_id, usuario_tipo, accion, descripcion) 
            VALUES (?, ?, ?, 'actualizacion', ?)`,
            [
                asignacion.tarea_id, 
                usuario_id || 1, 
                usuario_tipo || 'superadmin', 
                `Estado de asignación actualizado a: ${estado}`
            ]
        );
        
        await connection.commit();
        connection.release();
        
        res.json({
            success: true,
            message: 'Estado actualizado correctamente'
        });
        
    } catch (error) {
        await connection.rollback();
        connection.release();
        console.error('Error al actualizar asignación:', error);
        res.status(500).json({
            success: false,
            error: 'Error al actualizar estado'
        });
    }
});

// Eliminar tarea
router.delete('/tareas/:id', async (req, res) => {
    const connection = await db.getConnection();
    
    try {
        await connection.beginTransaction();
        
        const { id } = req.params;
        
        // Obtener archivos para eliminarlos
        const [archivos] = await connection.execute(
            'SELECT * FROM tareas_archivos WHERE tarea_id = ?',
            [id]
        );
        
        // Eliminar archivos físicos
        for (const archivo of archivos) {
            try {
                const filePath = path.join('uploads/tareas', archivo.ruta_archivo);
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            } catch (err) {
                console.error('Error eliminando archivo:', err);
            }
        }
        
        // Eliminar tarea (las demás tablas se eliminan por CASCADE)
        const [result] = await connection.execute(
            'DELETE FROM tareas WHERE id = ?',
            [id]
        );
        
        if (result.affectedRows === 0) {
            await connection.rollback();
            connection.release();
            return res.status(404).json({
                success: false,
                error: 'Tarea no encontrada'
            });
        }
        
        await connection.commit();
        connection.release();
        
        res.json({
            success: true,
            message: 'Tarea eliminada exitosamente',
            archivosEliminados: archivos.length
        });
        
    } catch (error) {
        await connection.rollback();
        connection.release();
        console.error('Error al eliminar tarea:', error);
        res.status(500).json({
            success: false,
            error: 'Error al eliminar tarea'
        });
    }
});

// Servir archivos de tareas
router.get('/tareas/archivo/:filename', (req, res) => {
    try {
        const { filename } = req.params;
        const filePath = path.join('uploads/tareas', filename);
        
        if (fs.existsSync(filePath)) {
            res.sendFile(path.resolve(filePath));
        } else {
            res.status(404).json({ error: 'Archivo no encontrado' });
        }
    } catch (error) {
        console.error('Error al servir archivo:', error);
        res.status(500).json({ error: 'Error al cargar el archivo' });
    }
});

// ========== RUTAS PARA PERSONAL (TAREAS) ==========

// Obtener tareas asignadas a un personal específico
router.get('/tareas/personal/:personalId', async (req, res) => {
  try {
    const { personalId } = req.params;
    
    console.log(`📋 Obteniendo tareas para personal ID: ${personalId}`);
    
    const [tareas] = await db.execute(`
      SELECT 
        t.*,
        ta.id as asignacion_id,
        ta.estado as asignacion_estado,
        ta.comentarios as asignacion_comentarios,
        ta.fecha_completado,
        CASE 
          WHEN t.creado_por_tipo = 'superadmin' THEN su.username
          WHEN t.creado_por_tipo = 'directivo' THEN d.nombre_completo
          WHEN t.creado_por_tipo = 'personal' THEN p.nombre_completo
        END as creado_por_nombre
      FROM tareas t
      INNER JOIN tareas_asignaciones ta ON t.id = ta.tarea_id
      LEFT JOIN super_users su ON t.creado_por_id = su.id AND t.creado_por_tipo = 'superadmin'
      LEFT JOIN directivos d ON t.creado_por_id = d.id AND t.creado_por_tipo = 'directivo'
      LEFT JOIN personal p ON t.creado_por_id = p.id AND t.creado_por_tipo = 'personal'
      WHERE ta.usuario_id = ? AND ta.usuario_tipo = 'personal'
      ORDER BY 
        CASE 
          WHEN ta.estado IN ('pendiente', 'en_progreso') THEN 1
          ELSE 2
        END,
        t.fecha_entrega ASC
    `, [personalId]);
    
    // Para cada tarea, obtener sus archivos
    for (let tarea of tareas) {
      const [archivos] = await db.execute(
        `SELECT * FROM tareas_archivos WHERE tarea_id = ?`,
        [tarea.id]
      );
      
      tarea.archivos = archivos.map(archivo => ({
        ...archivo,
        url: `http://strideutmat.com:5000/uploads/tareas/${archivo.ruta_archivo}`
      }));
      
      // Calcular días restantes
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);
      const entrega = new Date(tarea.fecha_entrega);
      entrega.setHours(0, 0, 0, 0);
      const diffTime = entrega - hoy;
      tarea.dias_restantes = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }
    
    res.json({
      success: true,
      data: tareas
    });
    
  } catch (error) {
    console.error('Error al obtener tareas del personal:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener tareas'
    });
  }
});

// Completar una tarea (con descripción y/o archivos)
router.post('/tareas/completar/:asignacionId', uploadTareas.array('archivos', 5), async (req, res) => {
  const connection = await db.getConnection();
  
  try {
    await connection.beginTransaction();
    
    const { asignacionId } = req.params;
    const { comentarios } = req.body;
    
    console.log('✅ Completando tarea:', { asignacionId, comentarios });
    
    // Validar que haya al menos comentarios o archivos
    if (!comentarios?.trim() && (!req.files || req.files.length === 0)) {
      await connection.rollback();
      connection.release();
      
      if (req.files && req.files.length > 0) {
        req.files.forEach(file => fs.unlinkSync(file.path));
      }
      
      return res.status(400).json({
        success: false,
        error: 'Debes agregar una descripción o un archivo para completar la tarea'
      });
    }
    
    // Verificar que la asignación existe
    const [asignaciones] = await connection.execute(
      `SELECT ta.*, t.titulo 
       FROM tareas_asignaciones ta
       INNER JOIN tareas t ON ta.tarea_id = t.id
       WHERE ta.id = ?`,
      [asignacionId]
    );
    
    if (asignaciones.length === 0) {
      await connection.rollback();
      connection.release();
      
      if (req.files && req.files.length > 0) {
        req.files.forEach(file => fs.unlinkSync(file.path));
      }
      
      return res.status(404).json({
        success: false,
        error: 'Asignación no encontrada'
      });
    }
    
    const asignacion = asignaciones[0];
    
    // Actualizar la asignación
    await connection.execute(
      `UPDATE tareas_asignaciones 
       SET estado = 'completada', 
           comentarios = ?, 
           fecha_completado = NOW() 
       WHERE id = ?`,
      [comentarios || null, asignacionId]
    );
    
    // Guardar archivos si existen
    let archivosGuardados = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const [result] = await connection.execute(
          `INSERT INTO tareas_archivos 
           (tarea_id, nombre_original, nombre_archivo, ruta_archivo, tipo_mime, tamano) 
           VALUES (?, ?, ?, ?, ?, ?)`,
          [asignacion.tarea_id, file.originalname, file.filename, file.filename, file.mimetype, file.size]
        );
        archivosGuardados.push({
          id: result.insertId,
          nombre: file.originalname
        });
      }
    }
    
    // Registrar en historial
    await connection.execute(
      `INSERT INTO tareas_historial 
       (tarea_id, usuario_id, usuario_tipo, accion, descripcion) 
       VALUES (?, ?, 'personal', 'completada', ?)`,
      [asignacion.tarea_id, asignacion.usuario_id, 
       `Tarea completada${comentarios ? ' con comentarios' : ''}${req.files?.length > 0 ? ' y ' + req.files.length + ' archivo(s)' : ''}`
      ]
    );
    
    await connection.commit();
    connection.release();
    
    res.json({
      success: true,
      message: '¡Felicidades! Tarea completada exitosamente',
      data: {
        tarea: asignacion.titulo,
        comentarios: comentarios || null,
        archivos: archivosGuardados.length
      }
    });
    
  } catch (error) {
    await connection.rollback();
    connection.release();
    
    if (req.files && req.files.length > 0) {
      req.files.forEach(file => {
        try { fs.unlinkSync(file.path); } catch (err) {}
      });
    }
    
    console.error('Error al completar tarea:', error);
    res.status(500).json({
      success: false,
      error: 'Error al completar la tarea'
    });
  }
});

// Obtener conteo de tareas pendientes para el badge
router.get('/tareas/personal/:personalId/conteo', async (req, res) => {
  try {
    const { personalId } = req.params;
    
    const [result] = await db.execute(`
      SELECT COUNT(*) as pendientes
      FROM tareas_asignaciones ta
      WHERE ta.usuario_id = ? 
        AND ta.usuario_tipo = 'personal'
        AND ta.estado IN ('pendiente', 'en_progreso')
    `, [personalId]);
    
    res.json({
      success: true,
      data: {
        pendientes: result[0].pendientes
      }
    });
    
  } catch (error) {
    console.error('Error al obtener conteo:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener conteo'
    });
  }
});

// Editar tarea (Super Admin)
router.put('/tareas/:id', uploadTareas.array('archivos', 5), async (req, res) => {
  const connection = await db.getConnection();
  
  try {
    await connection.beginTransaction();
    
    const { id } = req.params;
    const { 
      titulo, 
      descripcion,
      fecha_entrega,
      asignaciones // JSON con nuevas asignaciones
    } = req.body;
    
    console.log('📝 Editando tarea:', id);
    
    // 1. Actualizar datos básicos de la tarea
    await connection.execute(
      `UPDATE tareas 
       SET titulo = ?, descripcion = ?, fecha_entrega = ?
       WHERE id = ?`,
      [titulo, descripcion || null, fecha_entrega, id]
    );
    
    // 2. Si hay nuevas asignaciones, actualizar
    if (asignaciones) {
      const nuevasAsignaciones = JSON.parse(asignaciones);
      
      // Eliminar asignaciones actuales
      await connection.execute(
        'DELETE FROM tareas_asignaciones WHERE tarea_id = ?',
        [id]
      );
      
      // Insertar nuevas asignaciones
      for (const asig of nuevasAsignaciones) {
        await connection.execute(
          `INSERT INTO tareas_asignaciones 
           (tarea_id, usuario_id, usuario_tipo, estado) 
           VALUES (?, ?, ?, 'pendiente')`,
          [id, asig.usuario_id, asig.usuario_tipo]
        );
      }
    }
    
    // 3. Si hay nuevos archivos, agregarlos
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        await connection.execute(
          `INSERT INTO tareas_archivos 
           (tarea_id, nombre_original, nombre_archivo, ruta_archivo, tipo_mime, tamano) 
           VALUES (?, ?, ?, ?, ?, ?)`,
          [id, file.originalname, file.filename, file.filename, file.mimetype, file.size]
        );
      }
    }
    
    await connection.commit();
    connection.release();
    
    res.json({
      success: true,
      message: 'Tarea actualizada exitosamente'
    });
    
  } catch (error) {
    await connection.rollback();
    connection.release();
    
    console.error('Error editando tarea:', error);
    res.status(500).json({
      success: false,
      error: 'Error al editar la tarea'
    });
  }
});

// Eliminar archivo de tarea
router.delete('/tareas/archivo/:archivoId', async (req, res) => {
  try {
    const { archivoId } = req.params;
    
    // Obtener info del archivo
    const [archivos] = await db.execute(
      'SELECT * FROM tareas_archivos WHERE id = ?',
      [archivoId]
    );
    
    if (archivos.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Archivo no encontrado'
      });
    }
    
    const archivo = archivos[0];
    
    // Eliminar archivo físico
    const filePath = path.join('uploads/tareas', archivo.ruta_archivo);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    
    // Eliminar registro
    await db.execute(
      'DELETE FROM tareas_archivos WHERE id = ?',
      [archivoId]
    );
    
    res.json({
      success: true,
      message: 'Archivo eliminado'
    });
    
  } catch (error) {
    console.error('Error eliminando archivo:', error);
    res.status(500).json({
      success: false,
      error: 'Error al eliminar archivo'
    });
  }
});

// ========== EDITAR Y ELIMINAR DIRECTIVOS ==========

// Editar directivo
router.put('/directivos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre_completo, cargo, direccion_id, email, password } = req.body;

        if (!nombre_completo || !cargo || !direccion_id || !email) {
            return res.status(400).json({
                success: false,
                error: 'Nombre, cargo, dirección y email son requeridos'
            });
        }

        // Si se envía nueva contraseña, hashearla
        let updateQuery;
        let updateParams;

        if (password && password.trim() !== '') {
            const hashedPassword = await bcrypt.hash(password, 10);
            updateQuery = `UPDATE directivos SET nombre_completo = ?, cargo = ?, direccion_id = ?, email = ?, password = ? WHERE id = ?`;
            updateParams = [nombre_completo, cargo, direccion_id, email, hashedPassword, id];
        } else {
            updateQuery = `UPDATE directivos SET nombre_completo = ?, cargo = ?, direccion_id = ?, email = ? WHERE id = ?`;
            updateParams = [nombre_completo, cargo, direccion_id, email, id];
        }

        const [result] = await db.execute(updateQuery, updateParams);

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, error: 'Directivo no encontrado' });
        }

        res.json({ success: true, message: 'Directivo actualizado exitosamente' });

    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ success: false, error: 'El email ya está registrado' });
        }
        console.error('Error al editar directivo:', error);
        res.status(500).json({ success: false, error: 'Error al editar el directivo' });
    }
});

// Eliminar directivo
router.delete('/directivos/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const [directivos] = await db.execute('SELECT * FROM directivos WHERE id = ?', [id]);
        if (directivos.length === 0) {
            return res.status(404).json({ success: false, error: 'Directivo no encontrado' });
        }

        await db.execute('DELETE FROM directivos WHERE id = ?', [id]);

        res.json({ success: true, message: 'Directivo eliminado exitosamente' });

    } catch (error) {
        console.error('Error al eliminar directivo:', error);
        res.status(500).json({ success: false, error: 'Error al eliminar el directivo' });
    }
});

// ========== EDITAR Y ELIMINAR PERSONAL ==========

// Editar personal (con opción de cambiar foto)
router.put('/personal/:id', uploadPersonal.single('foto'), async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre_completo, puesto, direccion_id, email, password } = req.body;

        if (!nombre_completo || !puesto || !direccion_id || !email) {
            if (req.file) fs.unlinkSync(req.file.path);
            return res.status(400).json({
                success: false,
                error: 'Nombre, puesto, dirección y email son requeridos'
            });
        }

        // Obtener personal actual para ver si tiene foto
        const [personalActual] = await db.execute('SELECT * FROM personal WHERE id = ?', [id]);
        if (personalActual.length === 0) {
            if (req.file) fs.unlinkSync(req.file.path);
            return res.status(404).json({ success: false, error: 'Personal no encontrado' });
        }

        const persona = personalActual[0];
        let nuevaFoto = persona.foto_perfil; // Mantener foto actual por defecto

<<<<<<< HEAD
        // Si se subió nueva foto, reemplazar con versión comprimida
=======
        // Si se subió nueva foto, reemplazar
>>>>>>> c86f75758cebfb13d4dd1ad7a1c4364ad2ed5179
        if (req.file) {
            // Eliminar foto anterior si existe
            if (persona.foto_perfil) {
                const fotoAnterior = path.join('uploads/personal', persona.foto_perfil);
                if (fs.existsSync(fotoAnterior)) {
                    fs.unlinkSync(fotoAnterior);
                }
            }
<<<<<<< HEAD
            // Comprimir nueva foto
            try {
                const compressedFilename = 'c-' + req.file.filename.replace(/\.[^.]+$/, '') + '.jpg';
                const compressedPath = path.join('uploads/personal', compressedFilename);
                await sharp(req.file.path)
                    .resize(300, 300, { fit: 'cover' })
                    .jpeg({ quality: 80 })
                    .toFile(compressedPath);
                fs.unlinkSync(req.file.path);
                nuevaFoto = compressedFilename;
            } catch (sharpError) {
                console.error('Error comprimiendo foto:', sharpError);
                nuevaFoto = req.file.filename; // usar original si falla
            }
=======
            nuevaFoto = req.file.filename;
>>>>>>> c86f75758cebfb13d4dd1ad7a1c4364ad2ed5179
        }

        // Construir query según si se cambia contraseña
        let updateQuery;
        let updateParams;

        if (password && password.trim() !== '') {
            const hashedPassword = await bcrypt.hash(password, 10);
            updateQuery = `UPDATE personal SET nombre_completo = ?, puesto = ?, direccion_id = ?, email = ?, password = ?, foto_perfil = ? WHERE id = ?`;
            updateParams = [nombre_completo, puesto, direccion_id, email, hashedPassword, nuevaFoto, id];
        } else {
            updateQuery = `UPDATE personal SET nombre_completo = ?, puesto = ?, direccion_id = ?, email = ?, foto_perfil = ? WHERE id = ?`;
            updateParams = [nombre_completo, puesto, direccion_id, email, nuevaFoto, id];
        }

        await db.execute(updateQuery, updateParams);

        res.json({ success: true, message: 'Personal actualizado exitosamente' });

    } catch (error) {
        if (req.file) {
            try { fs.unlinkSync(req.file.path); } catch (e) {}
        }
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ success: false, error: 'El email ya está registrado' });
        }
        console.error('Error al editar personal:', error);
        res.status(500).json({ success: false, error: 'Error al editar el personal' });
    }
});

// Eliminar personal
router.delete('/personal/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const [personalList] = await db.execute('SELECT * FROM personal WHERE id = ?', [id]);
        if (personalList.length === 0) {
            return res.status(404).json({ success: false, error: 'Personal no encontrado' });
        }

        const persona = personalList[0];

        // Eliminar foto si existe
        if (persona.foto_perfil) {
            const fotoPath = path.join('uploads/personal', persona.foto_perfil);
            if (fs.existsSync(fotoPath)) {
                fs.unlinkSync(fotoPath);
            }
        }

        await db.execute('DELETE FROM personal WHERE id = ?', [id]);

        res.json({ success: true, message: 'Personal eliminado exitosamente' });

    } catch (error) {
        console.error('Error al eliminar personal:', error);
        res.status(500).json({ success: false, error: 'Error al eliminar el personal' });
    }
});

<<<<<<< HEAD
module.exports = router;
=======
module.exports = router;
>>>>>>> c86f75758cebfb13d4dd1ad7a1c4364ad2ed5179
