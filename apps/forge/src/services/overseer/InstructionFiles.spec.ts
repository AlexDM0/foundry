/**
 * Which instruction files a launch reads, in which order, and what Customs V11 protects. What matters: a role's list is read in entry
 * order; a `constitution` entry is the pipeline's constitution path or the installed default; a `default-brief` entry is that role's
 * installed default; an absent list is the role's default list; an empty list reads the role's built-in brief, which every role has; each
 * job role reads its own role's list, an Airlock agent the list of the role it stands in for; one missing file refuses the whole reading;
 * a job of an entity reads its entity's list and constitution, a job without one the forge's own, and a job of an entity the pipeline no
 * longer holds the installed defaults; and V11 protects every tracked path any role's resolved list names, each entity's too. Main's
 * `CONSTITUTION.md`, or an entity's constitution by its path, is read with its blob id from one commit of the main line, absent when that
 * commit holds none or when the main line is checked out with no commit yet, and unreadable, never absent, when any other main line does
 * not resolve. Data-folder files are read from disk; a tracked path is asked of git, which answers
 * from the recorded answers of `src/testing/RecordedGit.ts`.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from 'node:fs';
import { dirname, join } from 'node:path';

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test
} from 'bun:test';

import type { Job }                                               from '../../lib/tracker-model/@types/Job.ts';
import { PIPELINE_AGENT_ROLES, type Pipeline }                    from '../../lib/tracker-model/@types/Pipeline.ts';
import type { PipelineAgentRole }                                 from '../../lib/tracker-model/@types/Pipeline.ts';
import { PRODUCT_NAMES }                                          from '../../shared/constants/ProductNames.ts';
import { GIT_CALL_SHAPES, RECORDED_PLACEHOLDERS, useRecordedGit } from '../../testing/RecordedGit.ts';
import { createScratchDirectory, removeScratchDirectory }         from '../../testing/ScratchWorkspace.ts';
import { describeWhenGitIsRecorded }                              from '../../testing/ToolGuard.ts';
import {
  CONSTITUTION_DEFAULT_PATH,
  InstructionFiles,
  builtInBriefPathOf,
  defaultInstructionPathOf
} from './InstructionFiles.ts';

const recordedGit = useRecordedGit();

const MAIN_LINE = 'main';

const EXAMPLE_NOTES_PATH = `${PRODUCT_NAMES.DATA_FOLDER}/example-notes.md`;

const MINIMAL_PIPELINE: Pipeline = {
  version: 3, prepare: [], gates: [], phases: { build: [], review: [], merge: [] }
};

const ENTITY_CONSTITUTION_PATH = 'apps/gaia/CONSTITUTION.md';

/** A forge with one entity whose builder reads its own constitution and a notes file, beside the forge's own empty steps. */
const ENTITIES_PIPELINE: Pipeline = {
  ...MINIMAL_PIPELINE,
  entities: {
    gaia: {
      kind:         'app',
      home:         ['/apps/gaia'],
      constitution: { path: ENTITY_CONSTITUTION_PATH },
      prepare:      [],
      gates:        [],
      phases:       { build: [], review: [], merge: [] },
      agents:       { builder: { instructions: [{ kind: 'constitution' }, { kind: 'file', path: 'apps/gaia/docs/example-notes.md' }] } },
    },
  },
};

let repositoryDirectory = '';

function jobOf(kind: string, role: Job['role'], entity?: string): Readonly<Job> {
  return {
    id: 'J7', kind, role, ticketIds: ['012'], attempt: 1, ...entity === undefined ? {} : { entity, stage: 1 }
  } as unknown as Readonly<Job>;
}

function writeDataFolderFile(path: string, text: string): void {
  mkdirSync(dirname(join(repositoryDirectory, path)), { recursive: true });
  writeFileSync(join(repositoryDirectory, path), text);
}

