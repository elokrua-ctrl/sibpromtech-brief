import { useCallback, useEffect, useRef, useState } from 'react';
import type { BriefRecord } from './data/types';
import { newBrief, repository } from './storage/repository';
import { warmupDownloads } from './storage/download';
import { StartScreen } from './components/StartScreen';
import { Survey } from './components/Survey';
import { Results } from './components/Results';
import { ViewMode } from './components/ViewMode';

export type Route = 'start' | 'brief' | 'results' | 'view';

const ROUTES: Route[] = ['start', 'brief', 'results', 'view'];

function readRoute(): Route {
  const h = window.location.hash.replace('#', '');
  return (ROUTES as string[]).includes(h) ? (h as Route) : 'start';
}

export function App() {
  const [route, setRoute] = useState<Route>(readRoute);
  const [rec, setRec] = useState<BriefRecord | null>(null);
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    warmupDownloads();
    repository.loadCurrent().then((r) => {
      setRec(r);
      setLoaded(true);
    });
    const onHash = () => setRoute(readRoute());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = useCallback((r: Route) => {
    if (window.location.hash !== `#${r}`) window.location.hash = r;
    setRoute(r);
    window.scrollTo({ top: 0 });
  }, []);

  const update = useCallback((next: BriefRecord) => {
    const stamped = { ...next, updatedAt: new Date().toISOString() };
    setRec(stamped);
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void repository.saveCurrent(stamped), 250);
  }, []);

  const startNew = useCallback(
    (respondent?: BriefRecord['respondent']) => {
      const b = newBrief();
      if (respondent && (respondent.name || respondent.role)) b.respondent = respondent;
      update(b);
      go('brief');
    },
    [go, update],
  );

  const reset = useCallback(async () => {
    await repository.clearCurrent();
    setRec(null);
    go('start');
  }, [go]);

  if (!loaded) return <div className="boot" aria-busy="true" />;

  // Без брифа опросник и результаты не имеют смысла — возвращаем на старт
  const effectiveRoute: Route = !rec && (route === 'brief' || route === 'results') ? 'start' : route;

  switch (effectiveRoute) {
    case 'brief':
      return <Survey rec={rec!} onChange={update} onFinish={() => go('results')} onExit={() => go('start')} />;
    case 'results':
      return <Results rec={rec!} mode="own" onEdit={() => go('brief')} onHome={() => go('start')} onReset={reset} />;
    case 'view':
      return <ViewMode localRec={rec} onHome={() => go('start')} />;
    default:
      return (
        <StartScreen
          rec={rec}
          persistent={repository.persistent}
          onStart={startNew}
          onContinue={() => go('brief')}
          onResults={() => go('results')}
          onView={() => go('view')}
          onReset={reset}
        />
      );
  }
}
