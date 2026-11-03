/**
 * The stamp check `bun run verify` runs: it reads the recordings of the OS it runs on and the installed versions, and makes no real
 * call. A stamp that does not agree is stale and fails the check; a boundary with no recording for this OS is listed as not finished.
 */
import type { RecordedSystem, RecordingStamp }                   from './BoundaryRecordings.ts';
import { recordCommandOf, recordingFileNameOf, recordingPathOf } from './BoundaryRecordings.ts';

export interface RecordingStampInput {
  readonly boundaries:         readonly string[];
  readonly systemOf:           Readonly<Record<string, RecordedSystem>>;
  readonly os:                 string;
  /** The text of each recording file of this OS, by file name. */
  readonly recordingTexts:     ReadonlyMap<string, string>;
  readonly installedVersionOf: (system: RecordedSystem) => string;
}

export interface RecordingStampReport {
  readonly staleLines:      readonly string[];
  readonly unfinishedLines: readonly string[];
}

function stampOf(recordingText: string): RecordingStamp | null {
  try {
    const parsed: unknown = JSON.parse(recordingText);
    if (typeof parsed !== 'object' || parsed === null || !('stamp' in parsed)) return null;
    const { stamp } = parsed;
    if (typeof stamp !== 'object' || stamp === null) return null;
    const fields = ['boundary', 'system', 'version', 'os'] as const;
    return fields.every((field) => field in stamp && typeof (stamp as Record<string, unknown>)[field] === 'string') ? stamp as RecordingStamp : null;
  } catch {
    return null;
  }
}

function staleLineOf(boundary: string, input: RecordingStampInput, recordingText: string): string | null {
  const recordAgain = `Record it again with \`${recordCommandOf(boundary)}\`.`;
  const path = recordingPathOf(boundary, input.os);
  const stamp = stampOf(recordingText);
  if (stamp === null) return `${path} has no readable stamp. ${recordAgain}`;
  const expectedSystem = Object.hasOwn(input.systemOf, boundary) ? input.systemOf[boundary] : undefined;
  if (stamp.boundary !== boundary || stamp.os !== input.os || stamp.system !== expectedSystem) {
    return `${path} is stamped for ${stamp.boundary} on ${stamp.os} with ${stamp.system}, not for ${boundary} on ${input.os} with ${expectedSystem ?? 'no system'}. ${recordAgain}`;
  }
  const installed = input.installedVersionOf(stamp.system);
  if (installed === stamp.version) return null;
  return `The recording of ${boundary} on ${input.os} is stale: it is stamped ${stamp.system} ${stamp.version}, and ${stamp.system} ${installed} is installed. ${recordAgain}`;
}

export function recordingStampReportOf(input: RecordingStampInput): RecordingStampReport {
  const staleLines: string[] = [];
  const unfinishedLines: string[] = [];
  const recordedFileNames = new Set(input.boundaries.map(recordingFileNameOf));
  for (const fileName of input.recordingTexts.keys()) {
    if (!recordedFileNames.has(fileName)) staleLines.push(`${fileName} of ${input.os} records no boundary of BOUNDARY_SPECS: remove it.`);
  }
  for (const boundary of input.boundaries) {
    const recordingText = input.recordingTexts.get(recordingFileNameOf(boundary));
    if (recordingText === undefined) {
      unfinishedLines.push(`${boundary} is not finished for ${input.os}: it has no recording. Record it with \`${recordCommandOf(boundary)}\`.`);
      continue;
    }
    const staleLine = staleLineOf(boundary, input, recordingText);
    if (staleLine !== null) staleLines.push(staleLine);
  }
  return { staleLines, unfinishedLines };
}
