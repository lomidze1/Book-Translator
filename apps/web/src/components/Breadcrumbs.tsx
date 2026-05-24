import { Link } from '@/i18n/navigation';
import styles from './Breadcrumbs.module.scss';

export interface BreadcrumbItem {
  /** Visible text. */
  label: string;
  /** When omitted the item is rendered as the current page (non-link). */
  href?: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  /** Accessible name for the nav landmark. Defaults to "Breadcrumb". */
  ariaLabel?: string;
}

/**
 * Visual breadcrumb trail. The structured-data version (BreadcrumbList JSON-LD)
 * is emitted separately in /books/[id]/page.tsx — this component is for users,
 * not crawlers, so it does not duplicate the schema.
 *
 * The last item is rendered as plain text (current page) — never linked,
 * matches the WAI-ARIA breadcrumb pattern.
 */
export default function Breadcrumbs({ items, ariaLabel = 'Breadcrumb' }: BreadcrumbsProps) {
  if (items.length === 0) return null;

  return (
    <nav aria-label={ariaLabel} className={styles.nav}>
      <ol className={styles.list}>
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          return (
            <li key={`${item.label}-${i}`} className={styles.item}>
              {isLast || !item.href ? (
                <span className={styles.current} aria-current="page">
                  {item.label}
                </span>
              ) : (
                <Link href={item.href} className={styles.link}>
                  {item.label}
                </Link>
              )}
              {!isLast && (
                <span aria-hidden="true" className={styles.separator}>
                  /
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