/** Each installed default holds its own name, so a reading shows which files it took and in which order. */
function writeEveryDefault(): void {
  writeDataFolderFile(CONSTITUTION_DEFAULT_PATH, 'constitution default\n');
  for (const role of PIPELINE_AGENT_ROLES) writeDataFolderFile(defaultInstructionPathOf(role), `${role} default\n`);
}

function pathsReadFor(pipeline: Pipeline | null, job: Readonly<Job>): string[] {
  const reading = InstructionFiles.readingFor(repositoryDirectory, MAIN_LINE, pipeline, job);
  if (reading.verdict !== 'read') throw new Error(`the reading was ${reading.verdict} of ${reading.path}`);
  return reading.files.map((file) => file.path);
}

function pipelineWithList(role: PipelineAgentRole, instructions: NonNullable<NonNullable<Pipeline['agents']>[PipelineAgentRole]>['instructions']): Pipeline {
  return { ...MINIMAL_PIPELINE, agents: { [role]: { instructions } } };
}

beforeEach(() => {
  repositoryDirectory = createScratchDirectory('instruction-files');
  writeEveryDefault();
});

afterEach(() => {
  removeScratchDirectory(repositoryDirectory);
});

describe('the role whose list a job reads', () => {
  test('each job role reads its own list, a build and a review by their kind where no role is stored', () => {
    expect([
      InstructionFiles.instructionRoleOf(jobOf('build', 'builder')),
      InstructionFiles.instructionRoleOf(jobOf('build', null)),
      InstructionFiles.instructionRoleOf(jobOf('review', 'reviewer')),
      InstructionFiles.instructionRoleOf(jobOf('review', 're-reviewer')),
      InstructionFiles.instructionRoleOf(jobOf('review', null)),
      InstructionFiles.instructionRoleOf(jobOf('product-owner', 'product-owner')),
      InstructionFiles.instructionRoleOf(jobOf('pipeline-agent', 'pipeline-agent')),
      InstructionFiles.instructionRoleOf(jobOf('assistant', 'assistant')),
    ]).toEqual(['builder', 'builder', 'reviewer', 'reReviewer', 'reviewer', 'productOwner', 'pipelineAgent', 'assistant']);
  });

  test('an Airlock agent reads the list of the role it stands in for, and a job that runs no agent reads none', () => {
    expect([
      InstructionFiles.instructionRoleOf(jobOf('merge-agent', 'builder')),
      InstructionFiles.instructionRoleOf(jobOf('merge-agent', 'reviewer')),
      InstructionFiles.instructionRoleOf(jobOf('merge-agent', 're-reviewer')),
      InstructionFiles.instructionRoleOf(jobOf('merge-agent', 'conflict-re-reviewer')),
      InstructionFiles.instructionRoleOf(jobOf('merge', null)),
    ]).toEqual(['builder', 'reviewer', 'reReviewer', 'conflictReReviewer', null]);
  });
});

