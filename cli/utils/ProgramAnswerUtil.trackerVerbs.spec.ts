/**
 * The versioned JSON answers of `init`, `update` and `stop` on a tracker, over recorded git: a success and one refusal each. What matters: the
 * answer carries `answerVersion: 1` and only the keys the command's reference names, and a refusal under `--json` is the refusal document.
 */
import { realpathSync } from 'node:fs';

import { afterEach, expect, test } from 'bun:test';

import { useRecordedGit }                                                      from '../../src/testing/RecordedGit.ts';
import { removeScratchDirectory }                                              from '../../src/testing/ScratchWorkspace.ts';
import { describeWhenGitIsRecorded }                                           from '../../src/testing/ToolGuard.ts';
import { runCommandLine }                                                      from '../Main.ts';
import { INSTALL_VERSION }                                                     from '../constants/InstallVersion.ts';
import { createCapturedCommandContext }                                        from '../testing/CapturedCommandContext.ts';
import { createInitializedRecordedGitRepository, createRecordedGitRepository } from '../testing/InitializedScratchRepository.ts';
import { INIT_IN_A_NEW_REPOSITORY, REFRESH_OF_AN_IGNORING_REPOSITORY }         from '../testing/RecordedGitStages.ts';

const FROZEN_NOW = new Date('2026-11-12T10:00:00+01:00');

const recordedGit = useRecordedGit();
const scratchDirectories: string[] = [];

afterEach(() => {
  for (const directory of scratchDirectories.splice(0)) removeScratchDirectory(directory);
});

async function trackedDirectory(): Promise<string> {
  const directory = await createInitializedRecordedGitRepository('program-answers', ['--project', 'Example Agency'], () => FROZEN_NOW, recordedGit);
  scratchDirectories.push(directory);
  return directory;
}

async function answerIn(currentDirectory: string, commandLine: readonly string[]): Promise<{ exitCode: number; answer: Record<string, unknown> }> {
  const context = createCapturedCommandContext({ currentDirectory, now: () => FROZEN_NOW });
  const exitCode = await runCommandLine(commandLine, context);
  return { exitCode, answer: JSON.parse(context.outputText()) as Record<string, unknown> };
}

const REFUSAL_OF_ARGUMENTS = { answerVersion: 1, refusal: 'arguments-refused', text: expect.any(String) };

describeWhenGitIsRecorded('the answers of the verbs on a tracker', () => {
  test('init answers created with the tracker id, the project and the root, and an unknown option as a refusal', async () => {
    const directory = createRecordedGitRepository('program-answers-init');
    scratchDirectories.push(directory);
    const created = await recordedGit.playStage(INIT_IN_A_NEW_REPOSITORY, () => answerIn(directory, ['init', '--project', 'Example Agency', '--json']));
    expect(created).toEqual({
      exitCode: 0,
      answer:   {
        answerVersion: 1, outcome: 'created', trackerId: expect.any(String), project: 'Example Agency', root: realpathSync(directory)
      },
    });
    expect(await answerIn(directory, ['init', '--unknown', '--json'])).toEqual({ exitCode: 1, answer: REFUSAL_OF_ARGUMENTS });
  });

  test('update answers done with no Baton pass needed, and an option it does not take as a refusal', async () => {
    const directory = await trackedDirectory();
    const updated = await recordedGit.playStage(REFRESH_OF_AN_IGNORING_REPOSITORY, () => answerIn(directory, ['update', '--json']));
    expect(updated).toEqual({
      exitCode: 0,
      answer:   {
        answerVersion: 1, outcome: 'done', installVersion: INSTALL_VERSION, batonPass: 'not-needed', batonPassStep: null
      },
    });
    expect(await answerIn(directory, ['update', '--root', '--json'])).toEqual({ exitCode: 1, answer: REFUSAL_OF_ARGUMENTS });
  });

  test('stop answers nothing to do with no Overseer live, and an extra argument as a refusal', async () => {
    const directory = await trackedDirectory();
    expect(await answerIn(directory, ['stop', '--json'])).toEqual({ exitCode: 0, answer: { answerVersion: 1, outcome: 'nothing-to-do' } });
    expect(await answerIn(directory, ['stop', 'extra', '--json'])).toEqual({ exitCode: 1, answer: REFUSAL_OF_ARGUMENTS });
  });
});
