import { Link } from 'react-router-dom';
import { subscriptionPlans } from '../billing';
import styles from "./pricing.module.css";

const features = [
  'تسجيل بيانات المرضى والبحث في سجلاتهم',
  'إدارة قائمة الانتظار ومتابعة حالة الزيارة',
  'عرض السجل الطبي والزيارات السابقة',
  'تسجيل تفاصيل الزيارة وحفظها',
  'فتح عدة زيارات والتنقّل بينها',
  'جرس نداء للموظف مع تأكيد الاستلام',
  'إيقاف دخول المرضى واستئنافه',
  'صلاحيات منفصلة للطبيب والموظف',
];

const plans = [
  { ...subscriptionPlans[0], description: "بداية بسيطة لتنظيم عيادتك.", accounts: ['حساب طبيب واحد', 'حساب موظف واحد'] },
  { ...subscriptionPlans[1], description: "مساحة أكبر لفريق عيادتك.", accounts: ['حسابان للأطباء', '٣ حسابات للموظفين'], featured: true },
];

export default function Pricing() {

  return (
    <section id="pricing" className={styles.section} aria-labelledby="pricing-title">
      <div className={styles.heading}>
        <span className={styles.eyebrow}>الأسعار</span>
        <h2 id="pricing-title" className={styles.title}>باقة تناسب عيادتك.</h2>
        <p className={styles.subtitle}>اختر الباقة الأنسب لك. جميع الأسعار بالدينار العراقي، والاشتراك شهري.</p>
      </div>

      <div className={styles.grid}>
        {plans.map((plan) => (
          <article
            key={plan.name}
            className={`${styles.card} ${plan.featured ? styles.featured : ""}`}
          >
            <div className={styles.planHeader}>
              <h3>{plan.name}</h3>
              {plan.featured && <span className={styles.badge}>نوصي بها</span>}
            </div>
            <p className={styles.description}>{plan.description}</p>
            <p className={styles.price}>
              <span className={styles.amount}>{plan.price.toLocaleString("ar-IQ")}</span>
              <span className={styles.period}> د.ع / شهر</span>
            </p>
            <ul className={styles.accounts} aria-label="الحسابات المشمولة">
              {plan.accounts.map(account => <li key={account}>
                <span aria-hidden="true">✓</span>{account}
              </li>)}
            </ul>
            <h4 className={styles.featuresTitle}>المميزات المشمولة</h4>
            <ul className={styles.features} aria-label={`مميزات الباقة ${plan.name}`}>
              {features.map(feature => <li key={feature}>
                <span className={styles.check} aria-hidden="true">✓</span>
                <span>{feature}</span>
              </li>)}
            </ul>
            <Link
              to={`/subscription?plan=${plan.id}`}
              className={styles.choose}
            >
              {`اشترك في ${plan.name}`}
            </Link>
          </article>
        ))}
      </div>
      <p className={styles.status} role="status">
        الدفع بتحويل يدوي عبر Qi Card. يتم تفعيل الاشتراك بعد استلام المبلغ ومراجعته.
      </p>
    </section>
  );
}