describe('the files a reading takes', () => {
  test('an absent list is the role\'s default list: the re-reviewers read the constitution, the reviewer\'s default, then their own', () => {
    expect(pathsReadFor(MINIMAL_PIPELINE, jobOf('review', 're-reviewer'))).toEqual([
      CONSTITUTION_DEFAULT_PATH, defaultInstructionPathOf('reviewer'), defaultInstructionPathOf('reReviewer'),
    ]);
    expect(pathsReadFor(null, jobOf('merge-agent', 'conflict-re-reviewer'))).toEqual([
      CONSTITUTION_DEFAULT_PATH, defaultInstructionPathOf('reviewer'), defaultInstructionPathOf('conflictReReviewer'),
    ]);
    expect(pathsReadFor(null, jobOf('build', 'builder'))).toEqual([CONSTITUTION_DEFAULT_PATH, defaultInstructionPathOf('builder')]);
    expect(pathsReadFor(null, jobOf('assistant', 'assistant'))).toEqual([defaultInstructionPathOf('assistant')]);
  });

  test('a list is read in entry order, a default-brief entry naming any role\'s installed default, and the texts join in that order', () => {
    writeDataFolderFile(EXAMPLE_NOTES_PATH, 'example notes\n');
    const pipeline = pipelineWithList('reReviewer', [
      { kind: 'file', path: EXAMPLE_NOTES_PATH },
      { kind: 'default-brief', role: 'reReviewer' },
      { kind: 'constitution' },
      { kind: 'default-brief', role: 'builder' },
    ]);
    const reading = InstructionFiles.readingFor(repositoryDirectory, MAIN_LINE, pipeline, jobOf('review', 're-reviewer'));

    expect(reading.verdict === 'read' ? reading.text : reading.verdict).toBe('example notes\n\nreReviewer default\n\nconstitution default\n\nbuilder default\n');
    expect(pathsReadFor(pipeline, jobOf('review', 'reviewer'))).toEqual([CONSTITUTION_DEFAULT_PATH, defaultInstructionPathOf('reviewer')]);
  });

  test('an empty list reads the role\'s built-in brief, and records no file of the board', () => {
    const reading = InstructionFiles.readingFor(repositoryDirectory, MAIN_LINE, pipelineWithList('builder', []), jobOf('build', 'builder'));

    expect(reading).toEqual({ verdict: 'read', text: readFileSync(builtInBriefPathOf('builder'), 'utf8'), files: [] });
  });

  test('every role has a built-in brief that names its role', () => {
    const missing = PIPELINE_AGENT_ROLES.filter((role) => !existsSync(builtInBriefPathOf(role)));

    expect(missing).toEqual([]);
    expect(builtInBriefPathOf('conflictReReviewer').endsWith(join('resources', 'prompts', 'BuiltInBriefConflictReReviewer.md'))).toBe(true);
    const roleWordOfRole: Readonly<Record<PipelineAgentRole, string>> = {
      productOwner:       'product owner',
      builder:            'builder',
      reviewer:           'reviewer',
      reReviewer:         're-reviewer',
      conflictReReviewer: 'conflict re-reviewer',
      pipelineAgent:      'pipeline agent',
      assistant:          'Assistant',
    };
    const briefsNotNamingTheirRole = PIPELINE_AGENT_ROLES
      .filter((role) => !readFileSync(builtInBriefPathOf(role), 'utf8').startsWith(`You are the ${roleWordOfRole[role]} `));
    expect(briefsNotNamingTheirRole).toEqual([]);
  });

  test('one missing file refuses the whole reading, naming it, though the files around it exist', () => {
    const pipeline = pipelineWithList('builder', [
      { kind: 'constitution' },
      { kind: 'file', path: EXAMPLE_NOTES_PATH },
      { kind: 'default-brief', role: 'builder' },
    ]);

    expect(InstructionFiles.readingFor(repositoryDirectory, MAIN_LINE, pipeline, jobOf('build', 'builder')))
      .toEqual({ verdict: 'instructions-missing', path: EXAMPLE_NOTES_PATH });
  });
});

describeWhenGitIsRecorded('a constitution entry', () => {
  test('resolves to the pipeline\'s constitution path, read from the main line, and to the installed default where it names none', async () => {
    const pipeline: Pipeline = { ...MINIMAL_PIPELINE, constitution: { path: 'CONSTITUTION.md' } };
    const shown = {
      gitArguments: ['show', `${MAIN_LINE}:CONSTITUTION.md`],
      answeredAs:   GIT_CALL_SHAPES.FILE_ON_BRANCH,
      filledIn:     { [RECORDED_PLACEHOLDERS.TEXT]: 'Example constitution.' },
    };
    const paths = await recordedGit.playStage([shown], async () => pathsReadFor(pipeline, jobOf('build', 'builder')));

    expect(paths).toEqual(['CONSTITUTION.md', defaultInstructionPathOf('builder')]);
    expect(pathsReadFor(MINIMAL_PIPELINE, jobOf('build', 'builder'))).toEqual([CONSTITUTION_DEFAULT_PATH, defaultInstructionPathOf('builder')]);
  });
});

