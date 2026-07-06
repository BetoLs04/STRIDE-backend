const API_BASE_URL = process.env.API_URL || 'https://api1.strideutmat.com';

const CAMPOS_BLOQUEO_MAP = {
    'bloqueo_1er_cuatrimestre': 'bloqueo_1er_cuatrimestre',
    'bloqueo_2do_cuatrimestre': 'bloqueo_2do_cuatrimestre',
    'bloqueo_3er_cuatrimestre': 'bloqueo_3er_cuatrimestre',
    'bloqueo_filas': 'bloqueo_filas'
};

const ESTADOS_ACTIVIDAD = ['pendiente', 'en_progreso', 'completada'];

const TIPOS_USUARIO_VALIDOS = ['directivo', 'personal'];

const ALINEACIONES_VALIDAS = ['left', 'center', 'right'];

const TIPOS_DATO_SMOA = ['texto', 'documento', 'enlace'];
const PERMISOS_SUBIDA_SMOA = ['solo_admin', 'todos'];

const EXTENSIONES_IMAGEN = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];

module.exports = {
    API_BASE_URL,
    CAMPOS_BLOQUEO_MAP,
    ESTADOS_ACTIVIDAD,
    TIPOS_USUARIO_VALIDOS,
    ALINEACIONES_VALIDAS,
    TIPOS_DATO_SMOA,
    PERMISOS_SUBIDA_SMOA,
    EXTENSIONES_IMAGEN
};
