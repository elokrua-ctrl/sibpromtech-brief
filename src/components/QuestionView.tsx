import { useState } from 'react';
import { OTHER, UNKNOWN } from '../data/questions';
import type { Answer, Answers, FieldDef, OptionDef, QuestionDef, ToolDef } from '../data/types';
import { itemsFor, optionsOf, realSelected, toggleOption } from '../logic/flow';

interface Props {
  q: QuestionDef;
  answer: Answer | undefined;
  answers: Answers;
  tools: ToolDef[];
  onChange: (a: Answer) => void;
}

export function QuestionView(p: Props) {
  switch (p.q.type) {
    case 'single':
    case 'multi':
      return <Choice {...p} />;
    case 'text':
      return <TextQ {...p} />;
    case 'rank':
      return <Rank {...p} />;
    case 'perItem':
      return <PerItem {...p} />;
  }
}

function OptionTile({
  opt,
  selected,
  multi,
  disabled,
  onClick,
}: {
  opt: OptionDef;
  selected: boolean;
  multi: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  const muted = opt.id === UNKNOWN || opt.exclusive;
  return (
    <button
      type="button"
      className={`opt${selected ? ' is-on' : ''}${muted ? ' is-muted' : ''}`}
      role={multi ? 'checkbox' : 'radio'}
      aria-checked={selected}
      disabled={disabled}
      onClick={onClick}
      data-opt={opt.id}
    >
      <span className={`opt-mark ${multi ? 'check' : 'radio'}`} aria-hidden="true" />
      <span className="opt-text">
        <span className="opt-label">{opt.label}</span>
        {opt.hint && <span className="opt-hint">{opt.hint}</span>}
      </span>
    </button>
  );
}

function Choice({ q, answer, answers, onChange }: Props) {
  const multi = q.type === 'multi';
  const sel = answer?.selected ?? [];
  const opts = optionsOf(q);
  const main = opts.filter((o) => !(o.id === UNKNOWN || o.exclusive));
  const tail = opts.filter((o) => o.id === UNKNOWN || o.exclusive);
  const otherOn = sel.includes(OTHER);
  const realCount = realSelected(q.id, answers).length;
  const atLimit = !!q.maxSelect && realCount >= q.maxSelect;
  const [showComment, setShowComment] = useState(!!answer?.comment);

  const click = (id: string) => onChange(toggleOption(q, answer, id));

  return (
    <div className="choice">
      {q.maxSelect && (
        <p className="choice-limit">
          Выбрано {Math.min(realCount, q.maxSelect)} из {q.maxSelect}
        </p>
      )}
      <div className={`opts${main.length > 6 ? ' two-col' : ''}`} role={multi ? 'group' : 'radiogroup'} aria-label={q.title}>
        {main.map((o) => (
          <OptionTile
            key={o.id}
            opt={o}
            selected={sel.includes(o.id)}
            multi={multi}
            disabled={multi && atLimit && !sel.includes(o.id)}
            onClick={() => click(o.id)}
          />
        ))}
        {q.allowOther && (
          <OptionTile
            opt={{ id: OTHER, label: 'Свой вариант' }}
            selected={otherOn}
            multi={multi}
            disabled={multi && atLimit && !otherOn}
            onClick={() => click(OTHER)}
          />
        )}
      </div>
      {otherOn && (
        <input
          className="field other-input"
          autoFocus
          placeholder="Напишите своими словами"
          value={answer?.other ?? ''}
          onChange={(e) => onChange({ ...(answer ?? {}), other: e.target.value })}
          data-testid="other-input"
        />
      )}
      {tail.length > 0 && (
        <div className="opts opts-tail">
          {tail.map((o) => (
            <OptionTile key={o.id} opt={o} selected={sel.includes(o.id)} multi={multi} onClick={() => click(o.id)} />
          ))}
        </div>
      )}
      {q.manyHint && realCount >= q.manyHint.threshold && <p className="hint-box">{q.manyHint.text}</p>}
      {q.allowComment &&
        (showComment ? (
          <label className="comment">
            <span>{q.commentLabel ?? 'Комментарий'}</span>
            <textarea
              className="field"
              rows={2}
              value={answer?.comment ?? ''}
              onChange={(e) => onChange({ ...(answer ?? {}), comment: e.target.value })}
            />
          </label>
        ) : (
          <button type="button" className="link add-comment" onClick={() => setShowComment(true)}>
            + {q.commentLabel ?? 'Добавить комментарий'}
          </button>
        ))}
    </div>
  );
}

function TextQ({ q, answer, onChange }: Props) {
  return (
    <textarea
      className="field textarea-lg"
      rows={6}
      placeholder={q.placeholder}
      value={answer?.text ?? ''}
      onChange={(e) => onChange({ ...(answer ?? {}), text: e.target.value })}
      data-testid="text-input"
    />
  );
}

function Rank({ q, answer, answers, tools, onChange }: Props) {
  const items = itemsFor(q, answers, tools);
  const valid = new Set(items.map((i) => i.id));
  const order = (answer?.order ?? []).filter((id) => valid.has(id));
  const need = Math.min(q.rankCount ?? 3, items.length);
  const toggle = (id: string) => {
    if (order.includes(id)) onChange({ ...(answer ?? {}), order: order.filter((x) => x !== id) });
    else if (order.length < need) onChange({ ...(answer ?? {}), order: [...order, id] });
  };
  return (
    <div className="rank">
      <ol className="rank-slots" aria-label="Выбранные приоритеты">
        {Array.from({ length: need }).map((_, i) => {
          const it = items.find((x) => x.id === order[i]);
          return (
            <li key={i} className={it ? 'filled' : ''}>
              <span className="rank-n">{i + 1}</span>
              <span>{it ? it.label : 'не выбрано'}</span>
            </li>
          );
        })}
      </ol>
      {items.length > 5 && (
        <p className="hint-box">
          Вы отметили {items.length} направлений. Это нормально — но начинать стоит с главного. Выберите {need}, без которых не обойтись.
        </p>
      )}
      <div className="opts two-col">
        {items.map((it) => {
          const pos = order.indexOf(it.id);
          const full = order.length >= need && pos < 0;
          return (
            <button
              key={it.id}
              type="button"
              className={`opt rank-opt${pos >= 0 ? ' is-on' : ''}`}
              aria-pressed={pos >= 0}
              disabled={full}
              onClick={() => toggle(it.id)}
              data-opt={it.id}
            >
              <span className="rank-badge" aria-hidden="true">
                {pos >= 0 ? pos + 1 : ''}
              </span>
              <span className="opt-text">
                <span className="opt-label">{it.label}</span>
                <span className="opt-hint">{tools.find((t) => t.id === it.id)?.group}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Chips({ field, value, onChange }: { field: FieldDef; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="chips" role={field.multi ? 'group' : 'radiogroup'} aria-label={field.label}>
      {field.options.map((o) => {
        const on = value.includes(o.id);
        return (
          <button
            key={o.id}
            type="button"
            className={`chip${on ? ' is-on' : ''}${o.id === UNKNOWN ? ' is-muted' : ''}`}
            role={field.multi ? 'checkbox' : 'radio'}
            aria-checked={on}
            onClick={() => {
              if (field.multi) onChange(on ? value.filter((x) => x !== o.id) : [...value, o.id]);
              else onChange(on ? [] : [o.id]);
            }}
            data-opt={o.id}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function PerItem({ q, answer, answers, tools, onChange }: Props) {
  const items = itemsFor(q, answers, tools);
  const fields = q.fields ?? [];
  const compact = fields.length === 1;
  const set = (itemId: string, fieldId: string, v: string[]) => {
    const prevItems = answer?.items ?? {};
    onChange({ ...(answer ?? {}), items: { ...prevItems, [itemId]: { ...(prevItems[itemId] ?? {}), [fieldId]: v } } });
  };
  return (
    <div className={`peritem${compact ? ' compact' : ''}`}>
      {items.map((it) => {
        const vals = answer?.items?.[it.id] ?? {};
        const filled = Object.values(vals).some((v) => v.length);
        return (
          <section key={it.id} className={`pi-card${filled ? ' filled' : ''}`} data-item={it.id}>
            <h3 className="pi-title">{it.label}</h3>
            {fields.map((f) => (
              <div key={f.id} className="pi-field">
                {!compact && <p className="pi-label">{f.label}</p>}
                <Chips field={f} value={vals[f.id] ?? []} onChange={(v) => set(it.id, f.id, v)} />
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}
