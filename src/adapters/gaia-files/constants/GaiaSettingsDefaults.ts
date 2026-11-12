import type { GaiaSettings, NotificationKind, ThemeChoice } from '../../../shared/@types/GaiaSettings.ts';

export const THEME_CHOICES: readonly ThemeChoice[] = ['auto', 'light', 'dark'];

export const NOTIFICATION_KINDS: readonly NotificationKind[] = [
  'escalated-questions',
  'questions',
  'reviews-and-merge-accepts',
  'forges-held-or-unreachable',
  'quiet-agents',
  'machine-at-agent-limit',
  'draft-tickets',
];

/** What Gaia runs on when its settings file is absent, unreadable or newer than this Gaia (SCREENS A4 and C2). */
export const GAIA_SETTINGS_DEFAULTS: GaiaSettings = {
  theme:            'auto',
  hiddenTrackerIds: [],
  forgeProgramPath: null,
  notifications:    {
    enabled: true,
    kinds:   {
      'escalated-questions':        true,
      'questions':                  true,
      'reviews-and-merge-accepts':  true,
      'forges-held-or-unreachable': true,
      'quiet-agents':               true,
      'machine-at-agent-limit':     false,
      'draft-tickets':              false,
    },
  },
  startForgesAtLogin: false,
};
