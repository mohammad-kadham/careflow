import { useEffect, useRef } from 'react';
import { isRouteErrorResponse, useRouteError } from 'react-router-dom';
import styles from './error.module.css';
import SeoMetadata from '../seo/metadata.jsx';
import { getMetadata } from '../seo/metadata';

export default function ErrorPage({ notFound = false, manageMetadata = true }) {
    const error = useRouteError();
    const headingRef = useRef(null);
    const missing = notFound || (isRouteErrorResponse(error) && error.status === 404);
    const title = missing ? 'الصفحة غير موجودة' : 'تعذّر عرض الصفحة';

    useEffect(() => {
        headingRef.current?.focus();
    }, [missing]);

    return <main className={styles.page} dir="rtl" lang="ar">
        {manageMetadata && <SeoMetadata metadata={{ ...getMetadata('/404'), title: `${title} | كيرفلو` }} />}
        <a href="/" className={styles.brand} aria-label="كيرفلو — الصفحة الرئيسية">كيرفلو<span>.</span></a>
        <section className={styles.card} aria-labelledby="error-title">
            <div className={styles.symbol} aria-hidden="true">{missing ? '404' : '!'}</div>
            <p className={styles.eyebrow}>{missing ? 'لنعُد إلى المسار الصحيح' : 'حدث خطأ غير متوقع'}</p>
            <h1 id="error-title" ref={headingRef} tabIndex={-1}>{title}</h1>
            <p className={styles.description}>{missing
                ? 'قد يكون الرابط غير صحيح أو أن الصفحة لم تعد متاحة. يمكنك العودة إلى الصفحة الرئيسية والمتابعة من هناك.'
                : 'واجهنا مشكلة أثناء عرض هذه الصفحة. حاول إعادة تحميلها، وإذا استمرت المشكلة، أعد المحاولة لاحقًا.'}</p>
            <div className={styles.actions}>
                {!missing && <button type="button" className={styles.primary} onClick={() => window.location.reload()}>إعادة تحميل الصفحة</button>}
                {/* A full navigation also clears a failed lazy import or render boundary. */}
                <a href="/" className={missing ? styles.primary : styles.secondary}>العودة إلى الرئيسية</a>
            </div>
            {!missing && <p className={styles.note}>قد تفقد التغييرات غير المحفوظة عند إعادة تحميل الصفحة أو مغادرتها.</p>}
        </section>
        <p className={styles.footer}>كيرفلو — إدارة أسهل. رعاية أفضل.</p>
    </main>;
}
