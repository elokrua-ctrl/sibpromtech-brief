import { QUESTIONS } from '../data/questions';
import type { BriefRecord } from '../data/types';
import { SOURCE_LABEL, type Doc } from './doc';
import { buildPlan, horizonTitle, ORIGIN_LABEL, PRIORITY_LABEL } from './plan';
import { PROJECT_BY_ID } from '../data/projects';

/** Документ → простой текст (для копирования и передачи исполнителю) */
export function docToText(doc: Doc): string {
  const out: string[] = [];
  out.push(doc.title.toUpperCase());
  out.push(doc.subtitle);
  for (const [k, v] of doc.meta) out.push(`${k}: ${v}`);
  out.push('');
  out.push(doc.disclaimer);
  for (const s of doc.sections) {
    out.push('');
    out.push('━'.repeat(40));
    out.push(s.title.toUpperCase());
    for (const b of s.blocks) {
      const tag = 'source' in b && b.source ? `[${SOURCE_LABEL[b.source]}] ` : '';
      switch (b.t) {
        case 'p':
          out.push(`${tag}${b.text}`);
          break;
        case 'note':
          out.push(`Примечание: ${b.text}`);
          break;
        case 'h3':
          out.push(`\n${b.text}${b.sub ? ` — ${b.sub}` : ''}`);
          break;
        case 'list':
          if (b.title || tag) out.push(`\n${tag}${b.title ?? ''}`.trimEnd());
          b.items.forEach((it, i) => out.push(`  ${b.ordered ? `${i + 1}.` : '•'} ${it}`));
          break;
        case 'kv':
          if (b.title || tag) out.push(`\n${tag}${b.title ?? ''}`.trimEnd());
          for (const [k, v] of b.rows) out.push(`  ${k}: ${v}`);
          break;
        case 'card':
          out.push('');
          out.push(`▸ ${b.card.name}  [${b.card.tags.join(' · ')}]`);
          for (const [k, v] of b.card.rows) out.push(`    ${k}: ${v}`);
          if (b.card.why) out.push(`    Почему здесь: ${b.card.why}`);
          break;
      }
    }
  }
  out.push('');
  out.push('Сформировано интерактивным брифом СИБПРОМТЕХ. Данные не отправляются автоматически — этот текст передан вручную.');
  return out.join('\n');
}

export const EXPORT_FORMAT = 'sibpromtech-brief-export';

export interface BriefExport {
  format: typeof EXPORT_FORMAT;
  formatVersion: 1;
  exportedAt: string;
  /** Список вопросов на момент экспорта — чтобы файл читался и после правок анкеты */
  questionsSnapshot: { id: string; short: string; title: string }[];
  brief: BriefRecord;
  /** Производные данные для быстрого анализа нескольких брифов */
  derived: {
    tools: string[];
    top3: string[];
    projects: { id: string; name: string; origin: string; horizon: number; priority: string; kind: string }[];
  };
}

export function toExportJson(rec: BriefRecord): string {
  const plan = buildPlan(rec.answers);
  const data: BriefExport = {
    format: EXPORT_FORMAT,
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    questionsSnapshot: QUESTIONS.map((q) => ({ id: q.id, short: q.short, title: q.title })),
    brief: rec,
    derived: {
      tools: plan.tools.map((t) => t.id),
      top3: plan.top3.map((t) => t.id),
      projects: plan.projects.map((p) => ({
        id: p.def.id,
        name: p.def.name,
        origin: p.origin,
        horizon: p.horizon,
        priority: p.priority,
        kind: p.def.kind,
      })),
    },
  };
  return JSON.stringify(data, null, 2);
}

export function parseImport(text: string): BriefRecord {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Файл не похож на JSON. Выберите файл, выгруженный из брифа.');
  }
  const d = data as Partial<BriefExport> & Partial<BriefRecord>;
  const rec = d.format === EXPORT_FORMAT ? d.brief : d.app === 'sibpromtech-brief' ? (d as BriefRecord) : undefined;
  if (!rec || typeof rec !== 'object' || typeof rec.answers !== 'object') {
    throw new Error('В файле нет данных брифа СИБПРОМТЕХ.');
  }
  if (rec.schemaVersion !== 1) throw new Error(`Неподдерживаемая версия данных: ${String(rec.schemaVersion)}.`);
  return rec;
}

function csvCell(v: string): string {
  return /[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** План в CSV (разделитель «;» — открывается в Excel с русской локалью) */
export function roadmapCsv(rec: BriefRecord): string {
  const plan = buildPlan(rec.answers);
  const head = ['Период', 'Проект', 'Источник', 'Тип', 'Приоритет', 'Бизнес-цель', 'Результат', 'Что нужно от заказчика', 'Зависит от', 'Измеримые результаты', 'Стоимость'];
  const rows = plan.projects.map((p) => [
    horizonTitle(p.horizon),
    p.def.name,
    ORIGIN_LABEL[p.origin],
    p.def.kind === 'ongoing' ? 'Ежемесячно' : 'Разовый',
    PRIORITY_LABEL[p.priority],
    p.def.businessGoal,
    p.deliverable,
    p.def.fromClient.join('; '),
    p.dependsOn.map((id) => PROJECT_BY_ID[id].name).join('; '),
    p.def.metrics.join('; '),
    'Отдельная смета',
  ]);
  return '﻿' + [head, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n');
}

export function fileStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
