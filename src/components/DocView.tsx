import { useState } from 'react';
import { SOURCE_LABEL, type Block, type Doc, type ProjectCard, type Source } from '../logic/doc';

export function SourceTag({ source }: { source?: Source }) {
  if (!source) return null;
  return <span className={`src src-${source}`}>{SOURCE_LABEL[source]}</span>;
}

export function CardView({ card, source, collapsible = false }: { card: ProjectCard; source?: Source; collapsible?: boolean }) {
  const [open, setOpen] = useState(!collapsible);
  return (
    <article className={`pcard src-border-${source ?? 'none'}`}>
      <header className="pcard-head">
        <h4>{card.name}</h4>
        <div className="pcard-tags">
          {card.tags.map((t) => (
            <span key={t} className="ptag">
              {t}
            </span>
          ))}
        </div>
        {collapsible && (
          <button className="link pcard-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
            {open ? 'Свернуть' : 'Подробнее'}
          </button>
        )}
      </header>
      {open && (
        <>
          <dl className="kv kv-card">
            {card.rows.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          {card.why && <p className="pcard-why">Почему здесь: {card.why}</p>}
        </>
      )}
    </article>
  );
}

function BlockView({ b }: { b: Block }) {
  switch (b.t) {
    case 'p':
      return (
        <div className="blk">
          <SourceTag source={b.source} />
          <p>{b.text}</p>
        </div>
      );
    case 'note':
      return <p className="blk-note">{b.text}</p>;
    case 'h3':
      return <h3 className="blk-h3">{b.text}</h3>;
    case 'list': {
      const L = b.ordered ? 'ol' : 'ul';
      return (
        <div className="blk">
          <SourceTag source={b.source} />
          {b.title && <h3 className="blk-h3">{b.title}</h3>}
          <L className={b.ordered ? 'olist' : 'ulist'}>
            {b.items.map((it, i) => (
              <li key={i}>{it}</li>
            ))}
          </L>
        </div>
      );
    }
    case 'kv':
      return (
        <div className="blk">
          <SourceTag source={b.source} />
          {b.title && <h3 className="blk-h3">{b.title}</h3>}
          <dl className="kv">
            {b.rows.map(([k, v], i) => (
              <div key={i}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      );
    case 'card':
      return (
        <div className="blk">
          <SourceTag source={b.source} />
          <CardView card={b.card} source={b.source} collapsible />
        </div>
      );
  }
}

export function DocView({ doc, hideHeader = false }: { doc: Doc; hideHeader?: boolean }) {
  return (
    <div className="doc">
      {!hideHeader && (
        <header className="doc-head">
          <h2>{doc.title}</h2>
          <p>{doc.subtitle}</p>
        </header>
      )}
      <p className="doc-disclaimer">{doc.disclaimer}</p>
      {doc.sections.map((s) => (
        <section key={s.id} className="doc-sec">
          <h3 className="doc-sec-title">{s.title}</h3>
          {s.blocks.map((b, i) => (
            <BlockView key={i} b={b} />
          ))}
        </section>
      ))}
    </div>
  );
}
