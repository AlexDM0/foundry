/**
 * The recording-stamp step of `bun run verify`: reads the recordings of the OS it runs on and the installed versions, prints the report,
 * and fails on a stale recording only. It runs no spec and starts no program.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join }                                  from 'node:path';

import {
  installedVersionOf,
  RECORDED_BOUNDARIES,
  RECORDING_FILE_SUFFIX,
  recordingsFolderOf,
  repositoryRoot,
} from './BoundaryRecordings.ts';
import { recordingStampReportOf, type RecordingStampReport } from './RecordingStamps.ts';

function recordingTextsOf(operatingSystem: string): Map<string, string> {
  const recordingsFolder = join(repositoryRoot(), recordingsFolderOf(operatingSystem));
  if (!existsSync(recordingsFolder)) return new Map();
  return new Map(readdirSync(recordingsFolder)
    .filter((fileName) => fileName.endsWith(RECORDING_FILE_SUFFIX))
    .map((fileName) => [fileName, readFileSync(join(recordingsFolder, fileName), 'utf8')]));
}

function reportText(heading: string, lines: readonly string[]): string {
  return [heading, ...lines.map((line) => `  ${line}`)].join('\n');
}

function recordingStampReportOfThisMachine(): RecordingStampReport {
  return recordingStampReportOf({
    recordedBoundaries: RECORDED_BOUNDARIES,
    operatingSystem:    process.platform,
    recordingTexts:     recordingTextsOf(process.platform),
    installedVersionOf,
  });
}

if (import.meta.main) {
  const {
    staleLines,
    unfinishedLines,
    authoredLines,
    uncheckedLines,
  } = recordingStampReportOfThisMachine();
  if (unfinishedLines.length > 0) console.log(reportText(`${unfinishedLines.length} recorded boundaries are not finished for ${process.platform}:`, unfinishedLines));
  if (uncheckedLines.length > 0) {
    console.log(reportText(`${uncheckedLines.length} recordings for ${process.platform} are not checked against an installed version:`, uncheckedLines));
  }
  if (authoredLines.length > 0) console.warn(reportText(`${authoredLines.length} recordings for ${process.platform} are authored, not recorded:`, authoredLines));
  if (staleLines.length === 0) {
    console.log(`No recording for ${process.platform} is stale.`);
  } else {
    console.error(reportText(`${staleLines.length} recordings for ${process.platform} are stale:`, staleLines));
    process.exitCode = 1;
  }
}
