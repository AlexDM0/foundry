/**
 * The pipeline's `billing` on a scratch tracker behind the Watcher boundary, the Claude Code adapter's environment and arguments on a fake
 * session. What matters: with subscription billing, or none set, a session gets neither API variable of the Overseer; with API billing the
 * launch file names `ANTHROPIC_API_KEY` for the Watcher to copy and holds no key; a planted key is in no file of the data or monitor folder;
 * a budget reaches the launch arguments; and API billing with no key starts no session and opens one decision naming the variable and the
 * set-up section. No case calls the API or holds a real key.
 */
import {
  existsSync,
  readdirSync,
  readFileSync,
  writeFileSync
} from 'node:fs';
import { join } from 'node:path';
import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import type { AgentAdapter }                                    from '../../src/lib/agent-launch/AgentAdapter.ts';
import type { AgentLaunchPlan }                                 from '../../src/lib/agent-launch/AgentLaunchPlan.ts';
import type { PipelineBilling }                                 from '../../src/lib/tracker-model/@types/Pipeline.ts';
import { watcherFilesOf }                                       from '../../src/lib/watcher/WatcherFiles.ts';
import type { WatcherLaunch }                                   from '../../src/lib/watcher/WatcherLaunch.ts';
import type { DrivePass, DrivePassRequest }                     from '../../src/services/overseer/DrivePass.ts';
import { WatcherFleet }                                         from '../../src/services/overseer/WatcherFleet.ts';
import { requireWorkspace }                                     from '../../src/services/tracker/Workspace.ts';
import { createScratchDrivePass, FAKE_WATCHER_BUNDLE_PATH }     from '../../src/testing/DrivePassHarness.ts';
import { fakeAgentAdapter }                                     from '../../src/testing/FakeAgentAdapter.ts';
import { fakeGateConfinement }                                  from '../../src/testing/FakeGateConfinement.ts';
import { nativePlatformPorts }                                  from '../../src/testing/NativePlatformPorts.ts';
import { useRecordedGit }                                       from '../../src/testing/RecordedGit.ts';
import { RECORDED_FLOW_MAIN_LINE }                              from '../../src/testing/RecordedGitFlow.ts';
import { type RecordedWatcherStages, useRecordedWatcherStages } from '../../src/testing/RecordedWatcherStages.ts';
import { createScratchDirectory, removeScratchDirectory }       from '../../src/testing/ScratchWorkspace.ts';
import { describeWhenRecorded, EVERY_RECORDING_REQUIREMENT }    from '../../src/testing/ToolGuard.ts';
import { waitUntil }                                            from '../../src/testing/WaitUntil.ts';
import { agentAdapterOfThisProcess }                            from '../CommandContext.ts';
import { createCapturedCommandContext }                         from '../testing/CapturedCommandContext.ts';
import { createInitializedRecordedGitRepository }               from '../testing/InitializedScratchRepository.ts';
import { runCommandLineWithOverseerMoves }                      from '../testing/OverseerTicketMoves.ts';
import { fileReadyTicket }                                      from '../testing/ReadyTicketFiling.ts';
import { storedProgressOf }                                     from '../testing/StoredProgress.ts';
import { OverseerWording }                                      from './OverseerWording.ts';

const recordedGit = useRecordedGit();

const SPEC_CLOCK = (): Date => new Date('2026-09-18T20:11:03Z');
const PLANTED_KEY = 'sk-ant-example-planted-overseer-key';
const PLANTED_AUTH_TOKEN = 'example-planted-overseer-auth-token';
const OVERSEER_ENVIRONMENT = {
  HOME:                    '/Users/example',
  PATH:                    '/usr/bin:/bin',
  ANTHROPIC_API_KEY:       PLANTED_KEY,
  ANTHROPIC_AUTH_TOKEN:    PLANTED_AUTH_TOKEN,
  CLAUDE_CODE_OAUTH_TOKEN: 'example-oauth-token',
};

const world = useRecordedWatcherStages(nativePlatformPorts());
let ports: RecordedWatcherStages['ports'];
let repositoryDirectory = '';
let monitorFolder = '';
let overseerLog: string[] = [];
const drivePassesOfThisTest: DrivePass[] = [];

