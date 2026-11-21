import type { GaiaSettings } from '../@types/GaiaSettings.ts';

/** What Gaia runs on when its settings file is absent, unreadable or newer than this Gaia (`docs/design/screens.md` A4 and C2). */
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
