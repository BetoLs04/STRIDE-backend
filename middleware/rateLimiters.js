const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { success: false, error: 'Demasiados intentos de inicio de sesión. Intente en 15 minutos.' },
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false }
});

const createUserLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 3,
    message: { success: false, error: 'Demasiados intentos de creación de usuario. Intente más tarde.' },
    standardHeaders: true,
    legacyHeaders: false
});

module.exports = { loginLimiter, createUserLimiter };
