import Link from 'next/link';
import styles from './page.module.scss';

export default function HomePage() {
  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <h1 className={styles.title}>
          წიგნების <span className={styles.highlight}>AI თარგმანი</span> ქართულად
        </h1>
        <p className={styles.subtitle}>
          ატვირთე ინგლისურენოვანი წიგნი PDF, EPUB ან DOCX ფორმატში და მიიღე
          ხარისხიანი ქართული თარგმანი Claude AI-ის მეშვეობით.
        </p>
        <div className={styles.actions}>
          <Link href="/register" className={styles.primaryBtn}>
            დაიწყე უფასოდ
          </Link>
          <Link href="#features" className={styles.secondaryBtn}>
            გაიგე მეტი
          </Link>
        </div>
      </section>

      <section id="features" className={styles.features}>
        <h2 className={styles.sectionTitle}>რას გთავაზობთ</h2>
        <div className={styles.grid}>
          <div className={styles.card}>
            <h3>AI თარგმანი</h3>
            <p>Claude API-ის მეშვეობით მაღალხარისხიანი, კონტექსტის გათვალისწინებით თარგმანი.</p>
          </div>
          <div className={styles.card}>
            <h3>Online Reader</h3>
            <p>წაიკითხე ნათარგმნი წიგნი ჩაშენებულ რიდერში სანიშნეებით და ხაზგასმებით.</p>
          </div>
          <div className={styles.card}>
            <h3>ხმოვანი წაკითხვა</h3>
            <p>მოისმინე წიგნი ქართულად Text-to-Speech ტექნოლოგიით.</p>
          </div>
          <div className={styles.card}>
            <h3>მრავალი ფორმატი</h3>
            <p>PDF, EPUB, TXT, DOCX — ატვირთე ნებისმიერი ფორმატის წიგნი.</p>
          </div>
        </div>
      </section>

      <section className={styles.pricing}>
        <h2 className={styles.sectionTitle}>ფასები</h2>
        <div className={styles.priceGrid}>
          <div className={styles.priceCard}>
            <h3>ახალი წიგნი</h3>
            <p className={styles.price}>10 &#8382;</p>
            <p>სრული თარგმანი ინგლისურიდან ქართულად</p>
          </div>
          <div className={styles.priceCard}>
            <h3>არსებული თარგმანი</h3>
            <p className={styles.price}>5 &#8382;</p>
            <p>უკვე ნათარგმნი წიგნის წვდომა</p>
          </div>
        </div>
      </section>
    </div>
  );
}
