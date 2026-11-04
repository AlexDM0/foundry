/**
 * What a session is told comes from the pipeline's instruction files, read by the Overseer at launch. What matters: a builder's first
 * message holds the constitution files, then its own array's files, in array order, each asked of git as the main line holds it; the
 * data-folder default is read from disk and filled; each file read leaves its content hash; and one missing file, named or default, refuses
 * the launch naming it. Git answers from the recorded answers of `src/testing/RecordedGit.ts`, and a git call with no recorded answer fails
 * the case.
 */
import { createHash }               from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join }            from 'node:path';

import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';


import type { Job }                                               from '../../src/lib/tracker-model/@types/Job.ts';
import type { Pipeline }                                          from '../../src/lib/tracker-model/@types/Pipeline.ts';
import type { JobLaunchFacts }                                    from '../../src/services/overseer/DrivePass.ts';
import { InstructionFiles, defaultInstructionPathOf }             from '../../src/services/overseer/InstructionFiles.ts';
import { PRODUCT_NAMES }                                          from '../../src/shared/constants/ProductNames.ts';
import { GIT_CALL_SHAPES, RECORDED_PLACEHOLDERS, useRecordedGit } from '../../src/testing/RecordedGit.ts';
import type { RecordedGitStep }                                   from '../../src/testing/RecordedGit.ts';
import { createScratchDirectory, removeScratchDirectory }         from '../../src/testing/ScratchWorkspace.ts';
import { describeWhenGitIsRecorded }                              from '../../src/testing/ToolGuard.ts';
import { OverseerWording }                                        from './OverseerWording.ts';

const recordedGit = useRecordedGit();

const BUILD_JOB = {
  id: 'J4', kind: 'build', role: 'builder', ticketIds: ['012'], attempt: 1
} as unknown as Readonly<Job>;

const BUILDER_DEFAULT = 'Build ticket #{{ticketId}} as job {{jobId}}: {{ticketTitle}}.\n';

const PIPELINE: Pipeline = {
  prepare:      [],
  gates:        [],
  constitution: ['example-constitution.md', 'example-style.md'],
  agents:       { builder: [defaultInstructionPathOf('builder'), 'example-builder-extra.md'] },
};

const MAIN_LINE = 'master';

const MAIN_LINE_TEXTS = {
  'example-constitution.md':  'Main line rule: name things fully.\n',
  'example-style.md':         'Main line style: one purpose per file.\n',
  'example-builder-extra.md': 'Main line extra: run the example checks.\n',
} as const;

let repositoryDirectory = '';

/** The main line's version of `path`, as `git show` prints a file byte for byte. */
function shownOnTheMainLine(path: keyof typeof MAIN_LINE_TEXTS): RecordedGitStep {
  return {
    gitArguments: ['show', `${MAIN_LINE}:${path}`],
    answeredAs:   GIT_CALL_SHAPES.FILE_ON_BRANCH,
    filledIn:     { [RECORDED_PLACEHOLDERS.TEXT]: MAIN_LINE_TEXTS[path].trimEnd() },
  };
}

function missingOnTheMainLine(path: string): RecordedGitStep {
  return {
    gitArguments: ['show', `${MAIN_LINE}:${path}`],
    answeredAs:   GIT_CALL_SHAPES.FILE_NOT_ON_BRANCH,
    filledIn:     { [RECORDED_PLACEHOLDERS.BRANCH]: MAIN_LINE, [RECORDED_PLACEHOLDERS.PATH]: path },
  };
}

/** The tracked files `PIPELINE` names for a builder, in the order a launch reads them. */
const PIPELINE_SHOWS = [shownOnTheMainLine('example-constitution.md'), shownOnTheMainLine('example-style.md'), shownOnTheMainLine('example-builder-extra.md')];

