import { useEffect, useMemo, useRef, useState } from 'react';
import { STAGES } from '../data/questions';
import type { Answer, BriefRecord } from '../data/types';
import { canProceed, isAnswered, resolve } from '../logic/flow';
import { repository } from '../storage/repository';
import { BrandMark } from './BrandMark';
import { QuestionView } from './QuestionView';

interface Props {
  rec: BriefRecord;
  onChange: (r: BriefRecord) => void;
  onFinish: () => void;
  onExit: () => void;
}

export function Survey({ rec, onChange, onFinish, onExit }: Props) {
  const { visible, tools } = useMemo(() => resolve(rec.answers), [rec.answers]);
  const idx = Math.max(0, visible.findIndex((q) => q.id === rec.currentQuestionId));
  const q = visible[idx];
  const stage = STAGES.find((s) => s.id === q.stage)!;
  const firstOfStage = visible.findIndex((x) => x.stage === q.stage) === idx;
  const isLast = idx === visible.length - 1;
  const ok = canProceed(q, rec.answers, tools);
  const answered = isAnswered(q, rec.answers, tools);
  const [tried, setTried] = useState(false);
  const headRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    setTried(false);
    headRef.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [q.id]);

  const setAnswer = (a: Answer) => onChange({ ...rec, currentQuestionId: q.id, answers: { ...rec.answers, [q.id]: a } });

  const goTo = (id: string) => onChange({ ...rec, currentQuestionId: id });

  const next = () => {
    if (!ok) {
      setTried(true);
      return;
    }
    if (isLast) {
      onChange({ ...rec, status: 'completed', currentQuestionId: q.id });
      onFinish();
      return;
    }
    goTo(visible[idx + 1].id);
  };

  const back = () => {
    if (idx === 0) onExit();
    else goTo(visible[idx - 1].id);
  };

  const pct = Math.round((idx / visible.length) * 100);
  const stageFirstIdx = (sid: string) => visible.findIndex((x) => x.stage === sid);
  const reachable = (sid: string) => {
    const i = stageFirstIdx(sid);
    return i >= 0 && (rec.status === 'completed' || i <= idx || Object.keys(rec.answers).some((k) => visible.findIndex((x) => x.id === k) >= i));
  };

  return (
    <div className="survey">
      <header className="sv-top">
        <div className="sv-top-inner">
          <button className="sv-brand" onClick={onExit} aria-label="На стартовый экран">
            <BrandMark compact />
          </button>
          <div className="sv-save" aria-live="polite">
            {repository.persistent ? 'Ответы сохраняются в этом браузере' : 'Сохранение недоступно — не закрывайте вкладку'}
          </div>
        </div>
        <nav className="stepper" aria-label="Этапы">
          {STAGES.map((s) => {
            const state = s.index < stage.index ? 'done' : s.index === stage.index ? 'current' : 'todo';
            const can = reachable(s.id) && s.id !== stage.id;
            return (
              <button
                key={s.id}
                className={`step ${state}`}
                disabled={!can}
                onClick={() => can && goTo(visible[stageFirstIdx(s.id)].id)}
                aria-current={state === 'current' ? 'step' : undefined}
                title={s.title}
              >
                <span className="step-bar" />
                <span className="step-label">
                  <span className="step-num">{s.index}</span>
                  <span className="step-title">{s.title}</span>
                </span>
              </button>
            );
          })}
        </nav>
        <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="progress-fill" style={{ width: `${pct}%` }} />
        </div>
      </header>

      <main className="sv-main">
        <div className="sv-card">
          <p className="sv-stage">
            Этап {stage.index} из {STAGES.length} · {stage.title}
            <span className="sv-count">
              Вопрос {idx + 1} из {visible.length}
            </span>
          </p>
          {firstOfStage && <p className="sv-intro">{stage.intro}</p>}
          <h1 className="sv-q" tabIndex={-1} ref={headRef} data-testid="question-title" data-qid={q.id}>
            {q.title}
          </h1>
          {q.help && <p className="sv-help">{q.help}</p>}

          <QuestionView q={q} answer={rec.answers[q.id]} answers={rec.answers} tools={tools} onChange={setAnswer} />

          {q.note && <p className="sv-note">{q.note}</p>}
          {tried && !ok && (
            <p className="sv-error" role="alert">
              Выберите вариант — или «Пока не знаю», если ответа нет.
            </p>
          )}
        </div>
      </main>

      <footer className="sv-foot">
        <div className="sv-foot-inner">
          <button className="btn btn-secondary" onClick={back} data-testid="back">
            ← Назад
          </button>
          <button className={`btn btn-primary${ok ? '' : ' is-soft'}`} onClick={next} data-testid="next">
            {isLast ? 'Завершить и посмотреть итоги' : q.optional && !answered ? 'Пропустить →' : 'Далее →'}
          </button>
        </div>
      </footer>
    </div>
  );
}
