const db = require('../config/database');

async function isUserDelegado(user) {
    if (!user || user.tipo === 'superadmin') return false;
    try {
        const [rows] = await db.execute(
            'SELECT id FROM superadmin_delegado WHERE usuario_id = ? AND usuario_tipo = ?',
            [user.id, user.tipo]
        );
        return rows.length > 0;
    } catch (error) {
        console.error('Error checking delegate:', error);
        return false;
    }
}

function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ success: false, error: 'Autenticación requerida' });
        }
        if (!roles.includes(req.user.tipo)) {
            if (roles.includes('superadmin')) {
                return isUserDelegado(req.user).then(isDelegado => {
                    if (isDelegado) return next();
                    res.status(403).json({ success: false, error: 'No tienes permisos para realizar esta acción' });
                }).catch(() => {
                    res.status(500).json({ success: false, error: 'Error al verificar permisos' });
                });
            }
            return res.status(403).json({ success: false, error: 'No tienes permisos para realizar esta acción' });
        }
        next();
    };
}

const requireSuperAdmin = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ success: false, error: 'Autenticación requerida' });
    }
    if (req.user.tipo === 'superadmin') {
        return next();
    }
    isUserDelegado(req.user).then(isDelegado => {
        if (isDelegado) {
            next();
        } else {
            res.status(403).json({ success: false, error: 'No tienes permisos para realizar esta acción' });
        }
    }).catch(() => {
        res.status(500).json({ success: false, error: 'Error al verificar permisos' });
    });
};

module.exports = { requireRole, requireSuperAdmin, isUserDelegado };
