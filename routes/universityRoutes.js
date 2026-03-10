const express = require('express');
const router = express.Router();
const db = require('../config/database');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// ========== CONFIGURACIÓN DE MULTER ==========

const uploadDir = 'uploads/actividades';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

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
        fileSize: 5 * 1024 * 1024,
        files: 5
    }
});

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
        fileSize: 2 * 1024 * 1024,
    }
});

// ========== RUTAS BÁSICAS PARA SUPER USERS ==========

router.post('/create-superuser', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        if (!username || !email || !password) {
            return res.status(400).json({ success: false, error: 'Todos los campos son obligatorios' });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const [result] = await db.execute(
            'INSERT INTO super_users (username, email, password) VALUES (?, ?, ?)',
            [username, email, hashedPassword]
        );
        res.status(201).json({ success: true, message: 'Super usuario creado exitosamente', userId: result.insertId });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ success: false, error: 'El usuario o email ya existe' });
        }
        console.error('Error al crear super user:', error);
        res.status(500).json({ success: false, error: 'Error al crear el usuario' });
    }
});

router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        console.log('🔐 Intento de login para:', email);
        if (!email || !password) {
            return res.status(400).json({ success: false, error: 'Email y contraseña son requeridos' });
        }
        const [users] = await db.execute('SELECT * FROM super_users WHERE email = ?', [email]);
        console.log('👤 Usuarios encontrados:', users.length);
        if (users.length === 0) {
            return res.status(401).json({ success: false, error: 'Credenciales inválidas' });
        }
        const user = users[0];
        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            return res.status(401).json({ success: false, error: 'Credenciales inválidas' });
        }
        const userResponse = {
            id: user.id, username: user.username, email: user.email,
            tipo: 'superadmin', created_at: user.created_at
        };
        console.log('✅ Login exitoso para:', user.email);
        res.json({ success: true, message: 'Login exitoso', user: userResponse });
    } catch (error) {
        console.error('Error en login:', error);
        res.status(500).json({ success: false, error: 'Error en el servidor' });
    }
});

router.post('/login-general', async (req, res) => {
    try {
        const { email, password } = req.body;
        console.log('🔐 Login general para:', email);
        if (!email || !password) {
            return res.status(400).json({ success: false, error: 'Email y contraseña son requeridos' });
        }
        let user = null;
        let userType = null;
        const [superUsers] = await db.execute('SELECT * FROM super_users WHERE email = ?', [email]);
        if (superUsers.length > 0) {
            const superUser = superUsers[0];
            const isValidPassword = await bcrypt.compare(password, superUser.password);
            if (isValidPassword) {
                user = { id: superUser.id, nombre: superUser.username, username: superUser.username, email: superUser.email, tipo: 'superadmin', userType: 'superadmin' };
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
                    user = { id: directivo.id, nombre: directivo.nombre_completo, username: directivo.nombre_completo, email: directivo.email, cargo: directivo.cargo, direccion_id: directivo.direccion_id, direccion_nombre: directivo.direccion_nombre, tipo: 'directivo', userType: 'directivo' };
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
                    user = { id: personalUser.id, nombre: personalUser.nombre_completo, username: personalUser.nombre_completo, email: personalUser.email, puesto: personalUser.puesto, direccion_id: personalUser.direccion_id, direccion_nombre: personalUser.direccion_nombre, tipo: 'personal', userType: 'personal' };
                    userType = 'personal';
                }
            }
        }
        if (!user) {
            return res.status(401).json({ success: false, error: 'Credenciales inválidas' });
        }
        console.log('✅ Login exitoso para:', user.email, 'Tipo:', userType);
        res.json({ success: true, message: 'Login exitoso', user: user, userType: userType });
    } catch (error) {
        console.error('Error en login general:', error);
        res.status(500).json({ success: false, error: 'Error en el servidor' });
    }
});

router.get('/superusers', async (req, res) => {
    try {
        const [users] = await db.execute('SELECT id, username, email, created_at FROM super_users ORDER BY created_at DESC');
        res.json({ success: true, data: users });
    } catch (error) {
        console.error('Error al obtener usuarios:', error);
        res.status(500).json({ success: false, error: 'Error al obtener usuarios' });
    }
});

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

// ========== DIRECCIONES ==========

router.get('/direcciones', async (req, res) => {
    try {
        const [direcciones] = await db.execute('SELECT * FROM direcciones ORDER BY nombre');
        res.json({ success: true, data: direcciones });
    } catch (error) {
        console.error('Error al obtener direcciones:', error);
        res.status(500).json({ success: false, error: 'Error al obtener direcciones' });
    }
});

router.post('/direcciones', async (req, res) => {
    try {
        const { nombre } = req.body;
        if (!nombre) {
            return res.status(400).json({ success: false, error: 'El nombre es requerido' });
        }
        const [result] = await db.execute('INSERT INTO direcciones (nombre) VALUES (?)', [nombre]);
        res.status(201).json({ success: true, message: 'Dirección creada exitosamente', direccionId: result.insertId });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ success: false, error: 'Esta dirección ya existe' });
        }
        console.error('Error al crear dirección:', error);
        res.status(500).json({ success: false, error: 'Error al crear la dirección' });
    }
});

// ========== DIRECTIVOS ==========

router.get('/directivos', async (req, res) => {
    try {
        const [directivos] = await db.execute(
            'SELECT d.*, dir.nombre as direccion_nombre FROM directivos d LEFT JOIN direcciones dir ON d.direccion_id = dir.id ORDER BY d.nombre_completo'
        );
        res.json({ success: true, data: directivos });
    } catch (error) {
        console.error('Error al obtener directivos:', error);
        res.status(500).json({ success: false, error: 'Error al obtener directivos' });
    }
});

router.post('/directivos', async (req, res) => {
    try {
        const { nombre_completo, cargo, direccion_id, email, password } = req.body;
        if (!nombre_completo || !cargo || !direccion_id || !email || !password) {
            return res.status(400).json({ success: false, error: 'Todos los campos son requeridos' });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const [result] = await db.execute(
            'INSERT INTO directivos (nombre_completo, cargo, direccion_id, email, password) VALUES (?, ?, ?, ?, ?)',
            [nombre_completo, cargo, direccion_id, email, hashedPassword]
        );
        res.status(201).json({ success: true, message: 'Directivo creado exitosamente', directivoId: result.insertId });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ success: false, error: 'El email ya está registrado' });
        }
        console.error('Error al crear directivo:', error);
        res.status(500).json({ success: false, error: 'Error al crear el directivo' });
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
        const personalConFotos = personal.map(persona => {
            const fotoUrl = persona.foto_perfil
                ? `http://strideutmat.com:5000/api/university/personal/foto/${persona.foto_perfil}`
                : `http://strideutmat.com:5000/api/university/personal/foto/default-avatar.png`;
            return { ...persona, foto_url: fotoUrl };
        });
        res.json({ success: true, data: personalConFotos, metadata: { total: personalConFotos.length, conFoto: personal.filter(p => p.foto_perfil).length, sinFoto: personal.filter(p => !p.foto_perfil).length } });
    } catch (error) {
        console.error('❌ Error al obtener personal:', error);
        res.status(500).json({ success: false, error: 'Error al obtener personal' });
    }
});

