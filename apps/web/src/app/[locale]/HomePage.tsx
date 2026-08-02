// Server Component — the landing page is all-static markup, so there is no
// reason to ship a client bundle for it. Using getTranslations() async on the
// server cuts JS payload on what is by far the most-trafficked entry point
// and improves the LCP / TTI signals Google measures for ranking.
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { API_URL } from '@/lib/api-client';
import styles from '../page.module.scss';

type ShelfBook = {
  id: string;
  title: string;
  author?: string | null;
  coverUrl?: string | null;
  pageCount?: number | null;
};

// The "already translated" shelf is a trust device: real books, real page
// counts. If the API is unreachable at render time the section is simply
// omitted rather than showing invented titles.
async function fetchShelf(): Promise<ShelfBook[]> {
  try {
    const res = await fetch(`${API_URL}/api/books?page=1&limit=5`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const payload = await res.json();
    const books: ShelfBook[] = payload.data ?? payload.books ?? [];
    return books.slice(0, 5);
  } catch {
    return [];
  }
}

// The live-demo panel shows one fixed passage translating. Source and target
// are the same in both locales — it demonstrates EN → KA, so the strings are
// content, not UI copy.
const DEMO_SOURCE = [
  'It was the kind of afternoon that seemed to hold its breath. The harbour lay flat, the cranes idle, and somewhere behind the customs house a radio played a song nobody had asked for.',
  'Mara counted the ships twice and got a different number each time.',
];
const DEMO_TARGET = [
  'ეს იყო ისეთი შუადღე, თითქოს ქვეყანას სუნთქვა შეეკრა. ნავსადგური გაშლილიყო უძრავად, ამწეები დუმდნენ, საბაჟოს უკან კი რადიო უკრავდა სიმღერას, რომელსაც არავინ ითხოვდა.',
  'მარამ გემები ორჯერ დათვალა და ორჯერვე სხვა რიცხვი მიიღო.',
];

export default async function HomePage({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: 'home' });
  const shelf = await fetchShelf();

  return (
    <div className={styles.page}>
      {/* ---- Hero: 1.15fr / 1fr, 2px divider between and below ---- */}
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <span className={styles.eyebrow}>{t('hero_eyebrow')}</span>
          <h1 className={styles.title}>
            {t('hero_line1')}
            <br />
            {t('hero_line2')}
            <br />
            <span className={styles.highlight}>{t('hero_line3')}</span>
          </h1>
          <p className={styles.lead}>{t('hero_lead')}</p>
          <div className={styles.actions}>
            <Link href="/upload" className={styles.primaryBtn}>
              {t('cta_free')} <span aria-hidden="true">→</span>
            </Link>
            <a href="#demo" className={styles.secondaryBtn}>
              {t('cta_demo')}
            </a>
          </div>
          <div className={styles.stats}>
            <div className={styles.stat}>
              <div className={styles.statValue}>
                ~12<span className={styles.statUnit}>min</span>
              </div>
              <div className={styles.statLabel}>{t('stat_time_label')}</div>
            </div>
            <div className={styles.stat}>
              <div className={styles.statValue}>4</div>
              <div className={styles.statLabel}>{t('stat_formats_label')}</div>
            </div>
            <div className={styles.stat}>
              <div className={styles.statValue}>
                0<span className={styles.statUnit}>&#8382;</span>
              </div>
              <div className={styles.statLabel}>{t('stat_price_label')}</div>
            </div>
          </div>
        </div>
        <div className={styles.heroFigure}>
          <div className={styles.heroPlate}>
            <div className={styles.heroPlateKicker}>{t('hero_plate_kicker')}</div>
            <div className={styles.heroPlateText}>{t('hero_plate_text')}</div>
          </div>
        </div>
      </section>

      {/* ---- Live demo ---- */}
      <section id="demo" className={styles.demo}>
        <div className={styles.demoHead}>
          <h2 className={styles.sectionTitle}>{t('demo_title')}</h2>
          <p className={styles.demoNote}>{t('demo_note')}</p>
        </div>
        <div className={styles.demoPanel}>
          <div className={styles.demoSource}>
            <div className={styles.demoLabel}>
              <span>{t('demo_source_label')}</span>
              <span>p. 41</span>
            </div>
            {DEMO_SOURCE.map((line) => (
              <p key={line} className={styles.demoText}>
                {line}
              </p>
            ))}
          </div>
          <div className={styles.demoTarget}>
            <div className={`${styles.demoLabel} ${styles.demoLabelAccent}`}>
              <span>{t('demo_target_label')}</span>
              <span>2.1 წმ</span>
            </div>
            {DEMO_TARGET.map((line, i) => (
              <p
                key={line}
                className={`${styles.demoText} ${styles.demoReveal}`}
                style={{ animationDelay: `${0.1 + i}s` }}
              >
                {line}
                {i === DEMO_TARGET.length - 1 && <span className={styles.caret} aria-hidden="true" />}
              </p>
            ))}
            <div className={styles.demoTags}>
              <span className={styles.tag}>{t('demo_tag_tone')}</span>
              <span className={`${styles.tag} ${styles.tagAccent}`}>{t('demo_tag_context')}</span>
            </div>
          </div>
        </div>
      </section>

      {/* ---- How it works ---- */}
      <section className={styles.how}>
        <div className={styles.howHead}>
          <h2 className={styles.sectionTitle}>{t('how_title')}</h2>
        </div>
        <div className={styles.howGrid}>
          {(['1', '2', '3'] as const).map((n) => (
            <div key={n} className={styles.howCell}>
              <div className={styles.howNum}>0{n}</div>
              <h3 className={styles.howTitle}>{t(`how_${n}_title`)}</h3>
              <p className={styles.howDesc}>{t(`how_${n}_desc`)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---- Already translated ---- */}
      {shelf.length > 0 && (
        <section className={styles.shelf}>
          <div className={styles.shelfHead}>
            <h2 className={styles.sectionTitle}>{t('already_title')}</h2>
            <Link href="/library" className={styles.shelfLink}>
              {t('already_link')}
            </Link>
          </div>
          <div className={styles.shelfGrid}>
            {shelf.map((book) => (
              <Link key={book.id} href={`/books/${book.id}`} className={styles.shelfItem}>
                <div className={`${styles.cover} grayscale`}>
                  {book.coverUrl && (
                    // Covers come from arbitrary external hosts (Google Books,
                    // Open Library), so next/image optimisation is not worth the
                    // remote-pattern maintenance here.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={book.coverUrl} alt="" loading="lazy" />
                  )}
                </div>
                <div className={styles.shelfTitle}>{book.title}</div>
                <div className={styles.shelfMeta}>
                  {book.pageCount ? t('already_pages', { count: book.pageCount }) : book.author}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ---- Who it is for / FAQ ---- */}
      <section className={styles.split}>
        <div className={styles.who}>
          <div className={styles.colLabel}>{t('who_label')}</div>
          <div className={styles.whoRows}>
            {(['1', '2', '3', '4'] as const).map((n) => (
              <div key={n} className={styles.whoRow}>
                <div className={styles.whoLabel}>{t(`who_${n}_label`)}</div>
                <div className={styles.whoDesc}>{t(`who_${n}_desc`)}</div>
              </div>
            ))}
          </div>
        </div>
        <div className={styles.faq}>
          <div className={styles.colLabel}>{t('faq_label')}</div>
          <div className={styles.faqList}>
            {(['1', '2', '3', '4'] as const).map((n) => (
              <details key={n} className={styles.faqItem}>
                <summary className={styles.faqQ}>{t(`faq_${n}_q`)}</summary>
                <p className={styles.faqA}>{t(`faq_${n}_a`)}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ---- Poster close: the only place the accent runs as a field ---- */}
      <section className={styles.poster}>
        <div className={styles.posterEyebrow}>{t('poster_eyebrow')}</div>
        <h2 className={styles.posterTitle}>
          {t('poster_line1')}
          <br />
          {t('poster_line2')}
          <br />
          {t('poster_line3')}
        </h2>
        <div className={styles.posterActions}>
          <Link href="/upload" className={styles.posterBtn}>
            {t('poster_cta_upload')}
          </Link>
          <Link href="/library" className={styles.posterBtnOutline}>
            {t('poster_cta_reader')}
          </Link>
        </div>
      </section>
    </div>
  );
}
