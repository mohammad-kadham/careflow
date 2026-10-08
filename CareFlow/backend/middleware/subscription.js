// Values are read from the clinic on every authenticated request, never from client input.
function subscriptionFor(user) {
    return {
        active: Number(user.subscription_active) === 1,
        required: Number(user.subscription_required) === 1,
        plan: user.subscription_plan ?? null,
        expiresAt: user.subscription_expires_at ?? null,
    };
}
function requireSubscription(req, res, next) {
    if (!subscriptionFor(req.user).active) {
        return res.status(402).json({ code: 'SUBSCRIPTION_REQUIRED',
            error: 'اشتراك العيادة غير مفعّل أو انتهت صلاحيته. يرجى مراجعة صفحة الاشتراك والدفع.' });
    }
    next();
}
module.exports = { subscriptionFor, requireSubscription };
