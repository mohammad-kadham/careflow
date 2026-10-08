import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../api';
import styles from './staff-buzzer.module.css';
import EntryControl from './entry-control';

function playBuzzer(context) {
    if (context?.state !== 'running') return false;
    const beginsAt = context.currentTime + 0.02;
    // A high "ding" followed by a lower "dong", with metallic overtones.
    for (const [offset, frequency] of [[0, 659.25], [0.6, 523.25]]) {
        const start = beginsAt + offset;
        for (const [ratio, volume, decay] of [[1, 0.38, 1.5], [2.76, 0.095, 0.65], [4.07, 0.025, 0.35]]) {
            const oscillator = context.createOscillator();
            const gain = context.createGain();
            oscillator.type = 'sine';
            oscillator.frequency.value = frequency * ratio;
            gain.gain.setValueAtTime(0, start);
            gain.gain.linearRampToValueAtTime(volume, start + 0.008);
            gain.gain.exponentialRampToValueAtTime(0.0001, start + decay);
            gain.gain.linearRampToValueAtTime(0, start + decay + 0.05);
            oscillator.connect(gain);
            gain.connect(context.destination);
            oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
            oscillator.start(start);
            oscillator.stop(start + decay + 0.06);
        }
    }
    return true;
}

export function DoctorBuzzer() {
    const [sending, setSending] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState(false);
    const [staffStatus, setStaffStatus] = useState(null);
    const pending = useRef(false);

    async function ring() {
        if (pending.current) return;
        pending.current = true;
        setSending(true);
        setMessage('');
        setError(false);
        try {
            const response = await apiFetch('/user/buzzer', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'تعذر إرسال النداء.');
            setMessage('تم إرسال النداء.');
            setStaffStatus(previous => previous ? { ...previous, alert: { id: result.eventId, state: 'pending' } } : previous);
        } catch (error) {
            setError(true);
            setMessage(error.message === 'Failed to fetch' ? 'تعذر الاتصال بالخادم. حاول مرة أخرى.' : error.message);
        } finally {
            pending.current = false;
            setSending(false);
        }
    }

    return <div className={styles.controls}>
        <div className={styles.controlRow}>
        <div className={styles.buzzerMount}>
            <button className={styles.pushButton} type="button" disabled={sending} aria-busy={sending} onClick={ring}>
                <svg className={styles.bellIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4M12 2V1" />
                </svg>
                <span>{sending ? 'جارٍ النداء…' : 'نداء الموظف'}</span>
            </button>
        </div>
        <EntryControl onStaffStatus={setStaffStatus} />
        </div>
        <div className={styles.staffStatus} role="status" aria-live="polite">
            <span className={`${styles.statusLight} ${staffStatus?.online ? styles.online : ''}`} aria-hidden="true" />
            <span>{!staffStatus ? 'حالة الموظف غير متاحة' : !staffStatus.linked ? 'لا يوجد حساب موظف مرتبط' : staffStatus.online ? 'الموظف متصل' : 'الموظف غير متصل'}</span>
            {staffStatus?.online && <span className={styles.soundStatus}>{staffStatus.soundEnabled ? 'الصوت مفعّل بالمتصفح' : 'الصوت غير مفعّل'}</span>}
            {staffStatus?.alert && <span className={styles.receipt}>{({
                pending: 'آخر نداء: بانتظار الاستلام',
                received: 'آخر نداء: وصل إلى الموظف — بانتظار الاطلاع',
                acknowledged: 'آخر نداء: أكد الموظف الاطلاع',
                expired: 'آخر نداء: انتهت مهلة الاستلام — أعد النداء',
            })[staffStatus.alert.state]}</span>}
        </div>
        {message && <p role={error ? 'alert' : 'status'}>{message}</p>}
    </div>;
}

export default function StaffBuzzer() {
    const audio = useRef(null);
    const seen = useRef(null);
    const lastPaused = useRef(null);
    const [paused, setPaused] = useState(null);
    const [enabled, setEnabled] = useState(false);
    const [alert, setAlert] = useState(null);
    const [acknowledging, setAcknowledging] = useState(false);
    const acknowledgmentPending = useRef(false);
    const [error, setError] = useState('');
    const [connectionError, setConnectionError] = useState(false);

    useEffect(() => {
        let stopped = false;
        let timer;
        let controller;
        const clientId = crypto.randomUUID();
        async function poll() {
            controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 8000);
            let retry = true;
            try {
                const soundEnabled = audio.current?.state === 'running';
                const response = await apiFetch('/user/buzzer/poll', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ clientId, soundEnabled, receivedEventId: seen.current }),
                    signal: controller.signal,
                });
                if ([401, 403].includes(response.status)) retry = false;
                if (!response.ok) throw new Error();
                const { event, paused: entryPaused } = await response.json();
                if (typeof entryPaused !== 'boolean') throw new Error();
                if (stopped) return;
                setConnectionError(false);
                setEnabled(audio.current?.state === 'running');
                const entryChanged = lastPaused.current !== null && lastPaused.current !== entryPaused;
                lastPaused.current = entryPaused;
                setPaused(entryPaused);
                const newCall = event && event.id !== seen.current;
                if (newCall) {
                    seen.current = event.id;
                    setAlert(event.acknowledged ? null : event.id);
                }
                if (!event || event.acknowledged) setAlert(current => !event || current === event.id ? null : current);
                if (((newCall && !event.acknowledged) || entryChanged) && !playBuzzer(audio.current)) setEnabled(false);
            } catch {
                if (!stopped) setConnectionError(true);
            } finally {
                clearTimeout(timeout);
                if (!stopped && retry) timer = setTimeout(poll, 2000);
            }
        }
        poll();
        return () => {
            stopped = true;
            clearTimeout(timer);
            controller?.abort();
            if (audio.current) {
                audio.current.close().catch(() => {});
                audio.current = null;
            }
        };
    }, []);

    async function acknowledge() {
        if (!alert || acknowledgmentPending.current) return;
        const eventId = alert;
        acknowledgmentPending.current = true;
        setAcknowledging(true);
        setError('');
        try {
            const response = await apiFetch('/user/buzzer/ack', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ eventId }),
            });
            if (!response.ok) {
                if (response.status === 404) setAlert(current => current === eventId ? null : current);
                throw new Error();
            }
            setAlert(current => current === eventId ? null : current);
        } catch {
            setError('تعذر تأكيد الاطلاع على النداء. حدّث الاتصال وحاول مرة أخرى.');
        } finally {
            acknowledgmentPending.current = false;
            setAcknowledging(false);
        }
    }

    async function enableSound() {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!audio.current) audio.current = new AudioContext();
            await audio.current.resume();
            if (!playBuzzer(audio.current)) throw new Error();
            setEnabled(true);
            setError('');
        } catch {
            setEnabled(false);
            setError('تعذر تشغيل الصوت. تحقق من إعدادات الصوت في المتصفح.');
        }
    }

    return <aside className={`${styles.receiver} ${alert ? styles.active : ''} ${paused ? styles.entryPaused : ''}`} aria-label="جرس الطبيب">
        <div role="status" aria-live="polite">
            <strong>{paused ? 'دخول المرضى متوقف — لا تسمح بدخول أي مريض.' : paused === null ? 'جارٍ التحقق من حالة دخول المرضى…' : 'دخول المرضى متاح'}</strong>
            {paused && <p>انتظر حتى يستأنف الطبيب دخول المرضى.</p>}
            {alert && <p>نداء من الطبيب — يرجى مراجعة الطبيب.</p>}
            <p>{connectionError ? 'انقطع الاتصال بالجرس. جارٍ إعادة الاتصال…' : enabled ? 'الصوت مفعّل — أبقِ الصفحة مفتوحة لاستقبال النداء.' : 'فعّل الصوت لسماع نداء الطبيب.'}</p>
        </div>
        <button className={styles.button} type="button" onClick={enableSound}>{enabled ? 'اختبار الصوت' : 'تفعيل الصوت'}</button>
        {alert && <button className={styles.button} type="button" disabled={acknowledging} onClick={acknowledge}>{acknowledging ? 'جارٍ التأكيد…' : 'تم الاطلاع'}</button>}
        {error && <p role="alert">{error}</p>}
    </aside>;
}
