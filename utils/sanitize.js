const sanitizeStr = (val) => typeof val === 'string' ? val.trim().replace(/[\0\x08\x09\x1a\n\r"'\\%_]/g, '').substring(0, 255) : '';
const sanitizeEmail = (val) => typeof val === 'string' ? val.trim().toLowerCase().replace(/[<>()\[\]\\,;:\s"]/g, '').substring(0, 254) : '';
const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

module.exports = { sanitizeStr, sanitizeEmail, isValidEmail };
