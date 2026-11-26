import { writeFileAtomically }                                         from '../../lib/atomic-file/AtomicFile.ts';
import { JsonTextUtil }                                                from '../../shared/utils/JsonTextUtil.ts';
import { LAUNCH_SETTINGS_FORMAT_VERSION, type RecordedLaunchSettings } from './LaunchSettingsIngestion.ts';

/** Through `src/lib/atomic-file/AtomicFile.ts`, so every resume reads the whole pair the first launch ran on. */
export function createLaunchSettingsWriter(settingsFilePath: string): { write(settings: Readonly<RecordedLaunchSettings>): void } {
  function write(settings: Readonly<RecordedLaunchSettings>): void {
    writeFileAtomically(settingsFilePath, JsonTextUtil.storedFileTextOf({ version: LAUNCH_SETTINGS_FORMAT_VERSION, model: settings.model, effort: settings.effort }));
  }

  return { write };
}
