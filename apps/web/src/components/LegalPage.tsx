import styles from './LegalPage.module.scss';

export interface LegalSection {
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
  outro?: string[];
}

export interface LegalDoc {
  title: string;
  updated: string;
  intro: string[];
  sections: LegalSection[];
}

export default function LegalPage({ doc }: { doc: LegalDoc }) {
  return (
    <main className={styles.legal}>
      <h1>{doc.title}</h1>
      <p className={styles.updated}>{doc.updated}</p>
      {doc.intro.map((paragraph, i) => (
        <p key={i}>{paragraph}</p>
      ))}
      {doc.sections.map((section, i) => (
        <section key={i}>
          <h2>
            {i + 1}. {section.heading}
          </h2>
          {section.paragraphs?.map((paragraph, j) => (
            <p key={j}>{paragraph}</p>
          ))}
          {section.bullets && (
            <ul>
              {section.bullets.map((bullet, j) => (
                <li key={j}>{bullet}</li>
              ))}
            </ul>
          )}
          {section.outro?.map((paragraph, j) => (
            <p key={j}>{paragraph}</p>
          ))}
        </section>
      ))}
    </main>
  );
}
