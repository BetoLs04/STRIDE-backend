function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ success: false, error: 'Autenticación requerida' });
        }
        if (!roles.includes(req.user.tipo)) {
            return res.status(403).json({ success: false, error: 'No tienes permisos para realizar esta acción' });
        }
        next();
    };
}

const requireSuperAdmin = requireRole('superadmin');

module.exports = { requireRole, requireSuperAdmin };
