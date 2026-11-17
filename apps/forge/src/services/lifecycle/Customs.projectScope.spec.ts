/**
 * Customs for a tracker in a folder of its repository, beside a sibling tracker and people's own checkouts. A tracker at the root must be
 * judged exactly as before: its patterns, protected names and refs read as they always did, and the reach check asks git nothing. A
 * project tracker's patterns and ticket naming read from its folder, its protected names hold at any depth, its branch may change only
 * its folder and its reach, and V14 watches only its own refs, so a sibling's branch, a person's commit, a stash or a tag fails no job
 * and a sibling's journaled landing passes. The ref cases replay the two-tracker answer set; the reach check replays a merge of the main
 * line, so a sibling's change it brought in is never the branch's own. On a top-level forge with entities, the data folder and agent
 * configuration are protected at the root and in every entity home, and a job of an entity may change only its homes and its reach: a
 * path a deeper home of another entity holds is that entity's (E2), and the root entity owns every path no other home holds. Without entity
 * homes or writable folders every check reads as before.
 */
import { join, posix } from 'node:path';

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test
} from 'bun:test';

import type { GitPathStyle }                              from '../../lib/git/GitPaths.ts';
import { TicketBodyHashUtil }                             from '../../lib/tracker-model/utils/TicketBodyHashUtil.ts';
import { branchNamesOf }                                  from '../../shared/BranchNames.ts';
import { PRODUCT_NAMES }                                  from '../../shared/constants/ProductNames.ts';
import { useRecordedGit }                                 from '../../testing/RecordedGit.ts';
import { GIT_SCENARIOS }                                  from '../../testing/RecordedGitScenarios.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { describeWhenGitIsRecorded }                      from '../../testing/ToolGuard.ts';
import {
  ticketBranchOfProject,
  ticketWorktreeFolderOf,
  TWO_TRACKER_MAIN_LINE,
  TWO_TRACKER_PROJECT_SOURCE_FILE,
  TWO_TRACKER_PROJECTS,
  TWO_TRACKER_SHARED_PACKAGE_FOLDER,
  TWO_TRACKER_SHARED_PACKAGE_SOURCE_FILE
} from '../../testing/TwoTrackerFixture.ts';
import { TWO_TRACKER_SCENARIOS } from '../../testing/TwoTrackerScenarios.ts';
import {
  agentConfigPathsAmong,
  CUSTOMS_CHECKS,
  type CustomsSubject,
  dataFolderPathsAmong,
  definitionFileMatcherOf,
  definitionFilePatternExpressionOf,
  foreignRefsMovedOf,
  launchSnapshotOf,
  pathsOutsideHomeAndReachOf,
  type LaunchSnapshot,
  type ProjectScope,
  type RefMovesAllowed,
  refMovesAllowedOf,
  pathsOutsideWritableFoldersOf,
  type VerificationCheck,
  watchedRefsOf,
  type WatchedRefs,
  type WritableFolders
} from './Customs.ts';

const { FORGE, GAIA } = TWO_TRACKER_PROJECTS;
const { DATA_FOLDER } = PRODUCT_NAMES;
const LINUX_STYLE: GitPathStyle = { pathModule: posix, foldsCase: false };

const GAIA_SCOPE: ProjectScope = { projectPrefix: GAIA.folder, reach: [`/${TWO_TRACKER_SHARED_PACKAGE_FOLDER}`, '/bun.lock'] };
const ROOT_SCOPE: ProjectScope = { projectPrefix: '', reach: [] };