describeWhenGitIsRecorded('a job of an entity', () => {
  test('reads its entity\'s list and constitution from the main line, and a job without an entity reads the forge\'s own', async () => {
    const shownFile = (path: string) => ({
      gitArguments: ['show', `${MAIN_LINE}:${path}`],
      answeredAs:   GIT_CALL_SHAPES.FILE_ON_BRANCH,
      filledIn:     { [RECORDED_PLACEHOLDERS.TEXT]: `Example text of ${path}.` },
    });
    const entityPaths = await recordedGit.playStage(
      [shownFile(ENTITY_CONSTITUTION_PATH), shownFile('apps/gaia/docs/example-notes.md')],
      async () => pathsReadFor(ENTITIES_PIPELINE, jobOf('build', 'builder', 'gaia')),
    );

    expect(entityPaths).toEqual([ENTITY_CONSTITUTION_PATH, 'apps/gaia/docs/example-notes.md']);
    expect(pathsReadFor(ENTITIES_PIPELINE, jobOf('build', 'builder'))).toEqual([CONSTITUTION_DEFAULT_PATH, defaultInstructionPathOf('builder')]);
  });

  test('of an entity the pipeline no longer holds reads the installed defaults', () => {
    expect(pathsReadFor(ENTITIES_PIPELINE, jobOf('build', 'builder', 'example-removed'))).toEqual([
      CONSTITUTION_DEFAULT_PATH, defaultInstructionPathOf('builder'),
    ]);
  });
});