router.get('/personal/debug-fotos', async (req, res) => {
    try {
        const [personal] = await db.execute('SELECT id, nombre_completo, foto_perfil FROM personal ORDER BY id');
        const resultados = [];
        for (const persona of personal) {
            let existeArchivo = false;
            let rutaArchivo = '';
            if (persona.foto_perfil) {
                rutaArchivo = path.join('uploads/personal', persona.foto_perfil);
                existeArchivo = fs.existsSync(rutaArchivo);
            }
            resultados.push({ id: persona.id, nombre: persona.nombre_completo, foto_perfil: persona.foto_perfil, existe_archivo: existeArchivo, ruta: rutaArchivo, url: persona.foto_perfil ? `http://strideutmat.com:5000/api/university/personal/foto/${persona.foto_perfil}` : 'Sin foto' });
        }
        res.json({ success: true, data: resultados, carpeta: path.resolve('uploads/personal'), archivos_en_carpeta: fs.existsSync('uploads/personal') ? fs.readdirSync('uploads/personal') : 'Carpeta no existe' });
    } catch (error) {
        console.error('Error en debug:', error);
        res.status(500).json({ error: error.message });
    }
});

router.get('/personal/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const [personal] = await db.execute(
            `SELECT p.*, dir.nombre as direccion_nombre FROM personal p LEFT JOIN direcciones dir ON p.direccion_id = dir.id WHERE p.id = ?`,
            [id]
        );
        if (personal.length === 0) {
            return res.status(404).json({ success: false, error: 'Personal no encontrado' });
        }
        const persona = personal[0];
        const personaConFoto = { ...persona, foto_url: persona.foto_perfil ? `http://strideutmat.com:5000/api/university/personal/foto/${persona.foto_perfil}` : null };
        res.json({ success: true, data: personaConFoto });
    } catch (error) {
        console.error('Error al obtener personal:', error);
        res.status(500).json({ success: false, error: 'Error al obtener personal' });
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

router.post('/personal', uploadPersonal.single('foto'), async (req, res) => {
    try {
        console.log('📝 Cuerpo recibido:', req.body);
        console.log('📸 Archivo recibido:', req.file);
        if (!req.body || Object.keys(req.body).length === 0) {
            return res.status(400).json({ success: false, error: 'Los datos deben enviarse como JSON o form-urlencoded' });
        }
        const { nombre_completo, puesto, direccion_id, email, password } = req.body;
        const foto = req.file;
        if (!nombre_completo || !puesto || !direccion_id || !email || !password) {
            if (foto) { try { fs.unlinkSync(foto.path); } catch (err) {} }
            return res.status(400).json({ success: false, error: 'Todos los campos son requeridos', campos_recibidos: { nombre_completo, puesto, direccion_id, email } });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const [result] = await db.execute(
            'INSERT INTO personal (nombre_completo, puesto, direccion_id, email, password, foto_perfil) VALUES (?, ?, ?, ?, ?, ?)',
            [nombre_completo, puesto, direccion_id, email, hashedPassword, foto ? foto.filename : null]
        );
        res.status(201).json({ success: true, message: 'Personal creado exitosamente', personalId: result.insertId, tieneFoto: !!foto });
    } catch (error) {
        if (req.file) { try { fs.unlinkSync(req.file.path); } catch (err) {} }
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ success: false, error: 'El email ya está registrado' });
        }
        console.error('Error al crear personal:', error);
        res.status(500).json({ success: false, error: 'Error al crear el personal', detalle: error.message });
    }
});

// ========== ACTIVIDADES CON IMÁGENES ==========

router.post('/actividades', upload.array('imagenes', 5), async (req, res) => {
    try {
        const { titulo, descripcion, tipo_actividad, fecha_inicio, fecha_fin, direccion_id, creado_por_id, creado_por_tipo } = req.body;
        console.log('📝 Datos recibidos:', { titulo, descripcion, tipo_actividad, fecha_inicio, fecha_fin, direccion_id, creado_por_id, creado_por_tipo });
        console.log('📸 Archivos recibidos:', req.files ? req.files.length : 0);
        if (!titulo || !tipo_actividad || !fecha_inicio || !direccion_id || !creado_por_id || !creado_por_tipo) {
            if (req.files && req.files.length > 0) {
                req.files.forEach(file => { try { fs.unlinkSync(file.path); } catch (err) {} });
            }
            return res.status(400).json({ success: false, error: 'Título, tipo de actividad, fecha de inicio, dirección, creador y tipo son requeridos' });
        }
        if (fecha_fin && new Date(fecha_fin) < new Date(fecha_inicio)) {
            if (req.files && req.files.length > 0) {
                req.files.forEach(file => { try { fs.unlinkSync(file.path); } catch (err) {} });
            }
            return res.status(400).json({ success: false, error: 'La fecha de fin no puede ser anterior a la fecha de inicio' });
        }
        const [result] = await db.execute(
            `INSERT INTO actividades (titulo, descripcion, tipo_actividad, fecha_inicio, fecha_fin, direccion_id, creado_por_id, creado_por_tipo, estado) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pendiente')`,
            [titulo, descripcion || null, tipo_actividad, fecha_inicio, fecha_fin || null, direccion_id, creado_por_id, creado_por_tipo]
        );
        const actividadId = result.insertId;
        if (req.files && req.files.length > 0) {
            for (const file of req.files) {
                await db.execute(
                    `INSERT INTO actividad_imagenes (actividad_id, nombre_archivo, ruta_archivo, tipo_mime, tamano) VALUES (?, ?, ?, ?, ?)`,
                    [actividadId, file.originalname, file.filename, file.mimetype, file.size]
                );
            }
        }
        res.status(201).json({ success: true, message: 'Actividad creada exitosamente', actividadId: actividadId, imagenesCount: req.files ? req.files.length : 0 });
    } catch (error) {
        console.error('❌ Error al crear actividad:', error);
        if (req.files && req.files.length > 0) {
            req.files.forEach(file => { try { fs.unlinkSync(file.path); } catch (err) {} });
        }
        res.status(500).json({ success: false, error: error.message || 'Error al crear la actividad' });
    }
});

