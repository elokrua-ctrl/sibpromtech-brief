import { OTHER, QUESTIONS, QUESTION_BY_ID, UNKNOWN, UNKNOWN_LABEL } from '../data/questions';
import { TOOLS } from '../data/tools';
import type { Answer, Answers, Condition, OptionDef, QuestionDef, ToolDef } from '../data/types';

export interface Ctx {
  answers: Answers;
  tools: Set<string>;
}

/** Варианты вопроса с учётом «Пока не знаю» */
export function optionsOf(q: QuestionDef): OptionDef[] {
  const base = q.options ?? [];
  return q.allowUnknown ? [...base, { id: UNKNOWN, label: UNKNOWN_LABEL, exclusive: true }] : base;
}

/** Выбранные содержательные варианты: без «не знаю» и без исключающих («не нужно») */
export function realSelected(qid: string, answers: Answers): string[] {
  const q = QUESTION_BY_ID[qid];
  const sel = answers[qid]?.selected ?? [];
  if (!q) return sel;
  const exclusive = new Set(optionsOf(q).filter((o) => o.exclusive).map((o) => o.id));
  return sel.filter((id) => id !== UNKNOWN && !exclusive.has(id));
}

export function evalCondition(c: Condition | undefined, ctx: Ctx): boolean {
  if (!c) return true;
  if ('all' in c) return c.all.every((x) => evalCondition(x, ctx));
  if ('some' in c) return c.some.some((x) => evalCondition(x, ctx));
  if ('not' in c) return !evalCondition(c.not, ctx);
  if ('tool' in c) return c.tool.some((t) => ctx.tools.has(t));
  if ('toolsCountGte' in c) return ctx.tools.size >= c.toolsCountGte;
  const a = ctx.answers[c.q];
  const sel = a?.selected ?? [];
  if ('any' in c) return c.any.some((id) => sel.includes(id));
  if ('none' in c) return !c.none.some((id) => sel.includes(id));
  if ('anyReal' in c) return realSelected(c.q, ctx.answers).length > 0;
  if ('countGte' in c) return realSelected(c.q, ctx.answers).length >= c.countGte;
  if ('answered' in c) return !!a && isAnswerNonEmpty(a);
  return false;
}

function isAnswerNonEmpty(a: Answer): boolean {
  return (
    (a.selected?.length ?? 0) > 0 ||
    !!a.text?.trim() ||
    (a.order?.length ?? 0) > 0 ||
    Object.values(a.items ?? {}).some((f) => Object.values(f).some((v) => v.length > 0))
  );
}

export function deriveTools(answers: Answers): ToolDef[] {
  const ctx: Ctx = { answers, tools: new Set() };
  return TOOLS.filter((t) => evalCondition(t.when, ctx));
}

/**
 * Видимые вопросы и «действующие» ответы: ответы на скрытые вопросы
 * (например, детали сайта после ответа «сайт не нужен») не учитываются в отчётах,
 * но сохраняются — если человек вернётся и передумает, они восстановятся.
 */
export function resolve(answers: Answers): { visible: QuestionDef[]; effective: Answers; tools: ToolDef[]; ctx: Ctx } {
  let effective = answers;
  let visible: QuestionDef[] = [];
  let tools: ToolDef[] = [];
  for (let i = 0; i < 3; i++) {
    tools = deriveTools(effective);
    const ctx: Ctx = { answers: effective, tools: new Set(tools.map((t) => t.id)) };
    visible = QUESTIONS.filter((q) => evalCondition(q.showIf, ctx));
    const ids = new Set(visible.map((q) => q.id));
    const next: Answers = {};
    for (const [k, v] of Object.entries(answers)) if (ids.has(k)) next[k] = v;
    const same = Object.keys(next).length === Object.keys(effective).length;
    effective = next;
    if (same && i > 0) break;
  }
  tools = deriveTools(effective);
  const ctx: Ctx = { answers: effective, tools: new Set(tools.map((t) => t.id)) };
  visible = QUESTIONS.filter((q) => evalCondition(q.showIf, ctx));
  return { visible, effective, tools, ctx };
}

