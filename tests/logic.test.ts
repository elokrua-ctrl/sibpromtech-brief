import assert from 'node:assert/strict';
import { test } from 'node:test';
import { QUESTIONS, QUESTION_BY_ID, UNKNOWN } from '../src/data/questions';
import { PROJECTS } from '../src/data/projects';
import { TOOLS } from '../src/data/tools';
import { canProceed, resolve, toggleOption } from '../src/logic/flow';
import { buildPlan } from '../src/logic/plan';
import { buildClientDoc, buildExecutorDoc, buildRoadmapDoc } from '../src/logic/report';
import { docToText, parseImport, roadmapCsv, toExportJson } from '../src/logic/exporters';
import { docToPdf } from '../src/pdf/render';
import { rec, SITE_VIDEO_CATALOG } from './fixtures';

test('данные согласованы: ссылки на вопросы, варианты и проекты существуют', () => {
  const qids = new Set(QUESTIONS.map((q) => q.id));
  assert.equal(qids.size, QUESTIONS.length, 'id вопросов уникальны');
  const pids = new Set(PROJECTS.map((p) => p.id));
  const tids = new Set(TOOLS.map((t) => t.id));
  for (const p of PROJECTS) {
    for (const d of [...p.dependsOn, ...(p.after ?? [])]) assert.ok(pids.has(d), `${p.id} → ${d}`);
    for (const t of p.tools) assert.ok(tids.has(t), `${p.id} tool ${t}`);
  }
  for (const t of TOOLS) assert.ok(PROJECTS.some((p) => p.tools.includes(t.id)), `инструмент ${t.id} покрыт проектом`);
  // все варианты, упомянутые в условиях, существуют
  const walk = (c: unknown): void => {
    if (!c || typeof c !== 'object') return;
    const o = c as Record<string, unknown>;
    if (typeof o.q === 'string') {
      assert.ok(qids.has(o.q), `вопрос ${o.q}`);
      const opts = new Set([...(QUESTION_BY_ID[o.q].options ?? []).map((x) => x.id), UNKNOWN]);
      for (const k of ['any', 'none'] as const) for (const id of (o[k] as string[]) ?? []) assert.ok(opts.has(id), `${o.q}.${id}`);
    }
    for (const v of Object.values(o)) {
      if (Array.isArray(v)) v.forEach(walk);
      else if (typeof v === 'object') walk(v);
    }
  };
  for (const q of QUESTIONS) walk(q.showIf);
  for (const t of TOOLS) walk(t.when);
  for (const p of PROJECTS) {
    walk(p.recommendWhen);
    walk(p.skipWhen);
    p.deliverableAddons?.forEach((a) => walk(a.when));
  }
});

test('условные переходы: без сайта подробный бриф сайта не показывается', () => {
  const r1 = resolve({ s_need: { selected: ['no'] } });
  assert.ok(!r1.visible.some((q) => q.id === 's_tasks'));
  const r2 = resolve({ s_need: { selected: ['main'] } });
  assert.ok(r2.visible.some((q) => q.id === 's_tasks'));
  assert.ok(r2.visible.some((q) => q.id === 's_updater'));
});

test('условные переходы: вопросы о видео только при выбранном видео', () => {
  assert.ok(!resolve({ v_types: { selected: ['none'] } }).visible.some((q) => q.id === 'v_people'));
  assert.ok(!resolve({ v_types: { selected: [UNKNOWN] } }).visible.some((q) => q.id === 'v_details'));
  assert.ok(resolve({ v_types: { selected: ['image'] } }).visible.some((q) => q.id === 'v_restrict'));
});

test('без инструментов вместо ранжирования — вопрос «с чего начать»', () => {
  const r = resolve({ s_need: { selected: ['no'] }, v_types: { selected: ['none'] }, a_types: { selected: ['none'] }, s_online: { selected: ['none'] } });
  assert.ok(!r.visible.some((q) => q.id === 'p_top3'));
  assert.ok(r.visible.some((q) => q.id === 'p_none_selected'));
});

test('ответы скрытых вопросов не попадают в отчёт, но сохраняются', () => {
  const answers = { s_need: { selected: ['no'] }, s_tasks: { selected: ['requests'] } };
  const r = resolve(answers);
  assert.equal(r.effective['s_tasks'], undefined);
  assert.ok(answers.s_tasks);
});

test('исключающие варианты и лимит выбора', () => {
  const q = QUESTION_BY_ID['v_types'];
  let a = toggleOption(q, undefined, 'image');
  a = toggleOption(q, a, 'process');
  assert.deepEqual(a.selected, ['image', 'process']);
  a = toggleOption(q, a, 'none');
  assert.deepEqual(a.selected, ['none']);
  a = toggleOption(q, a, 'short');
  assert.deepEqual(a.selected, ['short']);
  a = toggleOption(q, a, UNKNOWN);
  assert.deepEqual(a.selected, [UNKNOWN]);
  const q3 = QUESTION_BY_ID['g_first_know'];
  let b = toggleOption(q3, undefined, 'custom_parts');
  b = toggleOption(q3, b, 'equipment');
  b = toggleOption(q3, b, 'hydraulics');
  b = toggleOption(q3, b, 'quality');
  assert.equal(b.selected!.length, 3, 'не больше трёх');
});

test('обязательный вопрос без ответа не пропускает дальше; «не знаю» — пропускает', () => {
  const q = QUESTION_BY_ID['g_tasks'];
  assert.equal(canProceed(q, {}, []), false);
  assert.equal(canProceed(q, { g_tasks: { selected: [UNKNOWN] } }, []), true);
  assert.equal(canProceed(QUESTION_BY_ID['o_vision'], {}, []), true);
});

