/**
 * `update` never touches the tracker's own files: with each option it leaves every tracker file byte for byte, and prints its heading saying
 * so and the refresh lines.
 */
import {
  afterEach,
  beforeEach,
  expect,
  test
}                                                                             from 'bun:test';

import { workspacePathsFor }                      from '../../../src/services/tracker/Workspace.ts';
import { PRODUCT_NAMES }                          from '../../../src/shared/constants/ProductNames.ts';
import { useRecordedGit }                         from '../../../src/testing/RecordedGit.ts';
import { removeScratchDirectory }                 from '../../../src/testing/ScratchWorkspace.ts';
import { describeWhenGitIsRecorded }              from '../../../src/testing/ToolGuard.ts';
import { storedFileContentsOf }                   from '../../../src/testing/TrackerFileFixtures.ts';
import { runCommandLine }                         from '../../Main.ts';
import { createCapturedCommandContext }           from '../../testing/CapturedCommandContext.ts';
import { createInitializedRecordedGitRepository } from '../../testing/InitializedScratchRepository.ts';
import { REFRESH_OF_AN_IGNORING_REPOSITORY }      from '../../testing/RecordedGitStages.ts';

const FROZEN_NOW = new Date('2026-09-18T20:11:03Z');

const REFRESH_LINE_PATTERNS = [
  new RegExp(`^ {2}brief: {7}unchanged \\(\\S+/${RegExp.escape(PRODUCT_NAMES.DATA_FOLDER)}/session-instructions\\.md\\)$`, 'm'),
  /^ {2}hooks: {7}\S+\/\.claude\/settings\.local\.json \(unchanged\)$/m,
  new RegExp(`^ {2}worktrees: {3}${RegExp.escape(PRODUCT_NAMES.WORKTREES_FOLDER)} already ignored, so nothing was added$`, 'm'),
];

let repositoryDirectory = '';

async function run(commandLineArguments: readonly string[]): Promise<ReturnType<typeof createCapturedCommandContext>> {
  const context  = createCapturedCommandContext({ currentDirectory: repositoryDirectory, now: () => FROZEN_NOW });
  const stage = commandLineArguments[0] === 'update' ? REFRESH_OF_AN_IGNORING_REPOSITORY : [];
  const exitCode = await recordedGit.playStage(stage, async () => runCommandLine(commandLineArguments, context));
  expect(exitCode, `\`agent-progress ${commandLineArguments.join(' ')}\` failed: ${context.errorText()}`).toBe(0);
  return context;
}

const recordedGit = useRecordedGit();

beforeEach(async () => {
  repositoryDirectory = await createInitializedRecordedGitRepository('update-command-tracker-untouched', ['--project', 'Example Agency'], () => FROZEN_NOW, recordedGit);
  await run(['ticket', 'add', 'Example importer', '--type', 'ticket', '--at', '2026-09-18T09:00:00+02:00']);
  await run(['task', 'add', 'Example page', '--at', '2026-09-18T09:05:00+02:00']);
  await run(['log', 'Example note', '--at', '2026-09-18T09:10:00+02:00']);
});

afterEach(() => {
  removeScratchDirectory(repositoryDirectory);
});

describeWhenGitIsRecorded('update on a tracker', () => {
  test('leaves every tracker file byte for byte and prints each refresh line', async () => {
    const filesBefore = storedFileContentsOf(workspacePathsFor(repositoryDirectory));

    const context = await run(['update']);

    expect(storedFileContentsOf(workspacePathsFor(repositoryDirectory))).toEqual(filesBefore);
    expect(context.outputText())
      .toMatch(new RegExp(`^Refreshed what ${RegExp.escape(PRODUCT_NAMES.PROGRAM)} manages in \\S+; the tracker itself was not touched\\.\\n`));
    for (const refreshLinePattern of REFRESH_LINE_PATTERNS) expect(context.outputText()).toMatch(refreshLinePattern);
    expect(context.errorText()).toBe('');
  });

  test('takes every current option, each leaving its own file alone and the tracker byte for byte', async () => {
    const filesBefore = storedFileContentsOf(workspacePathsFor(repositoryDirectory));
    const optionsWithTheirLines: Array<[optionArguments: string[], line: string]> = [
      [['--no-hooks'], '  hooks:       left alone (--no-hooks)'],
    ];

    for (const [optionArguments, line] of optionsWithTheirLines) {
      const context = await run(['update', ...optionArguments]);
      expect(context.outputText(), optionArguments.join(' ')).toContain(line);
    }
    const everyOption = await run(['update', ...new Set(optionsWithTheirLines.flatMap(([optionArguments]) => optionArguments))]);
    for (const [, line] of optionsWithTheirLines) expect(everyOption.outputText()).toContain(line);
    expect(storedFileContentsOf(workspacePathsFor(repositoryDirectory))).toEqual(filesBefore);
  });
});
