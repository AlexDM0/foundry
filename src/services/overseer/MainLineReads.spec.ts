/**
 * The main line reads a state read keeps across calls. What matters: a tracked text and main's constitution are asked of git once per
 * main tip, and a moved tip asks again; a git that could not be started is not kept, so the next read asks again; a data-folder file is
 * read from disk on each read, so an edit shows at the next read. Git answers from the recorded answers of `src/testing/RecordedGit.ts`,
 * and a stage fails a call it does not hold, which counts the calls.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join }                     from 'node:path';
import {
  afterEach,
  beforeEach,
  expect,
  spyOn
} from 'bun:test';

import { GitProcess }                                             from '../../lib/git/GitProcess.ts';
import { PRODUCT_NAMES }                                          from '../../shared/constants/ProductNames.ts';
import { GIT_CALL_SHAPES, RECORDED_PLACEHOLDERS, useRecordedGit } from '../../testing/RecordedGit.ts';
import { createScratchDirectory, removeScratchDirectory }         from '../../testing/ScratchWorkspace.ts';
import { testWhenGitIsRecorded }                                  from '../../testing/ToolGuard.ts';
import { MainLineReads }                                          from './MainLineReads.ts';

const MAIN_TIP = '2'.repeat(40);
const LATER_MAIN_TIP = '3'.repeat(40);
const BLOB = 'b'.repeat(40);
const BRIEF_PATH = 'docs/example-brief.md';

const recordedGit = useRecordedGit();

let repositoryDirectory = '';

beforeEach(() => {
  repositoryDirectory = createScratchDirectory('main-line-reads');
});

afterEach(() => {
  removeScratchDirectory(repositoryDirectory);
});

function briefShownAt(mainTip: string) {
  return {
    gitArguments: ['show', `${mainTip}:${BRIEF_PATH}`],
    answeredAs:   GIT_CALL_SHAPES.FILE_ON_BRANCH,
    filledIn:     { [RECORDED_PLACEHOLDERS.TEXT]: 'Example brief.' },
  };
}

testWhenGitIsRecorded('a tracked text is shown once per main tip, and again once the tip moved', async () => {
  const reads = new MainLineReads(repositoryDirectory);

  const first = await recordedGit.playStage([briefShownAt(MAIN_TIP)], async () => reads.textAt(MAIN_TIP, BRIEF_PATH));
  const again = await recordedGit.playStage([], async () => reads.textAt(MAIN_TIP, BRIEF_PATH));
  const moved = await recordedGit.playStage([briefShownAt(LATER_MAIN_TIP)], async () => reads.textAt(LATER_MAIN_TIP, BRIEF_PATH));

  expect([first, again, moved]).toEqual(['Example brief.\n', 'Example brief.\n', 'Example brief.\n']);
});

testWhenGitIsRecorded('a tracked text git could not be shown is not kept, so the next read at the same tip asks git again', async () => {
  const reads = new MainLineReads(repositoryDirectory);
  spyOn(GitProcess, 'run').mockImplementationOnce(() => null);

  const unstarted = await recordedGit.playStage([], async () => reads.textAt(MAIN_TIP, BRIEF_PATH));
  const again = await recordedGit.playStage([briefShownAt(MAIN_TIP)], async () => reads.textAt(MAIN_TIP, BRIEF_PATH));

  expect([unstarted, again]).toEqual([null, 'Example brief.\n']);
});

testWhenGitIsRecorded('main\'s constitution is read once per main tip', async () => {
  const reads = new MainLineReads(repositoryDirectory);
  const constitutionRead = [
    {
      gitArguments: ['rev-parse', '--verify', '--quiet', '--end-of-options', `${MAIN_TIP}:CONSTITUTION.md`],
      answeredAs:   GIT_CALL_SHAPES.BLOB_OF_A_PATH,
      filledIn:     { [RECORDED_PLACEHOLDERS.BLOB]: BLOB },
    },
    {
      gitArguments: ['show', `${MAIN_TIP}:CONSTITUTION.md`],
      answeredAs:   GIT_CALL_SHAPES.FILE_ON_BRANCH,
      filledIn:     { [RECORDED_PLACEHOLDERS.TEXT]: '# Example Agency' },
    },
  ];

  const first = await recordedGit.playStage(constitutionRead, async () => reads.mainConstitutionAt(MAIN_TIP));
  const again = await recordedGit.playStage([], async () => reads.mainConstitutionAt(MAIN_TIP));

  expect(again).toEqual(first);
  expect(first).toEqual({ verdict: 'read', constitution: { path: 'CONSTITUTION.md', markdown: '# Example Agency\n', blob: BLOB } });
});

testWhenGitIsRecorded('a data-folder file is read from disk on each read, with no git', async () => {
  const reads = new MainLineReads(repositoryDirectory);
  const notesPath = `${PRODUCT_NAMES.DATA_FOLDER}/briefs/example-notes.md`;
  mkdirSync(join(repositoryDirectory, PRODUCT_NAMES.DATA_FOLDER, 'briefs'), { recursive: true });
  writeFileSync(join(repositoryDirectory, notesPath), 'First notes.\n');

  const first = await recordedGit.playStage([], async () => reads.textAt(MAIN_TIP, notesPath));
  writeFileSync(join(repositoryDirectory, notesPath), 'Edited notes.\n');
  const edited = await recordedGit.playStage([], async () => reads.textAt(MAIN_TIP, notesPath));

  expect([first, edited]).toEqual(['First notes.\n', 'Edited notes.\n']);
});
