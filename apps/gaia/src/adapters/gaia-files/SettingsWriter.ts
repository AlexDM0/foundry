/**
 * Writes `GaiaSettings` to `~/.gaia/settings.json` at the known major and minor, atomically, and never over a file of a newer major or
 * minor: this Gaia reads a newer minor but would drop the keys it adds.
 */
import type { ContractVersion } from 'overseer-contracts/ContractVersion';

import type { GaiaSettings }                from '../../shared/@types/GaiaSettings.ts';
import { CONTRACT_VERSIONS }                from '../../shared/constants/ContractVersions.ts';
import { GaiaFile }                         from './GaiaFile.ts';
import { SettingsFile, settingsFilePathIn } from './SettingsFile.ts';
import { SettingsFormatUtil }               from './utils/SettingsFormatUtil.ts';

/** Gaia's own folder also holds the token, so only its owner may list or enter it. */
const GAIA_FOLDER_MODE = 0o700;

export type SettingsWriteVerdict =
  | { readonly verdict: 'written' }
  | { readonly verdict: 'kept-newer-version'; readonly storedVersion: ContractVersion }
  | { readonly verdict: 'unwritable'; readonly failure: string };

export interface SettingsWriter {
  write(settings: GaiaSettings): Promise<SettingsWriteVerdict>;
}

export function createSettingsWriter(homeDirectory: string): SettingsWriter {
  async function write(settings: GaiaSettings): Promise<SettingsWriteVerdict> {
    const storedReading = await new SettingsFile(homeDirectory).read();
    if (storedReading.verdict === 'newer-version') return { verdict: 'kept-newer-version', storedVersion: storedReading.storedVersion };
    if (storedReading.verdict === 'readable' && storedReading.storedVersion.minor > CONTRACT_VERSIONS.gaiaSettings.minor) {
      return { verdict: 'kept-newer-version', storedVersion: storedReading.storedVersion };
    }
    return GaiaFile.writeJson(settingsFilePathIn(homeDirectory), SettingsFormatUtil.storedFormOf(settings), GAIA_FOLDER_MODE);
  }

  return { write };
}
