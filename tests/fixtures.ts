import type { Answers, BriefRecord } from '../src/data/types';

export function rec(answers: Answers): BriefRecord {
  return {
    app: 'sibpromtech-brief',
    schemaVersion: 1,
    id: 'test',
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-01T10:30:00.000Z',
    status: 'completed',
    respondent: { name: 'Иванов И. И.', role: 'Генеральный директор' },
    answers,
  };
}

/** Сценарий из задания: сайт + презентационный ролик + каталог */
export const SITE_VIDEO_CATALOG: Answers = {
  g_tasks: { selected: ['more_requests', 'trust', 'tenders'] },
  g_barriers: { selected: ['nothing_to_show', 'name_confusion'] },
  g_audience: { selected: ['big_industry'] },
  g_first_know: { selected: ['custom_parts', 'equipment'] },
  g_success: { selected: ['more_requests', 'faster_deals'] },
  s_current: { selected: ['outdated'] },
  s_need: { selected: ['main'] },
  s_tasks: { selected: ['requests', 'capabilities'] },
  s_catalog: { selected: ['detailed'] },
  s_drawings: { selected: ['upload'] },
  s_equipment: { selected: ['detailed'] },
  s_cases: { selected: ['anonymous'] },
  s_updater: { selected: ['assign'] },
  s_online: { selected: ['search', 'maps'] },
  v_types: { selected: ['presentation'] },
  v_people: { selected: ['director'] },
  v_restrict: { selected: ['client_parts'] },
  a_types: { selected: ['catalog'] },
  p_top3: { order: ['site', 'video_presentation', 'ad_catalog'] },
  p_timing: {
    items: {
      site: { when: ['m3'] },
      video_presentation: { when: ['m6'] },
      ad_catalog: { when: ['h2'] },
    },
  },
  p_events: { selected: ['expo'], comment: 'Нефть и газ, март' },
  p_resources: { selected: ['brandbook', 'amateur_photos'] },
  p_budget_once: { selected: ['advice'] },
  p_budget_monthly: { selected: ['none'] },
  p_format: { selected: ['start_then'] },
  o_decider: { selected: ['ceo'] },
  o_tech: { selected: ['chief_engineer'] },
  o_materials: { selected: ['sales'] },
  o_contact: { selected: ['deputy'] },
  o_format: { selected: ['onsite', 'messenger'] },
  o_publish: { selected: ['no_clients'] },
  o_vision: { text: 'Нас знают крупные компании региона и приходят сами.' },
};