test('сценарий «сайт + ролик + каталог»: одна съёмка на все три проекта', () => {
  const plan = buildPlan(SITE_VIDEO_CATALOG);
  const ids = plan.projects.map((p) => p.def.id);
  for (const id of ['site', 'video_main', 'catalog', 'shoot', 'messages', 'audit']) assert.ok(ids.includes(id), id);
  const shoot = plan.projects.find((p) => p.def.id === 'shoot')!;
  for (const id of ['site', 'video_main', 'catalog']) assert.ok(shoot.dependents.includes(id), `shoot → ${id}`);
  assert.ok(plan.synergies.some((s) => s.includes('Одна съёмка') && s.includes('Корпоративный сайт') && s.includes('Каталог')));
  // Сроки из ответов
  const h = (id: string) => plan.projects.find((p) => p.def.id === id)!.horizon;
  assert.equal(h('site'), 1);
  assert.equal(h('video_main'), 2);
  assert.equal(h('catalog'), 3);
  // Базовые работы не позже зависимых
  for (const p of plan.projects) for (const d of p.dependsOn) assert.ok(h(d) <= p.horizon, `${d} ≤ ${p.def.id}`);
  // Рекомендации отмечены как рекомендации
  assert.equal(plan.projects.find((p) => p.def.id === 'presentation')!.origin, 'recommended');
  assert.equal(plan.projects.find((p) => p.def.id === 'site')!.origin, 'client');
  assert.equal(plan.projects.find((p) => p.def.id === 'site')!.priority, 'high');
  // Выставка в планах → выставочный комплект рекомендован
  assert.ok(ids.includes('expo'));
});

test('свежие фото и без видео — отдельная съёмка не добавляется', () => {
  const plan = buildPlan({ s_need: { selected: ['main'] }, p_resources: { selected: ['pro_photos'] } });
  assert.ok(!plan.projects.some((p) => p.def.id === 'shoot'));
  assert.ok(plan.skipped.length === 1);
});

test('перегрузка первого периода: лишнее без явного срока уходит на 3–6 мес.', () => {
  const plan = buildPlan({
    a_types: { selected: ['presentation', 'kp', 'catalog', 'banners', 'stand', 'outdoor', 'recruit'] },
    p_top3: { order: ['ad_presentation', 'ad_kp', 'ad_catalog'] },
    g_barriers: { selected: ['nothing_to_show', 'slow_kp'] },
    p_timing: { items: { ad_banners: { when: ['now'] }, ad_stand: { when: ['m3'] } } },
  });
  const h1 = plan.projects.filter((p) => p.horizon === 1 && p.origin !== 'foundation');
  const fixedIds = ['presentation', 'kp', 'catalog', 'ads', 'expo'];
  for (const id of fixedIds) assert.ok(h1.some((p) => p.def.id === id), `${id} в первом периоде (явный срок или топ-3)`);
  assert.ok(plan.projects.every((p) => p.horizonReasons.length > 0), 'у каждого проекта объяснён срок');
});

test('стоимость не выдумывается', () => {
  const doc = buildRoadmapDoc(rec(SITE_VIDEO_CATALOG));
  const txt = docToText(doc);
  assert.ok(!/\d\s?(000|тыс|млн)\s?₽/.test(txt.replace(/Бюджет.*$/gm, '')), 'в плане нет сумм');
  assert.ok(txt.includes('Требуется отдельная смета'));
});

test('отчёты: все 10 разделов исполнителя и разделение источников', () => {
  const r = rec(SITE_VIDEO_CATALOG);
  const ex = buildExecutorDoc(r);
  for (let i = 1; i <= 10; i++) assert.ok(ex.sections.some((s) => s.title.startsWith(`${i}.`)), `раздел ${i}`);
  const txt = docToText(ex);
  assert.ok(txt.includes('[Пожелание заказчика]'));
  assert.ok(txt.includes('[Исходные данные]'));
  assert.ok(txt.includes('[Рекомендация исполнителя'));
  const client = buildClientDoc(r);
  assert.equal(client.title, 'Ваши приоритеты развития СИБПРОМТЕХ');
  assert.equal(client.sections.length, 6);
});

test('экспорт JSON → импорт возвращает тот же бриф', () => {
  const r = rec(SITE_VIDEO_CATALOG);
  const back = parseImport(toExportJson(r));
  assert.deepEqual(back, r);
  assert.throws(() => parseImport('{"x":1}'));
  assert.throws(() => parseImport('не json'));
});

test('CSV плана формируется', () => {
  const csv = roadmapCsv(rec(SITE_VIDEO_CATALOG));
  assert.ok(csv.startsWith('﻿Период;Проект'));
  assert.ok(csv.split('\r\n').length > 5);
});

test('PDF собирается и содержит встроенный шрифт', async () => {
  const pdf = await docToPdf(buildExecutorDoc(rec(SITE_VIDEO_CATALOG)));
  const head = new TextDecoder('latin1').decode(pdf.slice(0, 8));
  assert.equal(head, '%PDF-1.7');
  const tail = new TextDecoder('latin1').decode(pdf.slice(-5));
  assert.equal(tail, '%%EOF');
  const s = new TextDecoder('latin1').decode(pdf);
  assert.ok(s.includes('/FontFile2'));
  assert.ok(s.includes('/ToUnicode'));
});

test('пустой бриф не ломает отчёты', async () => {
  const r = rec({});
  r.status = 'draft';
  for (const d of [buildClientDoc(r), buildExecutorDoc(r), buildRoadmapDoc(r)]) {
    assert.ok(docToText(d).length > 100);
    await docToPdf(d);
  }
});
