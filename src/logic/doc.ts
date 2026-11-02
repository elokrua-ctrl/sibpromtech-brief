/**
 * Модель документа. Один и тот же документ отображается в интерфейсе,
 * копируется текстом и выгружается в PDF — данные не расходятся.
 */

export type Source = 'client' | 'fact' | 'rec';

export const SOURCE_LABEL: Record<Source, string> = {
  client: 'Пожелание заказчика',
  fact: 'Исходные данные',
  rec: 'Рекомендация исполнителя · черновик',
};

export interface ProjectCard {
  name: string;
  tags: string[];
  rows: [string, string][];
  /** Абзац «почему здесь» мелким шрифтом */
  why?: string;
}

export type Block =
  | { t: 'p'; text: string; source?: Source }
  | { t: 'list'; items: string[]; source?: Source; title?: string; ordered?: boolean }
  | { t: 'kv'; rows: [string, string][]; source?: Source; title?: string }
  | { t: 'note'; text: string }
  | { t: 'h3'; text: string; sub?: string }
  | { t: 'card'; card: ProjectCard; source?: Source };

export interface Section {
  id: string;
  title: string;
  blocks: Block[];
}

export interface Doc {
  kind: 'client' | 'executor' | 'roadmap';
  title: string;
  subtitle: string;
  meta: [string, string][];
  disclaimer: string;
  sections: Section[];
}
