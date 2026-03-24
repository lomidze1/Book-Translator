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
