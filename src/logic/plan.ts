import { H1_CAPACITY, HORIZONS, TIMING_TO_HORIZON } from '../data/kpi';
import { DISCUSSION_RULES, PROJECTS, PROJECT_BY_ID, SYNERGIES } from '../data/projects';
import { QUESTION_BY_ID, TIMING_OPTIONS, UNKNOWN } from '../data/questions';
import { TOOL_BY_ID } from '../data/tools';
import type { Answers, Horizon, ProjectDef, ToolDef } from '../data/types';
import { evalCondition, optionsOf, realSelected, resolve, type Ctx } from './flow';

export type Origin = 'client' | 'recommended' | 'foundation';
export type Priority = 'high' | 'medium' | 'low';

export const ORIGIN_LABEL: Record<Origin, string> = {
  client: 'Запрос заказчика',
  recommended: 'Рекомендация исполнителя',
  foundation: 'Базовая работа (нужна для других проектов)',
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  high: 'Высокий',
  medium: 'Средний',
  low: 'Низкий',
};

export interface PlannedProject {
  def: ProjectDef;
  origin: Origin;
  /** Почему проект в плане */
  reasons: string[];
  requestedTools: ToolDef[];
  horizon: Horizon;
  /** Почему проект в этом горизонте (прозрачность правил) */
  horizonReasons: string[];
  priority: Priority;
  priorityReason: string;
  deliverable: string;
  dependsOn: string[];
  after: string[];
  dependents: string[];
  goalLinks: string[];
  missingResources: string[];
  timings: { tool: string; label: string }[];
}

export interface Plan {
  tools: ToolDef[];
  top3: ToolDef[];
  projects: PlannedProject[];
  skipped: { name: string; note: string }[];
  synergies: string[];
  discussion: string[];
  ctx: Ctx;
  effective: Answers;
}

const HORIZON_TITLE = Object.fromEntries(HORIZONS.map((h) => [h.id, h.title])) as Record<Horizon, string>;
const PRIORITY_RANK: Record<Priority, number> = { high: 3, medium: 2, low: 1 };

export function timingOf(answers: Answers, toolId: string): string | undefined {
  return answers['p_timing']?.items?.[toolId]?.['when']?.[0];
}

export function timingLabel(id: string | undefined): string {
  if (!id) return 'Срок не указан';
  return TIMING_OPTIONS.find((o) => o.id === id)?.label ?? id;
}