describe('a tracker at its repository\'s root reads every path as before', () => {
  const patterns = ['src/**', 'eslint.config.js', '/turbo.json', '.githooks/', 'tsconfig*.json', '**/pyproject.toml', 'ci/checks.sh'];
  const paths = [
    'src/Example.ts',
    'apps/forge/src/Example.ts',
    'eslint.config.js',
    'apps/gaia/eslint.config.js',
    'turbo.json',
    'apps/forge/turbo.json',
    '.githooks/pre-commit',
    'tsconfig.base.json',
    'example/pyproject.toml',
    'ci/checks.sh',
    'tools/ci/checks.sh',
  ];

  test.each(patterns)('the definition pattern "%s" names exactly the paths its expression always named', (pattern) => {
    const matches = definitionFileMatcherOf(pattern, '');
    const expression = definitionFilePatternExpressionOf(pattern);
    expect(paths.filter(matches)).toEqual(paths.filter((path) => expression.test(path)));
  });

  test('its data folder and agent configuration are protected at the root only, a nested copy passing as it always has', () => {
    const changed = [`${DATA_FOLDER}/progress.json`, `apps/forge/${DATA_FOLDER}/progress.json`, '.claude/settings.json', 'apps/gaia/.claude/settings.json', 'apps/gaia/.mcp.json'];
    expect(dataFolderPathsAmong(changed, '')).toEqual([`${DATA_FOLDER}/progress.json`]);
    expect(agentConfigPathsAmong(changed, null)).toEqual(['.claude/settings.json']);
    expect(agentConfigPathsAmong(changed, null, '')).toEqual(['.claude/settings.json']);
  });

  test('V17 passes it without asking git, with its scope given or absent, since the whole repository is its home', () => {
    const subject: CustomsSubject = {
      role:             'builder',
      worktreePath:     '/no-repository-is-read-by-this-check',
      startCommit:      'example-commit',
      report:           {},
      ticketBody:       '',
      bodyHashAtLaunch: TicketBodyHashUtil.bodyHashOf(''),
      target:           TWO_TRACKER_MAIN_LINE,
    };
    expect(CUSTOMS_CHECKS.V17(subject)).toEqual({ verdict: 'passed' });
    expect(CUSTOMS_CHECKS.V17({ ...subject, projectScope: ROOT_SCOPE })).toEqual({ verdict: 'passed' });
  });

  test('its branches keep their bare names, so it watches every ref, and a journal it shares with no one adds nothing', () => {
    expect(watchedRefsOf(branchNamesOf(null), TWO_TRACKER_MAIN_LINE, '/example/repository/.forge-worktrees')).toBeNull();
    const naming = {
      ownJobId:                     'J1',
      ownBranch:                    'ticket-001',
      otherJobBranches:             [],
      ticketBranchOf:               (ticketId: string) => `ticket-${ticketId}`,
      releasedGroupBranchOf:        () => null,
      refreshWorktreeOf:            () => '',
      constitutionCommitWorktreeOf: () => '',
    };
    expect(refMovesAllowedOf([], naming)).toEqual(refMovesAllowedOf([], naming, { journaledLandings: [], watchedRefs: null }));
    expect(Object.hasOwn(refMovesAllowedOf([], naming), 'watchedRefs')).toBe(false);
  });
});

