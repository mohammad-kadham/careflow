const path = require('node:path');

// Environment variables supplied by the host take precedence over the local file.
try {
    process.loadEnvFile(path.join(__dirname, '..', '.env'));
} catch (error) {
    if (error.code !== 'ENOENT') throw error;
}

const secret = process.env.JWT_SECRET;
if (!secret || Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('Set JWT_SECRET to a random secret of at least 32 bytes before starting the server.');
}

module.exports = {
    secret,
    issuer: 'careflow-api',
    audience: 'careflow-web',
    lifetimeSeconds: 60 * 60,
    cookieName: 'careflow_session',
    cookieOptions: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
    },
    allowedOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173')
        .split(',').map(origin => origin.trim()).filter(Boolean),
};
