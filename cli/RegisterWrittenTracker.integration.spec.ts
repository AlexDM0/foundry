/**
 * The monitor registry `~/.agent-progress-monitor/projects.json` as the commands write it, under a scratch home and with the temp-folder
 * rule pointed at a scratch folder the repositories lie outside, so they count as real ones. What matters: exactly a call that wrote the
 * tracker registers, though nothing renders, one entry per `trackerId` carrying every field with its value; a read-only call, `open`,
 * `update` and a tracker under any temp folder (`/tmp`, `/var/tmp`, the system one) register nothing; the file's version, unknown keys
 * and malformed entries are handled as `docs/cli.md` says; a registry that cannot be written never changes the exit code; and concurrent
 * processes all land in the file. A case needing a registered tracker outside `/tmp` and `/var/tmp` is skipped where the scratch root lies
 * under either (Linux), since neither a child's `TMPDIR` nor the case can move those. Git plays recorded answers, in this process and in
 * each spawned binary: a registering write asks only for the origin.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  symlinkSync,
  writeFileSync
} from 'node:fs';
import { tmpdir }        from 'node:os';
import { dirname, join } from 'node:path';

import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import { LocalTimeUtil }                            from '../src/lib/local-time/LocalTimeUtil.ts';
import { registerWithTheMonitor }                   from '../src/services/tracker/MonitorRegistration.ts';
import { NO_LOCK_HOLDER_READS_AS_GONE, withLockAt } from '../src/services/tracker/TrackerLock.ts';
import { workspacePathsFor }                        from '../src/services/tracker/Workspace.ts';
import { PRODUCT_NAMES }                            from '../src/shared/constants/ProductNames.ts';
import { CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS }  from '../src/testing/ChildProcessCaseTimeout.ts';
import { nativePlatformPorts }                      from '../src/testing/NativePlatformPorts.ts';
import {
  GIT_CALL_SHAPES,
  RECORDED_PLACEHOLDERS,
  type RecordedGitStage,
  type RecordedGitStep,
  useRecordedGit
} from '../src/testing/RecordedGit.ts';
import {
  createScratchCopyOf,
  createScratchCopyOutsideTheFixedTemporaryFolders,
  createScratchDirectory,
  removeScratchDirectory
} from '../src/testing/ScratchWorkspace.ts';
import { testWhenTheScratchRootIsOutsideTmp }                                  from '../src/testing/ToolGuard.ts';
import { runCommandLine }                                                      from './Main.ts';
import { registerWrittenTracker }                                              from './RegisterWrittenTracker.ts';
import { createCapturedCommandContext }                                        from './testing/CapturedCommandContext.ts';
import { runAgentProgress, runAgentProgressBesideRecordedGit }                 from './testing/CliProcess.ts';
import { createInitializedRecordedGitRepository, createRecordedGitRepository } from './testing/InitializedScratchRepository.ts';
import {
  COMMON_FOLDER_AT_THE_ROOT,
  COMMON_FOLDER_OUTSIDE,
  INIT_IN_A_NEW_REPOSITORY,
  REFRESH_OF_AN_IGNORING_REPOSITORY
} from './testing/RecordedGitStages.ts';

const FIRST_NOW  = new Date('2026-10-21T10:00:00Z');
const SECOND_NOW = new Date('2026-10-21T11:30:00Z');

const EXAMPLE_ORIGIN = 'https://example.invalid/example-agency.git';

/**
 * Long enough for a spawned write to reach the registry, well inside the lock's retry budget the children then wait out: a hold ending on the
 * children's state could outlast that budget, and a slow start only shortens what the window watches.
 */
const LOCK_HELD_WHILE_THE_CHILDREN_START_MILLISECONDS = 2_000;

const recordedGit = useRecordedGit();

/** The one git call a registration makes: the origin it stores. */
const ORIGIN_ASKED_WITH_NONE_SET: RecordedGitStep = { gitArguments: ['remote', 'get-url', 'origin'], answeredAs: GIT_CALL_SHAPES.ORIGIN_URL_UNSET };

/** A command that writes the tracker registers it, and the registration asks for the origin. */
const REGISTERING_WRITE: RecordedGitStage = [ORIGIN_ASKED_WITH_NONE_SET];

