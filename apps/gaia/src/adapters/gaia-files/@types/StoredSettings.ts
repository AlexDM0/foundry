/** `~/.gaia/settings.json` at major 1, exactly as it is stored (PLAN 6.2); an absent `minor` reads as 0. */
import type { NotificationKind, ThemeChoice } from '../../../shared/@types/GaiaSettings.ts';

export interface StoredSettingsVersion1 {
  readonly version:          1;
  readonly minor:            number;
  readonly theme:            ThemeChoice;
  readonly hiddenTrackerIds: readonly string[];
  readonly forgeProgramPath: string | null;
  readonly notifications:    { readonly enabled: boolean; readonly kinds: Readonly<Record<NotificationKind, boolean>> };
}
