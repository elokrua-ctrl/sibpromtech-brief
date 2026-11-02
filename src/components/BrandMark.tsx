import { BRAND } from '../config/brand';

/**
 * Логотип из брендбука, если он подключён в config/brand.ts.
 * Иначе — название компании обычным текстом (логотип не перерисовывается).
 */
export function BrandMark({ onDark = true, compact = false }: { onDark?: boolean; compact?: boolean }) {
  const src = onDark ? BRAND.logoOnDark : BRAND.logoOnLight;
  if (src) return <img className={`brandmark-img${compact ? ' compact' : ''}`} src={src} alt={BRAND.name} />;
  return <span className={`brandmark-text${compact ? ' compact' : ''}${onDark ? '' : ' on-light'}`}>{BRAND.name}</span>;
}
