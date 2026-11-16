/**
 * The two-tracker answer set is whole: the recording answers every call `TwoTrackerScenarios` names at its place in each scenario, so a
 * spec of Part B can lean on any of them, and a scenario replays through today's code. The claims below are the facts the fixture exists
 * to show: a prefix per project and none at a toplevel, one common directory from every checkout, both namespaces' tickets beside a
 * person's checkout, and a sibling's or a person's work visible where a tracker must scope it away.
 */
import { readFileSync, realpathSync } from 'node:fs';
import { join }                       from 'node:path';

import {
  afterAll,
  beforeAll,
  expect,
  test
} from 'bun:test';

import { discoverRepositoryRoot }                               from '../lib/git/RepositoryRoot.ts';
import type { BoundaryRecording }                               from './BoundaryRecordings.ts';
import { recordingPathOf }                                      from './BoundaryRecordings.ts';
import { useRecordedGit }                                       from './RecordedGit.ts';
import { SCENARIO_REPOSITORY_PLACEHOLDER, scenarioCallShapeOf } from './RecordedGitScenarios.ts';
import { createScratchDirectory, removeScratchDirectory }       from './ScratchWorkspace.ts';
import { describeWhenGitIsRecorded }                            from './ToolGuard.ts';
import {
  ticketWorktreeFolderOf,
  TWO_TRACKER_PERSON_CHECKOUT_FOLDER,
  TWO_TRACKER_PROJECTS,
  TWO_TRACKER_SHARED_PACKAGE_FOLDER
} from './TwoTrackerFixture.ts';
import {
  TWO_TRACKER_SCENARIO_COMMITS,
  TWO_TRACKER_SCENARIOS,
  twoTrackerCallsOf,
  type TwoTrackerScenario
} from './TwoTrackerScenarios.ts';

const GIT_BOUNDARY = 'src/lib/git/GitProcess.ts';
const FORGE_ROOT = join(import.meta.dir, '..', '..');
const OBJECT_ID_LENGTH = 40;
const { enterScenario } = useRecordedGit();

let repositoryDirectory = '';
let recordedOutputs = new Map<string, string>();

beforeAll(() => {
  repositoryDirectory = createScratchDirectory('two-tracker-replay');
  const recording = JSON.parse(readFileSync(join(FORGE_ROOT, recordingPathOf(GIT_BOUNDARY, process.platform)), 'utf8')) as BoundaryRecording;
  recordedOutputs = new Map(recording.answers.map(({ callShape, answer }) => [callShape, (answer as { standardOutput: string }).standardOutput]));
});

afterAll(() => {
  removeScratchDirectory(repositoryDirectory);
});

/** A distinct example id for each commit the scenario names. */
function exampleCommitsOf(scenario: TwoTrackerScenario): Record<string, string> {
  return Object.fromEntries(TWO_TRACKER_SCENARIO_COMMITS[scenario].map((placeholder, i) => [placeholder, `${i + 1}`.repeat(OBJECT_ID_LENGTH)]));
}

/** The recorded output of a call at `folder` in `scenario`, its placeholders left in, or null when nothing is recorded. */
function recordedOutputOf(scenario: TwoTrackerScenario, folder: string, gitArguments: readonly string[]): string | null {
  return recordedOutputs.get(scenarioCallShapeOf(scenario, join(SCENARIO_REPOSITORY_PLACEHOLDER, folder), gitArguments)) ?? null;
}

const { FORGE, GAIA } = TWO_TRACKER_PROJECTS;