describe('a project tracker judges paths from its own folder', () => {
  test('a pattern without a leading / names the project\'s file only, and one with it the repository root\'s', () => {
    const named = (pattern: string, path: string): boolean => definitionFileMatcherOf(pattern, FORGE.folder)(path);

    expect(named('src/**', 'apps/forge/src/Example.ts')).toBe(true);
    expect(named('src/**', 'apps/gaia/src/Example.ts')).toBe(false);
    expect(named('src/**', 'src/Example.ts')).toBe(false);
    expect(named('eslint.config.js', 'apps/forge/eslint.config.js')).toBe(true);
    expect(named('eslint.config.js', 'apps/forge/tools/eslint.config.js')).toBe(true);
    expect(named('eslint.config.js', 'apps/gaia/eslint.config.js')).toBe(false);
    expect(named('eslint.config.js', 'eslint.config.js')).toBe(false);
    expect(named('/turbo.json', 'turbo.json')).toBe(true);
    expect(named('/turbo.json', 'apps/forge/turbo.json')).toBe(false);
    expect(named(`/${TWO_TRACKER_SHARED_PACKAGE_FOLDER}/`, TWO_TRACKER_SHARED_PACKAGE_SOURCE_FILE)).toBe(true);
  });

  test('accepts its home and its reach, and refuses the sibling\'s file, a nested .claude/, a nested .mcp.json and the sibling\'s data folder', () => {
    const changed = [
      `${GAIA.folder}/${TWO_TRACKER_PROJECT_SOURCE_FILE}`,
      TWO_TRACKER_SHARED_PACKAGE_SOURCE_FILE,
      'bun.lock',
      `${FORGE.folder}/${TWO_TRACKER_PROJECT_SOURCE_FILE}`,
      `${GAIA.folder}/.claude/settings.json`,
      `${TWO_TRACKER_SHARED_PACKAGE_FOLDER}/.MCP.json`,
      `${FORGE.folder}/${DATA_FOLDER}/progress.json`,
    ];

    expect(pathsOutsideHomeAndReachOf(changed, GAIA_SCOPE)).toEqual([`${FORGE.folder}/${TWO_TRACKER_PROJECT_SOURCE_FILE}`, `${FORGE.folder}/${DATA_FOLDER}/progress.json`]);
    expect(dataFolderPathsAmong(changed, GAIA.folder)).toEqual([`${FORGE.folder}/${DATA_FOLDER}/progress.json`]);
    expect(agentConfigPathsAmong(changed, null, GAIA.folder)).toEqual([`${GAIA.folder}/.claude/settings.json`, `${TWO_TRACKER_SHARED_PACKAGE_FOLDER}/.MCP.json`]);
  });

  test('a reach entry names a file or a folder, its trailing / aside, and never a sibling folder that only starts with its name', () => {
    const scope: ProjectScope = { projectPrefix: GAIA.folder, reach: ['/packages/design-system/', '/turbo.json'] };
    const changed = ['packages/design-system/src/Example.ts', 'turbo.json', 'packages/design-system-extra/Example.ts', 'apps/gaia-extra/Example.ts', 'package.json'];
    expect(pathsOutsideHomeAndReachOf(changed, scope)).toEqual(['packages/design-system-extra/Example.ts', 'apps/gaia-extra/Example.ts', 'package.json']);
    expect(pathsOutsideHomeAndReachOf(changed, ROOT_SCOPE)).toEqual([]);
  });

  test('its data folder is protected at any depth and in any case, and a folder merely named like it is not', () => {
    const changed = [`${DATA_FOLDER}/progress.json`, `${GAIA.folder}/${DATA_FOLDER.toUpperCase()}/progress.json`, `${GAIA.folder}/${DATA_FOLDER}-notes/example.md`];
    expect(dataFolderPathsAmong(changed, GAIA.folder)).toEqual(changed.slice(0, 2));
  });
});

describe('a top-level forge with entities', () => {
  const ENTITY_HOMES = ['/', '/apps/forge', '/packages/shared/'];
  const FORGE_STAGE: WritableFolders = { homes: ['/apps/forge'], reach: ['/bun.lock', '/packages/shared/generated/'], otherHomes: ['/', '/packages/shared', '/apps/forge/vendor'] };
  const ROOT_STAGE: WritableFolders = { homes: ['/', '/scripts/root-tools'], reach: [], otherHomes: ['/apps/forge', '/packages/shared', '/scripts'] };

  test('a job of an entity may change its homes and its reach, a reach path inside another home among them, and nothing else', () => {
    const changed = [
      'apps/forge/src/Example.ts',
      'bun.lock',
      'packages/shared/generated/Example.ts',
      'packages/shared/src/Example.ts',
      'apps/forge/vendor/Example.ts',
      'apps/forge-extra/Example.ts',
      'package.json',
    ];
    expect(pathsOutsideWritableFoldersOf(changed, FORGE_STAGE))
      .toEqual(['packages/shared/src/Example.ts', 'apps/forge/vendor/Example.ts', 'apps/forge-extra/Example.ts', 'package.json']);
  });

  test('the root entity owns every path no other home holds, its own home inside another one too, and no other entity\'s path', () => {
    const changed = ['package.json', 'docs/Example.md', 'scripts/root-tools/Example.ts', 'scripts/Example.ts', 'apps/forge/src/Example.ts', 'packages/shared/Example.ts'];
    expect(pathsOutsideWritableFoldersOf(changed, ROOT_STAGE)).toEqual(['scripts/Example.ts', 'apps/forge/src/Example.ts', 'packages/shared/Example.ts']);
  });

  test('the data folder is protected at the root and in every entity home, in any case, and nowhere deeper', () => {
    const changed = [
      `${DATA_FOLDER}/progress.json`,
      `apps/forge/${DATA_FOLDER.toUpperCase()}/progress.json`,
      `packages/shared/${DATA_FOLDER}/example.json`,
      `apps/forge/src/${DATA_FOLDER}/example.json`,
    ];
    expect(dataFolderPathsAmong(changed, '', ENTITY_HOMES)).toEqual(changed.slice(0, 3));
    expect(dataFolderPathsAmong(changed, ''), 'without entity homes only the root\'s, as always').toEqual(changed.slice(0, 1));
  });

  test('.claude/ and .mcp.json are protected at the root and in every entity home, in any case, and nowhere deeper', () => {
    const changed = [
      '.claude/settings.json',
      'apps/forge/.Claude/agents/example.md',
      'packages/shared/.MCP.json',
      'apps/forge/src/.claude/settings.json',
      'apps/forge/.mcp.json.example',
    ];
    expect(agentConfigPathsAmong(changed, null, '', ENTITY_HOMES)).toEqual(changed.slice(0, 3));
    expect(agentConfigPathsAmong(changed, null, ''), 'without entity homes only the root\'s, as always').toEqual(changed.slice(0, 1));
  });
});

