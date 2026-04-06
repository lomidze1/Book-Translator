'use client';

import { useTranslations } from 'next-intl';
import styles from './NotificationCenter.module.scss';

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

interface Props {
  notifications: Notification[];
  unreadCount: number;
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  onClose: () => void;
}

function timeAgo(dateStr: string, t: (key: string, params?: Record<string, string | number | Date>) => string): string {
  const now = Date.now();
  const diff = now - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return t('just_now');
  if (minutes < 60) return t('minutes_ago', { count: minutes });
  if (hours < 24) return t('hours_ago', { count: hours });
  return t('days_ago', { count: days });
}

export default function NotificationCenter({
  notifications,
  unreadCount,
  onMarkAsRead,
  onMarkAllAsRead,
  onClose,
}: Props) {
  const t = useTranslations('notifications');

  return (
    <div className={styles.center}>
      <div className={styles.header}>
        <h3 className={styles.title}>{t('title')}</h3>
        {unreadCount > 0 && (
          <button className={styles.markAll} onClick={onMarkAllAsRead}>
            {t('mark_all_read')}
          </button>
        )}
      </div>

      <div className={styles.list}>
        {notifications.length === 0 ? (
          <p className={styles.empty}>{t('no_notifications')}</p>
        ) : (
          notifications.map(n => (
            <button
              key={n.id}
              className={`${styles.item} ${!n.read ? styles.unread : ''}`}
              onClick={() => {
                if (!n.read) onMarkAsRead(n.id);
                onClose();
              }}
            >
              <div className={styles.itemContent}>
                <span className={styles.itemTitle}>{n.title}</span>
                <span className={styles.itemBody}>{n.body}</span>
                <span className={styles.itemTime}>{timeAgo(n.createdAt, t)}</span>
              </div>
              {!n.read && <span className={styles.dot} />}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
