'use client';

import { useState } from 'react';
import Link from 'next/link';
import styles from './page.module.scss';

export default function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (password !== confirmPassword) {
      setError('პაროლები არ ემთხვევა');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message || 'რეგისტრაცია ვერ მოხერხდა');
        return;
      }

      setSuccess('რეგისტრაცია წარმატებით დასრულდა! შეამოწმეთ ელ-ფოსტა.');
    } catch {
      setError('სერვერთან კავშირი ვერ მოხერხდა');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.formCard}>
        <h1 className={styles.title}>რეგისტრაცია</h1>

        {error && <p className={styles.error}>{error}</p>}
        {success && <p className={styles.success}>{success}</p>}

        <form onSubmit={handleSubmit} className={styles.form}>
          <label className={styles.label}>
            სახელი
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="თქვენი სახელი"
              className={styles.input}
            />
          </label>

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
              placeholder="მინიმუმ 8 სიმბოლო"
              required
              minLength={8}
              className={styles.input}
            />
          </label>

          <label className={styles.label}>
            პაროლის დადასტურება
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="გაიმეორეთ პაროლი"
              required
              minLength={8}
              className={styles.input}
            />
          </label>

          <button type="submit" disabled={loading} className={styles.submitBtn}>
            {loading ? 'იტვირთება...' : 'რეგისტრაცია'}
          </button>
        </form>

        <p className={styles.switchLink}>
          უკვე გაქვს ანგარიში?{' '}
          <Link href="/login">შესვლა</Link>
        </p>
      </div>
    </div>
  );
}
