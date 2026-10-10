import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import AppPage from '../pages/app-page';
import styles from '../pages/auth.module.css';
import { onUnauthorized, onSubscriptionRequired } from '../api';
import { getSession, signOut } from './session';
import SubscriptionPage from '../pages/subscription';

export default function ProtectedApp({ billingOnly = false }) {
    const location = useLocation();
    const [session, setSession] = useState({ status: 'loading' });
    const [attempt, setAttempt] = useState(0);
    const [loggingOut, setLoggingOut] = useState(false);
    const [logoutError, setLogoutError] = useState('');
    const logoutRef = useRef(false);
    const sessionRequestRef = useRef(0);

    useEffect(() => {
        const controller = new AbortController();
        const unsubscribe = onUnauthorized(() => {
            sessionRequestRef.current++;
            setSession({ status: 'anonymous', reason: 'expired' });
        });
        const unsubscribeSubscription = onSubscriptionRequired(() => {
            setSession(previous => previous.status === 'authenticated' ? {
                ...previous, user: { ...previous.user, subscription: { ...previous.user.subscription, active: false } },
            } : previous);
        });

        async function checkSession(background = false) {
            if (logoutRef.current) return;
            const request = ++sessionRequestRef.current;
            try {
                const user = await getSession(controller.signal);
                if (!controller.signal.aborted && request === sessionRequestRef.current) {
                    setSession(user ? { status: 'authenticated', user }
                        : { status: 'anonymous', reason: 'required' });
                }
            } catch {
                if (!controller.signal.aborted && request === sessionRequestRef.current) {
                    setSession(previous => background && previous.status !== 'loading'
                        ? previous : { status: 'error' });
                }
            }
        }
        function refreshSession() {
            if (document.visibilityState === 'visible') checkSession(true);
        }
        checkSession();
        const timer = setInterval(refreshSession, 60000);
        window.addEventListener('focus', refreshSession);
        document.addEventListener('visibilitychange', refreshSession);
        return () => {
            controller.abort();
            unsubscribe();
            unsubscribeSubscription();
            clearInterval(timer);
            window.removeEventListener('focus', refreshSession);
            document.removeEventListener('visibilitychange', refreshSession);
        };
    }, [attempt]);

    async function handleLogout() {
        if (logoutRef.current) return;
        logoutRef.current = true;
        sessionRequestRef.current++;
        setLoggingOut(true);
        setLogoutError('');
        try {
            await signOut();
            setSession({ status: 'anonymous', reason: 'signed-out' });
        } catch {
            setLogoutError('تعذر تأكيد تسجيل الخروج. تحقق من اتصال الخادم وأعد المحاولة.');
        } finally {
            logoutRef.current = false;
            setLoggingOut(false);
        }
    }

    if (session.status === 'anonymous') {
        return <Navigate to={`/login${location.search}`} replace state={{ reason: session.reason }} />;
    }
    if (session.status === 'authenticated') {
        if (billingOnly || session.user.subscription?.active !== true) {
            return <SubscriptionPage user={session.user}
                onSubscriptionChanged={subscription => {
                    sessionRequestRef.current++;
                    setSession(previous => previous.status === 'authenticated' && !logoutRef.current &&
                        previous.user.id === session.user.id && previous.user.clinic_id === session.user.clinic_id
                        ? { ...previous, user: { ...previous.user, subscription } } : previous);
                }}
                onLogout={handleLogout} loggingOut={loggingOut} logoutError={logoutError} />;
        }
        return <AppPage key={`${session.user.id}:${session.user.clinic_id}:${session.user.role}`}
            user={session.user} onLogout={handleLogout} loggingOut={loggingOut} logoutError={logoutError} />;
    }
    return <main className={styles.page} dir="rtl">
        <section className={styles.card} aria-label="التحقق من تسجيل الدخول">
            {session.status === 'loading'
                ? <p role="status">جارٍ التحقق من تسجيل الدخول…</p>
                : <>
                    <p className={styles.error} role="alert">تعذر الاتصال بالخادم للتحقق من تسجيل الدخول.</p>
                    <button className={styles.button} type="button" onClick={() => {
                        setSession({ status: 'loading' });
                        setAttempt(value => value + 1);
                    }}>إعادة المحاولة</button>
                    <p className={styles.switch}><Link to="/login">العودة إلى تسجيل الدخول</Link></p>
                </>}
        </section>
    </main>;
}
