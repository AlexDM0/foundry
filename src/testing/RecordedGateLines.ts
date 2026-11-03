/**
 * The gate line of a default spec: `useRecordedGateSpawns` mocks `Bun.spawn` for a spec file with the ends real gate lines gave, which the
 * `RecordedGateLines.*.integration.spec.ts` specs record under `bun run record` of the shell line, the executable lookup, the gate
 * confinement and the gate run. A spawn is answered only when its argv is the recorded shell argv of a recorded line, alone or after the
 * recorded confinement prefix. Any other spawn fails the case, and so does a write outside the allowed folders that no sandbox confines.
 */
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir }                   from 'node:os';
import { join }                     from 'node:path';

import {
  afterAll,
  afterEach,
  beforeAll,
  spyOn
} from 'bun:test';

import type { ConfinedLine }                from '../lib/gate-confinement/ConfinedLine.ts';
import type { GateProcessRun }              from '../services/lifecycle/GateRun.ts';
import type { BoundaryRecording }           from './BoundaryRecordings.ts';
import { recordCommandOf, recordingPathOf } from './BoundaryRecordings.ts';

export const GATE_LINE_BOUNDARIES = {
  SHELL_LINE:          'src/lib/shell-line/',
  EXECUTABLE_RESOLVER: 'src/lib/executable-resolver/',
  GATE_CONFINEMENT:    'src/lib/gate-confinement/',
  GATE_RUN:            'src/services/lifecycle/GateRun.ts',
} as const;

/** The places a recorded answer holds for a value of the run it was asked in, which a replay fills in. */
export const RECORDED_GATE_PLACEHOLDERS = {
  SCRATCH:     '<scratch>',
  STATUS_FILE: '<status file>',
  ARGV:        '<argv>',
} as const;

const LINE_PLACEHOLDER = '<line>';

/** The lines whose spawn request the shell line boundary records: `%` is the variable mark of cmd, `$` of a POSIX shell. */
export const RECORDED_SHELL_LINES = {
  PLAIN:    'echo plain',
  QUOTED:   'echo "it\'s quoted"',
  VARIABLE: process.platform === 'win32' ? 'echo %PATH%' : 'echo "$PATH"',
} as const;

export const SHELL_LINE_CALL_SHAPES = {
  PLAIN:    'spawnRequestOf <line> <status file>, a plain line',
  QUOTED:   'spawnRequestOf <line> <status file>, a line with quotes',
  VARIABLE: 'spawnRequestOf <line> <status file>, a line with a variable',
} as const;

export const PLANTED_EXECUTABLE_NAME = 'example-gate-tool';

export const EXECUTABLE_CALL_SHAPES = {
  ON_A_PLANTED_PATH: 'absolutePathOf <name>, the name in the one folder of a planted PATH',
  MISSING:           'absolutePathOf <name>, the name in no folder of a planted PATH',
} as const;

export const CONFINEMENT_CALL_SHAPES = { CONFINED_ARGV: 'confinedArgvOf <plan> <argv>, a gate plan with no network and no extra writes', } as const;

/** The gate lines whose end the gate run boundary records; a default spec runs only these. */
export const RECORDED_GATE_LINES = {
  GREEN:   'exit 0',
  RED:     'echo example-red; exit 1',
  STOPPED: 'kill -TERM $$',
} as const;

export const OUTSIDE_WRITE_FILE = 'outside-write';
const OUTSIDE_FOLDER_PLACEHOLDER = '<outside folder>';

/** A line that writes a file in `outsideFolder`, a folder its confinement does not allow. */
export function writesOutsideLineOf(outsideFolder: string): string {
  return `echo example > '${outsideFolder}/${OUTSIDE_WRITE_FILE}'`;
}

const WRITES_OUTSIDE_LINE_PATTERN = /^echo example > '(?<folder>[^']+)\/outside-write'$/;

export type RecordedGateLineKind = 'green' | 'red' | 'stopped' | 'writes-outside';
export type GateLineConfinementKind = 'confined' | 'unconfined';

