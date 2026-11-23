/**
 * The versioned JSON answers of the verbs a program outside the board runs: for each of `version`, `init`, `update`, `stop`, `start`,
 * `machine limit`, the answer of a success and of one refusal. What matters: every answer is one document on standard output
 * carrying `answerVersion: 3`, and a refusal under `--json` is `{answerVersion, refusal, text}` at exit 1, the code beside the sentence
 * standard error carries. `init`, `update` and `stop` on a tracker are in `ProgramAnswerUtil.trackerVerbs.spec.ts`; `start` twice against a
 * real Hephaestus is pinned by `cli/hephaestus/StartCommand.integration.spec.ts`.
 */
import { afterEach, expect, test } from 'bun:test';

import { TALOS_PROTOCOL_VERSION }                         from '../../src/lib/talos/constants/TalosProtocol.ts';
import { useRecordedGitOutsideAnyRepository }             from '../../src/testing/RecordedGit.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../src/testing/ScratchWorkspace.ts';
import { runCommandLine }                                 from '../Main.ts';
import { INSTALL_VERSION }                                from '../constants/InstallVersion.ts';
import { createCapturedCommandContext }                   from '../testing/CapturedCommandContext.ts';

useRecordedGitOutsideAnyRepository();

const FROZEN_NOW = new Date('2026-11-12T10:00:00+01:00');

const scratchDirectories: string[] = [];

afterEach(() => {
  for (const directory of scratchDirectories.splice(0)) removeScratchDirectory(directory);
});

function untrackedDirectory(): string {
  const directory = createScratchDirectory('program-answers');
  scratchDirectories.push(directory);
  return directory;
}

async function answerIn(currentDirectory: string, commandLine: readonly string[]): Promise<{ exitCode: number; answer: Record<string, unknown> }> {
  const context = createCapturedCommandContext({ currentDirectory, now: () => FROZEN_NOW });
  const exitCode = await runCommandLine(commandLine, context);
  return { exitCode, answer: JSON.parse(context.outputText()) as Record<string, unknown> };
}

const REFUSAL_OF_ARGUMENTS = { answerVersion: 3, refusal: 'arguments-refused', text: expect.any(String) };

test('version answers its versions, the contracts it serves, the Talos protocol version it starts and its monitor folder, and a refused argument as a refusal', async () => {
  const directory = untrackedDirectory();
  expect(await answerIn(directory, ['version', '--json'])).toEqual({
    exitCode: 0,
    answer:   {
      answerVersion:        3,
      codeVersion:          expect.any(String),
      installVersion:       INSTALL_VERSION,
      contracts:            { summary: 3, monitor: 6, control: 3 },
      talosProtocolVersion: TALOS_PROTOCOL_VERSION,
      monitorFolder:        expect.any(String),
    },
  });
  expect(await answerIn(directory, ['version', 'extra', '--json'])).toEqual({ exitCode: 1, answer: REFUSAL_OF_ARGUMENTS });
});

test('machine limit answers the limit, its ceiling and the agents in flight, a set as done, and a limit above the CPUs as its refusal', async () => {
  const directory = untrackedDirectory();
  expect(await answerIn(directory, ['machine', 'limit', '--json'])).toEqual({
    exitCode: 0,
    answer:   {
      answerVersion: 3, limit: expect.any(Number), ceiling: expect.any(Number), agentsInFlight: 0
    },
  });
  expect(await answerIn(directory, ['machine', 'limit', '1', '--json'])).toEqual({
    exitCode: 0,
    answer:   {
      answerVersion: 3, outcome: 'done', limit: 1, ceiling: expect.any(Number)
    },
  });
  const refusalAboveTheCpus = { answerVersion: 3, refusal: 'machine-agent-limit-above-cpus', text: expect.stringContaining('CPUs') };
  expect(await answerIn(directory, ['machine', 'limit', '100000', '--json'])).toEqual({ exitCode: 1, answer: refusalAboveTheCpus });
});

test('start refuses a folder with no tracker as a refusal answer', async () => {
  const directory = untrackedDirectory();
  expect((await answerIn(directory, ['start', '--port', '0', '--json'])).answer).toMatchObject({ answerVersion: 3, refusal: expect.any(String), text: expect.any(String) });
});
