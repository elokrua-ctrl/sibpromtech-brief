import type { BriefRecord } from '../data/types';

/**
 * Хранилище брифов.
 * Сейчас — только браузер (localStorage). Интерфейс асинхронный, чтобы позже
 * подключить сервер без переделки интерфейса: реализуйте ApiBriefRepository
 * с теми же методами и подмените в `repository` ниже.
 */
export interface BriefRepository {
  /** Текущий бриф в этом браузере */
  loadCurrent(): Promise<BriefRecord | null>;
  saveCurrent(rec: BriefRecord): Promise<void>;
  clearCurrent(): Promise<void>;
  /** Для будущей панели анализа нескольких брифов */
  list(): Promise<BriefRecord[]>;
  /** true, если данные действительно сохраняются между визитами */
  readonly persistent: boolean;
}

const KEY = 'sibpromtech-brief:current:v1';

class LocalBriefRepository implements BriefRepository {
  private memory: BriefRecord | null = null;
  readonly persistent: boolean;

  constructor() {
    let ok = false;
    try {
      const t = '__probe__';
      window.localStorage.setItem(t, t);
      window.localStorage.removeItem(t);
      ok = true;
    } catch {
      ok = false;
    }
    this.persistent = ok;
  }

  async loadCurrent(): Promise<BriefRecord | null> {
    if (!this.persistent) return this.memory;
    try {
      const raw = window.localStorage.getItem(KEY);
      if (!raw) return null;
      const rec = JSON.parse(raw) as BriefRecord;
      return rec && rec.schemaVersion === 1 ? rec : null;
    } catch {
      return this.memory;
    }
  }

  async saveCurrent(rec: BriefRecord): Promise<void> {
    this.memory = rec;
    if (!this.persistent) return;
    try {
      window.localStorage.setItem(KEY, JSON.stringify(rec));
    } catch {
      /* переполнение или запрет — данные остаются в памяти вкладки */
    }
  }

  async clearCurrent(): Promise<void> {
    this.memory = null;
    try {
      window.localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  }

  async list(): Promise<BriefRecord[]> {
    const cur = await this.loadCurrent();
    return cur ? [cur] : [];
  }
}

export const repository: BriefRepository = new LocalBriefRepository();

export function newBrief(): BriefRecord {
  const now = new Date().toISOString();
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `b-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return { app: 'sibpromtech-brief', schemaVersion: 1, id, createdAt: now, updatedAt: now, status: 'draft', answers: {} };
}
