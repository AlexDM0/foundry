/**
 * The ingestion of `~/.gaia/settings.json`: read, validate, map. Every verdict carries settings to run on: the file's own when it is
 * readable, the defaults otherwise. Major 1 is the first format, so nothing migrates yet; any minor of it reads.
 */
import { join } from 'node:path';

import type { ContractVersion } from 'overseer-contracts/ContractVersion';

import { AtomicFile }             from '../../lib/atomic-file/AtomicFile.ts';
import type { GaiaSettings }      from '../../shared/@types/GaiaSettings.ts';
import { CONTRACT_VERSIONS }      from '../../shared/constants/ContractVersions.ts';
import { GAIA_SETTINGS_DEFAULTS } from '../../shared/constants/GaiaSettingsDefaults.ts';
import { PRODUCT_NAMES }          from '../../shared/constants/ProductNames.ts';
import { ContractVersionUtil }    from '../../shared/utils/ContractVersionUtil.ts';
import { SettingsFormatUtil }     from './utils/SettingsFormatUtil.ts';

const SETTINGS_FILE_NAME = 'settings.json';

export type SettingsUnreadableReason = 'file-unreadable' | 'not-json' | 'version-unknown' | 'shape-invalid';

export type SettingsReading =
  /** `storedVersion` lets a writer keep a file of a newer minor, whose added keys this Gaia would drop. */
  | { readonly verdict: 'readable'; readonly storedVersion: ContractVersion; readonly settings: GaiaSettings }
  | { readonly verdict: 'absent'; readonly settings: GaiaSettings }
  /** The file is kept as it is and never written; Gaia runs on the defaults and says so. */
  | { readonly verdict: 'newer-version'; readonly storedVersion: ContractVersion; readonly settings: GaiaSettings }
  | { readonly verdict: 'unreadable'; readonly reason: SettingsUnreadableReason; readonly failure: string; readonly settings: GaiaSettings };

export function settingsFilePathIn(homeDirectory: string): string {
  return join(homeDirectory, PRODUCT_NAMES.dataFolderName, SETTINGS_FILE_NAME);
}

function parsedJsonOf(contents: string): { readonly parsed: unknown } | { readonly failure: string } {
  try {
    return { parsed: JSON.parse(contents) as unknown };
  } catch (error) {
    return { failure: error instanceof Error ? error.message : String(error) };
  }
}

export class SettingsFile {
  readonly #homeDirectory: string;

  public constructor(homeDirectory: string) {
    this.#homeDirectory = homeDirectory;
  }

  public async read(): Promise<SettingsReading> {
    const settingsPath = settingsFilePathIn(this.#homeDirectory);
    const fileReading  = await AtomicFile.read(settingsPath);
    if (fileReading.verdict === 'absent') return { verdict: 'absent', settings: GAIA_SETTINGS_DEFAULTS };
    if (fileReading.verdict === 'unreadable') return SettingsFile.unreadable('file-unreadable', fileReading.failure);
    const json = parsedJsonOf(fileReading.contents);
    if ('failure' in json) return SettingsFile.unreadable('not-json', json.failure);
    const storedVersion = SettingsFormatUtil.versionOf(json.parsed);
    if (storedVersion === null) return SettingsFile.unreadable('version-unknown', 'no version');
    const majorVerdict = ContractVersionUtil.majorVerdictOf(storedVersion.major, CONTRACT_VERSIONS.gaiaSettings);
    if (majorVerdict === 'newer') return { verdict: 'newer-version', storedVersion, settings: GAIA_SETTINGS_DEFAULTS };
    if (majorVerdict !== 'known') return SettingsFile.unreadable('version-unknown', `version ${storedVersion.major}`);
    const stored = SettingsFormatUtil.storedSettingsOf(json.parsed);
    if (stored === null) return SettingsFile.unreadable('shape-invalid', `a key of version ${CONTRACT_VERSIONS.gaiaSettings.major} is missing or mistyped`);
    return { verdict: 'readable', storedVersion, settings: SettingsFormatUtil.settingsOf(stored) };
  }

  private static unreadable(reason: SettingsUnreadableReason, failure: string): SettingsReading {
    return {
      verdict:  'unreadable',
      reason,
      failure,
      settings: GAIA_SETTINGS_DEFAULTS,
    };
  }
}
