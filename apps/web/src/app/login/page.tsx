'use client';

import { useState } from 'react';
import Link from 'next/link';
import styles from './page.module.scss';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message || 'შესვლა ვერ მოხერხდა');
        return;
      }

      // TODO: Store tokens and redirect
      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('refreshToken', data.refreshToken);
      window.location.href = '/';
    } catch {
      setError('სერვერთან კავშირი ვერ მოხერხდა');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.formCard}>
        <h1 className={styles.title}>შესვლა</h1>

        {error && <p className={styles.error}>{error}</p>}

        <form onSubmit={handleSubmit} className={styles.form}>
          <label className={styles.label}>
            ელ-ფოსტა
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              className={styles.input}
            />
          </label>

          <label className={styles.label}>
            პაროლი
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="პაროლი"
              required
              minLength={8}
              className={styles.input}
            />
          </label>

          <button type="submit" disabled={loading} className={styles.submitBtn}>
            {loading ? 'იტვირთება...' : 'შესვლა'}
          </button>
        </form>

        <p className={styles.switchLink}>
          არ გაქვს ანგარიში?{' '}
          <Link href="/register">რეგისტრაცია</Link>
        </p>
      </div>
    </div>
  );
}
