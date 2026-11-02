import type { ToolDef } from './types';

/**
 * ИНСТРУМЕНТЫ — то, что заказчик сам отметил как нужное.
 * Из них строятся вопросы этапа 5 (три главные задачи, сроки) и проекты плана.
 * В условиях `when` используйте только ответы на вопросы (не другие инструменты).
 */
export const TOOLS: ToolDef[] = [
  { id: 'site', label: 'Сайт', group: 'Сайт и интернет', when: { q: 's_need', any: ['main', 'later', 'improve'] } },
  { id: 'online_search', label: 'Поиск и карты (Яндекс, 2ГИС)', group: 'Сайт и интернет', when: { q: 's_online', any: ['search', 'maps'] } },
  { id: 'b2b', label: 'Отраслевые каталоги и площадки закупок', group: 'Сайт и интернет', when: { q: 's_online', any: ['b2b'] } },
  {
    id: 'social',
    label: 'Соцсети и Telegram-канал',
    group: 'Сайт и интернет',
    when: { some: [{ q: 's_online', any: ['vk', 'telegram'] }, { q: 'a_types', any: ['social'] }] },
  },

  { id: 'video_image', label: 'Фильм о предприятии', group: 'Видео', when: { q: 'v_types', any: ['image'] } },
  { id: 'video_presentation', label: 'Ролик для переговоров', group: 'Видео', when: { q: 'v_types', any: ['presentation'] } },
  { id: 'video_process', label: 'Видео о производстве', group: 'Видео', when: { q: 'v_types', any: ['process'] } },
  { id: 'video_equipment', label: 'Видео об оборудовании', group: 'Видео', when: { q: 'v_types', any: ['equipment'] } },
  { id: 'video_interview', label: 'Интервью с руководством и специалистами', group: 'Видео', when: { q: 'v_types', any: ['interview'] } },
  { id: 'video_short', label: 'Короткие ролики для сайта и соцсетей', group: 'Видео', when: { q: 'v_types', any: ['short'] } },
  { id: 'video_recruit', label: 'Ролики для найма', group: 'Видео', when: { q: 'v_types', any: ['recruit'] } },
  { id: 'video_expo', label: 'Видео для выставок', group: 'Видео', when: { q: 'v_types', any: ['expo'] } },

  { id: 'ad_presentation', label: 'Презентация компании', group: 'Реклама и материалы', when: { q: 'a_types', any: ['presentation'] } },
  { id: 'ad_kp', label: 'Шаблон коммерческого предложения', group: 'Реклама и материалы', when: { q: 'a_types', any: ['kp'] } },
  { id: 'ad_catalog', label: 'Каталог продукции и услуг', group: 'Реклама и материалы', when: { q: 'a_types', any: ['catalog'] } },
  { id: 'ad_banners', label: 'Рекламные макеты и баннеры', group: 'Реклама и материалы', when: { q: 'a_types', any: ['banners'] } },
  { id: 'ad_posters', label: 'Плакаты', group: 'Реклама и материалы', when: { q: 'a_types', any: ['posters'] } },
  { id: 'ad_stand', label: 'Выставочный стенд', group: 'Реклама и материалы', when: { q: 'a_types', any: ['stand'] } },
  { id: 'ad_interior', label: 'Оформление помещений', group: 'Реклама и материалы', when: { q: 'a_types', any: ['interior'] } },
  { id: 'ad_outdoor', label: 'Наружная реклама и вывески', group: 'Реклама и материалы', when: { q: 'a_types', any: ['outdoor'] } },
  { id: 'ad_merch', label: 'Фирменная одежда и сувениры', group: 'Реклама и материалы', when: { q: 'a_types', any: ['merch'] } },
  {
    id: 'ad_recruit',
    label: 'Материалы для найма',
    group: 'Реклама и материалы',
    when: { some: [{ q: 'a_types', any: ['recruit'] }, { q: 's_online', any: ['hh'] }] },
  },
];

export const TOOL_BY_ID: Record<string, ToolDef> = Object.fromEntries(TOOLS.map((t) => [t.id, t]));
