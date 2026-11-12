import Image from 'next/image';

/**
 * Domio logo, built from the supplied brand artwork (public/brand/*).
 *  - "mark"       : the terracotta house tile only
 *  - "horizontal" : tile + "Domio" wordmark side by side (headers, navs)
 *  - "full"       : the stacked lockup (login / register / hero)
 * `height` is the rendered height in px of the primary image.
 */
export default function Logo({
  variant = 'horizontal',
  height,
  className = '',
  priority = false,
}: {
  variant?: 'mark' | 'horizontal' | 'full';
  height?: number;
  className?: string;
  priority?: boolean;
}) {
  if (variant === 'mark') {
    const h = height ?? 40;
    return (
      <Image
        src="/brand/logo-mark.png"
        alt="Domio"
        width={h}
        height={h}
        priority={priority}
        className={className}
      />
    );
  }
  if (variant === 'full') {
    const h = height ?? 180;
    // source art is 479 x 491
    return (
      <Image
        src="/brand/logo-full.png"
        alt="Domio"
        width={Math.round((h * 479) / 491)}
        height={h}
        priority={priority}
        className={className}
      />
    );
  }
  const markH = height ?? 36;
  const wordH = Math.round(markH * 0.52);
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <Image src="/brand/logo-mark.png" alt="" width={markH} height={markH} priority={priority} />
      <Image
        src="/brand/logo-wordmark.png"
        alt="Domio"
        width={Math.round((wordH * 479) / 133)}
        height={wordH}
        priority={priority}
      />
    </span>
  );
}