describe('a project tracker\'s refs', () => {
  const worktreesRoot = '/example/repository/apps/gaia/.forge-worktrees';
  const ownBranchNames = branchNamesOf(GAIA.namespace);
  const watchedRefs = watchedRefsOf(ownBranchNames, TWO_TRACKER_MAIN_LINE, worktreesRoot) ?? undefined;
  const allowed: RefMovesAllowed = {
    ownBranch:            ownBranchNames.ticketBranchOf('001'),
    otherJobBranches:     [],
    loggedJobBranches:    [],
    recordedLandings:     [],
    removedAfterLandings: [],
    airlockWorktreeHeads: [],
    ...(watchedRefs === undefined ? {} : { watchedRefs }),
  };

  test('a namespace gives the main line, the namespace and the tracker\'s worktrees root as what it watches', () => {
    expect(watchedRefs).toEqual({ mainLine: TWO_TRACKER_MAIN_LINE, namespacePrefix: ownBranchNames.namespacePrefix, worktreesRoot });
  });

  test('watches the main line, its own namespace\'s branches and its own worktrees\' HEADs, and lets every other ref move', () => {
    const ownGroup = `refs/heads/${ownBranchNames.groupTargetPrefix}example`;
    const ownRefreshHead = `HEAD:${worktreesRoot}/refresh-group-example`;
    const launchRefs = {
      'refs/heads/main':                                                      'commit-before',
      [ownGroup]:                                                             'commit-before',
      [ownRefreshHead]:                                                       'commit-before',
      [`refs/heads/${branchNamesOf(FORGE.namespace).ticketBranchOf('001')}`]: 'commit-before',
      'refs/heads/person':                                                    'commit-before',
      'HEAD:/example/repository/apps/forge/.forge-worktrees/refresh-group-x': 'commit-before',
      'refs/remotes/origin/main':                                             'commit-before',
    };
    const nowRefs = {
      ...Object.fromEntries(Object.keys(launchRefs).map((ref) => [ref, 'commit-after'])),
      'refs/stash':             'commit-after',
      'refs/tags/example-tag':  'commit-after',
      'refs/heads/forge-notes': 'commit-after',
    };
    expect(foreignRefsMovedOf(LINUX_STYLE, { launchRefs, nowRefs }, allowed, `${worktreesRoot}/ticket-001`)).toEqual([ownRefreshHead, ownGroup, 'refs/heads/main']);
  });

  test('without watched refs, every one of those moves still refuses, as for a tracker with bare branch names', () => {
    const { watchedRefs: _watchedRefsLeftOut, ...unscoped } = allowed;
    const launchRefs = { 'refs/heads/person': 'commit-before' };
    const nowRefs = { 'refs/heads/person': 'commit-after', 'refs/stash': 'commit-after' };
    expect(foreignRefsMovedOf(LINUX_STYLE, { launchRefs, nowRefs }, unscoped, `${worktreesRoot}/ticket-001`)).toEqual(['refs/heads/person', 'refs/stash']);
  });
});

/** Each commit the replayed scenarios name. */
const COMMITS = {
  '<start>':            '1'.repeat(40),
  '<forge ticket tip>': '2'.repeat(40),
  '<gaia ticket tip>':  '3'.repeat(40),
  '<person tip>':       '4'.repeat(40),
  '<stash>':            '5'.repeat(40),
  '<head>':             '6'.repeat(40),
  '<main tip>':         '7'.repeat(40),
};

