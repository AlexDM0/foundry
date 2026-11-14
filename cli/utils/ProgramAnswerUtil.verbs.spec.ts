/**
 * The versioned JSON answers of the verbs a program outside the board runs: for each of `version`, `init`, `update`, `stop`, `start`,
 * `machine limit` and `login-item`, the answer of a success and of one refusal. What matters: every answer is one document on standard output
 * carrying `answerVersion: 1`, and a refusal under `--json` is `{answerVersion, refusal, text}` at exit 1, the code beside the sentence
 * standard error carries. `init`, `update` and `stop` on a tracker are in `ProgramAnswerUtil.trackerVerbs.spec.ts`; `start` twice against a
 * real Overseer is pinned by `cli/overseer/OverseerCommand.integration.spec.ts`.
 */
import { mkdirSync } from 'node:fs';
import { join }      from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import { createScratchDirectory, removeScratchDirectory } from '../../src/testing/ScratchWorkspace.ts';
import { runCommandLine }                                 from '../Main.ts';
import { INSTALL_VERSION }                                from '../constants/InstallVersion.ts';
import type { SetupHost }                                 from '../setup/SetupHost.ts';
import { type LoginItemAnswer, loginItemAnswerOf }        from '../setup/login-item/LoginItemCommand.ts';
import { createCapturedCommandContext }                   from '../testing/CapturedCommandContext.ts';
import { ProgramAnswerUtil }                              from './ProgramAnswerUtil.ts';

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

const REFUSAL_OF_ARGUMENTS = { answerVersion: 1, refusal: 'arguments-refused', text: expect.any(String) };

test('version answers its versions, the contracts it serves and its monitor folder, and a refused argument as a refusal', async () => {
  const directory = untrackedDirectory();
  expect(await answerIn(directory, ['version', '--json'])).toEqual({
    exitCode: 0,
    answer:   {
      answerVersion:  1,
      codeVersion:    expect.any(String),
      installVersion: INSTALL_VERSION,
      contracts:      {
        summary: 1, monitor: 1, control: 1, embed: 1
      },
      monitorFolder: expect.any(String),
    },
  });
  expect(await answerIn(directory, ['version', 'extra', '--json'])).toEqual({ exitCode: 1, answer: REFUSAL_OF_ARGUMENTS });
});

test('machine limit answers the limit, its ceiling and the agents in flight, a set as done, and a limit above the CPUs as its refusal', async () => {
  const directory = untrackedDirectory();
  expect(await answerIn(directory, ['machine', 'limit', '--json'])).toEqual({
    exitCode: 0,
    answer:   {
      answerVersion: 1, limit: expect.any(Number), ceiling: expect.any(Number), agentsInFlight: 0
    },
  });
  expect(await answerIn(directory, ['machine', 'limit', '1', '--json'])).toEqual({
    exitCode: 0,
    answer:   {
      answerVersion: 1, outcome: 'done', limit: 1, ceiling: expect.any(Number)
    },
  });
  const refusalAboveTheCpus = { answerVersion: 1, refusal: 'machine-agent-limit-above-cpus', text: expect.stringContaining('CPUs') };
  expect(await answerIn(directory, ['machine', 'limit', '100000', '--json'])).toEqual({ exitCode: 1, answer: refusalAboveTheCpus });
});

test('login-item answers its state, label and location for add, status and remove', () => {
  const directory = untrackedDirectory();
  const homeDirectory = join(directory, 'home of Alex Example');
  mkdirSync(homeDirectory);
  const host: SetupHost = {
    platform:            'darwin',
    checkoutDirectory:   join(directory, 'checkout'),
    homeDirectory,
    bunProgram:          process.execPath,
    bunInstallFolder:    join(directory, 'bun-install'),
    searchPath:          [],
    userShell:           '/bin/zsh',
    programOnSearchPath: () => null,
    systemFolder:        () => undefined,
    run:                 () => ({ exitCode: 0, output: '' }),
    answersYes:          () => false,
    write:               () => undefined,
  };
  const repository = join(directory, 'example-storefront');
  const expected = (outcome: LoginItemAnswer['outcome'], state: LoginItemAnswer['state']): LoginItemAnswer => ({
    outcome, state, label: 'com.forge.overseer.tracker-example', location: expect.stringContaining('LaunchAgents') as unknown as string, repository
  });
  expect(loginItemAnswerOf(host, 'add', repository, 'tracker-example')).toEqual(expected('done', 'present'));
  expect(loginItemAnswerOf(host, 'status', repository, 'tracker-example')).toEqual(expected(null, 'present'));
  expect(loginItemAnswerOf(host, 'remove', repository, 'tracker-example')).toEqual(expected('done', 'absent'));
  expect(loginItemAnswerOf(host, 'remove', repository, 'tracker-example')).toEqual(expected('nothing-to-do', 'absent'));
  expect(ProgramAnswerUtil.answerOf({ ...expected(null, 'absent') })).toMatchObject({ answerVersion: 1 });
});

test('login-item and start refuse an unknown subcommand and a folder with no tracker, each as a refusal answer', async () => {
  const directory = untrackedDirectory();
  expect(await answerIn(directory, ['login-item', 'enable', '--json'])).toEqual({ exitCode: 1, answer: REFUSAL_OF_ARGUMENTS });
  expect((await answerIn(directory, ['start', '--port', '0', '--json'])).answer).toMatchObject({ answerVersion: 1, refusal: expect.any(String), text: expect.any(String) });
});
