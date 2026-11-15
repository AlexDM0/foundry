/**
 * The stamp check step of `bun run verify`: it lists each boundary with no recording for this OS as not finished, and fails on each
 * stale recording, naming the command that records it again. It reads files and installed versions only, and runs no spec.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join }                                  from 'node:path';

import type { RecordedSystem }                                     from './BoundaryRecordings.ts';
import { RECORDING_SUFFIX, RECORDINGS_FOLDER, SYSTEM_OF_BOUNDARY } from './BoundaryRecordings.ts';
import { BOUNDARY_SPECS }                                          from './BoundarySpecs.ts';
import { installedVersionOf }                                      from './InstalledSystemVersion.ts';
import { recordingStampReportOf }                                  from './RecordingStamps.ts';

const REPOSITORY_ROOT = join(import.meta.dir, '..', '..');
const os = process.platform;
const recordingsOfThisOs = join(REPOSITORY_ROOT, RECORDINGS_FOLDER, os);

const recordingTexts = new Map<string, string>(existsSync(recordingsOfThisOs)
  ? readdirSync(recordingsOfThisOs)
    .filter((fileName) => fileName.endsWith(RECORDING_SUFFIX))
    .map((fileName) => [fileName, readFileSync(join(recordingsOfThisOs, fileName), 'utf8')])
  : []);

const installedVersions = new Map<RecordedSystem, string>();

function memoizedInstalledVersionOf(system: RecordedSystem): string {
  const known = installedVersions.get(system) ?? installedVersionOf(system);
  installedVersions.set(system, known);
  return known;
}

const { staleLines, unfinishedLines } = recordingStampReportOf({
  boundaries:         BOUNDARY_SPECS.map(({ boundary }) => boundary),
  systemOf:           SYSTEM_OF_BOUNDARY,
  os,
  recordingTexts,
  installedVersionOf: memoizedInstalledVersionOf,
});

if (unfinishedLines.length > 0) {
  console.log(`${unfinishedLines.length} boundaries are not finished for ${os}:`);
  for (const line of unfinishedLines) console.log(`  ${line}`);
}
if (staleLines.length === 0) {
  console.log(`No recording for ${os} is stale.`);
} else {
  console.error(`${staleLines.length} recordings for ${os} are stale:`);
  for (const line of staleLines) console.error(`  ${line}`);
  process.exitCode = 1;
}
