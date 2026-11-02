import { useRef, useState } from 'react';
import type { BriefRecord } from '../data/types';
import { parseImport } from '../logic/exporters';
import { BrandMark } from './BrandMark';
import { Results } from './Results';

/**
 * Режим просмотра результатов без опросника:
 * исполнитель открывает присланный JSON или результаты, сохранённые в этом браузере.
 * Здесь же позже можно сделать список нескольких брифов (см. README).
 */
export function ViewMode({ localRec, onHome }: { localRec: BriefRecord | null; onHome: () => void }) {
  const [rec, setRec] = useState<BriefRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const readFile = async (f: File | undefined) => {
    if (!f) return;
    setError(null);
    try {
      setRec(parseImport(await f.text()));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (rec) return <Results rec={rec} mode="view" onHome={onHome} onLoadOther={() => setRec(null)} />;

  return (
    <div className="viewmode">
      <header className="rs-head">
        <div className="rs-head-inner">
          <div className="rs-top">
            <button className="sv-brand" onClick={onHome} aria-label="На стартовый экран">
              <BrandMark compact />
            </button>
            <span className="hero-tag">Режим просмотра</span>
          </div>
          <div className="hero-rule" />
          <h1 className="rs-title">Просмотр результатов брифа</h1>
          <p className="rs-sub">Для исполнителя: откройте файл, который прислал заказчик.</p>
        </div>
      </header>
      <main className="vm-main">
        <div
          className={`drop${drag ? ' is-drag' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            void readFile(e.dataTransfer.files[0]);
          }}
        >
          <p className="drop-title">Перетащите сюда файл брифа (.json)</p>
          <p className="muted">или</p>
          <button className="btn btn-primary" onClick={() => input.current?.click()}>
            Выбрать файл
          </button>
          <input
            ref={input}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => void readFile(e.target.files?.[0])}
            data-testid="import-input"
          />
          <p className="muted small">Файл открывается только в вашем браузере и никуда не загружается.</p>
        </div>
        {error && (
          <p className="status status-err" role="alert">
            {error}
          </p>
        )}
        {localRec && Object.keys(localRec.answers).length > 0 && (
          <button className="btn btn-secondary" onClick={() => setRec(localRec)} data-testid="view-local">
            Показать бриф, сохранённый в этом браузере
          </button>
        )}
      </main>
    </div>
  );
}
