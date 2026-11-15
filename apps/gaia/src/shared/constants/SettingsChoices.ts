/** The values each choice of Gaia's settings may take: read by the settings file's ingestion and by the page's command ingestion. */
import type { NotificationKind, ThemeChoice } from '../@types/GaiaSettings.ts';

const THEMES: readonly ThemeChoice[] = ['auto', 'light', 'dark'];

const NOTIFICATION_KINDS: readonly NotificationKind[] = [
  'escalated-questions',
  'questions',
  'reviews-and-merge-accepts',
  'forges-held-or-unreachable',
  'quiet-agents',
  'machine-at-agent-limit',
  'draft-tickets',
];

export const SETTINGS_CHOICES = {
  themes:            THEMES,
  notificationKinds: NOTIFICATION_KINDS,
} as const;
