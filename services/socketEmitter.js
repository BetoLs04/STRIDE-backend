const { getIO } = require('../config/socket');

function emit(event, data = {}) {
    const io = getIO();
    if (io) {
        io.emit(event, { ...data, timestamp: new Date().toISOString() });
    }
}

module.exports = { emit };