export function buildPlan(rawAnswers: Answers): Plan {
  const { effective, tools, ctx } = resolve(rawAnswers);
  const answers = effective;
  const toolIds = new Set(tools.map((t) => t.id));
  const top3Ids = (answers['p_top3']?.order ?? []).filter((id) => toolIds.has(id)).slice(0, 3);
  const top3 = top3Ids.map((id) => TOOL_BY_ID[id]);

  const planned = new Map<string, PlannedProject>();
  const skipped: { name: string; note: string }[] = [];

  const make = (def: ProjectDef, origin: Origin, reasons: string[], requested: ToolDef[]): PlannedProject => ({
    def,
    origin,
    reasons,
    requestedTools: requested,
    horizon: def.defaultHorizon,
    horizonReasons: [],
    priority: 'medium',
    priorityReason: '',
    deliverable: def.deliverable,
    dependsOn: [],
    after: [],
    dependents: [],
    goalLinks: [],
    missingResources: [],
    timings: [],
  });

  // 1–2. Запросы заказчика и рекомендации
  for (const def of PROJECTS) {
    if (def.foundation) continue;
    const requested = def.tools.filter((t) => toolIds.has(t)).map((t) => TOOL_BY_ID[t]);
    if (requested.length) {
      planned.set(def.id, make(def, 'client', [`Заказчик выбрал: ${requested.map((t) => t.label).join(', ')}.`], requested));
    } else if (def.recommendWhen && evalCondition(def.recommendWhen, ctx)) {
      planned.set(def.id, make(def, 'recommended', [def.recommendReason ?? 'Сработало правило рекомендации.'], []));
    }
  }

  // 3. Базовые проекты по зависимостям
  const queue = [...planned.values()];
  while (queue.length) {
    const p = queue.shift()!;
    for (const depId of p.def.dependsOn) {
      const dep = PROJECT_BY_ID[depId];
      if (!dep) continue;
      if (dep.skipWhen && evalCondition(dep.skipWhen, ctx)) {
        if (!skipped.find((s) => s.name === dep.name)) skipped.push({ name: dep.name, note: dep.skipNote ?? '' });
        continue;
      }
      let dp = planned.get(depId);
      if (!dp) {
        dp = make(dep, dep.foundation ? 'foundation' : 'recommended', [], []);
        planned.set(depId, dp);
        queue.push(dp);
      }
      p.dependsOn.push(depId);
      if (!dp.dependents.includes(p.def.id)) dp.dependents.push(p.def.id);
    }
  }
  for (const p of planned.values()) {
    p.after = (p.def.after ?? []).filter((id) => planned.has(id));
    if (p.origin === 'foundation') {
      p.reasons = [`Нужен для: ${p.dependents.map((id) => `«${planned.get(id)!.def.name}»`).join(', ')}.`];
    }
  }

  // Результат, связи с целями, недостающие материалы, сроки
  const goals = new Set(realSelected('g_tasks', answers));
  const goalOpts = optionsOf(QUESTION_BY_ID['g_tasks']);
  const resourcesAnswered = (answers['p_resources']?.selected ?? []).length > 0 && !(answers['p_resources']?.selected ?? []).includes(UNKNOWN);
  const resources = new Set(realSelected('p_resources', answers));
  for (const p of planned.values()) {
    const addons = (p.def.deliverableAddons ?? []).filter((a) => evalCondition(a.when, ctx)).map((a) => a.text);
    p.deliverable = [p.def.deliverable, ...addons].join(' ');
    p.goalLinks = p.def.servesGoals.filter((g) => goals.has(g)).map((g) => goalOpts.find((o) => o.id === g)!.label);
    if (resourcesAnswered) {
      p.missingResources = (p.def.needsResources ?? []).filter((r) => !resources.has(r.resource)).map((r) => r.text);
    }
    p.timings = p.requestedTools.map((t) => ({ tool: t.label, label: timingLabel(timingOf(answers, t.id)) }));
  }

  // 4. Горизонты — прозрачные правила
  const fixed = new Set<string>();
  for (const p of planned.values()) {
    if (p.origin === 'foundation') {
      p.horizon = 3;
      continue;
    }
    const hs = p.requestedTools
      .map((t) => ({ t, when: timingOf(answers, t.id) }))
      .filter((x) => x.when && TIMING_TO_HORIZON[x.when]);
    const inTop = p.requestedTools.filter((t) => top3Ids.includes(t.id));
    if (hs.length) {
      const best = hs.reduce((a, b) => (TIMING_TO_HORIZON[a.when!] <= TIMING_TO_HORIZON[b.when!] ? a : b));
      p.horizon = TIMING_TO_HORIZON[best.when!];
      p.horizonReasons.push(`Срок из ответа заказчика: «${timingLabel(best.when)}» для «${best.t.label}».`);
      if (best.when === 'now' || best.when === 'm3') fixed.add(p.def.id);
    } else if (inTop.length) {
      p.horizon = 1;
      fixed.add(p.def.id);
      p.horizonReasons.push(`Входит в три главные задачи заказчика («${inTop[0].label}»), срок не указан — ставим в первый период.`);
    } else {
      p.horizon = p.def.defaultHorizon;
      p.horizonReasons.push(`Срок не указан — стандартный период для такого проекта (${HORIZON_TITLE[p.horizon]}).`);
    }
  }

  // Ограничение нагрузки первого периода
  const h1 = [...planned.values()].filter((p) => p.origin !== 'foundation' && p.horizon === 1);
  if (h1.length > H1_CAPACITY) {
    const movable = h1
      .filter((p) => !fixed.has(p.def.id))
      .sort((a, b) => (a.origin === 'recommended' ? -1 : 0) - (b.origin === 'recommended' ? -1 : 0));
    let excess = h1.length - H1_CAPACITY;
    for (const p of movable) {
      if (excess <= 0) break;
      p.horizon = 2;
      p.horizonReasons.push(`Перенесено на 3–6 месяцев, чтобы не запускать больше ${H1_CAPACITY} проектов одновременно.`);
      excess--;
    }
  }

  // Зависимости: то, без чего проект не начать, подтягивается не позже него
  let changed = true;
  let guard = 0;
  while (changed && guard++ < 50) {
    changed = false;
    for (const p of planned.values()) {
      for (const depId of p.dependsOn) {
        const d = planned.get(depId)!;
        if (d.horizon > p.horizon) {
          d.horizon = p.horizon;
          changed = true;
        }
      }
    }
  }
  for (const p of planned.values()) {
    if (p.origin === 'foundation' || p.dependents.length) {
      const earliest = p.dependents
        .map((id) => planned.get(id)!)
        .filter((d) => d.horizon === p.horizon)
        .map((d) => `«${d.def.name}»`);
      if (p.origin === 'foundation') {
        p.horizonReasons.push(`Должен быть готов до старта: ${earliest.join(', ')} (${HORIZON_TITLE[p.horizon]}).`);
      } else if (earliest.length && !p.horizonReasons.some((r) => r.startsWith('Срок из ответа'))) {
        p.horizonReasons.push(`Подтянуто: от этого зависит ${earliest.join(', ')}.`);
      }
    }
  }

  // 5. Приоритеты
  for (const p of planned.values()) {
    if (p.origin === 'foundation') continue;
    const inTop = p.requestedTools.some((t) => top3Ids.includes(t.id));
    const urgent = p.requestedTools.some((t) => timingOf(answers, t.id) === 'now');
    if (inTop) {
      p.priority = 'high';
      p.priorityReason = 'Входит в три главные задачи заказчика.';
    } else if (urgent) {
      p.priority = 'high';
      p.priorityReason = 'Заказчик отметил: нужно уже сейчас.';
    } else if (p.origin === 'client') {
      p.priority = 'medium';
      p.priorityReason = 'Выбрано заказчиком, но не входит в три главные задачи.';
    } else {
      p.priority = 'low';
      p.priorityReason = 'Рекомендация исполнителя — требует подтверждения заказчиком.';
    }
  }
  // Базовые — по самому приоритетному зависимому
  const foundations = [...planned.values()].filter((p) => p.origin === 'foundation');
  for (let i = 0; i < 3; i++) {
    for (const f of foundations) {
      const best = f.dependents.map((id) => planned.get(id)!).sort((a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority])[0];
      if (best) {
        f.priority = best.priority;
        f.priorityReason = `Как у зависимого проекта «${best.def.name}».`;
      }
    }
  }

  // Мягкий порядок имеет смысл, только если тот проект идёт в том же или более раннем периоде
  for (const p of planned.values()) p.after = p.after.filter((id) => planned.get(id)!.horizon <= p.horizon);

  // Порядок: горизонт → зависимости → приоритет
  const projects = topoSort([...planned.values()]);

  // 6. Объединения работ
  const ids = new Set(projects.map((p) => p.def.id));
  const nameOf = (id: string) => `«${PROJECT_BY_ID[id].name}»`;
  const synergies: string[] = [];
  for (const s of SYNERGIES) {
    if (s.allOf && !s.allOf.every((id) => ids.has(id))) continue;
    const matched = (s.anyOf ?? []).filter((id) => ids.has(id));
    if (s.anyOf && matched.length < (s.minAny ?? 1)) continue;
    synergies.push(s.text.replace('{anyOf}', matched.map(nameOf).join(', ')));
  }

  // 7. Вопросы для обсуждения
  const discussion: string[] = [];
  for (const r of DISCUSSION_RULES) {
    if (!evalCondition(r.when, ctx)) continue;
    if (r.planHas && !r.planHas.every((id) => ids.has(id))) continue;
    if (r.planLacks && r.planLacks.some((id) => ids.has(id))) continue;
    discussion.push(r.text);
  }

  return { tools, top3, projects, skipped, synergies, discussion, ctx, effective };
}

function topoSort(list: PlannedProject[]): PlannedProject[] {
  const byId = new Map(list.map((p) => [p.def.id, p]));
  const out: PlannedProject[] = [];
  const done = new Set<string>();
  const sorted = [...list].sort(
    (a, b) =>
      a.horizon - b.horizon ||
      Number(b.origin === 'foundation') - Number(a.origin === 'foundation') ||
      PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority] ||
      PROJECTS.indexOf(a.def) - PROJECTS.indexOf(b.def),
  );
  const visit = (p: PlannedProject, stack: Set<string>) => {
    if (done.has(p.def.id) || stack.has(p.def.id)) return;
    stack.add(p.def.id);
    for (const d of [...p.dependsOn, ...p.after]) {
      const dp = byId.get(d);
      if (dp && dp.horizon <= p.horizon) visit(dp, stack);
    }
    done.add(p.def.id);
    out.push(p);
  };
  for (const p of sorted) visit(p, new Set());
  const idx = new Map(out.map((p, i) => [p.def.id, i]));
  return [...out].sort((a, b) => a.horizon - b.horizon || idx.get(a.def.id)! - idx.get(b.def.id)!);
}

export function horizonTitle(h: Horizon): string {
  return HORIZON_TITLE[h];
}