// ✅ RUTA ESPECÍFICA PRIMERO: Actualizar estado de actividad
router.put('/actividades/:id/estado', async (req, res) => {
    try {
        const { id } = req.params;
        const { estado } = req.body;

        const estadosValidos = ['pendiente', 'en_progreso', 'completada'];
        if (!estado || !estadosValidos.includes(estado)) {
            return res.status(400).json({ success: false, error: 'Estado inválido' });
        }

        const [result] = await db.execute('UPDATE actividades SET estado = ? WHERE id = ?', [estado, id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, error: 'Actividad no encontrada' });
        }

        res.json({ success: true, message: 'Estado actualizado', affectedRows: result.affectedRows });
    } catch (error) {
        console.error('Error al actualizar estado:', error);
        res.status(500).json({ success: false, error: 'Error al actualizar estado' });
    }
});

// ✅ RUTA GENERAL DESPUÉS: Editar actividad (solo el creador)
router.put('/actividades/:id', upload.array('imagenes', 5), async (req, res) => {
    try {
        const { id } = req.params;
        const { titulo, descripcion, tipo_actividad, fecha_inicio, fecha_fin, creado_por_id } = req.body;

        console.log('✏️ Editando actividad ID:', id);

        if (!titulo || !tipo_actividad || !fecha_inicio) {
            if (req.files && req.files.length > 0) {
                req.files.forEach(file => { try { fs.unlinkSync(file.path); } catch (err) {} });
            }
            return res.status(400).json({ success: false, error: 'Título, tipo de actividad y fecha de inicio son requeridos' });
        }

        const [actividades] = await db.execute(
            'SELECT * FROM actividades WHERE id = ?',
            [id]
        );

        if (actividades.length === 0) {
            if (req.files && req.files.length > 0) {
                req.files.forEach(file => { try { fs.unlinkSync(file.path); } catch (err) {} });
            }
            return res.status(404).json({ success: false, error: 'Actividad no encontrada' });
        }

        const actividad = actividades[0];

        if (String(actividad.creado_por_id) !== String(creado_por_id)) {
            if (req.files && req.files.length > 0) {
                req.files.forEach(file => { try { fs.unlinkSync(file.path); } catch (err) {} });
            }
            return res.status(403).json({ success: false, error: 'No tienes permiso para editar esta actividad' });
        }

        if (fecha_fin && new Date(fecha_fin) < new Date(fecha_inicio)) {
            if (req.files && req.files.length > 0) {
                req.files.forEach(file => { try { fs.unlinkSync(file.path); } catch (err) {} });
            }
            return res.status(400).json({ success: false, error: 'La fecha de fin no puede ser anterior a la fecha de inicio' });
        }

        await db.execute(
            `UPDATE actividades SET titulo = ?, descripcion = ?, tipo_actividad = ?, fecha_inicio = ?, fecha_fin = ? WHERE id = ?`,
            [titulo, descripcion || null, tipo_actividad, fecha_inicio, fecha_fin || null, id]
        );

        let imagenesAgregadas = 0;
        if (req.files && req.files.length > 0) {
            const [imagenesActuales] = await db.execute(
                'SELECT COUNT(*) as total FROM actividad_imagenes WHERE actividad_id = ?',
                [id]
            );
            const totalActual = imagenesActuales[0].total;
            const espacioDisponible = 5 - totalActual;

            if (req.files.length > espacioDisponible) {
                req.files.forEach(file => { try { fs.unlinkSync(file.path); } catch (err) {} });
                return res.status(400).json({
                    success: false,
                    error: `Solo puedes agregar ${espacioDisponible} imagen(es) más. Ya tienes ${totalActual} de 5.`
                });
            }

            for (const file of req.files) {
                await db.execute(
                    `INSERT INTO actividad_imagenes (actividad_id, nombre_archivo, ruta_archivo, tipo_mime, tamano) VALUES (?, ?, ?, ?, ?)`,
                    [id, file.originalname, file.filename, file.mimetype, file.size]
                );
                imagenesAgregadas++;
            }
        }

        console.log(`✅ Actividad ${id} editada exitosamente`);

        res.json({
            success: true,
            message: 'Actividad actualizada exitosamente',
            actividadId: id,
            imagenesAgregadas: imagenesAgregadas
        });

    } catch (error) {
        console.error('❌ Error al editar actividad:', error);
        if (req.files && req.files.length > 0) {
            req.files.forEach(file => { try { fs.unlinkSync(file.path); } catch (err) {} });
        }
        res.status(500).json({ success: false, error: error.message || 'Error al editar la actividad' });
    }
});

// ✅ RUTA ESPECÍFICA PRIMERO: Eliminar imagen individual
router.delete('/actividades/imagen/:imagenId', async (req, res) => {
    try {
        const { imagenId } = req.params;
        const { creado_por_id } = req.body;

        console.log('🗑️ Eliminando imagen ID:', imagenId);

        const [imagenes] = await db.execute(
            'SELECT ai.*, a.creado_por_id FROM actividad_imagenes ai INNER JOIN actividades a ON ai.actividad_id = a.id WHERE ai.id = ?',
            [imagenId]
        );

        if (imagenes.length === 0) {
            return res.status(404).json({ success: false, error: 'Imagen no encontrada' });
        }

        const imagen = imagenes[0];

        if (creado_por_id && String(imagen.creado_por_id) !== String(creado_por_id)) {
            return res.status(403).json({ success: false, error: 'No tienes permiso para eliminar esta imagen' });
        }

        const filePath = path.join(uploadDir, imagen.ruta_archivo);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log('✅ Archivo físico eliminado:', filePath);
        }

        await db.execute('DELETE FROM actividad_imagenes WHERE id = ?', [imagenId]);

        console.log(`✅ Imagen ${imagenId} eliminada exitosamente`);

        res.json({ success: true, message: 'Imagen eliminada exitosamente', imagenId: imagenId });

    } catch (error) {
        console.error('❌ Error al eliminar imagen:', error);
        res.status(500).json({ success: false, error: error.message || 'Error al eliminar la imagen' });
    }
});

// ✅ RUTA ESPECÍFICA PRIMERO: Obtener actividades por dirección
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
        for (let actividad of actividades) {
            const [imagenes] = await db.execute(
                `SELECT id, actividad_id, nombre_archivo, ruta_archivo, tipo_mime, tamano, fecha_subida FROM actividad_imagenes WHERE actividad_id = ?`,
                [actividad.id]
            );
            actividad.imagenes = imagenes.map(img => ({ ...img, url: `/uploads/actividades/${img.ruta_archivo}` }));
        }
        res.json({ success: true, data: actividades });
    } catch (error) {
        console.error('Error al obtener actividades:', error);
        res.status(500).json({ success: false, error: 'Error al obtener actividades' });
    }
});

