/**
 * The pipeline's `billing` on a scratch tracker behind the Talos boundary, the Claude Code adapter's environment and arguments on a fake
 * session. What matters: with subscription billing, or none set, a session gets neither API variable of Hephaestus; with API billing the
 * launch names `ANTHROPIC_API_KEY` for Talos to copy and holds no key; a planted key is in no file of the data or monitor folder;
 * a budget reaches the launch arguments; and API billing with no key starts no session and opens one decision naming the variable and the
 * set-up section, which a Hephaestus started again with the key set, or with billing no longer `api`, withdraws, and which a first setup's
 * record billed `api` keeps open pass after pass; API billing on an agent that bills only by its login starts no session and stands not
 * launched `billing-not-offered`. No case calls the API or holds a real key.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join }                                     from 'node:path';
import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import type { ChildLaunch }                 from '../../src/domain/talos/ChildLaunch.ts';
import type { PipelineBilling }             from '../../src/domain/tracker-model/@types/Pipeline.ts';
import type { AgentAdapter }                from '../../src/lib/agent-launch/AgentAdapter.ts';
import type { AgentLaunchPlan }             from '../../src/lib/agent-launch/AgentLaunchPlan.ts';
import type { DrivePass, DrivePassRequest } from '../../src/services/hephaestus/DrivePass.ts';
import { jobFolderIn }                      from '../../src/services/hephaestus/HephaestusFiles.ts';
import { localStoreLayoutOf }               from '../../src/services/tracker/LocalStoreLayout.ts';
import { requireWorkspace }                 from '../../src/services/tracker/Workspace.ts';
import { API_RATE_LIMIT_BACKOFF_SECONDS }   from '../../src/shared/constants/HephaestusLimits.ts';
import { createScratchDrivePass }           from '../../src/testing/DrivePassHarness.ts';
import {
  DEFAULT_FAKE_AGENT_STEPS,
  fakeAgentAdapter,
  fakeAssistantTurnLine,
  type FakeAgentStep,
  fakeStartedLine
} from '../../src/testing/FakeAgentAdapter.ts';
import { fakeGateConfinement }                               from '../../src/testing/FakeGateConfinement.ts';
import { detailsLoggerOf }                                   from '../../src/testing/LoggedDetails.ts';
import { nativePlatformPorts }                               from '../../src/testing/NativePlatformPorts.ts';
import { useRecordedGit }                                    from '../../src/testing/RecordedGit.ts';
import { RECORDED_FLOW_MAIN_LINE }                           from '../../src/testing/RecordedGitFlow.ts';
import { type RecordedTalosStages, useRecordedTalosStages }  from '../../src/testing/RecordedTalosStages.ts';
import { createScratchDirectory, removeScratchDirectory }    from '../../src/testing/ScratchWorkspace.ts';
import { describeWhenRecorded, EVERY_RECORDING_REQUIREMENT } from '../../src/testing/ToolGuard.ts';
import { firstValueOf, waitUntil }                           from '../../src/testing/WaitUntil.ts';
import { recordedLineOf }                                    from '../../src/testing/fake-agent/RecordedClaudeLines.ts';
import { agentAdapterOfThisProcess }                         from '../CommandContext.ts';
import { createCapturedCommandContext }                      from '../testing/CapturedCommandContext.ts';
import { runCommandLineWithHephaestusMoves }                 from '../testing/HephaestusTicketMoves.ts';
import { createInitializedRecordedGitRepository }            from '../testing/InitializedScratchRepository.ts';
import { fileReadyTicket }                                   from '../testing/ReadyTicketFiling.ts';
import { storedProgressOf }                                  from '../testing/StoredProgress.ts';
import { HephaestusWording }                                 from './HephaestusWording.ts';

const recordedGit = useRecordedGit();

const SPEC_CLOCK = (): Date => new Date('2026-09-18T20:11:03Z');
const PLANTED_KEY = 'sk-ant-example-planted-hephaestus-key';
const PLANTED_AUTH_TOKEN = 'example-planted-hephaestus-auth-token';
const HEPHAESTUS_ENVIRONMENT = {
  HOME:                    '/Users/example',
  PATH:                    '/usr/bin:/bin',
  ANTHROPIC_API_KEY:       PLANTED_KEY,
  ANTHROPIC_AUTH_TOKEN:    PLANTED_AUTH_TOKEN,
  CLAUDE_CODE_OAUTH_TOKEN: 'example-oauth-token',
};

const world = useRecordedTalosStages(nativePlatformPorts());
let ports: RecordedTalosStages['ports'];
let repositoryDirectory = '';
let monitorFolder = '';
let hephaestusLog: string[] = [];
const drivePassesOfThisTest: DrivePass[] = [];

async function run(commandLineArguments: readonly string[]): Promise<ReturnType<typeof createCapturedCommandContext>> {
  const context  = createCapturedCommandContext({ currentDirectory: repositoryDirectory, now: SPEC_CLOCK, platformPorts: ports });
  const exitCode = await runCommandLineWithHephaestusMoves(commandLineArguments, context);
  expect(exitCode, `\`${commandLineArguments.join(' ')}\` failed: ${context.errorText()}`).toBe(0);
  return context;
}

/** The text a planted budget-stop result carries, which `budgetStopPlantedIn` gives the subtype no recording holds yet. */
const PLANTED_BUDGET_STOP_TEXT = 'Example planted stop at the budget';