function contentHashOf(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

function writeDataFolderFile(path: string, text: string): void {
  mkdirSync(dirname(join(repositoryDirectory, path)), { recursive: true });
  writeFileSync(join(repositoryDirectory, path), text);
}

function factsWith(instructions: string): JobLaunchFacts {
  return {
    tickets:                [{ id: '012', title: 'Example basket total', body: '## Acceptance\nA1. Example basket adds up.\n' }],
    checksLine:             null,
    gates:                  null,
    earlierSessionReplaced: false,
    intake:                 null,
    airlock:                null,
    assistant:              null,
    instructions,
    confinement:            'confined',
  };
}

beforeEach(() => {
  repositoryDirectory = createScratchDirectory('instruction-files');
  writeDataFolderFile(defaultInstructionPathOf('builder'), BUILDER_DEFAULT);
});

afterEach(() => {
  removeScratchDirectory(repositoryDirectory);
});

describeWhenGitIsRecorded('the instruction files a launch reads', () => {
  test('a builder\'s first message holds the constitution files then its own, in array order, as the main line holds them', async () => {
    const reading = await recordedGit.playStage(PIPELINE_SHOWS, async () => InstructionFiles.readingFor(repositoryDirectory, MAIN_LINE, PIPELINE, BUILD_JOB));
    if (reading.verdict !== 'read') throw new Error(`the reading was ${reading.verdict}`);
    const { firstMessage } = OverseerWording.launchTextOf(BUILD_JOB, factsWith(reading.text));
    const parts = [
      'Main line rule: name things fully.',
      'Main line style: one purpose per file.',
      'Build ticket #012 as job J4: Example basket total.',
      'Main line extra: run the example checks.',
    ];
    const positions = parts.map((part) => firstMessage.indexOf(part));

    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  test('each file read leaves its path and the content hash of the version it was given', async () => {
    const reading = await recordedGit.playStage(PIPELINE_SHOWS, async () => InstructionFiles.readingFor(repositoryDirectory, MAIN_LINE, PIPELINE, BUILD_JOB));

    expect(reading.verdict === 'read' ? reading.files : []).toEqual([
      { path: 'example-constitution.md', contentHash: contentHashOf('Main line rule: name things fully.\n') },
      { path: 'example-style.md', contentHash: contentHashOf('Main line style: one purpose per file.\n') },
      { path: defaultInstructionPathOf('builder'), contentHash: contentHashOf(BUILDER_DEFAULT) },
      { path: 'example-builder-extra.md', contentHash: contentHashOf('Main line extra: run the example checks.\n') },
    ]);
  });

  test('a named file the main line lacks refuses the launch naming it', async () => {
    const pipeline: Pipeline = { ...PIPELINE, agents: { builder: ['example-builder-extra.md', 'example-branch-only.md'] } };
    const stage = [...PIPELINE_SHOWS, missingOnTheMainLine('example-branch-only.md')];
    const reading = await recordedGit.playStage(stage, async () => InstructionFiles.readingFor(repositoryDirectory, MAIN_LINE, pipeline, BUILD_JOB));

    expect(reading).toEqual({ verdict: 'instructions-missing', path: 'example-branch-only.md' });
  });

  test('with no pipeline stored a missing default refuses too, and a path leaving the repository is read as missing, asking git nothing', async () => {
    const constitutionDefault = `${dirname(defaultInstructionPathOf('builder'))}/constitution.md`;
    const leaving: Pipeline = { ...PIPELINE, constitution: ['../example-outside.md'] };
    const readings = await recordedGit.playStage([], async () => [
      InstructionFiles.readingFor(repositoryDirectory, MAIN_LINE, null, BUILD_JOB),
      InstructionFiles.readingFor(repositoryDirectory, MAIN_LINE, leaving, BUILD_JOB),
    ]);

    expect(readings).toEqual([{ verdict: 'instructions-missing', path: constitutionDefault }, { verdict: 'instructions-missing', path: '../example-outside.md' }]);
  });

  test('a data-folder entry climbing out through backslashes is read as missing, though this host could read it as one file name', async () => {
    const climbing = `${PRODUCT_NAMES.DATA_FOLDER}/..\\..\\example-outside.md`;
    writeDataFolderFile(climbing, 'Outside the data folder on Windows.\n');
    const pipeline: Pipeline = { ...PIPELINE, constitution: [climbing] };
    const reading = await recordedGit.playStage([], async () => InstructionFiles.readingFor(repositoryDirectory, MAIN_LINE, pipeline, BUILD_JOB));

    expect(reading).toEqual({ verdict: 'instructions-missing', path: climbing });
  });
});

describeWhenGitIsRecorded('a git call with no recorded answer', () => {
  test.failing('fails the case: the stage lacks the last show the launch asks for', async () => {
    const stageWithoutTheLastShow = PIPELINE_SHOWS.slice(0, -1);
    await recordedGit.playStage(stageWithoutTheLastShow, async () => InstructionFiles.readingFor(repositoryDirectory, MAIN_LINE, PIPELINE, BUILD_JOB));
  });
});