/** The isolation check asks git for the root of the scratch home, which holds no tracker and lies in no repository. */
const HOME_ISOLATION_CHECK: RecordedGitStage = [COMMON_FOLDER_OUTSIDE];

interface RegistryEntry {
  project:       string;
  root:          string;
  progressHtml:  string;
  progressJson:  string;
  gitOrigin:     string | null;
  registeredAt:  string;
  lastChangedAt: string;
  lastCommand:   string;
}

interface RegistryDocument {
  version:  number;
  projects: Record<string, RegistryEntry>;
}

const scratchDirectories: string[] = [];
let homeDirectory              = '';
let folderOutsideEveryRepository = '';

function scratch(directory: string): string {
  scratchDirectories.push(directory);
  return directory;
}

beforeEach(() => {
  homeDirectory                = scratch(createScratchDirectory('monitor-home'));
  folderOutsideEveryRepository = scratch(createScratchDirectory('monitor-temporary-folder'));
});

afterEach(() => {
  for (const directory of scratchDirectories.splice(0)) removeScratchDirectory(directory);
});

function registryFilePath(): string {
  return join(homeDirectory, PRODUCT_NAMES.MONITOR_FOLDER, 'projects.json');
}

function registryText(): string {
  return readFileSync(registryFilePath(), 'utf8');
}

function registry(): RegistryDocument {
  return JSON.parse(registryText()) as RegistryDocument;
}

function trackerIdOf(repositoryDirectory: string): string {
  return (JSON.parse(readFileSync(workspacePathsFor(repositoryDirectory).progressFilePath, 'utf8')) as { trackerId: string }).trackerId;
}

type CapturedContext = ReturnType<typeof createCapturedCommandContext>;

/** Made inside `isolationCheckStage`, since the context's isolation check asks git for the root of each directory that holds no tracker. */
async function registeringContext(repositoryDirectory: string, now: Date = FIRST_NOW, isolationCheckStage: RecordedGitStage = HOME_ISOLATION_CHECK): Promise<CapturedContext> {
  return await recordedGit.playStage(isolationCheckStage, async () => createCapturedCommandContext({
    currentDirectory: repositoryDirectory, homeDirectory, temporaryDirectories: [folderOutsideEveryRepository], now: () => now
  }));
}

async function initializedRepository(): Promise<string> {
  return scratch(await createInitializedRecordedGitRepository('monitor-repository', ['--project', 'Example Agency'], () => FIRST_NOW, recordedGit));
}

async function requireExitZero(commandLine: readonly string[], context: CapturedContext, stage: RecordedGitStage = REGISTERING_WRITE): Promise<void> {
  expect(await recordedGit.playStage(stage, async () => runCommandLine(commandLine, context)), context.errorText()).toBe(0);
}

/** Spawned with `TMPDIR` on the outside folder, so the child's own temp-folder rule does not reach the repository either. */
function logInAChildProcess(repositoryDirectory: string): ReturnType<typeof runAgentProgress> {
  return runAgentProgress(['log', 'Example milestone'], {
    currentDirectory: repositoryDirectory, homeDirectory, environment: { TMPDIR: folderOutsideEveryRepository }, recordedGitStage: REGISTERING_WRITE,
  });
}

test('A1: init registers one entry keyed by the trackerId, carrying every field with its value', async () => {
  const repositoryDirectory = scratch(createRecordedGitRepository('monitor-init'));
  const originAskedWithOneSet: RecordedGitStep = {
    ...ORIGIN_ASKED_WITH_NONE_SET,
    answeredAs: GIT_CALL_SHAPES.ORIGIN_URL_SET,
    filledIn:   { [RECORDED_PLACEHOLDERS.ORIGIN]: EXAMPLE_ORIGIN },
  };
  const context = await registeringContext(repositoryDirectory, FIRST_NOW, [COMMON_FOLDER_AT_THE_ROOT, COMMON_FOLDER_OUTSIDE]);
  // The tracker registers once its store is written, which comes before the skills are installed and their folders checked.
  const initRegistering = [...INIT_IN_A_NEW_REPOSITORY.slice(1, 6), originAskedWithOneSet, ...INIT_IN_A_NEW_REPOSITORY.slice(6)];
  await requireExitZero(['init', '--project', 'Example Agency'], context, initRegistering);

  const document  = registry();
  const trackerId = trackerIdOf(repositoryDirectory);
  expect(document.version).toBe(1);
  expect(Object.keys(document.projects)).toEqual([trackerId]);
  const entry = document.projects[trackerId];
  expect(realpathSync(entry?.root ?? '')).toBe(realpathSync(repositoryDirectory));
  const paths = workspacePathsFor(entry?.root ?? '');
  expect(entry).toEqual({
    project:       'Example Agency',
    root:          paths.rootDirectory,
    progressHtml:  paths.htmlFilePath,
    progressJson:  paths.progressFilePath,
    gitOrigin:     EXAMPLE_ORIGIN,
    registeredAt:  LocalTimeUtil.formatLocalIso(FIRST_NOW),
    lastChangedAt: LocalTimeUtil.formatLocalIso(FIRST_NOW),
    lastCommand:   'init',
  });
  expect(Object.keys(entry ?? {})).toEqual(['project', 'root', 'progressHtml', 'progressJson', 'gitOrigin', 'registeredAt', 'lastChangedAt', 'lastCommand']);
});

