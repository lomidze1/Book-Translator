'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from '@/i18n/navigation';
import Image from 'next/image';
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
        // Use cached auth user as fallback if API fails (e.g. rate limited)
        if (authUser) {
          setProfile({
            id: authUser.id,
            email: authUser.email,
            phone: null,
            name: authUser.name,
            avatar: authUser.avatar,
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
    return <div className={styles.container}><p className={styles.loading}>{t('loading')}</p></div>;
  }

  if (!profile) {
    return <div className={styles.container}><p role="alert">{t('load_error')}</p></div>;
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.header}>
          <div className={styles.avatar}>
            {profile.avatar ? (
              <Image src={profile.avatar} alt={profile.name || 'Avatar'} width={80} height={80} />
            ) : (
              <span>{(profile.name || profile.email || '?')[0].toUpperCase()}</span>
            )}
          </div>
          <h1>{profile.name || profile.email || 'User'}</h1>
          <p className={styles.role}>{profile.role}</p>
        </div>

        <div className={styles.info}>
          <div className={styles.field}>
            <label>{t('email')}</label>
            <span>{profile.email || '—'}</span>
            {profile.emailVerified && <span className={styles.verified}>{t('verified')}</span>}
          </div>

          {profile.phone && (
            <div className={styles.field}>
              <label>{t('phone')}</label>
              <span>{profile.phone}</span>
              {profile.phoneVerified && <span className={styles.verified}>{t('verified')}</span>}
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
                />
                <button onClick={handleSave} disabled={saving} className={styles.saveBtn}>
                  {saving ? '...' : t('save')}
                </button>
                <button onClick={() => setEditing(false)} className={styles.cancelBtn}>
                  {t('cancel')}
                </button>
              </div>
            ) : (
              <div className={styles.editRow}>
                <span>{profile.name || '—'}</span>
                <button onClick={() => setEditing(true)} className={styles.editBtn}>
                  {t('edit')}
                </button>
              </div>
            )}
          </div>

          <div className={styles.field}>
            <label>{t('member_since')}</label>
            <span>{new Date(profile.createdAt).toLocaleDateString()}</span>
          </div>
        </div>

        {message && <p className={styles.message} role="alert">{message}</p>}

        <button onClick={handleLogout} className={styles.logoutBtn}>
          {t('logout')}
        </button>
      </div>
    </div>
  );
}
