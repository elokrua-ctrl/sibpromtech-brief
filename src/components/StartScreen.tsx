import { useState } from 'react';
import { STAGES } from '../data/questions';
import type { BriefRecord } from '../data/types';
import { resolve } from '../logic/flow';
import { BrandMark } from './BrandMark';

interface Props {
  rec: BriefRecord | null;
  persistent: boolean;
  onStart: (respondent?: BriefRecord['respondent']) => void;
  onContinue: () => void;
  onResults: () => void;
  onView: () => void;
  onReset: () => void;
}

function progress(rec: BriefRecord): number {
  const { visible } = resolve(rec.answers);
  if (rec.status === 'completed') return 100;
  const i = visible.findIndex((q) => q.id === rec.currentQuestionId);
  return Math.round((Math.max(i, 0) / visible.length) * 100);
}

export function StartScreen({ rec, persistent, onStart, onContinue, onResults, onView, onReset }: Props) {
  const [name, setName] = useState(rec?.respondent?.name ?? '');
  const [role, setRole] = useState(rec?.respondent?.role ?? '');
  const [confirmReset, setConfirmReset] = useState(false);
  const hasDraft = !!rec && Object.keys(rec.answers).length > 0;
  const done = rec?.status === 'completed';

  return (
    <div className="start">
      <section className="hero">
        <div className="hero-inner">
          <header className="hero-top">
            <BrandMark />
            <span className="hero-tag">Бриф для руководства</span>
          </header>

          <div className="hero-main">
            <div className="hero-rule" />
            <h1 className="hero-title">СИБПРОМТЕХ</h1>
            <p className="hero-sub">Стратегия развития бренда</p>
            <p className="hero-lead">
              «Помогите определить, какие инструменты и проекты необходимы вашему предприятию на следующем этапе развития».
            </p>
            <p className="hero-meta">
              <span>10–15 минут</span>
              <span>6 этапов</span>
              <span>Можно прерваться и продолжить позже</span>
            </p>

            <div className="hero-actions">
              {!hasDraft && (
                <>
                  <div className="respondent">
                    <label>
                      <span>Ваше имя</span>
                      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Необязательно" autoComplete="name" />
                    </label>
                    <label>
                      <span>Должность</span>
                      <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Необязательно" autoComplete="organization-title" />
                    </label>
                  </div>
                  <button className="btn btn-primary btn-lg" onClick={() => onStart({ name: name.trim(), role: role.trim() })} data-testid="start">
                    Начать
                  </button>
                </>
              )}
              {hasDraft && !done && (
                <>
                  <button className="btn btn-primary btn-lg" onClick={onContinue} data-testid="continue">
                    Продолжить · заполнено {progress(rec!)}%
                  </button>
                  <button className="btn btn-ghost-dark" onClick={() => setConfirmReset(true)}>
                    Начать заново
                  </button>
                </>
              )}
              {done && (
                <>
                  <button className="btn btn-primary btn-lg" onClick={onResults} data-testid="open-results">
                    Открыть результаты
                  </button>
                  <button className="btn btn-ghost-dark" onClick={onContinue}>
                    Изменить ответы
                  </button>
                  <button className="btn btn-ghost-dark" onClick={() => setConfirmReset(true)}>
                    Новый бриф
                  </button>
                </>
              )}
            </div>
            {confirmReset && (
              <div className="confirm" role="alertdialog" aria-label="Подтверждение">
                <p>Удалить текущие ответы из этого браузера и начать с начала? Если ответы нужны — сначала выгрузите их на странице результатов.</p>
                <div className="confirm-actions">
                  <button className="btn btn-primary" onClick={() => { setConfirmReset(false); onReset(); }} data-testid="confirm-reset">
                    Да, начать заново
                  </button>
                  <button className="btn btn-ghost-dark" onClick={() => setConfirmReset(false)}>
                    Отмена
                  </button>
                </div>
              </div>
            )}
          </div>

          <ol className="hero-stages">
            {STAGES.map((s) => (
              <li key={s.id}>
                <span className="hero-stage-num">{String(s.index).padStart(2, '0')}</span>
                <span>{s.title}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="start-info">
        <div className="start-info-inner">
          <div>
            <h2>Как это работает</h2>
            <p>
              Вопросы простые, большинство — с готовыми вариантами. Если не уверены, выбирайте «Пока не знаю»: это тоже полезный ответ. Подробные
              вопросы появляются только по тем направлениям, которые вам интересны.
            </p>
          </div>
          <div>
            <h2>Где хранятся ответы</h2>
            <p>
              {persistent
                ? 'Ответы сохраняются только в этом браузере на этом устройстве. '
                : 'В этом окне браузер не разрешает сохранять данные: не закрывайте вкладку до конца заполнения. '}
              <strong>Исполнителю они автоматически не отправляются</strong> — в конце вы скачаете PDF или файл с ответами и передадите их.
            </p>
          </div>
          <div>
            <h2>Для исполнителя</h2>
            <p>
              Получили файл брифа (.json)? Откройте его в{' '}
              <button className="link" onClick={onView} data-testid="open-view">
                режиме просмотра результатов
              </button>
              .
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
