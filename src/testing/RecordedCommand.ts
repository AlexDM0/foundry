/**
 * The one mock of an outside command: `recordedCommandOf` answers an argv only with the answer that a real-system spec recorded for it
 * under `bun run record <boundary>`, and fails an argv with no recorded answer. A recorded argv holds placeholders such as `<home>` where
 * the real call held a scratch path; a replay gives the value of each placeholder, which is put back in the argv and in the output.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join }                     from 'node:path';

import type { BoundaryRecording }           from './BoundaryRecordings.ts';
import { recordCommandOf, recordingPathOf } from './BoundaryRecordings.ts';
import { recordAnswer }                     from './RecordedAnswers.ts';

/** `spawn-failed`: the command did not start, such as a program that is missing (`ENOENT`). */
export type CommandAnswer =
  | { readonly kind: 'finished'; readonly exitCode: number; readonly stdout: string; readonly stderr: string }
  | { readonly kind: 'spawn-failed'; readonly code: string };

/** Each placeholder, such as `<home>`, with the text it stands for in this call. */
export type CommandPlaceholders = Readonly<Record<string, string>>;

export interface CommandCall {
  readonly argv:       readonly string[];
  /** The state of the outside system that the argv alone does not show, such as `the key unset`. */
  readonly situation?: string;
}

export interface RecordedCommand {
  answerTo:  (call: CommandCall) => CommandAnswer;
  /** In place of `Bun.spawnSync`: a recorded `spawn-failed` answer throws as Bun throws it, with its `code`. */
  spawnSync: (argvOrOptions: readonly string[] | { readonly cmd: readonly string[] }) => Bun.SyncSubprocess<'pipe', 'pipe'>;
  /** In place of `Bun.spawn`: its standard output is the recorded one, its standard error dropped. */
  spawn:     (argv: readonly string[]) => Bun.Subprocess;
}

const REPOSITORY_ROOT = join(import.meta.dir, '..', '..');

function placeholdersByLongestText(placeholders: CommandPlaceholders): (readonly [string, string])[] {
  return Object.entries(placeholders).sort(([, a], [, b]) => b.length - a.length);
}

function withPlaceholders(text: string, placeholders: CommandPlaceholders): string {
  return placeholdersByLongestText(placeholders).reduce((shaped, [placeholder, value]) => shaped.replaceAll(value, placeholder), text);
}

function withValues(text: string, placeholders: CommandPlaceholders): string {
  return Object.entries(placeholders).reduce((filled, [placeholder, value]) => filled.replaceAll(placeholder, value), text);
}

export function callShapeOf(call: CommandCall, placeholders: CommandPlaceholders): string {
  const argvShape = call.argv.map((argument) => withPlaceholders(argument, placeholders)).join(' ');
  return call.situation === undefined ? argvShape : `${argvShape}, ${call.situation}`;
}

function answerWithPlaceholders(answer: CommandAnswer, placeholders: CommandPlaceholders): CommandAnswer {
  if (answer.kind === 'spawn-failed') return answer;
  return { ...answer, stdout: withPlaceholders(answer.stdout, placeholders), stderr: withPlaceholders(answer.stderr, placeholders) };
}

/** What a real-system spec calls: runs the real command once and gives its real answer. */
export function realCommandAnswerOf(argv: readonly string[], options: { readonly cwd?: string; readonly env?: Record<string, string | undefined> } = {}): CommandAnswer {
  try {
    const finished = Bun.spawnSync([...argv], {
      ...options, stdin: 'ignore', stdout: 'pipe', stderr: 'pipe', windowsHide: true
    });
    return {
      kind: 'finished', exitCode: finished.exitCode, stdout: finished.stdout.toString(), stderr: finished.stderr.toString()
    };
  } catch (problem) {
    const code = problem instanceof Error && 'code' in problem && typeof problem.code === 'string' ? problem.code : String(problem);
    return { kind: 'spawn-failed', code };
  }
}

/** Records the answer under its call shape; it writes only while `bun run record <boundary>` runs. */
export function recordCommandAnswer(call: CommandCall, placeholders: CommandPlaceholders, answer: CommandAnswer): void {
  recordAnswer(callShapeOf(call, placeholders), answerWithPlaceholders(answer, placeholders));
}

function recordingOf(boundary: string): BoundaryRecording {
  const recordingPath = join(REPOSITORY_ROOT, recordingPathOf(boundary, process.platform));
  if (!existsSync(recordingPath)) throw new Error(`no answers of ${boundary} are recorded for ${process.platform}: run \`${recordCommandOf(boundary)}\`.`);
  return JSON.parse(readFileSync(recordingPath, 'utf8')) as BoundaryRecording;
}

function spawnFailureOf(code: string, argv: readonly string[]): Error {
  return Object.assign(new Error(`${code}: the recorded answer to ${argv.join(' ')}`), { code });
}

/** `situation`, when given, is the situation that `spawnSync` and `spawn` answer each argv in. */
export function recordedCommandOf(boundary: string, placeholders: CommandPlaceholders = {}, situation?: string): RecordedCommand {
  const answers = new Map(recordingOf(boundary).answers.map(({ callShape, answer }) => [callShape, answer as CommandAnswer]));

  function answerTo(call: CommandCall): CommandAnswer {
    const callShape = callShapeOf(call, placeholders);
    const answer = answers.get(callShape);
    if (answer === undefined) {
      throw new Error(`\`${callShape}\` has no recorded answer of ${boundary}; recorded are:\n${[...answers.keys()].join('\n')}`);
    }
    if (answer.kind === 'spawn-failed') return answer;
    return { ...answer, stdout: withValues(answer.stdout, placeholders), stderr: withValues(answer.stderr, placeholders) };
  }

  function finishedAnswerTo(argv: readonly string[]): Extract<CommandAnswer, { kind: 'finished' }> {
    const answer = answerTo(situation === undefined ? { argv } : { argv, situation });
    if (answer.kind === 'spawn-failed') throw spawnFailureOf(answer.code, argv);
    return answer;
  }

  return {
    answerTo,
    spawnSync: (argvOrOptions) => {
      const argv = 'cmd' in argvOrOptions ? argvOrOptions.cmd : argvOrOptions;
      const answer = finishedAnswerTo(argv);
      return {
        exitCode: answer.exitCode,
        success:  answer.exitCode === 0,
        stdout:   Buffer.from(answer.stdout),
        stderr:   Buffer.from(answer.stderr),
      } as unknown as Bun.SyncSubprocess<'pipe', 'pipe'>;
    },
    spawn: (argv) => {
      const answer = finishedAnswerTo(argv);
      return {
        exited: Promise.resolve(answer.exitCode), exitCode: answer.exitCode, stdout: new Response(answer.stdout).body, unref: () => undefined
      } as unknown as Bun.Subprocess;
    },
  };
}
