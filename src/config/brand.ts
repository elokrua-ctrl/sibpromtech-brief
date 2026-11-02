/**
 * Фирменные константы СИБПРОМТЕХ (по брендбуку).
 *
 * ЛОГОТИП: файлы брендбука в проект не передавались, поэтому логотип не подставлен
 * и не нарисован заново. Чтобы вывести оригинальный логотип:
 *   1. положите SVG из брендбука в public/brand/ (например, logo-white.svg и logo.svg);
 *   2. укажите пути ниже: logoOnDark: 'brand/logo-white.svg', logoOnLight: 'brand/logo.svg'.
 * Пока пути пустые, в шапке выводится название компании обычным текстом.
 *
 * ШРИФТ: укажите фирменный шрифт в CSS-переменной --font-brand (src/styles.css).
 */
export const BRAND = {
  name: 'СИБПРОМТЕХ',
  fullName: 'НПО «Сибирские Промышленные Технологии»',
  city: 'Тюмень',
  colors: {
    graphite: '#07141B',
    steel: '#2D4056',
    red: '#C7181C',
    light: '#D9D9D9',
    white: '#FFFFFF',
  },
  logoOnDark: '' as string,
  logoOnLight: '' as string,
};
