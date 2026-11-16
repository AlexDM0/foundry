/**
 * A tracker in a project folder below its repository's root reads its own instruction files, never the root's (Part B spec 4). What
 * matters: a tracked instruction file, the constitution and the managed block's `CLAUDE.md` are asked of git at the repository's root by
 * their path through the project's folder; a data-folder file is read from the project's own data folder; the constitution keeps its
 * project path; the tracked instruction files Customs V11 protects are repository paths through the project's folder, so they meet git's
 * paths; tree findings name only the project's files; and a tracker at its repository's root asks git exactly as before. Each
 * repository is a scratch folder with a `.git` folder, laid out as the two-tracker fixture's; git answers from the recorded answers of
 * `src/testing/RecordedGit.ts`.
 */
import { mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { join }                                   from 'node:path';

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test
} from 'bun:test';

import type { Job }                                                   from '../../lib/tracker-model/@types/Job.ts';
import type { Pipeline }                                              from '../../lib/tracker-model/@types/Pipeline.ts';
import { PRODUCT_NAMES }                                              from '../../shared/constants/ProductNames.ts';
import { createPlantedRepository }                                    from '../../testing/RecordedAirlockGit.ts';
import { GIT_CALL_SHAPES, RECORDED_PLACEHOLDERS, useRecordedGit }     from '../../testing/RecordedGit.ts';
import { removeScratchDirectory }                                     from '../../testing/ScratchWorkspace.ts';
import { describeWhenGitIsRecorded }                                  from '../../testing/ToolGuard.ts';
import { TWO_TRACKER_PROJECTS }                                       from '../../testing/TwoTrackerFixture.ts';
import { TreePortability }                                            from '../lifecycle/TreePortability.ts';
import { CONSTITUTION_FILE_PATH, InstructionFiles, type ProjectFile } from './InstructionFiles.ts';
import { MainLineReads }                                              from './MainLineReads.ts';

const recordedGit = useRecordedGit();

const MAIN_LINE = 'main';
const MAIN_TIP = '1'.repeat(40);
const BLOB = '2'.repeat(40);
const PROJECT_FOLDER = TWO_TRACKER_PROJECTS.FORGE.folder;
const DATA_FOLDER_NOTES_PATH = `${PRODUCT_NAMES.DATA_FOLDER}/example-notes.md`;

const MINIMAL_PIPELINE: Pipeline = {
  version: 3, prepare: [], gates: [], phases: { build: [], review: [], merge: [] }
};

let repository = '';
let repositoryRoot = '';
let projectDirectory = '';

beforeEach(() => {
  repository = createPlantedRepository('instruction-files-project');
  repositoryRoot = realpathSync(repository);
  projectDirectory = join(repository, PROJECT_FOLDER);
  mkdirSync(join(projectDirectory, PRODUCT_NAMES.DATA_FOLDER), { recursive: true });
});

afterEach(() => {
  removeScratchDirectory(repository);
});

function builderJob(): Readonly<Job> {
  return {
    id: 'J7', kind: 'build', role: 'builder', ticketIds: ['012'], attempt: 1
  } as unknown as Readonly<Job>;
}

function shownAtTheRoot(revision: string, repositoryPath: string, text: string) {
  return {
    directory:    repositoryRoot,
    gitArguments: ['show', `${revision}:${repositoryPath}`],
    answeredAs:   GIT_CALL_SHAPES.FILE_ON_BRANCH,
    filledIn:     { [RECORDED_PLACEHOLDERS.TEXT]: text },
  };
}

describe('a project file as git names it', () => {
  test('lies through the project\'s folder from the repository\'s root, the managed block\'s CLAUDE.md included', () => {
    expect(InstructionFiles.projectFileOf(projectDirectory, 'CLAUDE.md'))
      .toEqual<ProjectFile>({ repositoryRoot, repositoryPath: `${PROJECT_FOLDER}/CLAUDE.md` });
  });

  test('is the path itself in the tracker\'s own folder, as written, for a tracker at its repository\'s root', () => {
    expect(InstructionFiles.projectFileOf(repository, 'CLAUDE.md')).toEqual<ProjectFile>({ repositoryRoot: repository, repositoryPath: 'CLAUDE.md' });
  });
});

