import { HORIZONS, SUCCESS_TO_KPI } from '../data/kpi';
import { PROJECT_BY_ID } from '../data/projects';
import { OTHER, QUESTION_BY_ID, STAGES, TIMING_OPTIONS, UNKNOWN } from '../data/questions';
import type { Answers, BriefRecord, QuestionDef } from '../data/types';
import type { Block, Doc, ProjectCard, Section } from './doc';
import { fieldLabel, hasUnknown, itemsFor, labelsOf, realSelected } from './flow';
import { buildPlan, horizonTitle, ORIGIN_LABEL, PRIORITY_LABEL, timingOf, type Plan, type PlannedProject } from './plan';

const NONE = '—';

function fmtDate(iso: string | undefined): string {
  if (!iso) return NONE;
  try {
    return new Date(iso).toLocaleString('ru-RU', { dateStyle: 'long', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

function metaOf(rec: BriefRecord): [string, string][] {
  const rows: [string, string][] = [];
  const who = [rec.respondent?.name, rec.respondent?.role].filter(Boolean).join(', ');
  if (who) rows.push(['Заполнил', who]);
  rows.push(['Обновлено', fmtDate(rec.updatedAt)]);
  rows.push(['Статус', rec.status === 'completed' ? 'Бриф заполнен' : 'Черновик — заполнен не полностью']);
  return rows;
}

function joinOr(list: string[], fallback = 'Не указано'): string {
  return list.length ? list.join('; ') : fallback;
}

function commentOf(qid: string, a: Answers): string | undefined {
  return a[qid]?.comment?.trim() || undefined;
}

/** Ответ одной строкой — для таблиц */
export function answerLine(qid: string, a: Answers): string {
  const labels = labelsOf(qid, a);
  const c = commentOf(qid, a);
  return [joinOr(labels, NONE), c ? `Комментарий: ${c}` : ''].filter(Boolean).join('. ');
}

/* ---------- Недостающая информация ---------- */

export function missingInfo(plan: Plan): string[] {
  const a = plan.effective;
  const out: string[] = [];
  const answered = Object.keys(a).map((id) => QUESTION_BY_ID[id]).filter(Boolean) as QuestionDef[];
  for (const q of answered) {
    if (hasUnknown(q.id, a)) out.push(`Заказчик пока не знает: ${q.short.toLowerCase()}.`);
  }
  for (const id of ['v_details', 'a_details'] as const) {
    const q = QUESTION_BY_ID[id];
    const items = itemsFor(q, a, plan.tools);
    const filled = a[id]?.items ?? {};
    const empty = items.filter((it) => !filled[it.id] || Object.values(filled[it.id]).every((v) => v.length === 0));
    if (items.length && empty.length) {
      out.push(`Не указано назначение и аудитория: ${empty.map((i) => i.label).join(', ')}.`);
    }
  }
  const noTiming = plan.tools.filter((t) => {
    const w = timingOf(a, t.id);
    return !w || w === UNKNOWN;
  });
  if (plan.tools.length && noTiming.length) out.push(`Нет срока: ${noTiming.map((t) => t.label).join(', ')}.`);
  const bo = a['p_budget_once']?.selected?.[0];
  if (bo === 'undefined') out.push('Бюджет на разовые проекты не определён.');
  if (bo === 'advice') out.push('Заказчик просит рекомендацию по разовому бюджету — подготовить вилки по проектам.');
  const bm = a['p_budget_monthly']?.selected?.[0];
  if (bm === 'undefined') out.push('Ежемесячный бюджет не определён.');
  if (bm === 'advice') out.push('Заказчик просит рекомендацию по ежемесячному бюджету.');
  if (realSelected('p_events', a).length && !commentOf('p_events', a)) out.push('Нет дат и названий запланированных событий.');
  if ((a['o_contact']?.selected ?? []).includes('undefined')) out.push('Не определено контактное лицо со стороны заказчика.');
  for (const p of plan.projects) {
    for (const r of p.missingResources) out.push(`Для «${p.def.name}» нет материала: ${r.charAt(0).toLowerCase() + r.slice(1)}.`);
  }
  if (!a['p_resources']) out.push('Не ясно, какие материалы уже есть (фото, описания, документы).');
  return Array.from(new Set(out));
}

/* ---------- Отчёт для заказчика ---------- */

export function buildClientDoc(rec: BriefRecord, plan: Plan = buildPlan(rec.answers)): Doc {
  const a = plan.effective;
  const sections: Section[] = [];

  sections.push({
    id: 'goals',
    title: 'Основные цели компании',
    blocks: [
      { t: 'list', items: labelsOf('g_tasks', a).length ? labelsOf('g_tasks', a) : ['Не указаны'] },
      ...(labelsOf('g_success', a).length
        ? ([{ t: 'list', title: 'Как поймём, что работает', items: labelsOf('g_success', a) }] as Block[])
        : []),
    ],
  });

  const topBlocks: Block[] = plan.top3.length
    ? [{ t: 'list', ordered: true, items: plan.top3.map((t) => t.label) }]
    : [{ t: 'p', text: labelsOf('p_none_selected', a).length ? labelsOf('p_none_selected', a).join('; ') : 'Приоритеты пока не выбраны.' }];
  sections.push({ id: 'top3', title: 'Три приоритетных направления', blocks: topBlocks });

  const groups = new Map<string, string[]>();
  for (const t of plan.tools) groups.set(t.group, [...(groups.get(t.group) ?? []), t.label]);
  sections.push({
    id: 'tools',
    title: 'Выбранные инструменты развития',
    blocks: groups.size
      ? [...groups.entries()].map(([g, items]) => ({ t: 'list', title: g, items }) as Block)
      : [{ t: 'p', text: 'Инструменты не выбраны.' }],
  });

  const byTiming = TIMING_OPTIONS.map((o) => ({
    label: o.label,
    tools: plan.tools.filter((t) => (timingOf(a, t.id) ?? '') === o.id).map((t) => t.label),
  })).filter((x) => x.tools.length);
  const noTime = plan.tools.filter((t) => !timingOf(a, t.id)).map((t) => t.label);
  if (noTime.length) byTiming.push({ label: 'Срок не указан', tools: noTime });
  sections.push({
    id: 'timing',
    title: 'Желаемые сроки',
    blocks: byTiming.length
      ? [{ t: 'kv', rows: byTiming.map((x) => [x.label, x.tools.join(', ')]) }]
      : [{ t: 'p', text: 'Сроки не указаны.' }],
  });

  const limits: [string, string][] = [];
  const pushIf = (label: string, qid: string) => {
    if (a[qid]) limits.push([label, answerLine(qid, a)]);
  };
  pushIf('Бюджет на разовые проекты', 'p_budget_once');
  pushIf('Ежемесячный бюджет', 'p_budget_monthly');
  pushIf('Съёмка производства', 'v_restrict');
  pushIf('Публикация информации', 'o_publish');
  pushIf('Выполненные проекты', 's_cases');
  sections.push({
    id: 'limits',
    title: 'Ограничения',
    blocks: limits.length ? [{ t: 'kv', rows: limits }] : [{ t: 'p', text: 'Ограничения не указаны.' }],
  });

  const questions = [...missingInfo(plan), ...plan.discussion];
  sections.push({
    id: 'discuss',
    title: 'Вопросы для дополнительного обсуждения',
    blocks: questions.length ? [{ t: 'list', items: questions }] : [{ t: 'p', text: 'Открытых вопросов нет.' }],
  });

  return {
    kind: 'client',
    title: 'Ваши приоритеты развития СИБПРОМТЕХ',
    subtitle: 'Предварительные итоги брифа',
    meta: metaOf(rec),
    disclaimer:
      'Это предварительные итоги ваших ответов, а не готовая маркетинговая стратегия. На их основе исполнитель подготовит предложения и обсудит их с вами.',
    sections,
  };
}

/* ---------- Отчёт для исполнителя ---------- */

function detailsBlocks(qid: 'v_details' | 'a_details', plan: Plan): Block[] {
  const a = plan.effective;
  const q = QUESTION_BY_ID[qid];
  if (!a[q.itemsFrom && q.itemsFrom.kind === 'selected' ? q.itemsFrom.q : '']) return [];
  const items = itemsFor(q, a, plan.tools);
  if (!items.length) return [];
  const rows: [string, string][] = items.map((it) => {
    const f = a[qid]?.items?.[it.id] ?? {};
    const parts = (q.fields ?? [])
      .map((fd) => {
        const v = fieldLabel(q, fd.id, f[fd.id] ?? []);
        return v.length ? `${fd.label}: ${v.join(', ')}` : '';
      })
      .filter(Boolean);
    return [it.label, parts.length ? parts.join('. ') : 'Не уточнено'];
  });
  return [{ t: 'kv', title: q.short, rows, source: 'client' }];
}

export function projectCard(p: PlannedProject, plan: Plan): ProjectCard {
  const nameOf = (id: string) => PROJECT_BY_ID[id].name;
  const deps = p.dependsOn.map(nameOf);
  const after = p.after.map(nameOf);
  const rows: [string, string][] = [
    ['Бизнес-цель', p.def.businessGoal + (p.goalLinks.length ? ` Связано с целями: ${p.goalLinks.join('; ')}.` : '')],
    ['Результат работы', p.deliverable],
    ['Приоритет', `${PRIORITY_LABEL[p.priority]} — ${p.priorityReason}`],
    ['Период', `${horizonTitle(p.horizon)}${p.def.kind === 'ongoing' ? ' — старт, далее ежемесячно' : ''}`],
    ['Что нужно от заказчика', p.def.fromClient.join('; ')],
    ['Зависит от', [deps.length ? deps.join(', ') : 'Нет обязательных зависимостей', after.length ? `лучше после: ${after.join(', ')}` : ''].filter(Boolean).join('; ')],
    ['Измеримые результаты', p.def.metrics.join('; ')],
    ['Стоимость', p.def.kind === 'ongoing' ? 'Требуется отдельная смета (ежемесячные затраты)' : 'Требуется отдельная смета (разовая инвестиция)'],
  ];
  if (p.timings.length) rows.splice(4, 0, ['Срок по ответу заказчика', p.timings.map((t) => `${t.tool}: ${t.label}`).join('; ')]);
  if (p.missingResources.length) rows.push(['Не хватает материалов', p.missingResources.join('; ')]);
  void plan;
  return {
    name: p.def.name,
    tags: [ORIGIN_LABEL[p.origin], p.def.kind === 'ongoing' ? 'Постоянная работа' : 'Разовый проект'],
    rows,
    why: [...p.reasons, ...p.horizonReasons].join(' '),
  };
}

export function buildExecutorDoc(rec: BriefRecord, plan: Plan = buildPlan(rec.answers)): Doc {
  const a = plan.effective;
  const s: Section[] = [];
  const list = (qid: string, title?: string, source: 'client' | 'fact' = 'client'): Block[] => {
    const items = labelsOf(qid, a);
    const c = commentOf(qid, a);
    if (!items.length && !c) return [];
    return [{ t: 'list', title: title ?? QUESTION_BY_ID[qid].short, items: c ? [...items, `Комментарий: ${c}`] : items, source }];
  };

  s.push({
    id: 'r1',
    title: '1. Сводка целей предприятия',
    blocks: [...list('g_tasks', 'Задачи на ближайший год'), ...list('g_audience', 'Кого привлекать')],
  });

  s.push({
    id: 'r2',
    title: '2. Выявленные проблемы и потребности',
    blocks: [
      ...list('g_barriers', 'Что мешает развитию (со слов заказчика)', 'fact'),
      ...list('s_current', 'Текущий сайт', 'fact'),
      ...(plan.tools.length
        ? ([{ t: 'list', title: 'Выбранные инструменты', items: plan.tools.map((t) => `${t.label} (${t.group})`), source: 'client' }] as Block[])
        : ([{ t: 'p', text: 'Инструменты не выбраны.', source: 'client' }] as Block[])),
      ...list('p_none_selected', 'Ситуация без выбранных инструментов'),
    ],
  });

  const vision = a['o_vision']?.text?.trim();
  const ideas = a['o_ideas']?.text?.trim();
  s.push({
    id: 'r3',
    title: '3. Ожидания руководства',
    blocks: [
      ...list('g_first_know', 'Что заказчик должен узнать первым'),
      ...list('g_success', 'По каким результатам оценят пользу'),
      ...list('p_format', 'Формат сотрудничества'),
      ...(vision ? ([{ t: 'p', text: `«${vision}»`, source: 'client' }] as Block[]) : []),
      ...(ideas ? ([{ t: 'p', text: `Идеи без решения: ${ideas}`, source: 'client' }] as Block[]) : []),
    ],
  });

  const timingRows: [string, string][] = plan.tools.map((t) => [t.label, timingOfLabel(a, t.id)]);
  const siteBlocks: Block[] = [];
  if (a['s_need']) {
    const rows: [string, string][] = ['s_need', 's_tasks', 's_catalog', 's_drawings', 's_equipment', 's_cases', 's_updater', 's_online']
      .filter((id) => a[id])
      .map((id) => [QUESTION_BY_ID[id].short, answerLine(id, a)]);
    siteBlocks.push({ t: 'kv', title: 'Сайт и интернет', rows, source: 'client' });
  }
  s.push({
    id: 'r4',
    title: '4. Приоритеты по направлениям',
    blocks: [
      plan.top3.length
        ? { t: 'list', title: 'Три главные задачи (по порядку)', ordered: true, items: plan.top3.map((t) => t.label), source: 'client' }
        : { t: 'p', text: 'Три главные задачи не выбраны.', source: 'client' },
      ...(timingRows.length ? ([{ t: 'kv', title: 'Сроки по направлениям', rows: timingRows, source: 'client' }] as Block[]) : []),
      ...siteBlocks,
      ...detailsBlocks('v_details', plan),
      ...list('v_people', 'Кто готов сниматься', 'fact'),
      ...detailsBlocks('a_details', plan),
    ],
  });

  s.push({
    id: 'r5',
    title: '5. Рекомендуемые проекты',
    blocks: [
      { t: 'note', text: 'Список сформирован автоматически по правилам брифа. Это предложение исполнителя, а не согласованный план.' },
      ...plan.projects.map((p) => ({ t: 'card', card: projectCard(p, plan), source: p.origin === 'client' ? 'client' : 'rec' }) as Block),
      ...(plan.skipped.length
        ? ([{ t: 'list', title: 'Не включено', items: plan.skipped.map((x) => `${x.name}: ${x.note}`), source: 'rec' }] as Block[])
        : []),
    ],
  });

  s.push({
    id: 'r6',
    title: '6. Предполагаемая последовательность',
    blocks: HORIZONS.flatMap((h) => {
      const ps = plan.projects.filter((p) => p.horizon === h.id);
      if (!ps.length) return [];
      return [{ t: 'list', title: `${h.title} — ${h.subtitle}`, ordered: true, items: ps.map((p) => `${p.def.name} (${PRIORITY_LABEL[p.priority].toLowerCase()} приоритет)`), source: 'rec' } as Block];
    }),
  });

  const depItems = plan.projects
    .filter((p) => p.dependsOn.length || p.after.length)
    .map((p) => {
      const parts = [];
      if (p.dependsOn.length) parts.push(`требует: ${p.dependsOn.map((id) => PROJECT_BY_ID[id].name).join(', ')}`);
      if (p.after.length) parts.push(`лучше после: ${p.after.map((id) => PROJECT_BY_ID[id].name).join(', ')}`);
      return `${p.def.name} — ${parts.join('; ')}`;
    });
  s.push({
    id: 'r7',
    title: '7. Зависимости и объединение работ',
    blocks: [
      ...(depItems.length ? ([{ t: 'list', title: 'Зависимости', items: depItems, source: 'rec' }] as Block[]) : []),
      ...(plan.synergies.length ? ([{ t: 'list', title: 'Что можно объединить', items: plan.synergies, source: 'rec' }] as Block[]) : []),
    ],
  });

  const miss = missingInfo(plan);
  s.push({
    id: 'r8',
    title: '8. Информация, которой пока не хватает',
    blocks: miss.length ? [{ t: 'list', items: miss, source: 'fact' }] : [{ t: 'p', text: 'Существенных пробелов нет.' }],
  });

  const kpi = realSelected('g_success', a).map((id) => SUCCESS_TO_KPI[id]).filter(Boolean);
  const other = a['g_success']?.other?.trim();
  s.push({
    id: 'r9',
    title: '9. Предварительные критерии эффективности',
    blocks: [
      ...(kpi.length || other
        ? ([{ t: 'list', title: 'Из ожиданий руководства', items: [...kpi, ...(other ? [`${other} — сформулировать измеримый показатель`] : [])], source: 'rec' }] as Block[])
        : []),
      ...(plan.projects.filter((p) => p.priority === 'high' && p.origin !== 'foundation').length
        ? ([
            {
              t: 'kv',
              title: 'По приоритетным проектам',
              rows: plan.projects.filter((p) => p.priority === 'high' && p.origin !== 'foundation').map((p) => [p.def.name, p.def.metrics.join('; ')]),
              source: 'rec',
            },
          ] as Block[])
        : []),
      { t: 'note', text: 'Перед стартом зафиксировать текущие значения — иначе через год сравнивать будет не с чем.' },
    ],
  });

  s.push({
    id: 'r10',
    title: '10. Предложения для дальнейшего обсуждения',
    blocks: plan.discussion.length
      ? [{ t: 'list', items: plan.discussion, source: 'rec' }]
      : [{ t: 'p', text: 'Противоречий в ответах не выявлено. Обсудить состав и сроки плана.', source: 'rec' }],
  });

  const factRows: [string, string][] = [
    ['p_events', 'Запланированные события'],
    ['p_resources', 'Что уже есть'],
    ['p_budget_once', 'Бюджет на разовые проекты'],
    ['p_budget_monthly', 'Ежемесячный бюджет'],
    ['v_restrict', 'Ограничения на съёмку'],
    ['o_publish', 'Ограничения на публикацию'],
    ['o_decider', 'Кто принимает решения'],
    ['o_tech', 'Кто проверяет технику'],
    ['o_materials', 'Кто даёт материалы'],
    ['o_contact', 'Контактное лицо'],
    ['o_format', 'Формат работы'],
  ]
    .filter(([id]) => a[id])
    .map(([id, label]) => [label, answerLine(id, a)]);
  s.push({
    id: 'app',
    title: 'Приложение. Исходные данные: ресурсы, бюджет, организация',
    blocks: factRows.length ? [{ t: 'kv', rows: factRows, source: 'fact' }] : [{ t: 'p', text: 'Нет данных.' }],
  });

  return {
    kind: 'executor',
    title: 'Стратегический отчёт по брифу СИБПРОМТЕХ',
    subtitle: 'Для исполнителя: дизайн-студии, отвечающей за развитие бренда',
    meta: metaOf(rec),
    disclaimer:
      'В отчёте разделены три вида информации: пожелания заказчика, исходные данные и рекомендации исполнителя. Рекомендации сформированы автоматически по открытым правилам и требуют обсуждения — это не согласованный план.',
    sections: s,
  };
}

function timingOfLabel(a: Answers, toolId: string): string {
  const w = timingOf(a, toolId);
  return TIMING_OPTIONS.find((o) => o.id === w)?.label ?? 'Срок не указан';
}

/* ---------- План развития ---------- */

export const ROADMAP_RULES = [
  'Проект попадает в план, если заказчик выбрал соответствующий инструмент, или по правилу рекомендации (причина указана в карточке).',
  'Базовые работы (аудит, тексты, съёмка) добавляются, когда от них зависят другие проекты.',
  'Период берётся из ответа заказчика о сроках: «сейчас» и «3 месяца» — 0–3 мес., «3–6 месяцев» — 3–6 мес., «второе полугодие» и «не срочно» — 6–12 мес.',
  'Если срок не указан, но направление входит в три главные задачи — 0–3 месяца; иначе — стандартный период для такого проекта.',
  'В первом периоде — не больше четырёх проектов по выбору заказчика; лишние, без явного срока, переносятся на 3–6 месяцев.',
  'Работа, без которой проект не начать, ставится не позже этого проекта.',
  'Приоритет «высокий» — у трёх главных задач и всего, что нужно «уже сейчас»; «средний» — у остального выбранного; «низкий» — у рекомендаций исполнителя.',
  'Стоимость не рассчитывается: для каждого проекта нужна отдельная смета. Разовые проекты и ежемесячная работа учитываются раздельно.',
];

export function buildRoadmapDoc(rec: BriefRecord, plan: Plan = buildPlan(rec.answers)): Doc {
  const sections: Section[] = HORIZONS.map((h) => {
    const ps = plan.projects.filter((p) => p.horizon === h.id);
    return {
      id: `h${h.id}`,
      title: `${h.title} — ${h.subtitle}`,
      blocks: ps.length
        ? ps.map((p) => ({ t: 'card', card: projectCard(p, plan), source: p.origin === 'client' ? 'client' : 'rec' }) as Block)
        : [{ t: 'p', text: 'Проектов в этом периоде нет.' }],
    };
  });
  const once = plan.projects.filter((p) => p.def.kind === 'once').length;
  const ongoing = plan.projects.filter((p) => p.def.kind === 'ongoing').map((p) => p.def.name);
  sections.unshift({
    id: 'summary',
    title: 'Коротко',
    blocks: [
      {
        t: 'kv',
        rows: [
          ['Проектов в плане', String(plan.projects.length)],
          ['Разовых', String(once)],
          ['Постоянных (ежемесячных)', ongoing.length ? `${ongoing.length}: ${ongoing.join(', ')}` : '0'],
          ['Три главные задачи', plan.top3.map((t) => t.label).join(', ') || 'не выбраны'],
        ],
      },
      ...(plan.synergies.length ? ([{ t: 'list', title: 'Объединение работ', items: plan.synergies, source: 'rec' }] as Block[]) : []),
    ],
  });
  sections.push({ id: 'rules', title: 'По каким правилам построен план', blocks: [{ t: 'list', items: ROADMAP_RULES }] });
  return {
    kind: 'roadmap',
    title: 'Предварительный план развития бренда СИБПРОМТЕХ',
    subtitle: 'Черновой план на 12 месяцев',
    meta: metaOf(rec),
    disclaimer:
      'Черновик, построенный по ответам брифа и открытым правилам. Сроки и состав работ уточняются с заказчиком; стоимость каждого проекта считается отдельной сметой.',
    sections,
  };
}

/* ---------- Все ответы ---------- */

export function allAnswersRows(answers: Answers): { stage: string; rows: [string, string][] }[] {
  const plan = buildPlan(answers);
  const a = plan.effective;
  return STAGES.map((st) => {
    const rows: [string, string][] = [];
    for (const [qid] of Object.entries(a)) {
      const q = QUESTION_BY_ID[qid];
      if (!q || q.stage !== st.id) continue;
      if (q.type === 'rank') rows.push([q.short, (a[qid].order ?? []).map((id, i) => `${i + 1}. ${plan.tools.find((t) => t.id === id)?.label ?? id}`).join('  ')]);
      else if (q.type === 'perItem') {
        const items = itemsFor(q, a, plan.tools);
        const parts = items
          .map((it) => {
            const f = a[qid].items?.[it.id];
            if (!f) return '';
            const s = (q.fields ?? []).map((fd) => fieldLabel(q, fd.id, f[fd.id] ?? []).join(', ')).filter(Boolean).join(' / ');
            return s ? `${it.label}: ${s}` : '';
          })
          .filter(Boolean);
        rows.push([q.short, parts.join('; ') || NONE]);
      } else rows.push([q.short, answerLine(qid, a)]);
    }
    return { stage: `${st.index}. ${st.title}`, rows };
  }).filter((x) => x.rows.length);
}

export { OTHER };
