import Link from 'next/link';
import styles from './Navbar.module.scss';

export default function Navbar() {
  return (
    <nav className={styles.navbar}>
      <div className={styles.container}>
        <Link href="/" className={styles.logo}>
          Book Translator
        </Link>
        <div className={styles.links}>
          <Link href="/search" className={styles.navLink}>
            ძებნა
          </Link>
          <Link href="/upload" className={styles.navLink}>
            ატვირთვა
          </Link>
          <Link href="/login" className={styles.loginBtn}>
            შესვლა
          </Link>
          <Link href="/register" className={styles.registerBtn}>
            რეგისტრაცია
          </Link>
        </div>
      </div>
    </nav>
  );
}
