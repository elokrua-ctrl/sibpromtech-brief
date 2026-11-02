import { HORIZONS } from '../data/kpi';
import { ROADMAP_RULES, projectCard } from '../logic/report';
import { PRIORITY_LABEL, type Plan } from '../logic/plan';
import { CardView } from './DocView';

export function RoadmapView({ plan }: { plan: Plan }) {
  return (
    <div className="roadmap">
      <p className="doc-disclaimer">
        Черновик, построенный по ответам брифа и открытым правилам (они перечислены внизу). Сроки и состав работ уточняются с заказчиком; стоимость
        каждого проекта считается отдельной сметой.
      </p>

      <div className="legend">
        <span className="src src-client">Запрос заказчика</span>
        <span className="src src-rec">Рекомендация исполнителя</span>
        <span className="legend-note">Нажмите «Подробнее» в карточке, чтобы увидеть цель, результат, зависимости и измеримые показатели.</span>
      </div>

      {plan.synergies.length > 0 && (
        <section className="synergy">
          <h3>Что можно объединить</h3>
          <ul className="ulist">
            {plan.synergies.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </section>
      )}

      <div className="horizons">
        {HORIZONS.map((h) => {
          const ps = plan.projects.filter((p) => p.horizon === h.id);
          return (
            <section key={h.id} className="horizon" data-horizon={h.id}>
              <header className="horizon-head">
                <span className="horizon-title">{h.title}</span>
                <span className="horizon-sub">{h.subtitle}</span>
              </header>
              {ps.length === 0 && <p className="muted">Проектов нет</p>}
              {ps.map((p) => (
                <div key={p.def.id} className={`hp prio-${p.priority}`} data-project={p.def.id}>
                  <div className="hp-prio">{PRIORITY_LABEL[p.priority]} приоритет</div>
                  <CardView card={projectCard(p, plan)} source={p.origin === 'client' ? 'client' : 'rec'} collapsible />
                </div>
              ))}
            </section>
          );
        })}
      </div>

      {plan.skipped.length > 0 && (
        <section className="synergy">
          <h3>Не включено</h3>
          <ul className="ulist">
            {plan.skipped.map((s) => (
              <li key={s.name}>
                {s.name}: {s.note}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rules">
        <h3>По каким правилам построен план</h3>
        <ol className="olist">
          {ROADMAP_RULES.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ol>
      </section>
    </div>
  );
}