describeWhenGitIsRecorded('main\'s CONSTITUTION.md', () => {
  const MAIN_TIP = '1'.repeat(40);
  const BLOB = '2'.repeat(40);
  const tipRead = {
    gitArguments: ['rev-parse', '--verify', '--quiet', '--end-of-options', `${MAIN_LINE}^{commit}`],
    answeredAs:   GIT_CALL_SHAPES.BRANCH_COMMIT_RESOLVED,
    filledIn:     { [RECORDED_PLACEHOLDERS.COMMIT]: MAIN_TIP },
  };
  const blobArguments = ['rev-parse', '--verify', '--quiet', '--end-of-options', `${MAIN_TIP}:CONSTITUTION.md`];

  test('is its text and its blob id, both read from the main line\'s tip', async () => {
    const reading = await recordedGit.playStage([
      tipRead,
      { gitArguments: blobArguments, answeredAs: GIT_CALL_SHAPES.BLOB_OF_A_PATH, filledIn: { [RECORDED_PLACEHOLDERS.BLOB]: BLOB } },
      {
        gitArguments: ['show', `${MAIN_TIP}:CONSTITUTION.md`],
        answeredAs:   GIT_CALL_SHAPES.FILE_ON_BRANCH,
        filledIn:     { [RECORDED_PLACEHOLDERS.TEXT]: '# Example Agency' },
      },
    ], async () => InstructionFiles.mainConstitutionOf(repositoryDirectory, MAIN_LINE));

    expect(reading).toEqual({ verdict: 'read', constitution: { path: 'CONSTITUTION.md', markdown: '# Example Agency\n', blob: BLOB } });
  });

  test('of an entity is read by its path and named by it', async () => {
    const reading = await recordedGit.playStage([
      tipRead,
      {
        gitArguments: ['rev-parse', '--verify', '--quiet', '--end-of-options', `${MAIN_TIP}:${ENTITY_CONSTITUTION_PATH}`],
        answeredAs:   GIT_CALL_SHAPES.BLOB_OF_A_PATH,
        filledIn:     { [RECORDED_PLACEHOLDERS.BLOB]: BLOB },
      },
      {
        gitArguments: ['show', `${MAIN_TIP}:${ENTITY_CONSTITUTION_PATH}`],
        answeredAs:   GIT_CALL_SHAPES.FILE_ON_BRANCH,
        filledIn:     { [RECORDED_PLACEHOLDERS.TEXT]: '# Gaia' },
      },
    ], async () => InstructionFiles.mainConstitutionOf(repositoryDirectory, MAIN_LINE, ENTITY_CONSTITUTION_PATH));

    expect(reading).toEqual({ verdict: 'read', constitution: { path: ENTITY_CONSTITUTION_PATH, markdown: '# Gaia\n', blob: BLOB } });
  });

  test('is absent when the tip holds no such file, and unreadable when the main line does not resolve and is not checked out', async () => {
    const readMain = async () => InstructionFiles.mainConstitutionOf(repositoryDirectory, MAIN_LINE);
    const absent = await recordedGit.playStage([tipRead, { gitArguments: blobArguments, answeredAs: GIT_CALL_SHAPES.BLOB_OF_A_MISSING_PATH }], readMain);
    const otherBranchRead = {
      gitArguments: ['symbolic-ref', '--quiet', '--short', 'HEAD'],
      answeredAs:   GIT_CALL_SHAPES.CURRENT_BRANCH,
      filledIn:     { [RECORDED_PLACEHOLDERS.BRANCH]: 'example-feature' },
    };
    const missingTipRead = { ...tipRead, answeredAs: GIT_CALL_SHAPES.RESOLVED_MISSING_REVISION };
    const unresolved = await recordedGit.playStage([missingTipRead, otherBranchRead], readMain);

    expect(absent).toEqual({ verdict: 'absent' });
    expect(unresolved.verdict).toBe('unreadable');
  });

  test('is absent when the main line is checked out with no commit yet, and unreadable when another unborn branch is checked out', async () => {
    const readMain = async () => InstructionFiles.mainConstitutionOf(repositoryDirectory, MAIN_LINE);
    const unbornTipRead = { gitArguments: tipRead.gitArguments, answeredAs: GIT_CALL_SHAPES.UNBORN_BRANCH_COMMIT_UNRESOLVED };
    const headArguments = ['symbolic-ref', '--quiet', '--short', 'HEAD'];
    const headRead = (branch: string) => ({ gitArguments: headArguments, answeredAs: GIT_CALL_SHAPES.CURRENT_UNBORN_BRANCH, filledIn: { [RECORDED_PLACEHOLDERS.BRANCH]: branch } });
    const unborn = await recordedGit.playStage([unbornTipRead, headRead(MAIN_LINE)], readMain);
    const otherBranch = await recordedGit.playStage([unbornTipRead, headRead('example-feature')], readMain);

    expect(unborn).toEqual({ verdict: 'absent' });
    expect(otherBranch.verdict).toBe('unreadable');
  });
});

describe('the tracked files Customs V11 protects', () => {
  test('every tracked path any role\'s resolved list names, the constitution\'s path once, and no data-folder file', () => {
    const pipeline: Pipeline = {
      ...MINIMAL_PIPELINE,
      constitution: { path: 'CONSTITUTION.md' },
      agents:       {
        reReviewer:         { instructions: [{ kind: 'file', path: 'docs/example-re-review.md' }, { kind: 'constitution' }] },
        conflictReReviewer: { instructions: [{ kind: 'file', path: 'docs/example-merge.md' }, { kind: 'file', path: EXAMPLE_NOTES_PATH }] },
        builder:            { instructions: [] },
      },
    };

    expect(InstructionFiles.trackedInstructionPathsOf(pipeline).sort()).toEqual(['CONSTITUTION.md', 'docs/example-merge.md', 'docs/example-re-review.md']);
    expect(InstructionFiles.trackedInstructionPathsOf(null)).toEqual([]);
    expect(InstructionFiles.trackedInstructionPathsOf(MINIMAL_PIPELINE)).toEqual([]);
  });

  test('each entity\'s constitution and listed files beside the forge\'s own', () => {
    expect(InstructionFiles.trackedInstructionPathsOf(ENTITIES_PIPELINE).sort()).toEqual([ENTITY_CONSTITUTION_PATH, 'apps/gaia/docs/example-notes.md']);
  });
});
