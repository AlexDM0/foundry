/**
 * `launch-settings.json`, the model and effort a job's first launch ran its session on, read into the recorded pair: read, validate, map.
 * Whether the pair is still one forge offers is the caller's question: a model a later forge retired is no corrupt file.
 */
import { JobFileShapeUtil }       from '../utils/JobFileShapeUtil.ts';
import { StoredJsonDocumentUtil } from '../utils/StoredJsonDocumentUtil.ts';

export const LAUNCH_SETTINGS_FORMAT_VERSION = 1;

export interface RecordedLaunchSettings {
  model:  string;
  effort: string;
}

export type LaunchSettingsReading =
  | { verdict: 'readable'; settings: RecordedLaunchSettings }
  | { verdict: 'absent' }
  | { verdict: 'unreadable'; reason: string };

export class LaunchSettingsIngestion {
  constructor(private readonly settingsFilePath: string) {}

  /** Never throws: a pair that cannot be read whole is `unreadable`, never a session resolved afresh. */
  read(): LaunchSettingsReading {
    const stored = StoredJsonDocumentUtil.documentAt(this.settingsFilePath, LAUNCH_SETTINGS_FORMAT_VERSION);
    if (stored.verdict !== 'readable') return stored;
    const { document } = stored;
    const problem = JobFileShapeUtil.firstFieldProblemOf(document, {
      model:  [JobFileShapeUtil.valueIsText, 'text'],
      effort: [JobFileShapeUtil.valueIsText, 'text'],
    });
    if (problem !== null) return { verdict: 'unreadable', reason: problem };
    return { verdict: 'readable', settings: { model: document['model'] as string, effort: document['effort'] as string } };
  }
}