const { enterScenario } = useRecordedGit();

let repositoryDirectory = '';

function enter(scenario: string): void {
  enterScenario(scenario, { repositoryDirectory, commits: COMMITS });
}

/** The fixture names a ticket branch under its project's namespace alone, so forge's own refs are the main line and `forge/`. */
function forgeWatchedRefs(): WatchedRefs {
  return { mainLine: TWO_TRACKER_MAIN_LINE, namespacePrefix: `${FORGE.namespace}/`, worktreesRoot: join(repositoryDirectory, FORGE.folder, PRODUCT_NAMES.WORKTREES_FOLDER) };
}

function forgeBuilderIn(worktreePath: string, launchSnapshot: LaunchSnapshot, refMovesAllowed: RefMovesAllowed): CustomsSubject {
  return {
    role:             'builder',
    worktreePath,
    startCommit:      COMMITS['<start>'],
    report:           {},
    ticketBody:       '',
    bodyHashAtLaunch: TicketBodyHashUtil.bodyHashOf(''),
    launchSnapshot,
    refMovesAllowed,
  };
}

function forgeRefMovesAllowed(sharedRepository: { journaledLandings: { target: string; commit: string }[]; watchedRefs: WatchedRefs | null }): RefMovesAllowed {
  return refMovesAllowedOf([], {
    ownJobId:                     'J1',
    ownBranch:                    ticketBranchOfProject(FORGE),
    otherJobBranches:             [],
    ticketBranchOf:               () => ticketBranchOfProject(FORGE),
    releasedGroupBranchOf:        () => null,
    refreshWorktreeOf:            () => '',
    constitutionCommitWorktreeOf: () => '',
  }, sharedRepository);
}

function factsOf(check: VerificationCheck, subject: CustomsSubject): readonly string[] | null {
  const verdict = CUSTOMS_CHECKS[check](subject);
  return verdict.verdict === 'refused' ? verdict.facts : null;
}

function launchSnapshotIn(scenario: string, folder: string): LaunchSnapshot {
  enter(scenario);
  const snapshot = launchSnapshotOf(join(repositoryDirectory, folder));
  if (snapshot === null) throw new Error(`no launch snapshot in ${scenario}`);
  return snapshot;
}

beforeEach(() => {
  repositoryDirectory = createScratchDirectory('customs-project-scope');
});

afterEach(() => {
  removeScratchDirectory(repositoryDirectory);
});

describeWhenGitIsRecorded('V14 in a repository two trackers and a person share', () => {
  test('a sibling\'s ticket branch appearing fails no job of a namespaced tracker, and refuses one that watches every ref', () => {
    const launchSnapshot = launchSnapshotIn(TWO_TRACKER_SCENARIOS.AT_REST, '');
    enter(TWO_TRACKER_SCENARIOS.TICKETS_BUILT);
    const worktree = join(repositoryDirectory, ticketWorktreeFolderOf(FORGE));

    expect(factsOf('V14', forgeBuilderIn(worktree, launchSnapshot, forgeRefMovesAllowed({ journaledLandings: [], watchedRefs: forgeWatchedRefs() })))).toBeNull();
    expect(factsOf('V14', forgeBuilderIn(worktree, launchSnapshot, forgeRefMovesAllowed({ journaledLandings: [], watchedRefs: null }))))
      .toEqual([`refs/heads/${ticketBranchOfProject(GAIA)}`]);
  });

  test('a person\'s commit, a stash and a tag fail no job of a namespaced tracker', () => {
    const launchSnapshot = launchSnapshotIn(TWO_TRACKER_SCENARIOS.AT_REST, '');
    enter(TWO_TRACKER_SCENARIOS.PERSON_AND_SIBLING_AT_WORK);

    expect(factsOf('V14', forgeBuilderIn(repositoryDirectory, launchSnapshot, forgeRefMovesAllowed({ journaledLandings: [], watchedRefs: forgeWatchedRefs() })))).toBeNull();
    expect(factsOf('V14', forgeBuilderIn(repositoryDirectory, launchSnapshot, forgeRefMovesAllowed({ journaledLandings: [], watchedRefs: null }))))
      .toEqual(['refs/heads/person', 'refs/stash', 'refs/tags/example-tag']);
  });

  test('a sibling\'s landing on the main line passes once the journal records it, and refuses while it does not', () => {
    const worktreeFolder = ticketWorktreeFolderOf(FORGE);
    const launchSnapshot = launchSnapshotIn(TWO_TRACKER_SCENARIOS.TICKETS_BUILT, worktreeFolder);
    enter(TWO_TRACKER_SCENARIOS.SIBLING_LANDED);
    const worktree = join(repositoryDirectory, worktreeFolder);
    const siblingLanding = { target: TWO_TRACKER_MAIN_LINE, commit: COMMITS['<gaia ticket tip>'] };

    expect(factsOf('V14', forgeBuilderIn(worktree, launchSnapshot, forgeRefMovesAllowed({ journaledLandings: [], watchedRefs: forgeWatchedRefs() }))))
      .toEqual(['refs/heads/main']);
    expect(factsOf('V14', forgeBuilderIn(worktree, launchSnapshot, forgeRefMovesAllowed({ journaledLandings: [siblingLanding], watchedRefs: forgeWatchedRefs() }))))
      .toBeNull();
    const landingAtAnotherCommit = { ...siblingLanding, commit: COMMITS['<start>'] };
    expect(factsOf('V14', forgeBuilderIn(worktree, launchSnapshot, forgeRefMovesAllowed({ journaledLandings: [landingAtAnotherCommit], watchedRefs: forgeWatchedRefs() }))))
      .toEqual(['refs/heads/main']);
  });
});

