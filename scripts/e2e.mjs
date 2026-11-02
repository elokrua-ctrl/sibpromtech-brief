// Сквозная проверка сценариев в настоящем браузере (Playwright + Chromium).
// Использование: node scripts/e2e.mjs dist/index.html [папка-для-скриншотов]
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve } from 'node:path';

const file = resolve(process.argv[2] ?? 'dist/index.html');
const shots = resolve(process.argv[3] ?? 'e2e-shots');
mkdirSync(shots, { recursive: true });
// Отдаём файл по http, как на настоящем хостинге
const server = createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/index.html`;

let failures = 0;
const check = (cond, msg) => {
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    failures++;
    console.log(`  ✗ ${msg}`);
  }
};

const browser = await chromium.launch();

async function qid(page) {
  return page.getAttribute('[data-testid="question-title"]', 'data-qid');
}
async function opt(page, id) {
  await page.click(`.sv-card [data-opt="${id}"]`);
}
async function next(page) {
  await page.click('[data-testid="next"]');
  await page.waitForTimeout(60);
}

/* ===== Сценарий 1: полный проход на десктопе ===== */
{
  console.log('Сценарий 1: полный проход, условные переходы, возврат, сохранение, экспорт');
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, acceptDownloads: true });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(url);
  await page.screenshot({ path: `${shots}/01-start-desktop.png`, fullPage: true });
  check(await page.isVisible('text=СТРАТЕГИЯ РАЗВИТИЯ БРЕНДА') || (await page.textContent('.hero-sub')).includes('Стратегия'), 'стартовый экран');
  check((await page.textContent('.hero-meta')).includes('10–15 минут'), 'время заполнения указано');

  await page.fill('.respondent input >> nth=0', 'Петров П. П.');
  await page.fill('.respondent input >> nth=1', 'Генеральный директор');
  await page.click('[data-testid="start"]');

  // Обязательный вопрос
  check((await qid(page)) === 'g_tasks', 'первый вопрос — цели');
  await next(page);
  check(await page.isVisible('.sv-error'), 'без ответа дальше не пускает');
  await opt(page, 'more_requests');
  await opt(page, 'trust');
  await opt(page, 'hiring');
  await page.screenshot({ path: `${shots}/02-question-desktop.png`, fullPage: true });
  await next(page);

  await opt(page, 'nothing_to_show');
  await opt(page, 'name_confusion');
  await next(page); // barriers
  await opt(page, 'big_industry');
  await opt(page, '__other');
  await page.fill('[data-testid="other-input"]', 'Обогатительные фабрики');
  await next(page); // audience
  for (const id of ['custom_parts', 'equipment', 'engineering']) await opt(page, id);
  check((await page.$$('.sv-card .opt.is-on')).length === 3 && (await page.isDisabled('.sv-card [data-opt="quality"]')), 'лимит «не больше трёх» работает');
  await next(page);
  await opt(page, 'more_requests');
  await opt(page, '__unknown');
  check((await page.$$('.sv-card .opt.is-on')).length === 1, '«Пока не знаю» снимает остальные варианты');
  await opt(page, 'more_requests');
  await opt(page, 'better_clients');
  await next(page); // success

  // Этап 2
  check((await qid(page)) === 's_current', 'этап 2 начинается с текущего сайта');
  check(await page.isVisible('.sv-intro'), 'показано вступление этапа');
  await opt(page, 'outdated');
  await next(page);
  await opt(page, 'main');
  await next(page);
  check((await qid(page)) === 's_tasks', 'сайт нужен → задаются вопросы о сайте');
  // Возврат и изменение ответа
  await page.click('[data-testid="back"]');
  check((await qid(page)) === 's_need', 'кнопка «Назад» возвращает к предыдущему вопросу');
  await opt(page, 'no');
  await next(page);
  check((await qid(page)) === 's_online', 'сайт не нужен → подробный бриф сайта пропущен');
  await page.click('[data-testid="back"]');
  await opt(page, 'main');
  await next(page);
  await opt(page, 'requests');
  await opt(page, 'capabilities');
  await next(page);
  await opt(page, 'detailed');
  await next(page);
  await opt(page, 'upload');
  await next(page);
  await opt(page, 'overview');
  await next(page);
  await opt(page, 'anonymous');
  await next(page);
  await opt(page, 'assign');
  await next(page);
  await opt(page, 'search');
  await opt(page, 'maps');
  await opt(page, 'hh');
  await next(page);

  // Этап 3 — видео
  check((await qid(page)) === 'v_types', 'этап видео');
  await opt(page, 'presentation');
  await opt(page, 'process');
  await opt(page, 'short');
  await next(page);
  check((await qid(page)) === 'v_details', 'уточнения только по выбранным видео');
  check((await page.$$('.pi-card')).length === 3, 'карточек уточнений — по числу выбранных видео');
  await page.click('.pi-card[data-item="presentation"] [data-opt="meetings"]');
  await page.click('.pi-card[data-item="presentation"] [data-opt="clients"]');
  await page.click('.pi-card[data-item="presentation"] [data-opt="big"]');
  await page.screenshot({ path: `${shots}/03-peritem-desktop.png`, fullPage: true });
  await next(page);
  await opt(page, 'director');
  await opt(page, 'workers');
  await next(page);
  await opt(page, 'client_parts');
  await next(page);

  // Этап 4 — реклама, много пунктов
  check((await qid(page)) === 'a_types', 'этап рекламы');
  for (const id of ['presentation', 'kp', 'catalog', 'stand', 'merch', 'social']) await opt(page, id);
  check(await page.isVisible('.hint-box'), 'при большом выборе предлагается расставить приоритеты');
  await next(page);
  check((await qid(page)) === 'a_details', 'уточнения по материалам');
  await next(page); // пропускаем — необязательный

  // Этап 5
  check((await qid(page)) === 'p_top3', 'ранжирование трёх задач');
  const rankItems = await page.$$eval('.rank-opt', (els) => els.map((e) => e.getAttribute('data-opt')));
  check(rankItems.includes('site') && rankItems.includes('video_presentation') && rankItems.includes('ad_catalog') && rankItems.includes('ad_recruit'), 'в ранжировании все выбранные инструменты');
  await next(page);
  check(await page.isVisible('.sv-error'), 'без выбора трёх задач дальше не пускает');
  await opt(page, 'site');
  await opt(page, 'video_presentation');
  await opt(page, 'ad_catalog');
  check((await page.$$('.rank-slots li.filled')).length === 3 && (await page.isDisabled('.rank-opt[data-opt="ad_kp"]')), 'выбрать можно ровно три');
  await page.screenshot({ path: `${shots}/04-rank-desktop.png`, fullPage: true });
  await next(page);
  check((await qid(page)) === 'p_timing', 'сроки по направлениям');
  await page.click('.pi-card[data-item="site"] [data-opt="m3"]');
  await page.click('.pi-card[data-item="video_presentation"] [data-opt="m6"]');
  await page.click('.pi-card[data-item="ad_catalog"] [data-opt="h2"]');
  await page.click('.pi-card[data-item="ad_merch"] [data-opt="later"]');
  await next(page);
  await opt(page, 'expo');
  await page.click('.add-comment');
  await page.fill('.comment textarea', 'Нефтегаз-2027, март');
  await next(page);
  await opt(page, 'brandbook');
  await opt(page, 'amateur_photos');
  await next(page);
  await opt(page, 'advice');
  await next(page);
  await opt(page, 'lt50');
  await next(page);
  await opt(page, 'start_then');
  await next(page);

  // Этап 6
  await opt(page, 'ceo');
  await next(page);
  await opt(page, 'chief_engineer');
  await next(page);
  await opt(page, 'sales');
  await next(page);
  await opt(page, 'deputy');
  await next(page);
  await opt(page, 'onsite');
  await opt(page, 'messenger');
  await next(page);
  await opt(page, 'no_clients');
  await next(page);
  check((await qid(page)) === 'o_ideas', 'открытый вопрос об идеях');
  check((await page.textContent('[data-testid="next"]')).includes('Пропустить'), 'необязательный вопрос можно пропустить');
  await page.fill('[data-testid="text-input"]', 'Хотим экскурсии на производство для заказчиков');
  await next(page);
  check((await qid(page)) === 'o_vision', 'последний вопрос — образ через год');
  await page.fill('[data-testid="text-input"]', 'Крупные компании УрФО знают СИБПРОМТЕХ и сами приходят с задачами.');
  await page.click('[data-testid="next"]');
  await page.waitForSelector('[data-testid="results-title"]');
  check((await page.textContent('[data-testid="results-title"]')).includes('Ваши приоритеты развития СИБПРОМТЕХ'), 'страница итогов для заказчика');
  await page.screenshot({ path: `${shots}/05-results-client-desktop.png`, fullPage: true });

  const clientText = await page.textContent('.rs-main');
  check(clientText.includes('Три приоритетных направления') && clientText.includes('Сайт'), 'итоги: три приоритета');
  check(clientText.includes('Вопросы для дополнительного обсуждения'), 'итоги: вопросы для обсуждения');
  check(clientText.includes('не готовая маркетинговая стратегия'), 'итоги: оговорка, что это не стратегия');

  await page.click('[data-testid="tab-executor"]');
  const exText = await page.textContent('.rs-main');
  for (let i = 1; i <= 10; i++) check(exText.includes(`${i}. `), `отчёт исполнителя: раздел ${i}`);
  check(exText.includes('Пожелание заказчика') && exText.includes('Исходные данные') && exText.includes('Рекомендация исполнителя'), 'отчёт: три вида информации разделены');
  await page.screenshot({ path: `${shots}/06-results-executor-desktop.png`, fullPage: true });

  await page.click('[data-testid="tab-roadmap"]');
  const shootCard = await page.$('[data-project="shoot"]');
  check(!!shootCard, 'в плане есть единая съёмка');
  const synergy = await page.textContent('.synergy');
  check(synergy.includes('Одна съёмка') && synergy.includes('Корпоративный сайт') && synergy.includes('Каталог'), 'план: съёмка объединяет сайт, ролик и каталог');
  check((await page.$$('[data-horizon="1"] [data-project="site"]')).length === 1, 'сайт (срок «3 месяца») — в периоде 0–3');
  check((await page.$$('[data-horizon="2"] [data-project="video_main"]')).length === 1, 'ролик (срок «3–6») — в периоде 3–6');
  check((await page.$$('[data-horizon="3"] [data-project="catalog"]')).length === 1, 'каталог (второе полугодие) — в периоде 6–12');
  check((await page.textContent('.roadmap')).includes('отдельной сметой'), 'стоимость не выдумывается');
  await page.click('[data-project="site"] .pcard-toggle');
  await page.screenshot({ path: `${shots}/07-results-roadmap-desktop.png`, fullPage: true });

  // Экспорт
  const saved = {};
  for (const key of ['pdf-client', 'pdf-executor', 'pdf-roadmap', 'csv', 'json']) {
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.click(`[data-testid="export-${key}"]`)]);
    const path = `${shots}/${key}__${dl.suggestedFilename()}`;
    await dl.saveAs(path);
    saved[key] = path;
    check(dl.suggestedFilename().startsWith('SIBPROMTECH_'), `экспорт ${key}: ${dl.suggestedFilename()}`);
  }
  for (const k of ['pdf-client', 'pdf-executor', 'pdf-roadmap']) {
    const buf = readFileSync(saved[k]);
    check(buf.subarray(0, 5).toString() === '%PDF-' && buf.length > 8000, `${k}: корректный PDF (${Math.round(buf.length / 1024)} КБ)`);
  }
  const json = JSON.parse(readFileSync(saved.json, 'utf8'));
  check(json.format === 'sibpromtech-brief-export' && json.brief.respondent.name === 'Петров П. П.', 'JSON содержит бриф и автора');
  check(readFileSync(saved.csv, 'utf8').includes('Корпоративный сайт'), 'CSV плана содержит проекты');

  await page.click('[data-testid="copy"]');
  await page.waitForSelector('[data-testid="status"]');
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  check(clip.includes('СТРАТЕГИЧЕСКИЙ ОТЧЁТ') && clip.includes('ПРЕДВАРИТЕЛЬНЫЙ ПЛАН'), 'текст для исполнителя копируется');

  // Сохранение и возврат
  await page.reload();
  await page.goto(url + '#start');
  await page.waitForSelector('[data-testid="open-results"]');
  check(true, 'после перезагрузки бриф восстановлен — доступна кнопка «Открыть результаты»');
  await page.click('[data-testid="open-results"]');
  await page.click('[data-testid="edit"]');
  check((await qid(page)) === 'o_vision', '«Изменить ответы» возвращает к опроснику');
  await page.click('.stepper .step >> nth=1');
  check((await qid(page)) === 's_current', 'переход к этапу по шкале этапов');

  // Режим просмотра из JSON
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const p2 = await ctx2.newPage();
  await p2.goto(url + '#view');
  await p2.setInputFiles('[data-testid="import-input"]', saved.json);
  await p2.waitForSelector('[data-testid="results-title"]');
  check((await p2.textContent('.rs-main')).includes('1. Сводка целей'), 'режим просмотра открывает присланный JSON');
  check(!(await p2.isVisible('[data-testid="edit"]')), 'в режиме просмотра нет опросника');
  await p2.screenshot({ path: `${shots}/08-view-mode.png`, fullPage: false });
  await p2.click('text=Открыть другой файл');
  await p2.setInputFiles('[data-testid="import-input"]', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"a":1}') });
  check(await p2.isVisible('.status-err'), 'чужой файл — понятная ошибка');
  await ctx2.close();

  check(errors.length === 0, `ошибок в консоли нет${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await ctx.close();
}

