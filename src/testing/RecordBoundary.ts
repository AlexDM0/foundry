/**
 * `bun run record <name>`: runs the real-system spec of one recorded boundary against the real system and, when it passes, writes the
 * answers it recorded to the boundary's recording for this OS, stamped with the installed version of the system it talks to.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

import { realProcessRun }    from '../lib/process-run/ProcessRun.ts';
import { environmentCopy }   from '../services/Environment.ts';
import { CONTRACT_VERSIONS } from '../shared/constants/ContractVersions.ts';

import {
  answersInProgressPathOf,
  installedVersionOf,
  RECORDED_BOUNDARIES,
  recordedBoundaryNamed,
  recordingPathOf,
  repositoryRoot,
  type BoundaryRecording,
  type RecordedAnswer,
  type RecordedBoundary,
} from './BoundaryRecordings.ts';
import { scratchRoot } from './ScratchRoot.ts';

const RECORDING_RUN_TIMEOUT_MILLISECONDS = 300_000;
const JSON_INDENT_SPACES = 2;
/** A pattern given on the command line replaces those of `bunfig.toml`, which keep every recording spec out of a plain `bun test`. */
const FOREIGN_TREES_IGNORED = ['.claude/**', '.scratch/**', 'node_modules/**'];

export interface RecordOutput {
  readonly writeStandardOutput: (text: string) => void;
  readonly writeStandardError:  (text: string) => void;
}

type CollectedAnswers = { readonly verdict: 'collected'; readonly answers: RecordedAnswer[] } | { readonly verdict: 'conflicting'; readonly callShape: string };

function collectedAnswersIn(answersPath: string): CollectedAnswers {
  const answerByCallShape = new Map<string, string>();
  for (const line of readFileSync(answersPath, 'utf8').split('\n').filter((answerLine) => answerLine !== '')) {
    const { callShape, answer } = JSON.parse(line) as RecordedAnswer;
    const answerText = JSON.stringify(answer);
    if ((answerByCallShape.get(callShape) ?? answerText) !== answerText) return { verdict: 'conflicting', callShape };
    answerByCallShape.set(callShape, answerText);
  }
  const answers = [...answerByCallShape.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([callShape, answerText]) => ({ callShape, answer: JSON.parse(answerText) as unknown }));
  return { verdict: 'collected', answers };
}

function writeRecording(boundary: RecordedBoundary, answers: readonly RecordedAnswer[]): string {
  const recording: BoundaryRecording = {
    recordingVersion: CONTRACT_VERSIONS.boundaryRecording,
    stamp:            {
      recordingName:   boundary.recordingName,
      operatingSystem: process.platform,
      system:          boundary.system,
      source:          'recorded',
      systemVersion:   installedVersionOf(boundary.system),
    },
    answers,
  };
  const recordingPath = recordingPathOf(boundary.recordingName, process.platform);
  mkdirSync(dirname(join(repositoryRoot(), recordingPath)), { recursive: true });
  writeFileSync(join(repositoryRoot(), recordingPath), `${JSON.stringify(recording, null, JSON_INDENT_SPACES)}\n`);
  return recordingPath;
}

export async function recordBoundary(recordingName: string, output: RecordOutput): Promise<number> {
  const boundary = recordedBoundaryNamed(recordingName);
  if (boundary === null) {
    const names = RECORDED_BOUNDARIES.map(({ recordingName: listedName }) => `  ${listedName}`).join('\n');
    output.writeStandardError(`"${recordingName}" is no recorded boundary. Name one of:\n${names}\n`);
    return 1;
  }
  const answersPath = answersInProgressPathOf(boundary.recordingName);
  mkdirSync(scratchRoot(), { recursive: true });
  writeFileSync(answersPath, '');
  try {
    output.writeStandardOutput(`Recording ${boundary.recordingName}: running ${boundary.recordingSpec} against the real system.\n`);
    const testRun = await realProcessRun(environmentCopy).run({
      program:             process.execPath,
      programArguments:    ['test', ...FOREIGN_TREES_IGNORED.map((pattern) => `--path-ignore-patterns=${pattern}`), `./${boundary.recordingSpec}`],
      workingDirectory:    repositoryRoot(),
      timeoutMilliseconds: RECORDING_RUN_TIMEOUT_MILLISECONDS,
    });
    if (testRun.verdict === 'finished') output.writeStandardError(`${testRun.standardOutput}${testRun.standardError}`);
    if (testRun.verdict !== 'finished' || testRun.exitCode !== 0) {
      output.writeStandardError(`The real-system spec of ${boundary.recordingName} did not pass (${testRun.verdict}): nothing is recorded.\n`);
      return 1;
    }
    const collected = collectedAnswersIn(answersPath);
    if (collected.verdict === 'conflicting') {
      output.writeStandardError(`The spec recorded two different answers for ${collected.callShape}: nothing is recorded.\n`);
      return 1;
    }
    const recordingPath = writeRecording(boundary, collected.answers);
    output.writeStandardOutput(`Recorded ${collected.answers.length} answers to ${recordingPath}.\n`);
    return 0;
  } finally {
    if (existsSync(answersPath)) rmSync(answersPath);
  }
}

if (import.meta.main) {
  process.exitCode = await recordBoundary(process.argv[2] ?? '', {
    writeStandardOutput: (text) => process.stdout.write(text),
    writeStandardError:  (text) => process.stderr.write(text),
  });
}