test('A1: each mutating command updates lastChangedAt and lastCommand, keeping registeredAt; no origin is null', async () => {
  const repositoryDirectory = await initializedRepository();
  const trackerId           = trackerIdOf(repositoryDirectory);

  await requireExitZero(['log', 'Example milestone'], await registeringContext(repositoryDirectory, FIRST_NOW));
  expect(registry().projects[trackerId]).toMatchObject({
    gitOrigin: null, registeredAt: LocalTimeUtil.formatLocalIso(FIRST_NOW), lastChangedAt: LocalTimeUtil.formatLocalIso(FIRST_NOW), lastCommand: 'log'
  });

  await requireExitZero(['ticket', 'add', 'Example ticket', '--type', 'ticket'], await registeringContext(repositoryDirectory, SECOND_NOW));
  const firstStamp  = LocalTimeUtil.formatLocalIso(FIRST_NOW);
  const secondStamp = LocalTimeUtil.formatLocalIso(SECOND_NOW);
  expect(registry().projects[trackerId]).toMatchObject({ registeredAt: firstStamp, lastChangedAt: secondStamp, lastCommand: 'ticket add' });

  await requireExitZero(['log', 'Example milestone'], await registeringContext(repositoryDirectory, SECOND_NOW));
  expect(registry().projects[trackerId]?.lastCommand).toBe('log');
  expect(Object.keys(registry().projects)).toEqual([trackerId]);
});

test('an Overseer key is added at the overseer\'s start, kept by every other write, and removed at its stop', async () => {
  const repositoryDirectory = await initializedRepository();
  const trackerId           = trackerIdOf(repositoryDirectory);
  const overseer              = { url: 'http://127.0.0.1:4930/', processId: 4242, startedAt: LocalTimeUtil.formatLocalIso(FIRST_NOW) };
  const registration = {
    workspace:            workspacePathsFor(repositoryDirectory),
    monitorFolder:        join(homeDirectory, PRODUCT_NAMES.MONITOR_FOLDER),
    temporaryDirectories: [folderOutsideEveryRepository],
    command:              'oversee',
    now:                  () => FIRST_NOW,
  };

  const registered = async (overseerKey: typeof overseer | 'removed'): Promise<string> => (await recordedGit.playStage(
    REGISTERING_WRITE, async () => registerWithTheMonitor({ ...registration, overseer: overseerKey })
  )).verdict;

  expect(await registered(overseer)).toBe('registered');
  expect(registry().projects[trackerId]).toMatchObject({ overseer, lastCommand: 'oversee' });
  await requireExitZero(['log', 'Example milestone'], await registeringContext(repositoryDirectory, SECOND_NOW));
  expect(registry().projects[trackerId]).toMatchObject({ overseer, lastCommand: 'log' });
  expect(await registered('removed')).toBe('registered');
  expect(Object.keys(registry().projects[trackerId] ?? {})).not.toContain('overseer');
});

