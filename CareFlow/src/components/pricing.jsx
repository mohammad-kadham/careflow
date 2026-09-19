import { useState } from "react";
import styles from "./pricing.module.css";

const plans = [
  { name: "الأساسية", price: 15, description: "بداية بسيطة لتنظيم عيادتك." },
  { name: "المتقدمة", price: 25, description: "خطوة جديدة مع نمو عيادتك.", featured: true },
  { name: "الاحترافية", price: 50, description: "للمرحلة القادمة من نجاح عيادتك." },
];

export default function Pricing() {
  const [selectedPlan, setSelectedPlan] = useState(null);

  return (
    <section id="pricing" className={styles.section} aria-labelledby="pricing-title">
      <div className={styles.heading}>
        <span className={styles.eyebrow}>الأسعار</span>
        <h2 id="pricing-title" className={styles.title}>باقة تناسب عيادتك.</h2>
        <p className={styles.subtitle}>اختر الباقة الأنسب لك. جميع الأسعار بالدولار الأمريكي، والاشتراك شهري.</p>
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
              <span className={styles.period}> دولارًا / شهر</span>
            </p>
            <button
              type="button"
              className={styles.choose}
              aria-pressed={selectedPlan === plan.name}
              onClick={() => setSelectedPlan(plan.name)}
            >
              {selectedPlan === plan.name ? `تم اختيار ${plan.name}` : `اختر ${plan.name}`}
            </button>
          </article>
        ))}
      </div>
      <p className={styles.status} role="status">
        {selectedPlan ? `تم اختيار الباقة ${selectedPlan}. لم يتم تفعيل أي اشتراك بعد.` : ""}
      </p>
    </section>
  );
}
