/**
 * `launch-settings.json`, the model and effort a job's first launch ran its session on, read into the recorded pair: read, validate, map.
 * Whether the pair is still one forge offers is the caller's question: a model a later forge retired is no corrupt file.
 */
import { StoredJsonDocumentUtil }     from '../utils/StoredJsonDocumentUtil.ts';
import type { LaunchSettingsProblem } from './@types/LaunchSettingsProblem.ts';

export const LAUNCH_SETTINGS_FORMAT_VERSION = 1;

export interface RecordedLaunchSettings {
  model:  string;
  effort: string;
}

export type LaunchSettingsReading =
  | { verdict: 'readable'; settings: RecordedLaunchSettings }
  | { verdict: 'absent' }
  | { verdict: 'unreadable'; problem: LaunchSettingsProblem };

const TEXT_SETTINGS = ['model', 'effort'] as const;

export class LaunchSettingsIngestion {
  constructor(private readonly settingsFilePath: string) {}

  /** Never throws: a pair that cannot be read whole is `unreadable`, never a session resolved afresh. */
  read(): LaunchSettingsReading {
    const stored = StoredJsonDocumentUtil.documentAt(this.settingsFilePath, LAUNCH_SETTINGS_FORMAT_VERSION);
    if (stored.verdict !== 'readable') return stored;
    const { document } = stored;
    const settingNotText = TEXT_SETTINGS.find((field) => typeof (Object.hasOwn(document, field) ? document[field] : undefined) !== 'string');
    if (settingNotText !== undefined) return { verdict: 'unreadable', problem: { code: 'launch-setting-not-text', field: settingNotText } };
    return { verdict: 'readable', settings: { model: document['model'] as string, effort: document['effort'] as string } };
  }
}