test('A2: status, ticket show, and open refused with no Overseer register nothing', async () => {
  const repositoryDirectory = await initializedRepository();
  // The default context's temp folders hold the scratch root, so this write registers nothing and asks no origin.
  await requireExitZero(['ticket', 'add', 'Example ticket', '--type', 'ticket'], createCapturedCommandContext({ currentDirectory: repositoryDirectory }), []);

  await requireExitZero(['status', '--json'], await registeringContext(repositoryDirectory), []);
  await requireExitZero(['ticket', 'show', '1'], await registeringContext(repositoryDirectory), []);
  // Spawned with a PATH holding only Bun, so no browser opener is found and none is launched.
  const environment = { TMPDIR: folderOutsideEveryRepository, PATH: dirname(process.execPath) };
  const opened      = await runAgentProgressBesideRecordedGit(recordedGit, HOME_ISOLATION_CHECK, ['open'], {
    currentDirectory: repositoryDirectory, homeDirectory, environment, recordedGitStage: [],
  });
  expect(opened.exitCode, opened.standardError).toBe(1);
  expect(existsSync(registryFilePath())).toBe(false);
}, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

test('A2: a status call leaves an existing registry byte-identical', async () => {
  const repositoryDirectory = await initializedRepository();
  await requireExitZero(['log', 'Example milestone'], await registeringContext(repositoryDirectory));
  const before = registryText();
  await requireExitZero(['status'], await registeringContext(repositoryDirectory, SECOND_NOW), []);
  expect(registryText()).toBe(before);
});

test('A2: update registers nothing, since it never writes the tracker', async () => {
  const repositoryDirectory = await initializedRepository();
  await requireExitZero(['update'], await registeringContext(repositoryDirectory), REFRESH_OF_AN_IGNORING_REPOSITORY);
  expect(existsSync(registryFilePath())).toBe(false);
});

test('A6: a store write that renders nothing still registers, leaving progress.html as it was', async () => {
  const repositoryDirectory = await initializedRepository();
  const workspace           = workspacePathsFor(repositoryDirectory);
  const pageBefore          = readFileSync(workspace.htmlFilePath, 'utf8');
  await requireExitZero(['log', 'Example milestone'], await registeringContext(repositoryDirectory, SECOND_NOW));
  expect(readFileSync(workspace.htmlFilePath, 'utf8')).toBe(pageBefore);
  const entry = registry().projects[trackerIdOf(repositoryDirectory)];
  expect(entry?.lastCommand).toBe('log');
  expect(entry?.progressHtml).toBe(workspacePathsFor(entry?.root ?? '').htmlFilePath);
});

test('A6: registering a written tracker needs no render outcome', async () => {
  const repositoryDirectory = await initializedRepository();
  const context             = await registeringContext(repositoryDirectory);
  await recordedGit.playStage(REGISTERING_WRITE, async () => registerWrittenTracker(context, workspacePathsFor(repositoryDirectory)));
  expect(existsSync(registryFilePath())).toBe(true);
});

test('A2: a tracker under the system temp folder registers nothing, also when that folder is named through a symlink', async () => {
  const repositoryDirectory = await initializedRepository();
  const underTheScratchRoot = await recordedGit.playStage(
    HOME_ISOLATION_CHECK, async () => createCapturedCommandContext({ currentDirectory: repositoryDirectory, homeDirectory, now: () => FIRST_NOW })
  );
  await requireExitZero(['log', 'Example milestone'], underTheScratchRoot, []);
  expect(existsSync(registryFilePath())).toBe(false);

  const linkToTheRepositoryFolder = join(folderOutsideEveryRepository, 'linked-temporary-folder');
  symlinkSync(realpathSync(dirname(repositoryDirectory)), linkToTheRepositoryFolder);
  const underTheLinkedFolder = await recordedGit.playStage(HOME_ISOLATION_CHECK, async () => createCapturedCommandContext({
    currentDirectory: repositoryDirectory, homeDirectory, temporaryDirectories: [linkToTheRepositoryFolder], now: () => FIRST_NOW
  }));
  await requireExitZero(['log', 'Example milestone'], underTheLinkedFolder, []);
  expect(existsSync(registryFilePath())).toBe(false);
});

/** Registers straight through the service, since no spec may write a tracker under `/tmp` or `/var/tmp` themselves. A refused one asks no origin. */
async function registrationOfATrackerRootedAt(rootDirectory: string, temporaryDirectories: readonly string[], stage: RecordedGitStage = []): Promise<string> {
  const outcome = await recordedGit.playStage(stage, async () => registerWithTheMonitor({
    workspace: workspacePathsFor(rootDirectory), monitorFolder: join(homeDirectory, PRODUCT_NAMES.MONITOR_FOLDER), temporaryDirectories, command: 'log', now: () => FIRST_NOW
  }));
  return outcome.verdict;
}

test('A1: a tracker rooted under /tmp registers nothing, named directly or through its resolved path', async () => {
  for (const rootDirectory of [join('/tmp', 'scratch-x'), join(realpathSync('/tmp'), 'scratch-x', 'nested')]) {
    expect(await registrationOfATrackerRootedAt(rootDirectory, nativePlatformPorts().dataFolders.temporaryRoots())).toBe('not-registered-temporary-tracker');
  }
  expect(existsSync(registryFilePath())).toBe(false);
});

test('A2: a tracker rooted under /var/tmp or the system temp folder registers nothing, each resolved through symlinks', async () => {
  const roots = [join('/var/tmp', 'scratch-x'), join(realpathSync('/var/tmp'), 'scratch-x'), join(tmpdir(), 'scratch-x'), join(realpathSync(tmpdir()), 'scratch-x')];
  for (const rootDirectory of roots) {
    expect(await registrationOfATrackerRootedAt(rootDirectory, nativePlatformPorts().dataFolders.temporaryRoots())).toBe('not-registered-temporary-tracker');
  }
  expect(existsSync(registryFilePath())).toBe(false);
});

testWhenTheScratchRootIsOutsideTmp('A2: a tracker outside every temp folder still registers when /tmp and /var/tmp are among them', async () => {
  const repositoryDirectory = scratch(createScratchCopyOutsideTheFixedTemporaryFolders(await initializedRepository(), 'monitor-outside-repository'));
  const temporaryDirectories = ['/tmp', '/var/tmp', folderOutsideEveryRepository];
  expect(await registrationOfATrackerRootedAt(repositoryDirectory, temporaryDirectories, REGISTERING_WRITE)).toBe('registered');
  expect(Object.keys(registry().projects)).toEqual([trackerIdOf(repositoryDirectory)]);
});

test('A3: a moved tracker updates its one entry\'s paths', async () => {
  const firstPlace  = await initializedRepository();
  const secondPlace = scratch(createScratchCopyOf(firstPlace, 'monitor-moved-repository'));
  await requireExitZero(['log', 'Example milestone'], await registeringContext(firstPlace));
  await requireExitZero(['log', 'Example milestone'], await registeringContext(secondPlace, SECOND_NOW));

  const entries = registry().projects;
  expect(Object.keys(entries)).toEqual([trackerIdOf(secondPlace)]);
  const entry = Object.values(entries)[0];
  expect(realpathSync(entry?.root ?? '')).toBe(realpathSync(secondPlace));
  expect(entry?.progressHtml).toBe(workspacePathsFor(entry?.root ?? '').htmlFilePath);
  expect(entry?.registeredAt).toBe(LocalTimeUtil.formatLocalIso(FIRST_NOW));
});

test('A4: a registry of a newer version is left byte-identical, with a warning and exit 0', async () => {
  const repositoryDirectory = await initializedRepository();
  const newerText           = '{"version":2,"projects":{"elsewhere":{"shape":"unknown"}}}';
  mkdirSync(dirname(registryFilePath()), { recursive: true });
  writeFileSync(registryFilePath(), newerText);

  const context = await registeringContext(repositoryDirectory);
  await requireExitZero(['log', 'Example milestone'], context);
  expect(registryText()).toBe(newerText);
  expect(context.errorText()).toContain(`is version 2, newer than this ${PRODUCT_NAMES.PROGRAM} writes; it was left untouched`);
});

test('A4: unknown keys at the top level and on an entry survive a write, in order', async () => {
  const repositoryDirectory = await initializedRepository();
  const trackerId           = trackerIdOf(repositoryDirectory);
  mkdirSync(dirname(registryFilePath()), { recursive: true });
  writeFileSync(registryFilePath(), JSON.stringify({
    comment:  'kept first',
    version:  1,
    projects: { other: { project: 'Other Example', pinned: true }, [trackerId]: { pinned: true, project: 'Old name', registeredAt: '2026-01-02T03:04:05+01:00' } },
    tail:     { kept: 'last' },
  }));

  await requireExitZero(['log', 'Example milestone'], await registeringContext(repositoryDirectory));
  const document = registry() as unknown as Record<string, unknown>;
  expect(Object.keys(document)).toEqual(['comment', 'version', 'projects', 'tail']);
  expect(document['tail']).toEqual({ kept: 'last' });
  const entries = registry().projects;
  expect(Object.keys(entries)).toEqual(['other', trackerId]);
  expect(entries['other']).toEqual({ project: 'Other Example', pinned: true } as unknown as RegistryEntry);
  expect(Object.keys(entries[trackerId] ?? {})).toEqual(['pinned', 'project', 'registeredAt', 'root', 'progressHtml', 'progressJson', 'gitOrigin', 'lastChangedAt', 'lastCommand']);
  expect(entries[trackerId]).toMatchObject({ project: 'Example Agency', registeredAt: '2026-01-02T03:04:05+01:00' });
});

test('A4: a malformed registry is reported and rewritten keeping every readable entry, plus this one', async () => {
  const repositoryDirectory = await initializedRepository();
  mkdirSync(dirname(registryFilePath()), { recursive: true });
  writeFileSync(registryFilePath(), JSON.stringify({ version: 1, projects: { readable: { project: 'Other Example' }, broken: 'not an entry' } }));

  const context = await registeringContext(repositoryDirectory);
  await requireExitZero(['log', 'Example milestone'], context);
  expect(Object.keys(registry().projects)).toEqual(['readable', trackerIdOf(repositoryDirectory)]);
  expect(context.errorText()).toContain('was malformed (entry "broken" is not an object); it was rewritten keeping every readable entry');

  writeFileSync(registryFilePath(), '{ not json');
  await requireExitZero(['log', 'Example milestone'], context);
  expect(Object.keys(registry().projects)).toEqual([trackerIdOf(repositoryDirectory)]);
});

test('A4: a registry that cannot be written warns on standard error and the command keeps exit 0', async () => {
  const repositoryDirectory = await initializedRepository();
  writeFileSync(join(homeDirectory, PRODUCT_NAMES.MONITOR_FOLDER), 'a file where the registry folder belongs');

  const context = await registeringContext(repositoryDirectory);
  await requireExitZero(['log', 'Example milestone'], context);
  expect(context.errorText()).toContain(`The monitor registry ${registryFilePath()} could not be updated:`);
});

testWhenTheScratchRootIsOutsideTmp('A5: several processes registering different projects at once all end up in the file', async () => {
  // One after another, since a recorded stage answers one flow in order; the children below are what runs at once.
  const repositoryDirectories: string[] = [];
  for (const projectNumber of [1, 2, 3, 4]) {
    const repositoryDirectory = scratch(createScratchCopyOutsideTheFixedTemporaryFolders(
      scratch(createRecordedGitRepository(`monitor-concurrent-template-${projectNumber}`)), `monitor-concurrent-${projectNumber}`
    ));
    await recordedGit.playStage(INIT_IN_A_NEW_REPOSITORY, async () => {
      const context = createCapturedCommandContext({ currentDirectory: repositoryDirectory });
      expect(await runCommandLine(['init', '--project', `Example Agency ${projectNumber}`], context), context.errorText()).toBe(0);
    });
    repositoryDirectories.push(repositoryDirectory);
  }

  // The registry's lock is held here while the children start, so a child writing without taking it would be seen writing meanwhile.
  mkdirSync(dirname(registryFilePath()), { recursive: true });
  let runningChildren: ReturnType<typeof logInAChildProcess>[] = [];
  const homeIsolationCheckOfEachChild = repositoryDirectories.map(() => COMMON_FOLDER_OUTSIDE);
  await withLockAt(join(dirname(registryFilePath()), '.lock'), async () => {
    // Each start checks the home's isolation before its first await, so the four checks come in order.
    runningChildren = await recordedGit.playStage(homeIsolationCheckOfEachChild, async () => repositoryDirectories.map(logInAChildProcess));
    await Bun.sleep(LOCK_HELD_WHILE_THE_CHILDREN_START_MILLISECONDS);
    expect(existsSync(registryFilePath())).toBe(false);
  }, () => new Date(), NO_LOCK_HOLDER_READS_AS_GONE);

  const results = await Promise.all(runningChildren);
  for (const result of results) expect(`${result.exitCode} ${result.standardError}`).toBe('0 ');
  expect(Object.keys(registry().projects).sort()).toEqual(repositoryDirectories.map(trackerIdOf).sort());
}, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);