async function run(commandLineArguments: readonly string[]): Promise<ReturnType<typeof createCapturedCommandContext>> {
  const context  = createCapturedCommandContext({ currentDirectory: repositoryDirectory, now: SPEC_CLOCK, platformPorts: ports });
  const exitCode = await runCommandLineWithOverseerMoves(commandLineArguments, context);
  expect(exitCode, `\`${commandLineArguments.join(' ')}\` failed: ${context.errorText()}`).toBe(0);
  return context;
}

/** The fake session's argv and files, with the Claude Code adapter's environment, copied variables and arguments beside them. */
function claudeBilledAdapter(): AgentAdapter {
  const fake = fakeAgentAdapter();
  const claude = agentAdapterOfThisProcess();
  if (claude.vendor !== 'claude-code') throw new Error(`the spec process chose the ${claude.vendor} adapter, not Claude Code's`);
  return {
    ...fake,
    inheritedVariableNames: claude.inheritedVariableNames,
    planOf:                 (request): AgentLaunchPlan => {
      const fakePlan = fake.planOf(request);
      const claudePlan = claude.planOf(request);
      return {
        ...fakePlan,
        argv:        [...fakePlan.argv, ...claudePlan.argv.slice(1)],
        environment: claudePlan.environment,
        ...(claudePlan.environmentFromWatcher === undefined ? {} : { environmentFromWatcher: claudePlan.environmentFromWatcher }),
        files:       [...fakePlan.files, ...claudePlan.files],
      };
    },
  };
}

function setBilling(billing: PipelineBilling | undefined): void {
  const pipelinePath = join(requireWorkspace(repositoryDirectory).trackerDirectory, 'pipeline.json');
  const pipeline = JSON.parse(readFileSync(pipelinePath, 'utf8')) as Record<string, unknown>;
  writeFileSync(pipelinePath, `${JSON.stringify({ ...pipeline, ...(billing === undefined ? {} : { billing }) }, null, 2)}\n`);
}

function drivePassWith(apiBillingKeyIsSet: boolean, requestOverrides: Partial<DrivePassRequest> = {}): DrivePass {
  const drivePass = createScratchDrivePass({
    platformPorts:        { ...ports, gateConfinement: fakeGateConfinement('unconfined-by-design') },
    processStarts:        world.processStarts,
    workspace:            requireWorkspace(repositoryDirectory),
    now:                  SPEC_CLOCK,
    watcherBundlePath:    FAKE_WATCHER_BUNDLE_PATH,
    agentAdapter:         claudeBilledAdapter(),
    monitorFolder,
    mainLine:             RECORDED_FLOW_MAIN_LINE,
    inheritedEnvironment: OVERSEER_ENVIRONMENT,
    apiBillingKeyIsSet:   () => apiBillingKeyIsSet,
    decisionWordingOf:    OverseerWording.decisionWordingOf,
    log:                  (line) => overseerLog.push(line),
    ...requestOverrides,
  });
  drivePassesOfThisTest.push(drivePass);
  return drivePass;
}

async function passOnce(drivePass: DrivePass): Promise<void> {
  drivePass.wake(true);
  await drivePass.idle();
}

function buildJobId(): string | undefined {
  return (storedProgressOf(repositoryDirectory).jobs ?? []).find((job) => job.kind === 'build')?.id;
}

function buildLaunchPath(): string {
  return watcherFilesOf(WatcherFleet.jobFolderOf(requireWorkspace(repositoryDirectory).trackerDirectory, String(buildJobId())), 1).launchPath;
}

async function buildLaunchOf(drivePass: DrivePass): Promise<WatcherLaunch> {
  await waitUntil(async () => {
    await passOnce(drivePass);
    return buildJobId() !== undefined && existsSync(buildLaunchPath());
  }, () => `the build session's launch file: ${overseerLog.join('\n')}`);
  return JSON.parse(readFileSync(buildLaunchPath(), 'utf8')) as WatcherLaunch;
}