/* ===== Сценарий 2: телефон, «ничего не нужно» ===== */
{
  console.log('Сценарий 2: телефон, минимальный путь без инструментов');
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(url);
  await page.screenshot({ path: `${shots}/10-start-mobile.png`, fullPage: true });
  await page.click('[data-testid="start"]');
  let steps = 0;
  const minimal = { s_need: 'no', s_online: 'none', v_types: 'none', a_types: 'none', p_none_selected: 'need_advice', o_contact: 'undefined' };
  while (!(await page.$('[data-testid="results-title"]')) && steps < 60) {
    const id = await qid(page);
    if (steps === 1) await page.screenshot({ path: `${shots}/11-question-mobile.png`, fullPage: false });
    const q = await page.$eval('[data-testid="question-title"]', (e) => e.getAttribute('data-qid'));
    if (minimal[id]) await opt(page, minimal[id]);
    else if (await page.$('.sv-card [data-opt="__unknown"]')) await opt(page, '__unknown');
    else if (await page.$('.sv-card .opt[data-opt]')) await page.click('.sv-card .opt[data-opt] >> nth=0');
    void q;
    await next(page);
    steps++;
  }
  check(!!(await page.$('[data-testid="results-title"]')), `пройден за ${steps} вопросов`);
  check(steps <= 25, 'без выбранных направлений — только базовые вопросы (не больше 25 коротких экранов)');
  await page.screenshot({ path: `${shots}/12-results-mobile.png`, fullPage: false });
  await page.click('[data-testid="tab-executor"]');
  const t = await page.textContent('.rs-main');
  check(t.includes('Заказчик пока не знает'), 'ответы «Пока не знаю» попадают в недостающую информацию');
  await page.click('[data-testid="tab-roadmap"]');
  await page.screenshot({ path: `${shots}/13-roadmap-mobile.png`, fullPage: true });
  await ctx.close();
}

/* ===== Сценарий 3: планшет ===== */
{
  console.log('Сценарий 3: планшет');
  const ctx = await browser.newContext({ viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(url);
  await page.click('[data-testid="start"]');
  await opt(page, 'more_requests');
  await page.screenshot({ path: `${shots}/20-question-tablet.png`, fullPage: false });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check(!overflow, 'нет горизонтальной прокрутки');
  await ctx.close();
}

await browser.close();
server.close();
console.log(failures ? `\nОШИБОК: ${failures}` : '\nВсе проверки пройдены');
process.exit(failures ? 1 : 0);