describeWhenGitIsRecorded('V17: a branch changes only its project and its reach', () => {
  /** In these scenarios the branch commits `feature.ts` and merges in the main line's `example-constitution.md`. */
  function builderWithScope(projectScope: ProjectScope, target?: string): CustomsSubject {
    return {
      ...forgeBuilderIn(repositoryDirectory, { refs: {}, hooksFolderDigest: null }, forgeRefMovesAllowed({ journaledLandings: [], watchedRefs: null })),
      projectScope,
      ...(target === undefined ? {} : { target }),
    };
  }
  const exampleProjectWithFeature: ProjectScope = { projectPrefix: 'apps/example', reach: ['/feature.ts'] };

  test('a change the main line brought in is never the branch\'s own, and its own change outside home and reach refuses', () => {
    enter(GIT_SCENARIOS.MAIN_INSTRUCTION_FILE_MERGED);

    expect(factsOf('V17', builderWithScope(exampleProjectWithFeature, 'main'))).toBeNull();
    expect(factsOf('V17', builderWithScope({ projectPrefix: 'apps/example', reach: [] }, 'main'))).toEqual(['feature.ts']);
    expect(factsOf('V17', builderWithScope(exampleProjectWithFeature)), 'with no target every path in range counts').toEqual(['example-constitution.md']);
  });

  test('a job of an entity is held to its homes and reach, judged on its own changes past the target, and the root entity owns the file', () => {
    enter(GIT_SCENARIOS.MAIN_INSTRUCTION_FILE_MERGED);
    const exampleStage: WritableFolders = { homes: ['/apps/example'], reach: [], otherHomes: ['/'] };

    expect(factsOf('V17', builderWithScope({ ...ROOT_SCOPE, writableFolders: exampleStage }, 'main'))).toEqual(['feature.ts']);
    expect(factsOf('V17', builderWithScope({ ...ROOT_SCOPE, writableFolders: { ...exampleStage, reach: ['/feature.ts'] } }, 'main'))).toBeNull();
    expect(factsOf('V17', builderWithScope({ ...ROOT_SCOPE, writableFolders: { homes: ['/'], reach: [], otherHomes: ['/apps/example'] } }, 'main'))).toBeNull();
  });

  test('the branch\'s own change after the merge refuses, and the same branch passes a tracker at the root', () => {
    enter(GIT_SCENARIOS.OWN_INSTRUCTION_EDIT_AFTER_MERGE);

    expect(CUSTOMS_CHECKS.V17(builderWithScope(exampleProjectWithFeature, 'main')))
      .toEqual({ verdict: 'refused', reason: 'changed-outside-home-and-reach', facts: ['example-constitution.md'] });
    expect(factsOf('V17', builderWithScope(ROOT_SCOPE, 'main'))).toBeNull();
  });
});
