const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../config/database');
const { generateToken, verifyToken } = require('../middleware/auth');
const { sanitizeStr, sanitizeEmail, isValidEmail } = require('../utils/sanitize');
const { loginLimiter, createUserLimiter } = require('../middleware/rateLimiters');
const { requireSuperAdmin, isUserDelegado } = require('../middleware/roles');
const { emit } = require('../services/socketEmitter');

router.post('/create-superuser', createUserLimiter, async (req, res) => {
    try {
        // Solo permitir crear el PRIMER superadmin sin auth
        const [existing] = await db.execute('SELECT COUNT(*) as total FROM super_users');
        if (existing[0].total > 0) {
            return res.status(403).json({ success: false, error: 'Ya existe un superadmin. Usa el panel administrativo para crear más.' });
        }

        const username = sanitizeStr(req.body.username);
        const email = sanitizeEmail(req.body.email);
        const password = req.body.password || '';
        if (!username || username.length < 2) {
            return res.status(400).json({ success: false, error: 'El nombre de usuario debe tener al menos 2 caracteres' });
        }
        if (!email || !isValidEmail(email)) {
            return res.status(400).json({ success: false, error: 'Correo electrónico inválido' });
        }
        if (!password || password.length < 8) {
            return res.status(400).json({ success: false, error: 'La contraseña debe tener al menos 8 caracteres' });
        }
        const hashedPassword = await bcrypt.hash(password, 12);
        const [result] = await db.execute(
            'INSERT INTO super_users (username, email, password) VALUES (?, ?, ?)',
            [username, email, hashedPassword]
        );
        res.status(201).json({ success: true, message: 'Super usuario creado exitosamente', userId: result.insertId });
        emit('superuser:created', { userId: result.insertId });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ success: false, error: 'El usuario o email ya existe' });
        }
        console.error('Error al crear super user:', error);
        res.status(500).json({ success: false, error: 'Error al crear el usuario' });
    }
});

router.post('/login', loginLimiter, async (req, res) => {
    try {
        const email = sanitizeEmail(req.body.email);
        const password = req.body.password || '';
        if (!email || !isValidEmail(email)) {
            return res.status(400).json({ success: false, error: 'Correo electrónico inválido' });
        }
        if (!password) {
            return res.status(400).json({ success: false, error: 'Contraseña requerida' });
        }
        const [users] = await db.execute('SELECT * FROM super_users WHERE email = ?', [email]);
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
        const token = generateToken(userResponse);
        res.json({ success: true, message: 'Login exitoso', user: userResponse, token });
    } catch (error) {
        console.error('Error en login:', error);
        res.status(500).json({ success: false, error: 'Error en el servidor' });
    }
});

router.post('/login-general', loginLimiter, async (req, res) => {
    try {
        const email = sanitizeEmail(req.body.email);
        const password = req.body.password || '';
        if (!email || !isValidEmail(email)) {
            return res.status(400).json({ success: false, error: 'Correo electrónico inválido' });
        }
        if (!password) {
            return res.status(400).json({ success: false, error: 'Contraseña requerida' });
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
        // Verificar si es delegado de superadmin
        if (userType !== 'superadmin') {
            const isDelegado = await isUserDelegado(user);
            if (isDelegado) {
                user.isDelegado = true;
            }
        }
        const token = generateToken(user);
        console.log('✅ Login exitoso para:', user.email, 'Tipo:', userType, user.isDelegado ? '(Delegado)' : '');
        res.json({ success: true, message: 'Login exitoso', user: user, userType: userType, token });
    } catch (error) {
        console.error('Error en login general:', error);
        res.status(500).json({ success: false, error: 'Error en el servidor' });
    }
});

router.get('/check-superadmin', async (req, res) => {
    try {
        const [users] = await db.execute('SELECT COUNT(*) as total FROM super_users');
        console.log('🔍 Check superadmin:', users[0].total > 0 ? 'existe' : 'no existe');
        res.json({ success: true, exists: users[0].total > 0 });
    } catch (error) {
        console.error('Error al verificar superadmin:', error);
        res.status(500).json({ success: false, error: 'Error al verificar superadmin' });
    }
});

router.get('/superusers', verifyToken, requireSuperAdmin, async (req, res) => {
    try {
        const [users] = await db.execute('SELECT id, username, email, created_at FROM super_users ORDER BY created_at DESC');
        res.json({ success: true, data: users });
    } catch (error) {
        console.error('Error al obtener usuarios:', error);
        res.status(500).json({ success: false, error: 'Error al obtener usuarios' });
    }
});

// ========== SUPERADMIN DELEGADO ==========

router.get('/superadmin-delegado', verifyToken, requireSuperAdmin, async (req, res) => {
    try {
        const [rows] = await db.execute(
            `SELECT sd.id, sd.usuario_id, sd.usuario_tipo, sd.fecha_asignacion,
                    COALESCE(d.nombre_completo, p.nombre_completo) as nombre
             FROM superadmin_delegado sd
             LEFT JOIN directivos d ON sd.usuario_id = d.id AND sd.usuario_tipo = 'directivo'
             LEFT JOIN personal p ON sd.usuario_id = p.id AND sd.usuario_tipo = 'personal'
             LIMIT 1`
        );
        res.json({ success: true, data: rows[0] || null });
    } catch (error) {
        console.error('Error al obtener delegado:', error);
        res.status(500).json({ success: false, error: 'Error al obtener delegado' });
    }
});

router.put('/superadmin-delegado', verifyToken, requireSuperAdmin, async (req, res) => {
    try {
        const { usuario_id, usuario_tipo } = req.body;
        if (!usuario_id || !usuario_tipo) {
            return res.status(400).json({ success: false, error: 'usuario_id y usuario_tipo son requeridos' });
        }
        if (!['directivo', 'personal'].includes(usuario_tipo)) {
            return res.status(400).json({ success: false, error: 'usuario_tipo debe ser directivo o personal' });
        }
        // Limpiar delegado anterior y asignar nuevo
        await db.execute('DELETE FROM superadmin_delegado');
        await db.execute(
            'INSERT INTO superadmin_delegado (usuario_id, usuario_tipo, asignado_por) VALUES (?, ?, ?)',
            [usuario_id, usuario_tipo, req.user.id]
        );
        // Obtener nombre del delegado asignado
        const table = usuario_tipo === 'directivo' ? 'directivos' : 'personal';
        const field = usuario_tipo === 'directivo' ? 'nombre_completo' : 'nombre_completo';
        const [userRows] = await db.execute(
            `SELECT ${field} as nombre FROM ${table} WHERE id = ?`,
            [usuario_id]
        );
        res.json({
            success: true,
            message: `Delegado asignado: ${userRows[0]?.nombre || 'Usuario'}`,
            data: { usuario_id, usuario_tipo, nombre: userRows[0]?.nombre || '' }
        });
        emit('superadmin:delegado-changed', { usuario_id, usuario_tipo });
    } catch (error) {
        console.error('Error al asignar delegado:', error);
        res.status(500).json({ success: false, error: 'Error al asignar delegado' });
    }
});

router.delete('/superadmin-delegado', verifyToken, requireSuperAdmin, async (req, res) => {
    try {
        await db.execute('DELETE FROM superadmin_delegado');
        res.json({ success: true, message: 'Delegado removido' });
        emit('superadmin:delegado-changed', { usuario_id: null, usuario_tipo: null });
    } catch (error) {
        console.error('Error al remover delegado:', error);
        res.status(500).json({ success: false, error: 'Error al remover delegado' });
    }
});

module.exports = router;
