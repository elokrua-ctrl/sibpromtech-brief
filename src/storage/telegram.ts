import { DELIVERY, deliveryEnabled } from '../config/delivery';
import type { BriefRecord } from '../data/types';
import { fileStamp, toExportJson } from '../logic/exporters';
import { buildPlan } from '../logic/plan';
import { buildExecutorDoc, buildRoadmapDoc, missingInfo } from '../logic/report';
import { labelsOf, resolve } from '../logic/flow';

/**
 * Автоматическая отправка ответов исполнителю в Telegram.
 * Отправка настоящая: успехом считается только ответ Telegram «ok».
 */

const api = (method: string) => `https://api.telegram.org/bot${DELIVERY.telegramBotToken}/${method}`;

export function answersHash(rec: BriefRecord): string {
  const s = JSON.stringify(rec.answers);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `${s.length}-${(h >>> 0).toString(36)}`;
}

function who(rec: BriefRecord): string {
  return [rec.respondent?.name, rec.respondent?.role].filter(Boolean).join(', ') || 'не представился';
}

function progressPct(rec: BriefRecord): number {
  const { visible } = resolve(rec.answers);
  const answered = visible.filter((q) => rec.answers[q.id]).length;
  return Math.round((answered / Math.max(visible.length, 1)) * 100);
}

export function summaryText(rec: BriefRecord, kind: 'completed' | 'updated'): string {
  const plan = buildPlan(rec.answers);
  const a = plan.effective;
  const lines: string[] = [];
  lines.push(kind === 'updated' ? '🔄 Бриф СИБПРОМТЕХ — ответы изменены' : '✅ Бриф СИБПРОМТЕХ заполнен');
  lines.push(`Кто: ${who(rec)}`);
  lines.push('');
  const goals = labelsOf('g_tasks', a);
  if (goals.length) lines.push(`Цели: ${goals.join('; ')}`);
  if (plan.top3.length) lines.push(`Три главные задачи: ${plan.top3.map((t, i) => `${i + 1}) ${t.label}`).join('  ')}`);
  else if (plan.tools.length === 0) lines.push('Инструменты не выбраны.');
  if (plan.tools.length) lines.push(`Выбрано направлений: ${plan.tools.length}`);
  const bo = labelsOf('p_budget_once', a)[0];
  const bm = labelsOf('p_budget_monthly', a)[0];
  if (bo || bm) lines.push(`Бюджет: разовый — ${bo ?? '—'}; ежемесячный — ${bm ?? '—'}`);
  const vision = a['o_vision']?.text?.trim();
  if (vision) lines.push(`Через год: «${vision.length > 400 ? vision.slice(0, 400) + '…' : vision}»`);
  lines.push(`Проектов в черновом плане: ${plan.projects.length}; открытых вопросов: ${missingInfo(plan).length + plan.discussion.length}`);
  lines.push('');
  lines.push('PDF — отчёт для исполнителя и план. JSON — все ответы: открыть в режиме просмотра:');
  lines.push(`${DELIVERY.publicUrl}#view`);
  return lines.join('\n').slice(0, 4000);
}

async function call(method: string, body: FormData): Promise<void> {
  const res = await fetch(api(method), { method: 'POST', body });
  let data: { ok?: boolean; description?: string } = {};
  try {
    data = await res.json();
  } catch {
    /* ignore */
  }
  if (!res.ok || !data.ok) throw new Error(data.description || `HTTP ${res.status}`);
}

function namePart(rec: BriefRecord): string {
  const n = (rec.respondent?.name ?? '').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
  return n ? `_${n}` : '';
}

/** Полная отправка после завершения брифа: сообщение + PDF + JSON */
export async function sendCompleted(rec: BriefRecord, kind: 'completed' | 'updated'): Promise<void> {
  if (!deliveryEnabled()) throw new Error('Отправка не настроена');
  const chat = DELIVERY.telegramChatId;
  const stamp = fileStamp();

  const msg = new FormData();
  msg.append('chat_id', chat);
  msg.append('text', summaryText(rec, kind));
  msg.append('disable_web_page_preview', 'true');
  await call('sendMessage', msg);

  const { docsToPdf } = await import('../pdf/render');
  const plan = buildPlan(rec.answers);
  const pdf = await docsToPdf([buildExecutorDoc(rec, plan), buildRoadmapDoc(rec, plan)]);
  const f1 = new FormData();
  f1.append('chat_id', chat);
  f1.append('document', new Blob([pdf as BlobPart], { type: 'application/pdf' }), `SIBPROMTECH_otchet-i-plan${namePart(rec)}_${stamp}.pdf`);
  f1.append('caption', 'Отчёт для исполнителя + черновой план развития');
  await call('sendDocument', f1);

  const f2 = new FormData();
  f2.append('chat_id', chat);
  f2.append('document', new Blob([toExportJson(rec)], { type: 'application/json' }), `SIBPROMTECH_brief${namePart(rec)}_${stamp}.json`);
  f2.append('caption', 'Все ответы. Открыть: режим просмотра на сайте брифа');
  await call('sendDocument', f2);
}

/**
 * Черновик при уходе со страницы (человек бросил на полпути).
 * Используется sendBeacon — он срабатывает даже при закрытии вкладки.
 * Возвращает true, если отправка поставлена в очередь.
 */
export function sendDraftBeacon(rec: BriefRecord): boolean {
  if (!deliveryEnabled() || rec.status === 'completed') return false;
  if (Object.keys(rec.answers).length < DELIVERY.draftMinAnswers) return false;
  const hash = answersHash(rec);
  if (rec.delivery?.draftHash === hash) return false;
  const last = rec.delivery?.draftSentAt ? Date.parse(rec.delivery.draftSentAt) : 0;
  if (Date.now() - last < DELIVERY.draftMinIntervalMin * 60_000) return false;
  if (typeof navigator.sendBeacon !== 'function') return false;
  const fd = new FormData();
  fd.append('chat_id', DELIVERY.telegramChatId);
  fd.append(
    'document',
    new Blob([toExportJson(rec)], { type: 'application/json' }),
    `SIBPROMTECH_chernovik${namePart(rec)}_${fileStamp()}.json`,
  );
  fd.append(
    'caption',
    `⏳ Черновик брифа (не завершён, заполнено ~${progressPct(rec)}%)\nКто: ${who(rec)}\nОткрыть: ${DELIVERY.publicUrl}#view`,
  );
  return navigator.sendBeacon(api('sendDocument'), fd);
}
