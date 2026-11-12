/**
 * The judgement of the recording-stamp check: from the recordings of one OS and the installed versions, which recordings are stale (a
 * failure, naming the command that records them again), which boundaries have no recording for the OS (not finished, listed), and which
 * recordings are authored by hand (a warning until the system they stand in for exists). It makes no real call.
 */
import {
  boundaryRecordingReadingOf,
  recordCommandOf,
  recordingFileNameOf,
  recordingPathOf,
  type RecordedBoundary,
  type RecordedSystem,
} from './BoundaryRecordings.ts';

export interface RecordingStampInput {
  readonly recordedBoundaries: readonly RecordedBoundary[];
  readonly operatingSystem:    string;
  /** The text of each recording file of this OS, by file name. */
  readonly recordingTexts:     ReadonlyMap<string, string>;
  readonly installedVersionOf: (system: RecordedSystem) => string;
}

export interface RecordingStampReport {
  readonly staleLines:      readonly string[];
  readonly unfinishedLines: readonly string[];
  readonly authoredLines:   readonly string[];
}

type BoundaryJudgement = { readonly kind: 'stale' | 'authored'; readonly line: string } | { readonly kind: 'current' };

function judgementOf(boundary: RecordedBoundary, input: RecordingStampInput, recordingText: string): BoundaryJudgement {
  const recordingPath = recordingPathOf(boundary.recordingName, input.operatingSystem);
  const recordAgain   = `Record it again with \`${recordCommandOf(boundary.recordingName)}\`.`;
  const reading       = boundaryRecordingReadingOf(recordingText);
  if (reading.verdict === 'unreadable') return { kind: 'stale', line: `${recordingPath} is unreadable: ${reading.reason}. ${recordAgain}` };
  const { stamp } = reading.recording;
  if (stamp.recordingName !== boundary.recordingName || stamp.operatingSystem !== input.operatingSystem || stamp.system !== boundary.system) {
    return {
      kind: 'stale',
      line: `${recordingPath} is stamped for ${stamp.recordingName} on ${stamp.operatingSystem} with ${stamp.system}, `
        + `not for ${boundary.recordingName} on ${input.operatingSystem} with ${boundary.system}. ${recordAgain}`,
    };
  }
  if (stamp.source === 'authored') {
    return { kind: 'authored', line: `${recordingPath} is authored by hand and waits to be recorded from a real ${stamp.system}.` };
  }
  const installedVersion = input.installedVersionOf(stamp.system);
  if (stamp.systemVersion === installedVersion) return { kind: 'current' };
  return {
    kind: 'stale',
    line: `The recording of ${boundary.recordingName} on ${input.operatingSystem} is stale: it is stamped ${stamp.system} ${stamp.systemVersion}, `
      + `and ${stamp.system} ${installedVersion} is installed. ${recordAgain}`,
  };
}

export function recordingStampReportOf(input: RecordingStampInput): RecordingStampReport {
  const staleLines: string[]      = [];
  const unfinishedLines: string[] = [];
  const authoredLines: string[]   = [];
  const knownFileNames = new Set(input.recordedBoundaries.map(({ recordingName }) => recordingFileNameOf(recordingName)));
  for (const fileName of input.recordingTexts.keys()) {
    if (!knownFileNames.has(fileName)) staleLines.push(`${fileName} of ${input.operatingSystem} records no boundary of RECORDED_BOUNDARIES: remove it.`);
  }
  for (const boundary of input.recordedBoundaries) {
    const recordingText = input.recordingTexts.get(recordingFileNameOf(boundary.recordingName));
    if (recordingText === undefined) {
      unfinishedLines.push(`${boundary.recordingName} is not finished for ${input.operatingSystem}: it has no recording. `
        + `Record it with \`${recordCommandOf(boundary.recordingName)}\`.`);
      continue;
    }
    const judgement = judgementOf(boundary, input, recordingText);
    if (judgement.kind === 'stale') staleLines.push(judgement.line);
    if (judgement.kind === 'authored') authoredLines.push(judgement.line);
  }
  return { staleLines, unfinishedLines, authoredLines };
}
