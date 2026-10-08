const { requireSubscription } = require('./middleware/subscription');
const auth = require('./config/auth');
const express = require('express');
const cors = require('cors');
const { requireAuth, protectCookieWrites } = require('./middleware/auth');
const userRoutes = require('./routes/user');
const patientRoutes = require('./routes/patient');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 'loopback');

app.use(cors({
    origin: auth.allowedOrigins,
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(protectCookieWrites);
app.use(express.json());
app.use(userRoutes);
// Every patient, queue and visit route requires a valid session.
app.use(requireAuth, requireSubscription, patientRoutes);

app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    const statusCode = err.statusCode || err.status || 500;
    res.status(statusCode).json({
        error: statusCode >= 500 ? 'An unexpected server error occurred.' : err.message,
    });
});

if (require.main === module) {
    const initDB = require('./data/init');
    initDB().then(() => {
        const port = Number(process.env.PORT || 8080);
        const host = process.env.HOST || '0.0.0.0';
        app.listen(port, host, () => console.log(`CareFlow API listening on ${host}:${port}`));
    }).catch(error => {
        console.error('Failed to initialize the database:', error.message);
        process.exitCode = 1;
    });
}

module.exports = app;