/** Every regular file under the folder whose text holds `value`; a socket or a folder is skipped. */
function filesHolding(folder: string, value: string): string[] {
  return readdirSync(folder, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
    .filter((path) => readFileSync(path, 'utf8').includes(value));
}

function decisionsOfKind(kind: string): readonly { questions: readonly { question: string }[]; context: string }[] {
  return (storedProgressOf(repositoryDirectory).decisions ?? []).filter((decision) => decision.kind === kind);
}

beforeEach(async () => {
  ({ ports } = world);
  repositoryDirectory = await createInitializedRecordedGitRepository('api-billing', ['--project', 'Example Agency'], SPEC_CLOCK, recordedGit);
  recordedGit.enterFlowStage('tracker ready', repositoryDirectory);
  monitorFolder = createScratchDirectory('h');
  overseerLog = [];
  await run(['gate', 'add', 'checks', '--', 'true']);
  await run(['oversee', 'resume']);
  await fileReadyTicket(run, ['ticket', 'add', '--type', 'ticket', 'Export the example roles']);
});

afterEach(async () => {
  await Promise.all(drivePassesOfThisTest.splice(0).map(async (drivePass) => await drivePass.stop()));
  removeScratchDirectory(monitorFolder);
  removeScratchDirectory(repositoryDirectory);
});

describeWhenRecorded(EVERY_RECORDING_REQUIREMENT, 'billing', () => {
  test.each([['absent', undefined], ['subscription', { mode: 'subscription' } as const]])(
    'with billing %s, the launched session holds neither API variable of the Overseer, copies none and keeps the OAuth token',
    async (_description, billing) => {
      setBilling(billing);
      const launch = await buildLaunchOf(drivePassWith(true));
      expect(launch.environment['ANTHROPIC_API_KEY']).toBeUndefined();
      expect(launch.environment['ANTHROPIC_AUTH_TOKEN']).toBeUndefined();
      expect(launch.environment['CLAUDE_CODE_OAUTH_TOKEN']).toBe('example-oauth-token');
      expect(launch.environmentFromWatcher).toBeUndefined();
      expect(launch.argv).not.toContain('--max-budget-usd');
    },
  );

  test('with api billing and a budget, the launch names ANTHROPIC_API_KEY to copy, passes the budget, and no file holds the planted key', async () => {
    setBilling({ mode: 'api', maxBudgetUsd: 3 });
    const drivePass = drivePassWith(true);
    const launch = await buildLaunchOf(drivePass);
    await passOnce(drivePass);

    expect(launch.environmentFromWatcher).toEqual({ ANTHROPIC_API_KEY: 'ANTHROPIC_API_KEY' });
    expect(launch.environment['ANTHROPIC_API_KEY']).toBeUndefined();
    expect(launch.environment['ANTHROPIC_AUTH_TOKEN']).toBeUndefined();
    expect(launch.argv.slice(launch.argv.indexOf('--max-budget-usd'), launch.argv.indexOf('--max-budget-usd') + 2)).toEqual(['--max-budget-usd', '3']);
    const { trackerDirectory } = requireWorkspace(repositoryDirectory);
    // The scan reads the launch file, which names the variable, so finding no key means something.
    expect(filesHolding(trackerDirectory, 'ANTHROPIC_API_KEY')).toContain(buildLaunchPath());
    for (const planted of [PLANTED_KEY, PLANTED_AUTH_TOKEN]) {
      expect(filesHolding(trackerDirectory, planted)).toEqual([]);
      expect(filesHolding(monitorFolder, planted)).toEqual([]);
    }
    expect(overseerLog.join('\n')).not.toContain(PLANTED_KEY);
    expect(decisionsOfKind('api-key-not-set')).toEqual([]);
  });

  test('with api billing and no key, no session starts and one decision names ANTHROPIC_API_KEY and the set-up section', async () => {
    setBilling({ mode: 'api' });
    const drivePass = drivePassWith(false);
    for (let pass = 0; pass < 3; pass += 1) await passOnce(drivePass);

    expect(buildJobId()).toBeDefined();
    expect(existsSync(buildLaunchPath())).toBe(false);
    const decisions = decisionsOfKind('api-key-not-set');
    expect(decisions).toHaveLength(1);
    const decisionText = JSON.stringify(decisions[0]);
    expect(decisionText).toContain('ANTHROPIC_API_KEY');
    expect(decisionText).toContain('API billing set-up');
    expect(filesHolding(requireWorkspace(repositoryDirectory).trackerDirectory, PLANTED_KEY)).toEqual([]);
  });
});
