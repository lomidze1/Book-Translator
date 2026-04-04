'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { useRouter, Link } from '@/i18n/navigation';
import styles from './profile.module.scss';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface UserProfile {
  id: string;
  email: string | null;
  phone: string | null;
  name: string | null;
  avatar: string | null;
  role: string;
  locale: string;
  emailVerified: string | null;
  phoneVerified: boolean;
  createdAt: string;
}

export default function ProfilePage() {
  const t = useTranslations('profile');
  const { user: authUser, isLoggedIn, isLoading, logout } = useAuth();
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!isLoading && !isLoggedIn) {
      router.push('/');
      return;
    }

    if (!isLoggedIn) return;

    const token = localStorage.getItem('accessToken');
    if (!token) return;

    fetch(`${API_URL}/api/users/profile`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error('Failed');
        return res.json();
      })
      .then((data) => {
        setProfile(data);
        setName(data.name || '');
      })
      .catch(() => {
        if (authUser) {
          setProfile({
            id: authUser.id,
            email: authUser.email,
            phone: null,
            name: authUser.name,
            avatar: null,
            role: 'USER',
            locale: 'ka',
            emailVerified: null,
            phoneVerified: false,
            createdAt: new Date().toISOString(),
          });
          setName(authUser.name || '');
        } else {
          setProfile(null);
        }
      })
      .finally(() => setLoading(false));
  }, [isLoggedIn, isLoading, router, authUser]);

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    const token = localStorage.getItem('accessToken');

    try {
      const res = await fetch(`${API_URL}/api/users/profile`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name }),
      });

      if (!res.ok) throw new Error('Failed');

      const updated = await res.json();
      setProfile(updated);
      setEditing(false);
      setMessage(t('updated'));
    } catch {
      setMessage(t('update_error'));
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  if (isLoading || loading) {
    return (
      <div className={styles.container}>
        <p className={styles.loading}>{t('loading')}</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className={styles.container}>
        <p role="alert">{t('load_error')}</p>
      </div>
    );
  }

  const roleKey = `role_${profile.role.toLowerCase()}` as 'role_user' | 'role_admin';
  const memberDate = new Date(profile.createdAt).toLocaleDateString('ka-GE', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.header}>
          <h1>{profile.name || profile.email || 'User'}</h1>
          <span className={styles.roleBadge}>{t(roleKey)}</span>
        </div>

        <div className={styles.info}>
          <div className={styles.field}>
            <label>{t('email')}</label>
            <span>{profile.email || '—'}</span>
          </div>

          {profile.phone && (
            <div className={styles.field}>
              <label>{t('phone')}</label>
              <span>{profile.phone}</span>
            </div>
          )}

          <div className={styles.field}>
            <label>{t('name')}</label>
            {editing ? (
              <div className={styles.editRow}>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={styles.input}
                  autoFocus
                />
                <button onClick={handleSave} disabled={saving} className={styles.saveBtn}>
                  {saving ? '...' : t('save')}
                </button>
                <button onClick={() => setEditing(false)} className={styles.cancelBtn}>
                  {t('cancel')}
                </button>
              </div>
            ) : (
              <div className={styles.nameRow}>
                <span>{profile.name || '—'}</span>
                <button onClick={() => setEditing(true)} className={styles.editBtn}>
                  {t('edit')}
                </button>
              </div>
            )}
          </div>

          <div className={styles.field}>
            <label>{t('member_since')}</label>
            <span>{memberDate}</span>
          </div>
        </div>

        {message && (
          <p className={styles.message} role="alert">
            {message}
          </p>
        )}

        <div className={styles.actions}>
          <Link href="/profile/change-password" className={styles.actionLink}>
            <svg className={styles.actionIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span>{t('change_password')}</span>
            <svg className={styles.actionArrow} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </Link>
          <Link href="/profile/translations" className={styles.actionLink}>
            <svg className={styles.actionIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
            <span>{t('my_translations')}</span>
            <svg className={styles.actionArrow} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </Link>
          <Link href="/profile/favorites" className={styles.actionLink}>
            <svg className={styles.actionIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
            <span>{t('my_favorites')}</span>
            <svg className={styles.actionArrow} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </Link>
          <Link href="/profile/payments" className={styles.actionLink}>
            <svg className={styles.actionIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
              <line x1="1" y1="10" x2="23" y2="10" />
            </svg>
            <span>{t('my_payments')}</span>
            <svg className={styles.actionArrow} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </Link>
        </div>

        <button onClick={handleLogout} className={styles.logoutBtn}>
          <svg className={styles.actionIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          {t('logout')}
        </button>
      </div>
    </div>
  );
}
