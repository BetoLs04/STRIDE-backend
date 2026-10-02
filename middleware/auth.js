const jwt = require('jsonwebtoken');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error('❌ JWT_SECRET no está definido en .env');
    process.exit(1);
}

function generateToken(user) {
    return jwt.sign(
        { id: user.id, tipo: user.tipo, email: user.email, nombre: user.nombre || user.username },
        JWT_SECRET,
        { expiresIn: '24h' }
    );
}

function verifyToken(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401)
            .set('WWW-Authenticate', 'Bearer realm="stride-api"')
            .json({
                success: false,
                code: 'AUTH_TOKEN_MISSING',
                error: 'Token de autenticación requerido',
                info: 'Respuesta ESPERADA cuando una ruta protegida se prueba sin iniciar sesión; no indica fallo del servidor. Para comprobar disponibilidad use GET /api/university/health (responde 200 sin token).'
            });
    }

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401)
            .set('WWW-Authenticate', 'Bearer error="invalid_token"')
            .json({
                success: false,
                code: 'AUTH_TOKEN_INVALID',
                error: 'Token inválido o expirado',
                info: 'El token vence a las 24 h; vuelva a iniciar sesión para obtener uno nuevo. No indica fallo del servidor.'
            });
    }
}

module.exports = { generateToken, verifyToken };