function budgetStopPlantedIn(line: string): string {
  if (!line.includes(PLANTED_BUDGET_STOP_TEXT)) return line;
  return JSON.stringify({ ...JSON.parse(line) as Record<string, unknown>, subtype: 'error_max_budget_usd' });
}

/** The fake session's argv and files, with the Claude Code adapter's environment, copied variables and arguments beside them. */
function claudeBilledAdapter(steps: readonly FakeAgentStep[] = DEFAULT_FAKE_AGENT_STEPS): AgentAdapter {
  const fake = fakeAgentAdapter(steps);
  const claude = agentAdapterOfThisProcess();
  if (claude.vendor !== 'claude-code') throw new Error(`the spec process chose the ${claude.vendor} adapter, not Claude Code's`);
  return {
    ...fake,
    credentials:            claude.credentials,
    eventsOf:               (line) => fake.eventsOf(budgetStopPlantedIn(line)),
    inheritedVariableNames: claude.inheritedVariableNames,
    planOf:                 (request): AgentLaunchPlan => {
      const fakePlan = fake.planOf(request);
      const claudePlan = claude.planOf(request);
      return {
        ...fakePlan,
        argv:        [...fakePlan.argv, ...claudePlan.argv.slice(1)],
        environment: claudePlan.environment,
        ...(claudePlan.environmentFromTalos === undefined ? {} : { environmentFromTalos: claudePlan.environmentFromTalos }),
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
  const agentAdapter = claudeBilledAdapter();
  const drivePass = createScratchDrivePass({
    platformPorts:        { ...ports, gateConfinement: fakeGateConfinement('unconfined-by-design') },
    processStarts:        world.processStarts,
    workspace:            requireWorkspace(repositoryDirectory),
    now:                  SPEC_CLOCK,
    talosConnection:      () => world.connectionFor(requireWorkspace(repositoryDirectory).trackerDirectory),
    agentAdapter,
    monitorFolder,
    mainLine:             RECORDED_FLOW_MAIN_LINE,
    inheritedEnvironment: HEPHAESTUS_ENVIRONMENT,
    agentVariableIsSet:   () => apiBillingKeyIsSet,
    decisionWordingOf:    (draft) => HephaestusWording.decisionWordingOf(draft, agentAdapter),
    log:                  detailsLoggerOf(hephaestusLog),
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

/** The launch Talos took for the build session; `null` before one. */
function buildLaunch(): ChildLaunch | null {
  const jobId = buildJobId();
  return jobId === undefined ? null : world.launchOf(jobFolderIn(requireWorkspace(repositoryDirectory).trackerDirectory, jobId), 1);
}

async function buildLaunchOf(drivePass: DrivePass): Promise<ChildLaunch> {
  return await firstValueOf(async () => {
    await passOnce(drivePass);
    return buildLaunch() ?? undefined;
  }, () => `the build session's launch: ${hephaestusLog.join('\n')}`);
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
  hephaestusLog = [];
  await run(['gate', 'add', 'checks', '--', 'true']);
  await run(['gate', 'assistant', 'on']);
  await run(['unpause']);
  await fileReadyTicket(run, ['ticket', 'add', '--type', 'ticket', 'Export the example roles']);
});

afterEach(async () => {
  await Promise.all(drivePassesOfThisTest.splice(0).map(async (drivePass) => await drivePass.stop()));
  removeScratchDirectory(monitorFolder);
  removeScratchDirectory(repositoryDirectory);
});

describeWhenRecorded(EVERY_RECORDING_REQUIREMENT, 'billing', () => {
  test.each([['absent', undefined], ['subscription', { mode: 'subscription' } as const]])(
    'with billing %s, the launched session holds neither API variable of Hephaestus, copies none and keeps the OAuth token',
    async (_description, billing) => {
      setBilling(billing);
      const launch = await buildLaunchOf(drivePassWith(true));
      expect(launch.environment['ANTHROPIC_API_KEY']).toBeUndefined();
      expect(launch.environment['ANTHROPIC_AUTH_TOKEN']).toBeUndefined();
      expect(launch.environment['CLAUDE_CODE_OAUTH_TOKEN']).toBe('example-oauth-token');
      expect(launch.environmentFromTalos).toEqual({});
      expect(launch.argv).not.toContain('--max-budget-usd');
    },
  );

  test('with api billing and a budget, the launch names ANTHROPIC_API_KEY to copy, passes the budget, and no file holds the planted key', async () => {
    setBilling({ mode: 'api', maxBudgetUsd: 3 });
    const drivePass = drivePassWith(true);
    const launch = await buildLaunchOf(drivePass);
    await passOnce(drivePass);

    expect(launch.environmentFromTalos).toEqual({ ANTHROPIC_API_KEY: 'ANTHROPIC_API_KEY' });
    expect(launch.environment['ANTHROPIC_API_KEY']).toBeUndefined();
    expect(launch.environment['ANTHROPIC_AUTH_TOKEN']).toBeUndefined();
    expect(launch.argv.slice(launch.argv.indexOf('--max-budget-usd'), launch.argv.indexOf('--max-budget-usd') + 2)).toEqual(['--max-budget-usd', '3']);
    const { trackerDirectory } = requireWorkspace(repositoryDirectory);
    for (const planted of [PLANTED_KEY, PLANTED_AUTH_TOKEN]) {
      expect(filesHolding(trackerDirectory, planted)).toEqual([]);
      expect(filesHolding(monitorFolder, planted)).toEqual([]);
    }
    expect(hephaestusLog.join('\n')).not.toContain(PLANTED_KEY);
    expect(decisionsOfKind('api-key-not-set')).toEqual([]);
  });

  test('with api billing and no key, no session starts and one decision names ANTHROPIC_API_KEY and the set-up section', async () => {
    setBilling({ mode: 'api' });
    const drivePass = drivePassWith(false);
    for (let pass = 0; pass < 3; pass += 1) await passOnce(drivePass);

    expect(buildJobId()).toBeDefined();
    expect(buildLaunch()).toBeNull();
    const decisions = decisionsOfKind('api-key-not-set');
    expect(decisions).toHaveLength(1);
    const decisionText = JSON.stringify(decisions[0]);
    expect(decisionText).toContain('ANTHROPIC_API_KEY');
    expect(decisionText).toContain('API billing set-up');
    expect(filesHolding(requireWorkspace(repositoryDirectory).trackerDirectory, PLANTED_KEY)).toEqual([]);
  });

  test('with api billing on an agent that bills only by its login, no session starts: the job stands not launched billing-not-offered', async () => {
    setBilling({ mode: 'api' });
    const loginOnly: AgentAdapter = { ...claudeBilledAdapter(), billingOptions: [{ mode: 'subscription', keyVariableName: null, capsEachLaunch: false }] };
    const drivePass = drivePassWith(true, { agentAdapter: loginOnly });
    for (let pass = 0; pass < 3; pass += 1) await passOnce(drivePass);

    expect(buildLaunch()).toBeNull();
    const buildJobNow = (storedProgressOf(repositoryDirectory).jobs ?? []).find((job) => job.kind === 'build');
    expect(buildJobNow?.notLaunched?.cause).toBe('billing-not-offered');
    expect(decisionsOfKind('api-key-not-set')).toEqual([]);
  });

  test('a first setup billed api with no key keeps its one decision open pass after pass, though the stored pipeline needs no key', async () => {
    await run(['pipeline', 'setup', '--agent', process.execPath, '--billing', 'api']);
    const drivePass = drivePassWith(false);
    for (let pass = 0; pass < 4; pass += 1) await passOnce(drivePass);

    expect(decisionsOfKind('api-key-not-set')).toHaveLength(1);
    const apiKeyDecisionOpenings = logRecords().filter((record) => record.kind === 'decision-opened' && record.fields['kind'] === 'api-key-not-set');
    expect([apiKeyDecisionOpenings.length, logRecords().some((record) => record.kind === 'decision-withdrawn')]).toEqual([1, false]);
  });

  test.each([
    ['the key is set', { mode: 'api' } as const],
    ['the billing is set to subscription', { mode: 'subscription' } as const],
  ])('a Hephaestus started again after %s withdraws the open api-key-not-set decision and starts the session', async (_description, billingAtRestart) => {
    setBilling({ mode: 'api' });
    const hephaestusWithoutKey = drivePassWith(false);
    await passOnce(hephaestusWithoutKey);
    expect(decisionsOfKind('api-key-not-set')).toHaveLength(1);
    await hephaestusWithoutKey.stop();

    setBilling(billingAtRestart);
    await buildLaunchOf(drivePassWith(billingAtRestart.mode === 'api'));
    expect(decisionsOfKind('api-key-not-set')).toEqual([]);
    expect(logRecords().some((record) => record.kind === 'decision-withdrawn')).toBe(true);
  });
});

/** A recorded result line of the real `claude`, its values planted as API billing would answer; no case calls the API. */
function plantedResultLine(values: Readonly<Record<string, unknown>>): string {
  return recordedLineOf(JSON.stringify({
    type: 'result', subtype: 'success', is_error: true, ...values
  }));
}

const RATE_LIMITED_RESULT = {
  api_error_status: 429, api_error: 'rate_limit_error', result: 'API Error: 429 rate_limit_error', total_cost_usd: 0.01
};
const REFUSED_KEY_RESULT  = {
  api_error_status: 401, api_error: 'authentication_error', result: 'Invalid API key · Please run /login', total_cost_usd: 0
};
const BUDGET_STOP_RESULT  = {
  api_error_status: null, api_error: null, result: PLANTED_BUDGET_STOP_TEXT, total_cost_usd: 3.02
};

function sessionEndingIn(result: Readonly<Record<string, unknown>>): FakeAgentStep[] {
  return [
    { kind: 'print', line: fakeStartedLine('fake-session') },
    { kind: 'print', line: fakeAssistantTurnLine('msg_example_turn') },
    { kind: 'print', line: plantedResultLine(result) },
    { kind: 'await-line' },
  ];
}

interface LoggedRecord {
  kind:   string;
  jobId?: string;
  fields: Record<string, unknown>;
}

function logRecords(): LoggedRecord[] {
  return readFileSync(localStoreLayoutOf(requireWorkspace(repositoryDirectory)).logRecordPath, 'utf8').split('\n').filter((line) => line !== '')
    .map((line) => JSON.parse(line) as LoggedRecord);
}

function buildJob(): { id: string; state: string; interruption?: string; childInstance: number } | undefined {
  return (storedProgressOf(repositoryDirectory).jobs ?? []).find((job) => job.kind === 'build');
}

/** Every state any job had at the end of each hold phase, so a move into `in-customs` and out again in one hold is seen too. */
function jobStateWatch(): { states: Set<string>; afterHoldPhase: NonNullable<DrivePassRequest['afterHoldPhase']> } {
  const states = new Set<string>();
  return { states, afterHoldPhase: (_phase, board) => board.jobs().forEach((job) => states.add(job.state)) };
}

async function passUntil(drivePass: DrivePass, condition: () => boolean, what: string): Promise<void> {
  await waitUntil(async () => {
    await passOnce(drivePass);
    return condition();
  }, () => `${what}: ${hephaestusLog.join('\n')}\n${JSON.stringify(storedProgressOf(repositoryDirectory).jobs)}`);
}

function buildJobEnded(): LoggedRecord | undefined {
  const buildJobIds = logRecords().filter((record) => record.kind === 'job-launched' && record.fields['kind'] === 'build').map((record) => record.jobId);
  return logRecords().find((record) => record.kind === 'job-ended' && buildJobIds.includes(record.jobId));
}

function spawnLines(): string[] {
  return hephaestusLog.filter((line) => line.startsWith('Launched child instance'));
}

/** The Assistant boots beside the build and plays the same session, so each case reads the build job's own records. */
describeWhenRecorded(EVERY_RECORDING_REQUIREMENT, 'API billing results', () => {
  test('a 429 result interrupts the job as a usage limit, never reaches in-customs, and resumes it once the backoff has passed', async () => {
    setBilling({ mode: 'api' });
    const clock = { stamp: '2026-09-18T22:11:03+02:00' };
    const watch = jobStateWatch();
    const drivePass = drivePassWith(true, {
      agentAdapter:   claudeBilledAdapter(sessionEndingIn(RATE_LIMITED_RESULT)),
      now:            () => new Date(Date.parse(clock.stamp)),
      formatStamp:    () => clock.stamp,
      afterHoldPhase: watch.afterHoldPhase,
    });
    await passUntil(drivePass, () => buildJob()?.state === 'interrupted', 'the build job interrupted');
    const jobId = String(buildJob()?.id);
    expect(buildJob()).toMatchObject({ interruption: 'usage-limit', childInstance: 1 });
    const hit = logRecords().find((record) => record.kind === 'usage-limit-hit' && record.jobId === jobId);
    const expectedReset = new Date(Date.parse(clock.stamp) + (API_RATE_LIMIT_BACKOFF_SECONDS * 1000)).toISOString();
    expect(hit?.fields).toEqual({ window: 'api-rate-limit', resetsAt: expectedReset });

    await passOnce(drivePass);
    expect(buildJob()).toMatchObject({ id: jobId, state: 'interrupted', childInstance: 1 });
    clock.stamp = '2026-09-18T22:12:04+02:00';
    await passUntil(drivePass, () => (buildJob()?.childInstance ?? 0) >= 2, 'the build job resumed after the backoff');
    expect(logRecords().some((record) => record.kind === 'job-resumed' && record.jobId === jobId && record.fields['cause'] === 'usage-limit')).toBe(true);
    expect(watch.states.has('in-customs')).toBe(false);
  });

  test('a refused key interrupts the session, opens one decision naming the failure, and nothing starts until User answers it', async () => {
    setBilling({ mode: 'api' });
    const watch = jobStateWatch();
    const drivePass = drivePassWith(true, { agentAdapter: claudeBilledAdapter(sessionEndingIn(REFUSED_KEY_RESULT)), afterHoldPhase: watch.afterHoldPhase });
    const openDecisions = (): readonly { id: string; context: string }[] => (storedProgressOf(repositoryDirectory).decisions ?? [])
      .filter((decision) => decision.kind === 'api-authentication-failed');
    await passUntil(drivePass, () => openDecisions().length > 0, 'the authentication decision');
    // An interrupted Assistant is replaced in the same hold, so the log is where its interruption shows.
    expect(logRecords().some((record) => record.kind === 'job-interrupted' && record.fields['cause'] === 'authentication-failed')).toBe(true);
    const spawnsBefore = spawnLines().length;

    // The build waits to spawn or to resume, and the replaced Assistant to boot: each is held while the decision is open.
    expect(buildJob()).toBeDefined();
    for (let pass = 0; pass < 4; pass += 1) await passOnce(drivePass);
    expect(openDecisions()).toHaveLength(1);
    expect(openDecisions()[0]?.context).toContain('status 401');
    expect(openDecisions()[0]?.context).toContain('Invalid API key');
    expect(spawnLines()).toHaveLength(spawnsBefore);
    expect(watch.states.has('in-customs')).toBe(false);

    await run(['decide', String(openDecisions()[0]?.id), '--', 'The key is set again']);
    await passUntil(drivePass, () => spawnLines().length > spawnsBefore, 'a session started after the answer');
  });

  test('a budget stop ends the job blocked without in-customs, opens one decision naming the budget, and its credit record holds the cost', async () => {
    setBilling({ mode: 'api', maxBudgetUsd: 3 });
    const watch = jobStateWatch();
    const drivePass = drivePassWith(true, { agentAdapter: claudeBilledAdapter(sessionEndingIn(BUDGET_STOP_RESULT)), afterHoldPhase: watch.afterHoldPhase });
    await passUntil(drivePass, () => buildJobEnded() !== undefined, 'the build job ended');
    const ended = buildJobEnded();
    expect(ended?.fields).toMatchObject({ outcome: 'blocked', cause: 'budget-reached' });
    expect(watch.states.has('in-customs')).toBe(false);
    const decisions = (storedProgressOf(repositoryDirectory).decisions ?? [])
      .filter((decision) => decision.kind === 'budget-reached' && decision.ticketIds.includes('001'));
    expect(decisions).toHaveLength(1);
    expect(decisions[0]?.context).toContain('maxBudgetUsd 3');
    expect(decisions[0]?.jobId).toBe(String(ended?.jobId));
    const credit = logRecords().find((record) => record.kind === 'agent-stopped' && record.fields['agentId'] === ended?.jobId);
    expect(credit?.fields['costUsd']).toBe(3.02);

    for (let pass = 0; pass < 3; pass += 1) await passOnce(drivePass);
    expect(buildJob()).toBeUndefined();
  });
});
