'use client';

import { useState, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import styles from './UserDropdown.module.scss';

interface Props {
  userName: string | null;
  userEmail: string | null;
  userRole?: 'USER' | 'ADMIN';
  onLogout: () => void;
}

export default function UserDropdown({ userName, userEmail, userRole, onLogout }: Props) {
  const t = useTranslations('navbar');
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEsc);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [isOpen]);

  const close = () => setIsOpen(false);
  const initial = userName?.[0]?.toUpperCase() || '?';

  return (
    <div className={styles.wrapper} ref={ref}>
      <button
        className={styles.trigger}
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-label={t('my_profile')}
      >
        <span className={styles.avatar}>{initial}</span>
        {userName || t('profile')}
        <span className={`${styles.chevron} ${isOpen ? styles.open : ''}`}>&#9660;</span>
      </button>

      {isOpen && (
        <div className={styles.dropdown} role="menu">
          <div className={styles.header}>
            <div className={styles.name}>{userName}</div>
            {userEmail && <div className={styles.email}>{userEmail}</div>}
          </div>

          <div className={styles.section}>
            <Link href="/dashboard" className={styles.item} onClick={close} role="menuitem">
              {t('dashboard')}
            </Link>
            <Link href="/library" className={styles.item} onClick={close} role="menuitem">
              {t('library')}
            </Link>
            <Link href="/profile/translations" className={styles.item} onClick={close} role="menuitem">
              {t('translation_history')}
            </Link>
          </div>

          <div className={styles.section}>
            <Link href="/profile" className={styles.item} onClick={close} role="menuitem">
              {t('profile')}
            </Link>
            <Link href="/settings" className={styles.item} onClick={close} role="menuitem">
              {t('settings')}
            </Link>
          </div>

          {userRole === 'ADMIN' && (
            <div className={styles.section}>
              <Link href="/admin" className={styles.item} onClick={close} role="menuitem">
                {t('admin_panel')}
              </Link>
            </div>
          )}

          <div className={styles.section}>
            <button
              className={styles.logoutItem}
              onClick={() => { close(); onLogout(); }}
              role="menuitem"
            >
              {t('logout')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
