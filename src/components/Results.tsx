import { useMemo, useState } from 'react';
import type { BriefRecord } from '../data/types';
import { buildPlan } from '../logic/plan';
import { allAnswersRows, buildClientDoc, buildExecutorDoc, buildRoadmapDoc } from '../logic/report';
import { docToText, fileStamp, roadmapCsv, toExportJson } from '../logic/exporters';
import type { Doc } from '../logic/doc';
import { copyText, saveFile } from '../storage/download';
import { BrandMark } from './BrandMark';
import { DocView } from './DocView';
import { RoadmapView } from './RoadmapView';

type Tab = 'client' | 'executor' | 'roadmap' | 'answers';

const TABS: { id: Tab; label: string }[] = [
  { id: 'client', label: 'Ваши приоритеты' },
  { id: 'executor', label: 'Отчёт для исполнителя' },
  { id: 'roadmap', label: 'План развития' },
  { id: 'answers', label: 'Все ответы' },
];

interface Props {
  rec: BriefRecord;
  mode: 'own' | 'view';
  onEdit?: () => void;
  onHome: () => void;
  onReset?: () => void;
  onLoadOther?: () => void;
}

export function Results({ rec, mode, onEdit, onHome, onReset, onLoadOther }: Props) {
  const [tab, setTab] = useState<Tab>(mode === 'view' ? 'executor' : 'client');
  const [status, setStatus] = useState<{ text: string; kind: 'ok' | 'err' } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const plan = useMemo(() => buildPlan(rec.answers), [rec.answers]);
  const docs = useMemo(
    () => ({ client: buildClientDoc(rec, plan), executor: buildExecutorDoc(rec, plan), roadmap: buildRoadmapDoc(rec, plan) }),
    [rec, plan],
  );
  const answersRows = useMemo(() => allAnswersRows(rec.answers), [rec.answers]);

  const flash = (text: string, kind: 'ok' | 'err' = 'ok') => {
    setStatus({ text, kind });
    window.setTimeout(() => setStatus((s) => (s?.text === text ? null : s)), 6000);
  };

  const report = (r: Awaited<ReturnType<typeof saveFile>>, name: string) => {
    if (r === 'saved') flash(`Файл «${name}» сохранён.`);
    else if (r === 'declined') flash('Сохранение отменено.', 'err');
    else flash('Браузер не дал сохранить файл. Скопируйте текст отчёта кнопкой ниже.', 'err');
  };

  const pdf = async (key: string, d: Doc | Doc[], name: string) => {
    setBusy(key);
    try {
      const { docToPdf, docsToPdf } = await import('../pdf/render');
      const bytes = Array.isArray(d) ? await docsToPdf(d) : await docToPdf(d);
      report(await saveFile(name, new Blob([bytes as BlobPart], { type: 'application/pdf' })), name);
    } catch (e) {
      console.error(e);
      flash('Не удалось сформировать PDF. Попробуйте ещё раз или скопируйте текст.', 'err');
    } finally {
      setBusy(null);
    }
  };

  // Латиница в именах файлов: некоторые браузеры теряют кириллические имена при скачивании
  const stamp = fileStamp();
  const exports = [
    {
      key: 'pdf-client',
      label: 'Ваши приоритеты · PDF',
      run: () => pdf('pdf-client', docs.client, `SIBPROMTECH_prioritety_${stamp}.pdf`),
    },
    {
      key: 'pdf-executor',
      label: 'Отчёт для исполнителя · PDF',
      run: () => pdf('pdf-executor', docs.executor, `SIBPROMTECH_otchet-dlya-ispolnitelya_${stamp}.pdf`),
    },
    {
      key: 'pdf-roadmap',
      label: 'План развития · PDF',
      run: () => pdf('pdf-roadmap', docs.roadmap, `SIBPROMTECH_plan-razvitiya_${stamp}.pdf`),
    },
    {
      key: 'csv',
      label: 'План развития · таблица CSV',
      run: async () => {
        const name = `SIBPROMTECH_plan-razvitiya_${stamp}.csv`;
        report(await saveFile(name, new Blob([roadmapCsv(rec)], { type: 'text/csv' })), name);
      },
    },
    {
      key: 'json',
      label: 'Ответы · файл JSON',
      run: async () => {
        const name = `SIBPROMTECH_brief_${stamp}.json`;
        report(await saveFile(name, new Blob([toExportJson(rec)], { type: 'application/json' })), name);
      },
    },
  ];

  const copy = async () => {
    const text = [docToText(docs.executor), '', '', docToText(docs.roadmap)].join('\n');
    const ok = await copyText(text);
    flash(ok ? 'Текст отчёта и плана скопирован — вставьте его в письмо или мессенджер.' : 'Не удалось скопировать автоматически.', ok ? 'ok' : 'err');
  };

  return (
    <div className="results">
      <header className="rs-head">
        <div className="rs-head-inner">
          <div className="rs-top">
            <button className="sv-brand" onClick={onHome} aria-label="На стартовый экран">
              <BrandMark compact />
            </button>
            {mode === 'view' && <span className="hero-tag">Режим просмотра</span>}
          </div>
          <div className="hero-rule" />
          <h1 className="rs-title" data-testid="results-title">
            {mode === 'view' ? 'Результаты брифа' : 'Ваши приоритеты развития СИБПРОМТЕХ'}
          </h1>
          <p className="rs-sub">
            {[rec.respondent?.name, rec.respondent?.role].filter(Boolean).join(', ') || 'Предварительные итоги брифа'}
            {rec.status !== 'completed' && <span className="draft-badge">Черновик — заполнен не полностью</span>}
          </p>
          <nav className="tabs" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                className={`tab${tab === t.id ? ' is-on' : ''}`}
                onClick={() => setTab(t.id)}
                data-testid={`tab-${t.id}`}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <div className="rs-body">
        <main className="rs-main" role="tabpanel">
          {tab === 'client' && <DocView doc={docs.client} hideHeader />}
          {tab === 'executor' && <DocView doc={docs.executor} hideHeader />}
          {tab === 'roadmap' && <RoadmapView plan={plan} />}
          {tab === 'answers' && (
            <div className="doc">
              {answersRows.length === 0 && <p className="muted">Ответов пока нет.</p>}
              {answersRows.map((s) => (
                <section key={s.stage} className="doc-sec">
                  <h3 className="doc-sec-title">{s.stage}</h3>
                  <dl className="kv">
                    {s.rows.map(([k, v]) => (
                      <div key={k}>
                        <dt>{k}</dt>
                        <dd>{v}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ))}
            </div>
          )}
        </main>

        <aside className="rs-side">
          <div className="panel">
            <h2>Передать исполнителю</h2>
            <p className="panel-warn">
              Ответы <strong>не отправляются автоматически</strong>. Скачайте файлы или скопируйте текст и отправьте их исполнителю любым удобным
              способом.
            </p>
            <div className="export-list">
              {exports.map((e) => (
                <button key={e.key} className="btn btn-export" onClick={e.run} disabled={!!busy} data-testid={`export-${e.key}`}>
                  {busy === e.key ? 'Формируем…' : e.label}
                </button>
              ))}
              <button className="btn btn-export btn-export-accent" onClick={copy} data-testid="copy">
                Скопировать текст для исполнителя
              </button>
            </div>
            {status && (
              <p className={`status status-${status.kind}`} role="status" data-testid="status">
                {status.text}
              </p>
            )}
            <p className="panel-small">Файл JSON можно открыть в режиме просмотра результатов — на стартовом экране, внизу.</p>
          </div>

          <div className="panel panel-plain">
            {mode === 'own' && (
              <>
                <button className="btn btn-secondary btn-block" onClick={onEdit} data-testid="edit">
                  Изменить ответы
                </button>
                {!confirmReset ? (
                  <button className="link danger" onClick={() => setConfirmReset(true)}>
                    Удалить ответы из браузера
                  </button>
                ) : (
                  <div className="confirm light">
                    <p>Удалить ответы? Перед этим сохраните JSON, если они ещё нужны.</p>
                    <div className="confirm-actions">
                      <button className="btn btn-primary" onClick={onReset}>
                        Удалить
                      </button>
                      <button className="btn btn-secondary" onClick={() => setConfirmReset(false)}>
                        Отмена
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
            {mode === 'view' && onLoadOther && (
              <button className="btn btn-secondary btn-block" onClick={onLoadOther}>
                Открыть другой файл
              </button>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