router.get('/debug/uploads', (req, res) => {
    try {
        const uploadDir = 'uploads/actividades';
        if (!fs.existsSync(uploadDir)) {
            return res.json({ success: false, message: 'Directorio no existe', path: path.resolve(uploadDir) });
        }
        const files = fs.readdirSync(uploadDir);
        const fileDetails = files.map(file => {
            const filePath = path.join(uploadDir, file);
            const stats = fs.statSync(filePath);
            return { nombre: file, ruta: filePath, tamaño: stats.size, url: `http://strideutmat.com:5000/uploads/actividades/${file}`, existe: fs.existsSync(filePath) };
        });
        res.json({ success: true, uploadDir: path.resolve(uploadDir), totalArchivos: files.length, archivos: fileDetails });
    } catch (error) {
        console.error('Error al leer directorio:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ✅ RUTA ESPECÍFICA PRIMERO: Obtener todas las actividades
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
        for (let actividad of actividades) {
            const [imagenes] = await db.execute(
                `SELECT id, actividad_id, nombre_archivo, ruta_archivo, tipo_mime, tamano, fecha_subida FROM actividad_imagenes WHERE actividad_id = ?`,
                [actividad.id]
            );
            actividad.imagenes = imagenes.map(img => ({ ...img, url: `/uploads/actividades/${img.ruta_archivo}` }));
        }
        res.json({ success: true, data: actividades, total: actividades.length, timestamp: new Date().toISOString() });
    } catch (error) {
        console.error('Error al obtener todas las actividades:', error);
        res.status(500).json({ success: false, error: 'Error al obtener actividades' });
    }
});

// ✅ RUTA GENERAL DESPUÉS: Eliminar actividad por ID
router.delete('/actividades/:id', async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`🗑️ Solicitando eliminación de actividad ID: ${id}`);
        const [actividades] = await db.execute('SELECT * FROM actividades WHERE id = ?', [id]);
        if (actividades.length === 0) {
            return res.status(404).json({ success: false, error: 'Actividad no encontrada' });
        }
        const actividad = actividades[0];
        const [imagenes] = await db.execute('SELECT * FROM actividad_imagenes WHERE actividad_id = ?', [id]);
        console.log(`📸 Imágenes a eliminar: ${imagenes.length}`);
        let imagenesEliminadas = 0;
        for (const imagen of imagenes) {
            try {
                const filePath = path.join(uploadDir, imagen.ruta_archivo);
                if (fs.existsSync(filePath)) { fs.unlinkSync(filePath); imagenesEliminadas++; }
            } catch (fileError) {
                console.error(`   ⚠️ Error eliminando archivo: ${fileError.message}`);
            }
        }
        await db.execute('DELETE FROM actividad_imagenes WHERE actividad_id = ?', [id]);
        const [result] = await db.execute('DELETE FROM actividades WHERE id = ?', [id]);
        if (result.affectedRows === 0) {
            return res.status(500).json({ success: false, error: 'No se pudo eliminar la actividad' });
        }
        console.log(`✅ Actividad ${id} eliminada exitosamente`);
        res.json({ success: true, message: 'Actividad eliminada exitosamente', actividadId: id, titulo: actividad.titulo, imagenesEliminadas: imagenesEliminadas, registrosEliminados: result.affectedRows });
    } catch (error) {
        console.error('❌ Error al eliminar actividad:', error);
        res.status(500).json({ success: false, error: error.message || 'Error al eliminar la actividad' });
    }
});

// ========== CONFIGURACIÓN SIMPLE PARA LOGOS ==========

const logoDir = 'uploads/logos';

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
      file.on('data', (chunk) => { chunks.push(chunk); });
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

// ========== COMUNICADOS ==========

router.post('/comunicados', async (req, res) => {
    try {
        const { titulo, contenido, link_externo, publicado_por_id } = req.body;
        console.log('📝 Creando comunicado:', { titulo, publicado_por_id });
        if (!titulo || !contenido || !publicado_por_id) {
            return res.status(400).json({ success: false, error: 'Título, contenido y creador son requeridos' });
        }
        const [result] = await db.execute(
            `INSERT INTO comunicados (titulo, contenido, link_externo, publicado_por_id, estado) VALUES (?, ?, ?, ?, 'publicado')`,
            [titulo, contenido, link_externo || null, publicado_por_id]
        );
        res.status(201).json({ success: true, message: 'Comunicado publicado exitosamente', comunicadoId: result.insertId });
    } catch (error) {
        console.error('❌ Error al crear comunicado:', error);
        res.status(500).json({ success: false, error: error.message || 'Error al crear el comunicado' });
    }
});

router.get('/comunicados', async (req, res) => {
    try {
        const [comunicados] = await db.execute(`
            SELECT c.*, su.username as publicado_por_nombre
            FROM comunicados c
            LEFT JOIN super_users su ON c.publicado_por_id = su.id
            WHERE c.estado = 'publicado'
            ORDER BY c.fecha_publicacion DESC
        `);
        res.json({ success: true, data: comunicados });
    } catch (error) {
        console.error('❌ Error al obtener comunicados:', error);
        res.status(500).json({ success: false, error: 'Error al obtener comunicados' });
    }
});

router.get('/comunicados-admin', async (req, res) => {
    try {
        const [comunicados] = await db.execute(`
            SELECT c.*, su.username as publicado_por_nombre
            FROM comunicados c
            LEFT JOIN super_users su ON c.publicado_por_id = su.id
            ORDER BY c.fecha_publicacion DESC
        `);
        res.json({ success: true, data: comunicados });
    } catch (error) {
        console.error('❌ Error al obtener comunicados para admin:', error);
        res.status(500).json({ success: false, error: 'Error al obtener comunicados' });
    }
});

