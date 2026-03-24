import styles from './Footer.module.scss';

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.container}>
        <p>&copy; {new Date().getFullYear()} Book Translator. ყველა უფლება დაცულია.</p>
      </div>
    </footer>
  );
}
