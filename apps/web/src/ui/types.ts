// Shape of the data the hero renders. Live data (Task 6) and fixtures both fill it.

export type PlanBlock = {
  id: "event-standup" | "block-showcase" | "block-tidy" | "block-rsvp" | "event-pickup";
  kind: "event" | "task";
  time: string;
  title: string;
  duration?: string;
  current?: boolean;
};

export type NextUpItem = { title: string; when: string; why: string };

export type MetaRow = { label: string; value: string };

export type CarriedDocket = {
  tag: string;
  title: string;
  rows: MetaRow[];
  footer: MetaRow;
};

export type TodayDocket = {
  time: string;
  duration: string;
  title: string[];
  source?: string;
  flags?: string[];
  high?: boolean;
  topPick?: boolean;
  rows: MetaRow[];
};

export type HeroData = {
  date: string;
  headline: string;
  done: number;
  total: number;
  presets: string[];
  activePreset: string;
  hours: string[];
  now: string;
  blocks: PlanBlock[];
  span: { from: string; to: string };
  quickAdd: string;
  chips: { when: string; priority: string; duration: string };
  nextUp: NextUpItem[];
  carried: CarriedDocket[];
  today: TodayDocket[];
  comingUp: number;
  legend?: { hints: string[]; bumpHint: string; tail: string[]; keys: { bumped: string; high: string } };
};
