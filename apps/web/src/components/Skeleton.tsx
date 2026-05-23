import styles from './Skeleton.module.scss';

type SkeletonVariant = 'text' | 'title' | 'avatar' | 'image' | 'card' | 'block';

interface SkeletonProps {
  variant?: SkeletonVariant;
  /** Pixel or % width override (defaults vary by variant). */
  width?: string | number;
  /** Pixel or % height override (defaults vary by variant). */
  height?: string | number;
  /** Optional extra class — caller can extend layout/positioning. */
  className?: string;
  /** When true, animate; the shimmer also respects prefers-reduced-motion. */
  animate?: boolean;
}

/**
 * Loading placeholder. Sized to roughly match the real content so the page
 * doesn't jump when data arrives. Always non-interactive and hidden from the
 * accessibility tree (the parent should set aria-busy / aria-live).
 */
export default function Skeleton({
  variant = 'text',
  width,
  height,
  className,
  animate = true,
}: SkeletonProps) {
  const style: React.CSSProperties = {};
  if (width !== undefined) style.width = typeof width === 'number' ? `${width}px` : width;
  if (height !== undefined) style.height = typeof height === 'number' ? `${height}px` : height;

  return (
    <span
      aria-hidden="true"
      className={[
        styles.skeleton,
        styles[variant],
        animate ? styles.animate : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={style}
    />
  );
}
