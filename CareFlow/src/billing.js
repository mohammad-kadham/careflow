export const manualPayment = { service: 'Qi Card', qrCode: '/payments/qicard.jpeg', currency: 'IQD' };

export const subscriptionPlans = [
    { id: 'basic', name: 'الأساسية', price: 22500 },
    { id: 'advanced', name: 'المتقدمة', price: 37500 },
];

export function selectedPlanId(value) {
    return subscriptionPlans.some(plan => plan.id === value) ? value : 'basic';
}
