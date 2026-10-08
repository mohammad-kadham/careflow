// Bounded per-IP protection; per-account resend cooldown is additionally stored in SQL.
module.exports = function rateLimit({ limit, windowMs }) {
    const clients = new Map();
    return (req, res, next) => {
        const now = Date.now();
        for (const [key, entry] of clients) if (entry.expires <= now) clients.delete(key);
        const key = req.ip;
        let entry = clients.get(key);
        if (!entry && clients.size < 10000) {
            entry = { count: 0, expires: now + windowMs };
            clients.set(key, entry);
        }
        if (!entry || entry.count >= limit) {
            res.set('Retry-After', String(Math.ceil(((entry?.expires || now + windowMs) - now) / 1000)));
            return res.status(429).json({ error: 'طلبات كثيرة. يرجى الانتظار قبل المحاولة مجدداً.' });
        }
        entry.count++;
        next();
    };
};
