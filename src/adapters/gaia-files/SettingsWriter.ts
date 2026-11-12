/** Writes `GaiaSettings` to `~/.gaia/settings.json` at version 1, atomically, and never over a file of a newer version. */
import type { GaiaSettings }                from './@types/GaiaSettings.ts';
import { SettingsFile, settingsFilePathIn } from './SettingsFile.ts';
import { GaiaFileWriteUtil }                from './utils/GaiaFileWriteUtil.ts';
import { SettingsFormatUtil }               from './utils/SettingsFormatUtil.ts';

/** Gaia's own folder also holds the token, so only its owner may list or enter it. */
const GAIA_FOLDER_MODE = 0o700;

export type SettingsWriteVerdict =
  | { readonly verdict: 'written' }
  | { readonly verdict: 'kept-newer-version'; readonly storedVersion: number }
  | { readonly verdict: 'unwritable'; readonly failure: string };

export interface SettingsWriter {
  write(settings: GaiaSettings): Promise<SettingsWriteVerdict>;
}

export function createSettingsWriter(homeDirectory: string): SettingsWriter {
  async function write(settings: GaiaSettings): Promise<SettingsWriteVerdict> {
    const storedReading = await new SettingsFile(homeDirectory).read();
    if (storedReading.verdict === 'newer-version') return { verdict: 'kept-newer-version', storedVersion: storedReading.storedVersion };
    return GaiaFileWriteUtil.writeJson(settingsFilePathIn(homeDirectory), SettingsFormatUtil.storedFormOf(settings), GAIA_FOLDER_MODE);
  }

  return { write };
}
