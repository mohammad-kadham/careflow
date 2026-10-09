const defaultOrigin = globalThis.location?.hostname === '127.0.0.1' ? 'http://127.0.0.1:8080' : 'http://localhost:8080';
const base = (import.meta.env?.VITE_API_URL || defaultOrigin).replace(/\/$/, '') + '/admin';

export async function adminRequest(path, { body, signal } = {}) {
  if (!path.startsWith('/') || path.startsWith('//')) throw new Error('Invalid admin endpoint');
  const response = await fetch(base + path, {
    method: body === undefined ? 'GET' : 'POST', credentials: 'include', cache: 'no-store', signal,
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error || 'تعذر تنفيذ الطلب. حاول مجددًا.'), { status: response.status });
  return data;
}

export function subscriptionStatus(clinic) {
  if (!Number(clinic.required)) return 'وصول سابق';
  return Number(clinic.active) ? 'نشط' : clinic.expiresAt ? 'منتهي' : 'غير مفعّل';
}

export function localDateInput(value) {
  if (!value) return '';
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
