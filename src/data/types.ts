/**
 * Типы данных брифа. Все вопросы, условия и правила описываются как данные
 * (см. questions.ts, tools.ts, projects.ts) — интерфейс их только отображает.
 */

export type StageId = 'goals' | 'digital' | 'video' | 'ads' | 'priorities' | 'organization';

export interface StageDef {
  id: StageId;
  index: number;
  title: string;
  /** Короткое пояснение, зачем этот этап. Показывается над первым вопросом этапа. */
  intro: string;
}

export interface OptionDef {
  id: string;
  label: string;
  hint?: string;
  /** Выбор этого варианта снимает остальные (например, «Видео сейчас не нужно»). */
  exclusive?: boolean;
}

/** Условие показа вопроса или срабатывания правила. Описывается декларативно. */
export type Condition =
  /** Выбран хотя бы один из вариантов */
  | { q: string; any: string[] }
  /** Не выбран ни один из вариантов */
  | { q: string; none: string[] }
  /** Выбран хотя бы один «содержательный» вариант (не «не знаю» и не исключающий) */
  | { q: string; anyReal: true }
  /** Вопрос получил любой ответ */
  | { q: string; answered: true }
  /** Количество выбранных содержательных вариантов >= n */
  | { q: string; countGte: number }
  /** Выбран хотя бы один инструмент из списка (см. tools.ts) */
  | { tool: string[] }
  /** Общее число выбранных инструментов >= n */
  | { toolsCountGte: number }
  | { all: Condition[] }
  | { some: Condition[] }
  | { not: Condition };

export type QuestionType =
  /** Один вариант */
  | 'single'
  /** Несколько вариантов */
  | 'multi'
  /** Свободный текст */
  | 'text'
  /** Выбрать и упорядочить N пунктов из динамического списка */
  | 'rank'
  /** Для каждого ранее выбранного пункта — короткие уточнения */
  | 'perItem';

export interface FieldDef {
  id: string;
  label: string;
  multi?: boolean;
  options: OptionDef[];
}

/** Откуда берутся пункты для вопросов rank / perItem */
export type ItemsSource =
  | { kind: 'selected'; q: string }
  | { kind: 'tools' };

export interface QuestionDef {
  id: string;
  stage: StageId;
  type: QuestionType;
  title: string;
  /** Короткое название для отчётов («Задачи на год») */
  short: string;
  help?: string;
  options?: OptionDef[];
  /** Разрешить «Свой вариант» с текстом */
  allowOther?: boolean;
  /** Добавить вариант «Пока не знаю» */
  allowUnknown?: boolean;
  /** Добавить поле для свободного комментария */
  allowComment?: boolean;
  commentLabel?: string;
  maxSelect?: number;
  showIf?: Condition;
  /** Можно ли перейти дальше без ответа */
  optional?: boolean;
  placeholder?: string;
  /** Примечание мелким шрифтом (например, «хронометраж предложит исполнитель») */
  note?: string;
  /** Если выбрано много вариантов — мягкая подсказка */
  manyHint?: { threshold: number; text: string };
  /** rank / perItem */
  itemsFrom?: ItemsSource;
  rankCount?: number;
  fields?: FieldDef[];
}

export interface Answer {
  selected?: string[];
  other?: string;
  comment?: string;
  text?: string;
  /** rank: упорядоченный список id */
  order?: string[];
  /** perItem: itemId -> fieldId -> выбранные варианты */
  items?: Record<string, Record<string, string[]>>;
}

export type Answers = Record<string, Answer>;

export interface ToolDef {
  id: string;
  label: string;
  group: 'Сайт и интернет' | 'Видео' | 'Реклама и материалы';
  /** Когда инструмент считается выбранным заказчиком */
  when: Condition;
}

export type Horizon = 1 | 2 | 3;

export interface ProjectDef {
  id: string;
  name: string;
  /** Разовая работа или постоянная (ежемесячная) — не смешиваем в бюджете */
  kind: 'once' | 'ongoing';
  /** Базовый проект, от которого зависят другие (аудит, тексты, съёмка) */
  foundation?: boolean;
  /** Инструменты заказчика, которые закрывает проект */
  tools: string[];
  /** Рекомендация исполнителя: когда предложить проект, даже если заказчик не выбрал его */
  recommendWhen?: Condition;
  recommendReason?: string;
  businessGoal: string;
  /** id вариантов из вопроса g_tasks, которым служит проект */
  servesGoals: string[];
  deliverable: string;
  /** Дополнения к результату в зависимости от ответов */
  deliverableAddons?: { when: Condition; text: string }[];
  fromClient: string[];
  /** Жёсткие зависимости: без них проект не начать. Базовые проекты добавляются в план автоматически. */
  dependsOn: string[];
  /** Мягкий порядок: если такой проект есть в плане, лучше сделать его раньше */
  after?: string[];
  /** Не включать базовый проект, если условие выполнено (например, свежие фото уже есть) */
  skipWhen?: Condition;
  skipNote?: string;
  metrics: string[];
  defaultHorizon: Horizon;
  /** Какие исходные материалы (варианты p_resources) нужны проекту */
  needsResources?: { resource: string; text: string }[];
}

export interface SynergyDef {
  /** Срабатывает, если в плане есть все перечисленные проекты (и хотя бы 2 из any) */
  allOf?: string[];
  anyOf?: string[];
  minAny?: number;
  text: string;
}

export interface DiscussionRuleDef {
  when: Condition;
  /** Проекты, которые должны (или не должны) быть в плане */
  planHas?: string[];
  planLacks?: string[];
  text: string;
}

export interface BriefRecord {
  app: 'sibpromtech-brief';
  schemaVersion: 1;
  id: string;
  createdAt: string;
  updatedAt: string;
  status: 'draft' | 'completed';
  /** id вопроса, на котором остановились */
  currentQuestionId?: string;
  respondent?: { name?: string; role?: string };
  answers: Answers;
}
