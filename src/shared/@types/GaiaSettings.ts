/** Gaia's own settings as the internal model holds them, whatever the stored file's version. */
export type ThemeChoice = 'auto' | 'light' | 'dark';

export type NotificationKind =
  | 'escalated-questions'
  | 'questions'
  | 'reviews-and-merge-accepts'
  | 'forge-holds-or-stops-answering'
  | 'quiet-agents'
  | 'machine-at-limit'
  | 'draft-tickets';

export interface NotificationSettings {
  enabled: boolean;
  kinds:   Record<NotificationKind, boolean>;
}

export interface GaiaSettings {
  theme:              ThemeChoice;
  hiddenTrackerIds:   string[];
  forgeProgramPath:   string | null;
  notifications:      NotificationSettings;
  startForgesAtLogin: boolean;
}