export interface Item {
  id: string;
  label: string;
}

/** Пункты для вопросов rank / perItem */
export function itemsFor(q: QuestionDef, answers: Answers, tools: ToolDef[]): Item[] {
  const src = q.itemsFrom;
  if (!src) return [];
  if (src.kind === 'tools') return tools.map((t) => ({ id: t.id, label: t.label }));
  const sq = QUESTION_BY_ID[src.q];
  const ids = realSelected(src.q, answers);
  const items: Item[] = [];
  for (const id of ids) {
    if (id === OTHER) {
      const txt = answers[src.q]?.other?.trim();
      if (txt) items.push({ id: OTHER, label: txt });
      continue;
    }
    const opt = optionsOf(sq).find((o) => o.id === id);
    if (opt) items.push({ id, label: opt.label });
  }
  return items;
}

export function isAnswered(q: QuestionDef, answers: Answers, tools: ToolDef[]): boolean {
  const a = answers[q.id];
  switch (q.type) {
    case 'single':
    case 'multi': {
      const sel = a?.selected ?? [];
      if (sel.length === 0) return false;
      if (sel.includes(OTHER) && !a?.other?.trim() && sel.length === 1) return false;
      return true;
    }
    case 'text':
      return !!a?.text?.trim();
    case 'rank': {
      const need = Math.min(q.rankCount ?? 3, itemsFor(q, answers, tools).length);
      const valid = new Set(itemsFor(q, answers, tools).map((i) => i.id));
      return (a?.order ?? []).filter((id) => valid.has(id)).length >= need;
    }
    case 'perItem':
      return Object.values(a?.items ?? {}).some((f) => Object.values(f).some((v) => v.length > 0));
  }
}

export function canProceed(q: QuestionDef, answers: Answers, tools: ToolDef[]): boolean {
  if (q.optional) return true;
  return isAnswered(q, answers, tools);
}

/** Применить клик по варианту с учётом исключающих вариантов и лимита */
export function toggleOption(q: QuestionDef, prev: Answer | undefined, optId: string): Answer {
  const a: Answer = { ...(prev ?? {}) };
  const opts = optionsOf(q);
  const isExclusive = optId === UNKNOWN || !!opts.find((o) => o.id === optId)?.exclusive;
  if (q.type === 'single') {
    a.selected = [optId];
    return a;
  }
  const cur = a.selected ?? [];
  if (cur.includes(optId)) {
    a.selected = cur.filter((x) => x !== optId);
    return a;
  }
  if (isExclusive) {
    a.selected = [optId];
    return a;
  }
  const exclusiveIds = new Set([UNKNOWN, ...opts.filter((o) => o.exclusive).map((o) => o.id)]);
  let next = cur.filter((x) => !exclusiveIds.has(x));
  if (q.maxSelect && next.length >= q.maxSelect) return { ...a, selected: next };
  next = [...next, optId];
  a.selected = next;
  return a;
}

/** Человекочитаемые подписи выбранных вариантов */
export function labelsOf(qid: string, answers: Answers): string[] {
  const q = QUESTION_BY_ID[qid];
  const a = answers[qid];
  if (!q || !a) return [];
  if (q.type === 'text') return a.text?.trim() ? [a.text.trim()] : [];
  const out: string[] = [];
  for (const id of a.selected ?? []) {
    if (id === OTHER) {
      if (a.other?.trim()) out.push(`Другое: ${a.other.trim()}`);
      continue;
    }
    const opt = optionsOf(q).find((o) => o.id === id);
    if (opt) out.push(opt.label);
  }
  return out;
}

export function hasUnknown(qid: string, answers: Answers): boolean {
  return (answers[qid]?.selected ?? []).includes(UNKNOWN);
}

export function fieldLabel(q: QuestionDef, fieldId: string, optIds: string[]): string[] {
  const f = q.fields?.find((x) => x.id === fieldId);
  if (!f) return [];
  return optIds.map((id) => f.options.find((o) => o.id === id)?.label ?? id);
}
