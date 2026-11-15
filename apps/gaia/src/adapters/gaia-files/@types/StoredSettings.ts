/** `~/.gaia/settings.json` at version 1, exactly as it is stored (PLAN 6.2). */
import type { NotificationKind, ThemeChoice } from '../../../shared/@types/GaiaSettings.ts';

export interface StoredSettingsVersion1 {
  readonly version:            1;
  readonly theme:              ThemeChoice;
  readonly hiddenTrackerIds:   readonly string[];
  readonly forgeProgramPath:   string | null;
  readonly notifications:      { readonly enabled: boolean; readonly kinds: Readonly<Record<NotificationKind, boolean>> };
  readonly startForgesAtLogin: boolean;
}
