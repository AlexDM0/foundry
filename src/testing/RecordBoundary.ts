/**
 * `bun run record <boundary>`: runs the real-system specs of one boundary of `BOUNDARY_SPECS` against the real system, and when they
 * pass writes the answers they recorded to the boundary's frozen table for this OS, stamped with the installed system version.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { dirname, join } from 'node:path';

import type { BoundaryRecording, RecordedAnswer }                             from './BoundaryRecordings.ts';
import { answersInProgressPathOf, recordingPathOf, SYSTEM_OF_BOUNDARY }       from './BoundaryRecordings.ts';
import { BOUNDARY_SPECS, INTEGRATION_SPEC_SUFFIX, integrationSpecsTouchedBy } from './BoundarySpecs.ts';
import { installedVersionOf }                                                 from './InstalledSystemVersion.ts';

const REPOSITORY_ROOT = join(import.meta.dir, '..', '..');
// A later `--path-ignore-patterns` replaces the one in `bunfig.toml`, which is what keeps these specs out of a plain `bun test`.
const NOTHING_REAL_IGNORED_PATTERN = '.claude/**';
const JSON_INDENT = 2;

function recordedAnswersIn(answersPath: string): RecordedAnswer[] {
  const lines = readFileSync(answersPath, 'utf8').split('\n').filter((line) => line.length > 0);
  const uniqueLines = [...new Set(lines)];
  return uniqueLines
    .map((line) => JSON.parse(line) as RecordedAnswer)
    .sort((a, b) => a.callShape.localeCompare(b.callShape));
}

function specsRunBy(boundary: string): string[] {
  const integrationSpecPaths = [...new Bun.Glob(`**/*${INTEGRATION_SPEC_SUFFIX}`).scanSync({ cwd: REPOSITORY_ROOT })]
    .filter((path) => !path.startsWith('node_modules/'));
  return integrationSpecsTouchedBy([boundary], integrationSpecPaths);
}

function record(boundary: string): number {
  const system = Object.hasOwn(SYSTEM_OF_BOUNDARY, boundary) ? SYSTEM_OF_BOUNDARY[boundary] : undefined;
  if (!BOUNDARY_SPECS.some((listed) => listed.boundary === boundary) || system === undefined) {
    console.error(`${boundary} is no boundary. Name one of src/testing/BoundarySpecs.ts:`);
    for (const listed of BOUNDARY_SPECS) console.error(`  ${listed.boundary}`);
    return 1;
  }
  const specPaths = specsRunBy(boundary);
  if (specPaths.length === 0) {
    console.error(`${boundary} has no real-system spec in this checkout: nothing to record.`);
    return 1;
  }
  const answersPath = answersInProgressPathOf(REPOSITORY_ROOT);
  writeFileSync(answersPath, '');
  try {
    console.log(`Recording ${boundary}: running ${specPaths.length} real-system specs.`);
    const finished = Bun.spawnSync(
      ['bun', 'test', `--path-ignore-patterns=${NOTHING_REAL_IGNORED_PATTERN}`, ...specPaths.map((specPath) => `./${specPath}`)],
      { cwd: REPOSITORY_ROOT, stdout: 'inherit', stderr: 'inherit' },
    );
    if (finished.exitCode !== 0) {
      console.error(`The real-system specs of ${boundary} failed: nothing is recorded.`);
      return 1;
    }
    const recording: BoundaryRecording = {
      stamp: {
        boundary, system, version: installedVersionOf(system), os: process.platform
      },
      answers: recordedAnswersIn(answersPath),
    };
    const recordingPath = join(REPOSITORY_ROOT, recordingPathOf(boundary, process.platform));
    mkdirSync(dirname(recordingPath), { recursive: true });
    writeFileSync(recordingPath, `${JSON.stringify(recording, null, JSON_INDENT)}\n`);
    console.log(`Recorded ${recording.answers.length} answers to ${recordingPathOf(boundary, process.platform)}.`);
    return 0;
  } finally {
    if (existsSync(answersPath)) rmSync(answersPath);
  }
}

const [boundaryArgument] = Bun.argv.slice(2);
process.exitCode = record(boundaryArgument ?? '');
