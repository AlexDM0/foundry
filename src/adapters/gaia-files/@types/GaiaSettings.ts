export type ThemeChoice = 'auto' | 'light' | 'dark';

export type NotificationKind =
  | 'escalated-questions'
  | 'questions'
  | 'reviews-and-merge-accepts'
  | 'forges-held-or-unreachable'
  | 'quiet-agents'
  | 'machine-at-agent-limit'
  | 'draft-tickets';

export interface NotificationSettings {
  readonly enabled: boolean;
  readonly kinds:   Readonly<Record<NotificationKind, boolean>>;
}

export interface GaiaSettings {
  readonly theme:              ThemeChoice;
  readonly hiddenTrackerIds:   readonly string[];
  readonly forgeProgramPath:   string | null;
  readonly notifications:      NotificationSettings;
  readonly startForgesAtLogin: boolean;
}