describeWhenGitIsRecorded('the two-tracker answer set', () => {
  test.each(Object.values(TWO_TRACKER_SCENARIOS))('holds an answer to every call it names at each place of "%s"', (scenario) => {
    const unrecorded = twoTrackerCallsOf(scenario).flatMap((place) => place.calls
      .map((call) => scenarioCallShapeOf(scenario, place.folder, call.gitArguments))
      .filter((callShape) => !recordedOutputs.has(callShape)));
    expect(unrecorded).toEqual([]);
  });

  test('replays a scenario through today\'s code: the main checkout is the repository root from a ticket worktree\'s project folder', () => {
    enterScenario(TWO_TRACKER_SCENARIOS.TICKETS_BUILT, { repositoryDirectory, commits: exampleCommitsOf(TWO_TRACKER_SCENARIOS.TICKETS_BUILT) });
    const discovery = discoverRepositoryRoot(join(repositoryDirectory, ticketWorktreeFolderOf(GAIA), GAIA.folder));
    expect(discovery).toEqual({ rootDirectory: realpathSync(repositoryDirectory), source: 'git' });
  });

  test('gives each project its prefix, and a toplevel none', () => {
    const prefixAt = (folder: string): string | null => recordedOutputOf(TWO_TRACKER_SCENARIOS.AT_REST, folder, ['rev-parse', '--show-prefix']);
    expect(prefixAt('')).toBe('\n');
    expect(prefixAt(TWO_TRACKER_PERSON_CHECKOUT_FOLDER)).toBe('\n');
    expect(prefixAt(FORGE.folder)).toBe(`${FORGE.folder}/\n`);
    expect(prefixAt(GAIA.folder)).toBe(`${GAIA.folder}/\n`);
    expect(prefixAt(TWO_TRACKER_SHARED_PACKAGE_FOLDER)).toBe(`${TWO_TRACKER_SHARED_PACKAGE_FOLDER}/\n`);
    expect(prefixAt(join(TWO_TRACKER_PERSON_CHECKOUT_FOLDER, GAIA.folder))).toBe(`${GAIA.folder}/\n`);
  });

  test('names one common directory from every checkout and project folder, and each ticket worktree its own toplevel', () => {
    const scenario = TWO_TRACKER_SCENARIOS.TICKETS_BUILT;
    const ticketProjectFolder = join(ticketWorktreeFolderOf(FORGE), FORGE.folder);
    for (const folder of ['', GAIA.folder, ticketProjectFolder, join(TWO_TRACKER_PERSON_CHECKOUT_FOLDER, GAIA.folder)]) {
      expect(recordedOutputOf(scenario, folder, ['rev-parse', '--path-format=absolute', '--git-common-dir'])).toBe(`${SCENARIO_REPOSITORY_PLACEHOLDER}/.git\n`);
    }
    expect(recordedOutputOf(scenario, ticketProjectFolder, ['rev-parse', '--show-toplevel']))
      .toBe(`${join(SCENARIO_REPOSITORY_PLACEHOLDER, ticketWorktreeFolderOf(FORGE))}\n`);
  });

  test('lists both namespaces\' tickets beside the person\'s checkout, and a change to the shared package on forge\'s ticket only', () => {
    const scenario = TWO_TRACKER_SCENARIOS.TICKETS_BUILT;
    const worktreeList = recordedOutputOf(scenario, '', ['worktree', 'list', '--porcelain']);
    expect(worktreeList).toContain('branch refs/heads/forge/ticket-001\n');
    expect(worktreeList).toContain('branch refs/heads/gaia/ticket-001\n');
    expect(worktreeList).toContain(`worktree ${join(SCENARIO_REPOSITORY_PLACEHOLDER, TWO_TRACKER_PERSON_CHECKOUT_FOLDER)}\n`);
    const changedSinceTheStart = ['diff', '--name-only', '--no-renames', '-z', '<start>', 'HEAD', '--'];
    expect(recordedOutputOf(scenario, ticketWorktreeFolderOf(FORGE), changedSinceTheStart)).toContain(`${TWO_TRACKER_SHARED_PACKAGE_FOLDER}/`);
    expect(recordedOutputOf(scenario, ticketWorktreeFolderOf(GAIA), changedSinceTheStart)).toBe(`${GAIA.folder}/src/Example.ts\0`);
  });

  test('moves the main line to gaia\'s ticket when gaia\'s landing went first', () => {
    expect(recordedOutputOf(TWO_TRACKER_SCENARIOS.SIBLING_LANDED, '', ['rev-parse', '--verify', '--quiet', '--end-of-options', 'HEAD^{commit}']))
      .toBe('<gaia ticket tip>\n');
  });

  test('shows a person\'s commit, stash and tag among the refs, and a sibling\'s change in the main checkout', () => {
    const scenario = TWO_TRACKER_SCENARIOS.PERSON_AND_SIBLING_AT_WORK;
    const refs = recordedOutputOf(scenario, '', ['for-each-ref', '--format=%(refname) %(objectname)']);
    expect(refs).toContain('refs/heads/person <person tip>\n');
    expect(refs).toContain('refs/stash <stash>\n');
    expect(refs).toContain('refs/tags/example-tag <start>\n');
    expect(recordedOutputOf(scenario, '', ['status', '--porcelain=v1', '-z', '--untracked-files=all'])).toBe(` M ${GAIA.folder}/src/Example.ts\0`);
  });
});