/** The end of a recorded line under its confinement; a write outside the allowed folders is recorded confined only. */
export function gateRunCallShapeOf(kind: RecordedGateLineKind, confinement: GateLineConfinementKind): string {
  return `runGate, a ${kind} line, ${confinement}`;
}

const REPOSITORY_ROOT = join(import.meta.dir, '..', '..');

function recordedAnswersOf(boundary: string): ReadonlyMap<string, unknown> {
  const recordingPath = join(REPOSITORY_ROOT, recordingPathOf(boundary, process.platform));
  if (!existsSync(recordingPath)) throw new Error(`no answers of ${boundary} are recorded for ${process.platform}: run \`${recordCommandOf(boundary)}\`.`);
  const recording = JSON.parse(readFileSync(recordingPath, 'utf8')) as BoundaryRecording;
  return new Map(recording.answers.map(({ callShape, answer }) => [callShape, answer]));
}

function recordedAnswerOf(boundary: string, callShape: string): unknown {
  const answer = recordedAnswersOf(boundary).get(callShape);
  if (answer === undefined) throw new Error(`the recording of ${boundary} holds no answer for "${callShape}": run \`${recordCommandOf(boundary)}\`.`);
  return answer;
}

/** The recorded argv of the plain line, `<line>` where the line stood. */
function shellArgvTemplate(): readonly string[] {
  const { argv } = recordedAnswerOf(GATE_LINE_BOUNDARIES.SHELL_LINE, SHELL_LINE_CALL_SHAPES.PLAIN) as { argv: readonly string[] };
  return argv.map((argument) => (argument === RECORDED_SHELL_LINES.PLAIN ? LINE_PLACEHOLDER : argument));
}

/** The recorded confined argv up to the argv it wraps; an empty prefix when this OS confines nothing. */
function confinementPrefix(): readonly string[] {
  const confinedArgv = recordedAnswerOf(GATE_LINE_BOUNDARIES.GATE_CONFINEMENT, CONFINEMENT_CALL_SHAPES.CONFINED_ARGV) as readonly string[];
  return confinedArgv.slice(0, confinedArgv.indexOf(RECORDED_GATE_PLACEHOLDERS.ARGV));
}

const RECORDED_CONFINEMENT_FOLDER = join(tmpdir(), 'agent-progress-recorded-confinement');

/** The confiner of a default spec: it wraps an argv as the recorded confinement does, so the mocked spawn reads it as confined. */
export function recordedGateConfiner(argv: readonly string[]): ConfinedLine {
  const prefix = confinementPrefix().map((argument) => argument.replaceAll(RECORDED_GATE_PLACEHOLDERS.SCRATCH, RECORDED_CONFINEMENT_FOLDER));
  return { verdict: 'runs', argv: [...prefix, ...argv] };
}

function argumentMatches(recorded: string, given: string): boolean {
  return recorded.includes(RECORDED_GATE_PLACEHOLDERS.SCRATCH) || recorded === given;
}

interface ReadSpawn {
  readonly confinement: GateLineConfinementKind;
  readonly line:        string;
}

/** The line a spawn runs and whether the recorded confinement wraps it, or null when its argv is no recorded shape. */
function readSpawnOf(argv: readonly string[]): ReadSpawn | null {
  const template = shellArgvTemplate();
  const prefix = confinementPrefix();
  const confined = prefix.length > 0 && argv.length === prefix.length + template.length && prefix.every((argument, i) => argumentMatches(argument, argv[i] ?? ''));
  const shellArgv = confined ? argv.slice(prefix.length) : argv;
  if (shellArgv.length !== template.length) return null;
  const lineIndex = template.indexOf(LINE_PLACEHOLDER);
  if (lineIndex === -1 || !template.every((argument, i) => i === lineIndex || argument === shellArgv[i])) return null;
  return { confinement: confined ? 'confined' : 'unconfined', line: shellArgv[lineIndex] ?? '' };
}

interface LineKindRead {
  readonly kind:          RecordedGateLineKind;
  readonly outsideFolder: string | null;
}