router.get('/comunicados/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const [comunicados] = await db.execute(`
            SELECT c.*, su.username as publicado_por_nombre
            FROM comunicados c
            LEFT JOIN super_users su ON c.publicado_por_id = su.id
            WHERE c.id = ?
        `, [id]);
        if (comunicados.length === 0) {
            return res.status(404).json({ success: false, error: 'Comunicado no encontrado' });
        }
        res.json({ success: true, data: comunicados[0] });
    } catch (error) {
        console.error('Error al obtener comunicado:', error);
        res.status(500).json({ success: false, error: 'Error al obtener comunicado' });
    }
});

router.put('/comunicados/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { titulo, contenido, link_externo, estado } = req.body;
        const [result] = await db.execute(
            `UPDATE comunicados SET titulo = ?, contenido = ?, link_externo = ?, estado = ? WHERE id = ?`,
            [titulo, contenido, link_externo || null, estado, id]
        );
        if (result.affectedRows === 0) { return res.status(404).json({ success: false, error: 'Comunicado no encontrado' }); }
        res.json({ success: true, message: 'Comunicado actualizado exitosamente' });
    } catch (error) {
        console.error('Error al actualizar comunicado:', error);
        res.status(500).json({ success: false, error: 'Error al actualizar comunicado' });
    }
});

router.delete('/comunicados/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const [result] = await db.execute('DELETE FROM comunicados WHERE id = ?', [id]);
        if (result.affectedRows === 0) { return res.status(404).json({ success: false, error: 'Comunicado no encontrado' }); }
        res.json({ success: true, message: 'Comunicado eliminado exitosamente' });
    } catch (error) {
        console.error('Error al eliminar comunicado:', error);
        res.status(500).json({ success: false, error: 'Error al eliminar comunicado' });
    }
});

router.get('/comunicados-recientes', async (req, res) => {
    try {
        const limitParam = req.query.limit;
        let limit = 5;
        if (limitParam !== undefined && limitParam !== null && limitParam !== '') {
            const parsed = parseInt(limitParam, 10);
            if (!isNaN(parsed) && parsed > 0) { limit = Math.min(parsed, 100); }
        }
        console.log(`📢 Obteniendo ${limit} comunicados recientes...`);
        const query = `
            SELECT c.*, su.username as publicado_por_nombre
            FROM comunicados c
            LEFT JOIN super_users su ON c.publicado_por_id = su.id
            WHERE c.estado = 'publicado'
            ORDER BY c.fecha_publicacion DESC
            LIMIT ${limit}
        `;
        const [comunicados] = await db.execute(query);
        res.json({ success: true, data: comunicados, limit: limit });
    } catch (error) {
        console.error('❌ Error al obtener comunicados recientes:', error);
        res.status(500).json({ success: false, error: 'Error al obtener comunicados', details: process.env.NODE_ENV === 'development' ? error.message : undefined });
    }
});

router.get('/comunicados-recientes-alt', async (req, res) => {
    try {
        const limitParam = req.query.limit || 5;
        const limit = Math.min(parseInt(limitParam) || 5, 100);
        const sql = `
            SELECT c.*, su.username as publicado_por_nombre
            FROM comunicados c
            LEFT JOIN super_users su ON c.publicado_por_id = su.id
            WHERE c.estado = 'publicado'
            ORDER BY c.fecha_publicacion DESC
            LIMIT ${db.escape(limit)}
        `;
        const [comunicados] = await db.query(sql);
        res.json({ success: true, data: comunicados, limit: limit });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ success: false, error: 'Error al obtener comunicados' });
    }
});

// ========== CONFIGURACIÓN DE MULTER PARA TAREAS ==========

const tareasStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        const dir = 'uploads/tareas';
        if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
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
    limits: { fileSize: 10 * 1024 * 1024, files: 5 }
});

// ========== TAREAS (SUPER ADMIN) ==========

router.get('/tareas/usuarios-disponibles', async (req, res) => {
    try {
        const [personal] = await db.execute(`
            SELECT p.id, p.nombre_completo as nombre, 'personal' as tipo, p.puesto as cargo, dir.nombre as direccion_nombre
            FROM personal p
            LEFT JOIN direcciones dir ON p.direccion_id = dir.id
            ORDER BY p.nombre_completo
        `);
        res.json({ success: true, data: personal, metadata: { total: personal.length } });
    } catch (error) {
        console.error('❌ Error al obtener personal:', error);
        res.status(500).json({ success: false, error: 'Error al obtener personal' });
    }
});

router.post('/tareas', uploadTareas.array('archivos', 5), async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const { titulo, descripcion, fecha_entrega, asignaciones } = req.body;
        const creado_por_id = req.body.creado_por_id;
        const creado_por_tipo = req.body.creado_por_tipo || 'superadmin';
        if (!titulo || !fecha_entrega || !creado_por_id || !asignaciones) {
            if (req.files && req.files.length > 0) { req.files.forEach(file => fs.unlinkSync(file.path)); }
            await connection.rollback(); connection.release();
            return res.status(400).json({ success: false, error: 'Todos los campos son requeridos' });
        }
        let asignacionesArray;
        try {
            asignacionesArray = JSON.parse(asignaciones);
            if (!Array.isArray(asignacionesArray) || asignacionesArray.length === 0) { throw new Error('Debe asignar al menos un usuario'); }
        } catch (e) {
            if (req.files && req.files.length > 0) { req.files.forEach(file => fs.unlinkSync(file.path)); }
            await connection.rollback(); connection.release();
            return res.status(400).json({ success: false, error: 'Formato de asignaciones inválido' });
        }
        const [tareaResult] = await connection.execute(
            `INSERT INTO tareas (titulo, descripcion, fecha_entrega, creado_por_id, creado_por_tipo) VALUES (?, ?, ?, ?, ?)`,
            [titulo, descripcion || null, fecha_entrega, creado_por_id, creado_por_tipo]
        );
        const tareaId = tareaResult.insertId;
        for (const asig of asignacionesArray) {
            await connection.execute(
                `INSERT INTO tareas_asignaciones (tarea_id, usuario_id, usuario_tipo, estado) VALUES (?, ?, ?, 'pendiente')`,
                [tareaId, asig.usuario_id, asig.usuario_tipo]
            );
        }
        if (req.files && req.files.length > 0) {
            for (const file of req.files) {
                await connection.execute(
                    `INSERT INTO tareas_archivos (tarea_id, nombre_original, nombre_archivo, ruta_archivo, tipo_mime, tamano) VALUES (?, ?, ?, ?, ?, ?)`,
                    [tareaId, file.originalname, file.filename, file.filename, file.mimetype, file.size]
                );
            }
        }
        await connection.execute(
            `INSERT INTO tareas_historial (tarea_id, usuario_id, usuario_tipo, accion, descripcion) VALUES (?, ?, ?, 'creada', ?)`,
            [tareaId, creado_por_id, creado_por_tipo, `Tarea creada con ${asignacionesArray.length} asignaciones`]
        );
        await connection.commit(); connection.release();
        res.status(201).json({ success: true, message: 'Tarea creada exitosamente', tareaId: tareaId, asignaciones: asignacionesArray.length, archivos: req.files?.length || 0 });
    } catch (error) {
        await connection.rollback(); connection.release();
        if (req.files && req.files.length > 0) { req.files.forEach(file => { try { fs.unlinkSync(file.path); } catch (err) {} }); }
        console.error('❌ Error al crear tarea:', error);
        res.status(500).json({ success: false, error: error.message || 'Error al crear la tarea' });
    }
});

router.get('/tareas', async (req, res) => {
    try {
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
        for (let tarea of tareas) {
            const [asignaciones] = await db.execute(`
                SELECT ta.*,
                       CASE WHEN ta.usuario_tipo = 'directivo' THEN d.nombre_completo WHEN ta.usuario_tipo = 'personal' THEN p.nombre_completo END as usuario_nombre,
                       CASE WHEN ta.usuario_tipo = 'directivo' THEN d.cargo WHEN ta.usuario_tipo = 'personal' THEN p.puesto END as usuario_cargo,
                       dir.nombre as direccion_nombre
                FROM tareas_asignaciones ta
                LEFT JOIN directivos d ON ta.usuario_id = d.id AND ta.usuario_tipo = 'directivo'
                LEFT JOIN personal p ON ta.usuario_id = p.id AND ta.usuario_tipo = 'personal'
                LEFT JOIN direcciones dir ON (ta.usuario_tipo = 'directivo' AND d.direccion_id = dir.id) OR (ta.usuario_tipo = 'personal' AND p.direccion_id = dir.id)
                WHERE ta.tarea_id = ?
                ORDER BY ta.estado, usuario_nombre
            `, [tarea.id]);
            tarea.asignaciones = asignaciones;
            const [archivos] = await db.execute(`SELECT * FROM tareas_archivos WHERE tarea_id = ?`, [tarea.id]);
            tarea.archivos = archivos.map(archivo => ({ ...archivo, url: `/uploads/tareas/${archivo.ruta_archivo}` }));
            tarea.progreso = tarea.total_asignaciones > 0 ? Math.round((tarea.completadas / tarea.total_asignaciones) * 100) : 0;
        }
        res.json({ success: true, data: tareas, total: tareas.length });
    } catch (error) {
        console.error('❌ Error al obtener tareas:', error);
        res.status(500).json({ success: false, error: 'Error al obtener tareas' });
    }
});

// ✅ RUTAS ESPECÍFICAS DE TAREAS PRIMERO (antes de /tareas/:id)

router.get('/tareas/usuarios-disponibles', async (req, res) => {
    try {
        const [personal] = await db.execute(`
            SELECT p.id, p.nombre_completo as nombre, 'personal' as tipo, p.puesto as cargo, dir.nombre as direccion_nombre
            FROM personal p
            LEFT JOIN direcciones dir ON p.direccion_id = dir.id
            ORDER BY p.nombre_completo
        `);
        res.json({ success: true, data: personal, metadata: { total: personal.length } });
    } catch (error) {
        console.error('❌ Error al obtener personal:', error);
        res.status(500).json({ success: false, error: 'Error al obtener personal' });
    }
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

router.get('/tareas/personal/:personalId/conteo', async (req, res) => {
  try {
    const { personalId } = req.params;
    const [result] = await db.execute(`
      SELECT COUNT(*) as pendientes FROM tareas_asignaciones ta
      WHERE ta.usuario_id = ? AND ta.usuario_tipo = 'personal' AND ta.estado IN ('pendiente', 'en_progreso')
    `, [personalId]);
    res.json({ success: true, data: { pendientes: result[0].pendientes } });
  } catch (error) {
    console.error('Error al obtener conteo:', error);
    res.status(500).json({ success: false, error: 'Error al obtener conteo' });
  }
});

router.get('/tareas/personal/:personalId', async (req, res) => {
  try {
    const { personalId } = req.params;
    const [tareas] = await db.execute(`
      SELECT t.*, ta.id as asignacion_id, ta.estado as asignacion_estado, ta.comentarios as asignacion_comentarios, ta.fecha_completado,
             CASE WHEN t.creado_por_tipo = 'superadmin' THEN su.username WHEN t.creado_por_tipo = 'directivo' THEN d.nombre_completo WHEN t.creado_por_tipo = 'personal' THEN p.nombre_completo END as creado_por_nombre
      FROM tareas t
      INNER JOIN tareas_asignaciones ta ON t.id = ta.tarea_id
      LEFT JOIN super_users su ON t.creado_por_id = su.id AND t.creado_por_tipo = 'superadmin'
      LEFT JOIN directivos d ON t.creado_por_id = d.id AND t.creado_por_tipo = 'directivo'
      LEFT JOIN personal p ON t.creado_por_id = p.id AND t.creado_por_tipo = 'personal'
      WHERE ta.usuario_id = ? AND ta.usuario_tipo = 'personal'
      ORDER BY CASE WHEN ta.estado IN ('pendiente', 'en_progreso') THEN 1 ELSE 2 END, t.fecha_entrega ASC
    `, [personalId]);
    for (let tarea of tareas) {
      const [archivos] = await db.execute(`SELECT * FROM tareas_archivos WHERE tarea_id = ?`, [tarea.id]);
      tarea.archivos = archivos.map(archivo => ({ ...archivo, url: `/uploads/tareas/${archivo.ruta_archivo}` }));
      const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
      const entrega = new Date(tarea.fecha_entrega); entrega.setHours(0, 0, 0, 0);
      tarea.dias_restantes = Math.ceil((entrega - hoy) / (1000 * 60 * 60 * 24));
    }
    res.json({ success: true, data: tareas });
  } catch (error) {
    console.error('Error al obtener tareas del personal:', error);
    res.status(500).json({ success: false, error: 'Error al obtener tareas' });
  }
});

router.post('/tareas/completar/:asignacionId', uploadTareas.array('archivos', 5), async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const { asignacionId } = req.params;
    const { comentarios } = req.body;
    if (!comentarios?.trim() && (!req.files || req.files.length === 0)) {
      await connection.rollback(); connection.release();
      if (req.files && req.files.length > 0) { req.files.forEach(file => fs.unlinkSync(file.path)); }
      return res.status(400).json({ success: false, error: 'Debes agregar una descripción o un archivo para completar la tarea' });
    }
    const [asignaciones] = await connection.execute(
      `SELECT ta.*, t.titulo FROM tareas_asignaciones ta INNER JOIN tareas t ON ta.tarea_id = t.id WHERE ta.id = ?`,
      [asignacionId]
    );
    if (asignaciones.length === 0) {
      await connection.rollback(); connection.release();
      if (req.files && req.files.length > 0) { req.files.forEach(file => fs.unlinkSync(file.path)); }
      return res.status(404).json({ success: false, error: 'Asignación no encontrada' });
    }
    const asignacion = asignaciones[0];
    await connection.execute(
      `UPDATE tareas_asignaciones SET estado = 'completada', comentarios = ?, fecha_completado = NOW() WHERE id = ?`,
      [comentarios || null, asignacionId]
    );
    let archivosGuardados = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const [result] = await connection.execute(
          `INSERT INTO tareas_archivos (tarea_id, nombre_original, nombre_archivo, ruta_archivo, tipo_mime, tamano) VALUES (?, ?, ?, ?, ?, ?)`,
          [asignacion.tarea_id, file.originalname, file.filename, file.filename, file.mimetype, file.size]
        );
        archivosGuardados.push({ id: result.insertId, nombre: file.originalname });
      }
    }
    await connection.execute(
      `INSERT INTO tareas_historial (tarea_id, usuario_id, usuario_tipo, accion, descripcion) VALUES (?, ?, 'personal', 'completada', ?)`,
      [asignacion.tarea_id, asignacion.usuario_id, `Tarea completada${comentarios ? ' con comentarios' : ''}${req.files?.length > 0 ? ' y ' + req.files.length + ' archivo(s)' : ''}`]
    );
    await connection.commit(); connection.release();
    res.json({ success: true, message: '¡Felicidades! Tarea completada exitosamente', data: { tarea: asignacion.titulo, comentarios: comentarios || null, archivos: archivosGuardados.length } });
  } catch (error) {
    await connection.rollback(); connection.release();
    if (req.files && req.files.length > 0) { req.files.forEach(file => { try { fs.unlinkSync(file.path); } catch (err) {} }); }
    console.error('Error al completar tarea:', error);
    res.status(500).json({ success: false, error: 'Error al completar la tarea' });
  }
});

router.put('/tareas/asignacion/:id', async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const { id } = req.params;
        const { estado, comentarios, usuario_id, usuario_tipo } = req.body;
        const [asignaciones] = await connection.execute('SELECT * FROM tareas_asignaciones WHERE id = ?', [id]);
        if (asignaciones.length === 0) {
            await connection.rollback(); connection.release();
            return res.status(404).json({ success: false, error: 'Asignación no encontrada' });
        }
        const asignacion = asignaciones[0];
        const fechaCompletado = estado === 'completada' ? new Date() : null;
        await connection.execute(
            `UPDATE tareas_asignaciones SET estado = ?, comentarios = ?, fecha_completado = ? WHERE id = ?`,
            [estado, comentarios || null, fechaCompletado, id]
        );
        await connection.execute(
            `INSERT INTO tareas_historial (tarea_id, usuario_id, usuario_tipo, accion, descripcion) VALUES (?, ?, ?, 'actualizacion', ?)`,
            [asignacion.tarea_id, usuario_id || 1, usuario_tipo || 'superadmin', `Estado de asignación actualizado a: ${estado}`]
        );
        await connection.commit(); connection.release();
        res.json({ success: true, message: 'Estado actualizado correctamente' });
    } catch (error) {
        await connection.rollback(); connection.release();
        console.error('Error al actualizar asignación:', error);
        res.status(500).json({ success: false, error: 'Error al actualizar estado' });
    }
});

router.delete('/tareas/archivo/:archivoId', async (req, res) => {
  try {
    const { archivoId } = req.params;
    const [archivos] = await db.execute('SELECT * FROM tareas_archivos WHERE id = ?', [archivoId]);
    if (archivos.length === 0) { return res.status(404).json({ success: false, error: 'Archivo no encontrado' }); }
    const archivo = archivos[0];
    const filePath = path.join('uploads/tareas', archivo.ruta_archivo);
    if (fs.existsSync(filePath)) { fs.unlinkSync(filePath); }
    await db.execute('DELETE FROM tareas_archivos WHERE id = ?', [archivoId]);
    res.json({ success: true, message: 'Archivo eliminado' });
  } catch (error) {
    console.error('Error eliminando archivo:', error);
    res.status(500).json({ success: false, error: 'Error al eliminar archivo' });
  }
});

// ✅ RUTAS GENERALES DE TAREAS AL FINAL (/:id)

router.get('/tareas/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const [tareas] = await db.execute(`
            SELECT t.*,
                   CASE WHEN t.creado_por_tipo = 'superadmin' THEN su.username WHEN t.creado_por_tipo = 'directivo' THEN d.nombre_completo WHEN t.creado_por_tipo = 'personal' THEN p.nombre_completo END as creado_por_nombre
            FROM tareas t
            LEFT JOIN super_users su ON t.creado_por_id = su.id AND t.creado_por_tipo = 'superadmin'
            LEFT JOIN directivos d ON t.creado_por_id = d.id AND t.creado_por_tipo = 'directivo'
            LEFT JOIN personal p ON t.creado_por_id = p.id AND t.creado_por_tipo = 'personal'
            WHERE t.id = ?
        `, [id]);
        if (tareas.length === 0) { return res.status(404).json({ success: false, error: 'Tarea no encontrada' }); }
        const tarea = tareas[0];
        const [asignaciones] = await db.execute(`
            SELECT ta.*,
                   CASE WHEN ta.usuario_tipo = 'directivo' THEN d.nombre_completo WHEN ta.usuario_tipo = 'personal' THEN p.nombre_completo END as usuario_nombre,
                   CASE WHEN ta.usuario_tipo = 'directivo' THEN d.cargo WHEN ta.usuario_tipo = 'personal' THEN p.puesto END as usuario_cargo,
                   dir.nombre as direccion_nombre
            FROM tareas_asignaciones ta
            LEFT JOIN directivos d ON ta.usuario_id = d.id AND ta.usuario_tipo = 'directivo'
            LEFT JOIN personal p ON ta.usuario_id = p.id AND ta.usuario_tipo = 'personal'
            LEFT JOIN direcciones dir ON (ta.usuario_tipo = 'directivo' AND d.direccion_id = dir.id) OR (ta.usuario_tipo = 'personal' AND p.direccion_id = dir.id)
            WHERE ta.tarea_id = ?
        `, [id]);
        tarea.asignaciones = asignaciones;
        const [archivos] = await db.execute(`SELECT * FROM tareas_archivos WHERE tarea_id = ?`, [id]);
        tarea.archivos = archivos.map(archivo => ({ ...archivo, url: `/uploads/tareas/${archivo.ruta_archivo}` }));
        const [historial] = await db.execute(`
            SELECT h.*,
                   CASE WHEN h.usuario_tipo = 'superadmin' THEN su.username WHEN h.usuario_tipo = 'directivo' THEN d.nombre_completo WHEN h.usuario_tipo = 'personal' THEN p.nombre_completo END as usuario_nombre
            FROM tareas_historial h
            LEFT JOIN super_users su ON h.usuario_id = su.id AND h.usuario_tipo = 'superadmin'
            LEFT JOIN directivos d ON h.usuario_id = d.id AND h.usuario_tipo = 'directivo'
            LEFT JOIN personal p ON h.usuario_id = p.id AND h.usuario_tipo = 'personal'
            WHERE h.tarea_id = ?
            ORDER BY h.fecha DESC
        `, [id]);
        tarea.historial = historial;
        res.json({ success: true, data: tarea });
    } catch (error) {
        console.error('Error al obtener tarea:', error);
        res.status(500).json({ success: false, error: 'Error al obtener tarea' });
    }
});

router.put('/tareas/:id', uploadTareas.array('archivos', 5), async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const { id } = req.params;
    const { titulo, descripcion, fecha_entrega, asignaciones } = req.body;
    await connection.execute(
      `UPDATE tareas SET titulo = ?, descripcion = ?, fecha_entrega = ? WHERE id = ?`,
      [titulo, descripcion || null, fecha_entrega, id]
    );
    if (asignaciones) {
      const nuevasAsignaciones = JSON.parse(asignaciones);
      await connection.execute('DELETE FROM tareas_asignaciones WHERE tarea_id = ?', [id]);
      for (const asig of nuevasAsignaciones) {
        await connection.execute(
          `INSERT INTO tareas_asignaciones (tarea_id, usuario_id, usuario_tipo, estado) VALUES (?, ?, ?, 'pendiente')`,
          [id, asig.usuario_id, asig.usuario_tipo]
        );
      }
    }
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        await connection.execute(
          `INSERT INTO tareas_archivos (tarea_id, nombre_original, nombre_archivo, ruta_archivo, tipo_mime, tamano) VALUES (?, ?, ?, ?, ?, ?)`,
          [id, file.originalname, file.filename, file.filename, file.mimetype, file.size]
        );
      }
    }
    await connection.commit(); connection.release();
    res.json({ success: true, message: 'Tarea actualizada exitosamente' });
  } catch (error) {
    await connection.rollback(); connection.release();
    console.error('Error editando tarea:', error);
    res.status(500).json({ success: false, error: 'Error al editar la tarea' });
  }
});

router.delete('/tareas/:id', async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const { id } = req.params;
        const [archivos] = await connection.execute('SELECT * FROM tareas_archivos WHERE tarea_id = ?', [id]);
        for (const archivo of archivos) {
            try {
                const filePath = path.join('uploads/tareas', archivo.ruta_archivo);
                if (fs.existsSync(filePath)) { fs.unlinkSync(filePath); }
            } catch (err) { console.error('Error eliminando archivo:', err); }
        }
        const [result] = await connection.execute('DELETE FROM tareas WHERE id = ?', [id]);
        if (result.affectedRows === 0) {
            await connection.rollback(); connection.release();
            return res.status(404).json({ success: false, error: 'Tarea no encontrada' });
        }
        await connection.commit(); connection.release();
        res.json({ success: true, message: 'Tarea eliminada exitosamente', archivosEliminados: archivos.length });
    } catch (error) {
        await connection.rollback(); connection.release();
        console.error('Error al eliminar tarea:', error);
        res.status(500).json({ success: false, error: 'Error al eliminar tarea' });
    }
});

// ========== EDITAR Y ELIMINAR DIRECTIVOS ==========

router.put('/directivos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre_completo, cargo, direccion_id, email, password } = req.body;
        if (!nombre_completo || !cargo || !direccion_id || !email) {
            return res.status(400).json({ success: false, error: 'Nombre, cargo, dirección y email son requeridos' });
        }
        let updateQuery, updateParams;
        if (password && password.trim() !== '') {
            const hashedPassword = await bcrypt.hash(password, 10);
            updateQuery = `UPDATE directivos SET nombre_completo = ?, cargo = ?, direccion_id = ?, email = ?, password = ? WHERE id = ?`;
            updateParams = [nombre_completo, cargo, direccion_id, email, hashedPassword, id];
        } else {
            updateQuery = `UPDATE directivos SET nombre_completo = ?, cargo = ?, direccion_id = ?, email = ? WHERE id = ?`;
            updateParams = [nombre_completo, cargo, direccion_id, email, id];
        }
        const [result] = await db.execute(updateQuery, updateParams);
        if (result.affectedRows === 0) { return res.status(404).json({ success: false, error: 'Directivo no encontrado' }); }
        res.json({ success: true, message: 'Directivo actualizado exitosamente' });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') { return res.status(400).json({ success: false, error: 'El email ya está registrado' }); }
        console.error('Error al editar directivo:', error);
        res.status(500).json({ success: false, error: 'Error al editar el directivo' });
    }
});

router.delete('/directivos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const [directivos] = await db.execute('SELECT * FROM directivos WHERE id = ?', [id]);
        if (directivos.length === 0) { return res.status(404).json({ success: false, error: 'Directivo no encontrado' }); }
        await db.execute('DELETE FROM directivos WHERE id = ?', [id]);
        res.json({ success: true, message: 'Directivo eliminado exitosamente' });
    } catch (error) {
        console.error('Error al eliminar directivo:', error);
        res.status(500).json({ success: false, error: 'Error al eliminar el directivo' });
    }
});

// ========== EDITAR Y ELIMINAR PERSONAL ==========

router.put('/personal/:id', uploadPersonal.single('foto'), async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre_completo, puesto, direccion_id, email, password } = req.body;
        if (!nombre_completo || !puesto || !direccion_id || !email) {
            if (req.file) fs.unlinkSync(req.file.path);
            return res.status(400).json({ success: false, error: 'Nombre, puesto, dirección y email son requeridos' });
        }
        const [personalActual] = await db.execute('SELECT * FROM personal WHERE id = ?', [id]);
        if (personalActual.length === 0) {
            if (req.file) fs.unlinkSync(req.file.path);
            return res.status(404).json({ success: false, error: 'Personal no encontrado' });
        }
        const persona = personalActual[0];
        let nuevaFoto = persona.foto_perfil;
        if (req.file) {
            if (persona.foto_perfil) {
                const fotoAnterior = path.join('uploads/personal', persona.foto_perfil);
                if (fs.existsSync(fotoAnterior)) { fs.unlinkSync(fotoAnterior); }
            }
            nuevaFoto = req.file.filename;
        }
        let updateQuery, updateParams;
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
        if (req.file) { try { fs.unlinkSync(req.file.path); } catch (e) {} }
        if (error.code === 'ER_DUP_ENTRY') { return res.status(400).json({ success: false, error: 'El email ya está registrado' }); }
        console.error('Error al editar personal:', error);
        res.status(500).json({ success: false, error: 'Error al editar el personal' });
    }
});

router.delete('/personal/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const [personalList] = await db.execute('SELECT * FROM personal WHERE id = ?', [id]);
        if (personalList.length === 0) { return res.status(404).json({ success: false, error: 'Personal no encontrado' }); }
        const persona = personalList[0];
        if (persona.foto_perfil) {
            const fotoPath = path.join('uploads/personal', persona.foto_perfil);
            if (fs.existsSync(fotoPath)) { fs.unlinkSync(fotoPath); }
        }
        await db.execute('DELETE FROM personal WHERE id = ?', [id]);
        res.json({ success: true, message: 'Personal eliminado exitosamente' });
    } catch (error) {
        console.error('Error al eliminar personal:', error);
        res.status(500).json({ success: false, error: 'Error al eliminar el personal' });
    }
});

//Ruta
module.exports = router;