describe('the tracked instruction files Customs V11 protects for a project tracker', () => {
  const pipeline: Pipeline = {
    ...MINIMAL_PIPELINE,
    constitution: { path: CONSTITUTION_FILE_PATH },
    agents:       { builder: { instructions: [{ kind: 'file', path: 'docs/example-brief.md' }, { kind: 'file', path: DATA_FOLDER_NOTES_PATH }] } },
  };

  test('are repository paths through the project\'s folder, with no data-folder file', () => {
    expect(InstructionFiles.trackedInstructionPathsOf(pipeline, PROJECT_FOLDER).sort())
      .toEqual([`${PROJECT_FOLDER}/${CONSTITUTION_FILE_PATH}`, `${PROJECT_FOLDER}/docs/example-brief.md`]);
  });

  test('are the project paths as written for a tracker at its repository\'s root', () => {
    expect(InstructionFiles.trackedInstructionPathsOf(pipeline).sort()).toEqual([CONSTITUTION_FILE_PATH, 'docs/example-brief.md']);
  });
});

describeWhenGitIsRecorded('a project tracker\'s readings', () => {
  test('read the project\'s tracked file from the main line at the repository\'s root, and a data-folder file from the project\'s', async () => {
    writeFileSync(join(projectDirectory, DATA_FOLDER_NOTES_PATH), 'example notes\n');
    const pipeline: Pipeline = {
      ...MINIMAL_PIPELINE,
      agents: { builder: { instructions: [{ kind: 'file', path: 'CLAUDE.md' }, { kind: 'file', path: DATA_FOLDER_NOTES_PATH }] } },
    };
    const reading = await recordedGit.playStage(
      [shownAtTheRoot(MAIN_LINE, `${PROJECT_FOLDER}/CLAUDE.md`, 'Example forge instructions.')],
      async () => InstructionFiles.readingFor(projectDirectory, MAIN_LINE, pipeline, builderJob()),
    );

    expect(reading.verdict === 'read' ? reading.text : reading.verdict).toBe('Example forge instructions.\n\nexample notes\n');
    expect(reading.verdict === 'read' ? reading.files.map((file) => file.path) : []).toEqual(['CLAUDE.md', DATA_FOLDER_NOTES_PATH]);
  });

  test('read the project\'s CONSTITUTION.md with its blob, named by its project path', async () => {
    const constitutionPath = `${PROJECT_FOLDER}/${CONSTITUTION_FILE_PATH}`;
    const reading = await recordedGit.playStage([
      {
        directory:    repositoryRoot,
        gitArguments: ['rev-parse', '--verify', '--quiet', '--end-of-options', `${MAIN_LINE}^{commit}`],
        answeredAs:   GIT_CALL_SHAPES.BRANCH_COMMIT_RESOLVED,
        filledIn:     { [RECORDED_PLACEHOLDERS.COMMIT]: MAIN_TIP },
      },
      {
        directory:    repositoryRoot,
        gitArguments: ['rev-parse', '--verify', '--quiet', '--end-of-options', `${MAIN_TIP}:${constitutionPath}`],
        answeredAs:   GIT_CALL_SHAPES.BLOB_OF_A_PATH,
        filledIn:     { [RECORDED_PLACEHOLDERS.BLOB]: BLOB },
      },
      shownAtTheRoot(MAIN_TIP, constitutionPath, '# Example forge rules'),
    ], async () => InstructionFiles.mainConstitutionOf(projectDirectory, MAIN_LINE));

    expect(reading).toEqual({ verdict: 'read', constitution: { path: CONSTITUTION_FILE_PATH, markdown: '# Example forge rules\n', blob: BLOB } });
  });

  test('of the main line, kept per tip, ask for the project\'s file', async () => {
    const reads = new MainLineReads(projectDirectory);
    const text = await recordedGit.playStage(
      [shownAtTheRoot(MAIN_TIP, `${PROJECT_FOLDER}/docs/example-brief.md`, 'Example brief.')],
      async () => reads.textAt(MAIN_TIP, 'docs/example-brief.md'),
    );

    expect(text).toBe('Example brief.\n');
  });

  test('of the tree name no finding outside the project, and ask git at the repository\'s root', async () => {
    const findings = await recordedGit.playStage(
      [{ directory: repositoryRoot, gitArguments: ['ls-tree', '-r', '-z', '--full-tree', MAIN_TIP], answeredAs: GIT_CALL_SHAPES.TREE_OF_AN_UNPORTABLE_COMMIT }],
      async () => TreePortability.treeFindingsAt(projectDirectory, MAIN_TIP),
    );

    expect(findings).toEqual([]);
  });
});
