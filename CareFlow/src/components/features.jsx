import { Link } from 'react-router-dom';
import styles from './features.module.css';

const features = [
  {
    title: 'سجل واضح لكل مريض',
    description: 'سجّل بيانات المريض وابحث بالاسم أو رقم الملف أو الهاتف أو المدينة للوصول إلى سجله بسهولة.',
    icon: <><path d="M14 3H5v18h14V8zM14 3v5h5M8 12h8M8 16h5" /></>,
  },
  {
    title: 'قائمة انتظار منظّمة',
    description: 'أضف المرضى إلى الانتظار، وتابع الزيارات المفتوحة والمكتملة من خلال أرقام دور واضحة ومميّزة.',
    icon: <><path d="M10 6h11M10 12h11M10 18h11M3 5h2v3M3 11h3l-3 3h3M3 17h3v3H3" /></>,
  },
  {
    title: 'التاريخ الطبي في مكان واحد',
    description: 'راجع المعلومات الطبية والزيارات السابقة، وسجّل الأعراض والفحص والعلاج وملاحظات الزيارة الحالية.',
    icon: <><path d="M8 4H4v17h16V4h-4M9 14h6M12 11v6" /><rect x="8" y="2" width="8" height="5" rx="1" /></>,
  },
  {
    title: 'تنقّل بين الزيارات',
    description: 'افتح عدة زيارات معاً وانتقل بينها، مع بقاء الملاحظات التي تكتبها أثناء التنقل داخل مساحة العمل.',
    icon: <><path d="M8 3h13v13M3 10h13M6 7v3M10 7v3" /><rect x="3" y="7" width="13" height="14" rx="2" /></>,
  },
  {
    title: 'تواصل مباشر مع الموظف',
    description: 'أرسل جرس نداء وتابع تأكيد الاطلاع، أو أوقف دخول المرضى وأبلغ الموظف عند استئنافه.',
    icon: <><path d="M18 8a6 6 0 0 0-12 0c0 6-3 6-3 9h18c0-3-3-3-3-9M10 21h4M12 2V1" /></>,
  },
  {
    title: 'صلاحيات تناسب الفريق',
    description: 'يتولى الموظف تسجيل المرضى وتنظيم الانتظار، بينما يراجع الطبيب السجل الطبي ويسجّل الزيارات.',
    icon: <><circle cx="9" cy="7" r="3" /><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6M18 13a5 5 0 0 1 3 5v3" /></>,
  },
];

export default function Features() {
  return <section id="features" className={styles.section} aria-labelledby="features-title" dir="rtl">
    <div className={styles.container}>
      <header className={styles.heading}>
        <span className={styles.eyebrow}>المميزات</span>
        <h2 id="features-title">من استقبال المريض إلى إتمام زيارته.</h2>
        <p>أدوات مترابطة تساعد الطبيب والموظف على تنظيم يوم العيادة ومتابعة كل خطوة.</p>
      </header>
      <div className={styles.grid}>
        {features.map(feature => <article key={feature.title} className={styles.card}>
          <span className={styles.icon}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
              strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{feature.icon}</svg>
          </span>
          <h3>{feature.title}</h3>
          <p>{feature.description}</p>
        </article>)}
      </div>
      <div className={styles.tryDemo}>
        <p>اكتشف المميزات بنفسك بحساب طبيب أو موظف تجريبي.</p>
        <Link to="/demo">جرّب بدون تسجيل <span aria-hidden="true">←</span></Link>
      </div>
    </div>
  </section>;
}