function lineKindOf(line: string): LineKindRead | null {
  if (line === RECORDED_GATE_LINES.GREEN) return { kind: 'green', outsideFolder: null };
  if (line === RECORDED_GATE_LINES.RED) return { kind: 'red', outsideFolder: null };
  if (line === RECORDED_GATE_LINES.STOPPED) return { kind: 'stopped', outsideFolder: null };
  const outsideFolder = WRITES_OUTSIDE_LINE_PATTERN.exec(line)?.groups?.['folder'];
  return outsideFolder === undefined ? null : { kind: 'writes-outside', outsideFolder };
}

/** The recorded end of the spawn, or the reason it has none. */
export function recordedEndOf(argv: readonly string[]): GateProcessRun | string {
  const read = readSpawnOf(argv);
  if (read === null) return `${JSON.stringify(argv)} is no recorded shell argv of a gate line, confined or not`;
  const kindRead = lineKindOf(read.line);
  if (kindRead === null) return `the line ${JSON.stringify(read.line)} is none of the recorded gate lines`;
  const callShape = gateRunCallShapeOf(kindRead.kind, read.confinement);
  const answer = recordedAnswersOf(GATE_LINE_BOUNDARIES.GATE_RUN).get(callShape) as GateProcessRun | undefined;
  if (answer === undefined) return `the gate run recording holds no answer for "${callShape}"`;
  if (answer.recordedStatus !== null) return `the answer for "${callShape}" records a status file, which this mock cannot place`;
  return { ...answer, output: answer.output.replaceAll(OUTSIDE_FOLDER_PLACEHOLDER, kindRead.outsideFolder ?? OUTSIDE_FOLDER_PLACEHOLDER) };
}

/** The recorded answer's form of a gate run's end: the outside folder a line wrote to as its placeholder. */
export function asRecordedGateEnd(run: GateProcessRun, outsideFolder: string | null): GateProcessRun {
  return outsideFolder === null ? run : { ...run, output: run.output.replaceAll(outsideFolder, OUTSIDE_FOLDER_PLACEHOLDER) };
}

const SIGNAL_EXIT_CODE = 128;

/** What `GateRun.runGate` reads of a spawned process: its two streams, its exit and its signal. */
function spawnedProcessOf(end: GateProcessRun): unknown {
  return {
    pid:        0,
    stdout:     new Response(end.output).body,
    stderr:     new Response('').body,
    exited:     Promise.resolve(end.exitCode ?? SIGNAL_EXIT_CODE),
    exitCode:   end.exitCode,
    signalCode: end.signalCode,
    kill:       () => undefined,
  };
}

export interface RecordedGateSpawns {
  /** Stands in for `Bun.spawn`: a recorded end, or a throw that is also kept for the case to fail on. */
  readonly spawn:               (options: { cmd: readonly string[] }) => unknown;
  readonly takeUnansweredCalls: () => string[];
}

export function createRecordedGateSpawns(): RecordedGateSpawns {
  let unansweredCalls: string[] = [];
  return {
    spawn: (options) => {
      const end = recordedEndOf(options.cmd);
      if (typeof end === 'string') {
        const unanswered = `a gate spawn has no recorded answer: ${end}`;
        unansweredCalls.push(unanswered);
        throw new Error(unanswered);
      }
      return spawnedProcessOf(end);
    },
    takeUnansweredCalls: () => {
      const taken = unansweredCalls;
      unansweredCalls = [];
      return taken;
    },
  };
}

/**
 * Call at a spec file's top level: every spawn of the file is a recorded gate line, and the file's end restores `Bun.spawn`. A case that
 * expects an unanswered spawn takes it before the case ends.
 */
export function useRecordedGateSpawns(): RecordedGateSpawns {
  const spawns = createRecordedGateSpawns();
  beforeAll(() => {
    spyOn(Bun, 'spawn').mockImplementation(spawns.spawn as unknown as typeof Bun.spawn);
  });
  afterEach(() => {
    // `GateRun.runGate` catches the throw of an unanswered spawn, so the case fails here too.
    const unanswered = spawns.takeUnansweredCalls();
    if (unanswered.length > 0) throw new Error(unanswered.join('\n'));
  });
  afterAll(() => {
    spyOn(Bun, 'spawn').mockRestore();
  });
  return spawns;
}
