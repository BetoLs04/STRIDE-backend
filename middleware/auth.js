const jwt = require('jsonwebtoken');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'stride_jwt_secret_key_2024';

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
        return res.status(401).json({ success: false, error: 'Token de autenticación requerido' });
    }

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ success: false, error: 'Token inválido o expirado' });
    }
}

module.exports = { generateToken, verifyToken };
