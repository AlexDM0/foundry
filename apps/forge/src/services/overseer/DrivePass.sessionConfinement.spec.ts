/**
 * A pass launches a session under the confinement its agent adapter declares. What matters: with an adapter that confines its sessions
 * itself (Claude Code's capability, which the fake agent keeps) the launch is as before and forge's confinement wraps nothing, since a
 * nested Seatbelt profile is refused; with a planted adapter that declares `ownConfinement: 'none'` the session's argv is wrapped by the
 * `GateConfinement` port under a plan of its profile, an `unavailable` port refuses the launch with the `sandbox-unavailable` incident, and
 * so does a profile with network domains, since forge's confinement never widens a domain line. The sessions play
 * `src/testing/RecordedTalosStages.ts`; git answers from the recorded flow stages.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join }                     from 'node:path';
import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import type { AgentAdapter }                                     from '../../lib/agent-launch/AgentAdapter.ts';
import type { AgentLaunchPlan }                                  from '../../lib/agent-launch/AgentLaunchPlan.ts';
import type { PipelineGate }                                     from '../../lib/tracker-model/@types/Pipeline.ts';
import { createScratchDrivePass }                                from '../../testing/DrivePassHarness.ts';
import { fakeAgentAdapter, type FakeAgentStep, fakeStartedLine } from '../../testing/FakeAgentAdapter.ts';
import {
  FAKE_CONFINER_ARGV,
  FAKE_MISSING_TOOLS_REASON,
  type FakeGateConfinement,
  fakeGateConfinement
} from '../../testing/FakeGateConfinement.ts';
import { LIVE_HOLDERS_LOCK_TAKER }                             from '../../testing/LockTakers.ts';
import { nativePlatformPorts }                                 from '../../testing/NativePlatformPorts.ts';
import { useRecordedGit }                                      from '../../testing/RecordedGit.ts';
import { RECORDED_FLOW_MAIN_LINE }                             from '../../testing/RecordedGitFlow.ts';
import { type RecordedTalosStages, useRecordedTalosStages }    from '../../testing/RecordedTalosStages.ts';
import { createScratchDirectory, removeScratchDirectory }      from '../../testing/ScratchWorkspace.ts';
import { describeWhenRecorded, EVERY_RECORDING_REQUIREMENT }   from '../../testing/ToolGuard.ts';
import { writeReadableTracker }                                from '../../testing/TrackerFileFixtures.ts';
import { waitUntil }                                           from '../../testing/WaitUntil.ts';
import { localStoreLayoutOf }                                  from '../tracker/LocalStoreLayout.ts';
import { writeTracker }                                        from '../tracker/TrackerPipeline.ts';
import { requireProgressFile }                                 from '../tracker/TrackerReader.ts';
import { workspacePathsFor, type Workspace }                   from '../tracker/Workspace.ts';
import type { BoardChildren }                                  from './BoardChildren.ts';
import type { DrivePass }                                      from './DrivePass.ts';
import { CONSTITUTION_DEFAULT_PATH, defaultInstructionPathOf } from './InstructionFiles.ts';
import { NETWORK_DOMAINS_REFUSAL }                             from './SessionConfinement.ts';
import { createTalosChildren }                                 from './TalosChildren.ts';

const recordedGit = useRecordedGit();
const world = useRecordedTalosStages(nativePlatformPorts());

const STAMP = '2026-09-18T22:11:03+02:00';
const CHANGED_AT = '2026-09-18T20:05:00+02:00';
const WAITING_STEPS: readonly FakeAgentStep[] = [{ kind: 'print', line: fakeStartedLine('fake-session') }, { kind: 'await-line' }];
const CHECKS_GATE: PipelineGate = { name: 'checks', run: 'true' };

let ports: RecordedTalosStages['ports'];
let repository = '';
let workspace: Workspace;
let monitorFolder = '';
let overseerLog: string[] = [];
/** Each plan the pass sent Talos, as it sent it; Talos is handed it unwrapped, so the recorded stages play the fake's scenario. */
let launchedPlans: AgentLaunchPlan[] = [];
let adapterPlans: AgentLaunchPlan[] = [];
/** The argv of each worker session the adapter planned, a worker being a session that owes a report. */
let workerArgvs: string[][] = [];

function recordingAdapter(ownConfinement: 'applies-the-profile' | 'none'): AgentAdapter {
  const adapter = fakeAgentAdapter(WAITING_STEPS);
  return {
    ...adapter,
    capabilities: { ...adapter.capabilities, ownConfinement },
    planOf(request) {
      const plan = adapter.planOf(request);
      adapterPlans.push(plan);
      if (request.reportSchema !== null) workerArgvs.push([...plan.argv]);
      return plan;
    },
  };
}

function unwrapped(plan: AgentLaunchPlan): AgentLaunchPlan {
  const isWrapped = FAKE_CONFINER_ARGV.every((part, index) => plan.argv[index] === part);
  return isWrapped ? { ...plan, argv: plan.argv.slice(FAKE_CONFINER_ARGV.length) } : plan;
}

function launchRecordingChildren(): BoardChildren {
  const children = createTalosChildren({ boardFolder: workspace.trackerDirectory, platformPorts: ports, connection: () => world.connectionFor(workspace.trackerDirectory) });
  return {
    ...children,
    launchAgent: (request) => {
      launchedPlans.push(request.plan);
      return children.launchAgent({ ...request, plan: unwrapped(request.plan) });
    },
  };
}

function startedOverseer(adapter: AgentAdapter, gateConfinement: FakeGateConfinement): DrivePass {
  return createScratchDrivePass({
    platformPorts:     { ...ports, gateConfinement },
    processStarts:     world.processStarts,
    workspace,
    now:               () => new Date(Date.parse(STAMP)),
    formatStamp:       () => STAMP,
    talosConnection:   () => world.connectionFor(workspace.trackerDirectory),
    boardChildren:     launchRecordingChildren(),
    agentAdapter:      adapter,
    monitorFolder,
    mainLine:          RECORDED_FLOW_MAIN_LINE,
    // An incident's decision needs a question, as the Overseer's own wording gives it.
    decisionWordingOf: (draft) => ({
      questions: [{
        question: `Example ${draft.kind}?`, header: draft.kind, multiSelect: false, options: []
      }],
      context: ''
    }),
    log: (line) => overseerLog.push(line),
  });
}

async function passUntil(drivePass: DrivePass, condition: () => boolean, what: string): Promise<void> {
  await waitUntil(async () => {
    drivePass.wake(true);
    await drivePass.idle();
    return condition();
  }, () => `${what}:\n${overseerLog.join('\n')}`);
}

function workerSessionLaunched(): boolean {
  return workerArgvs.some((argv) => launchedPlans.some((plan) => unwrapped(plan).argv.join('\n') === argv.join('\n')));
}

function sandboxIncidents(): readonly { kind: string; facts: Record<string, unknown> }[] {
  return (requireProgressFile(workspace).incidents ?? []).filter((incident) => incident.kind === 'sandbox-unavailable');
}

async function writeBoard(gate: PipelineGate): Promise<void> {
  await writeTracker({
    lockTaker: LIVE_HOLDERS_LOCK_TAKER,
    workspace,
    at:        CHANGED_AT,
    now:       () => new Date(Date.parse(STAMP)),
    mutate:    (change) => {
      change.board.addGate(gate, change.at);
      change.board.setOverseerState('running', change.at);
    },
  });
}

describeWhenRecorded(EVERY_RECORDING_REQUIREMENT, 'a session launched by the pass', () => {
  beforeEach(() => {
    ({ ports } = world);
    repository    = createScratchDirectory('session-confinement');
    mkdirSync(join(repository, '.git'));
    recordedGit.enterFlowStage('tracker ready', repository);
    workspace     = workspacePathsFor(repository);
    monitorFolder = createScratchDirectory('h');
    overseerLog   = [];
    launchedPlans = [];
    adapterPlans  = [];
    workerArgvs   = [];
    mkdirSync(localStoreLayoutOf(workspace).ticketRecordsFolder, { recursive: true });
    writeReadableTracker(workspace);
    const instructionDefaults = [CONSTITUTION_DEFAULT_PATH, ...(['builder', 'reviewer', 'conflictReReviewer', 'productOwner', 'assistant'] as const).map(defaultInstructionPathOf)];
    for (const path of instructionDefaults) {
      mkdirSync(join(repository, path, '..'), { recursive: true });
      writeFileSync(join(repository, path), 'Example instructions.\n');
    }
  });

  afterEach(() => {
    removeScratchDirectory(monitorFolder);
    removeScratchDirectory(repository);
  });

  test('with an agent that applies the profile itself, the plan is the adapter\'s own and forge\'s confinement wraps no session', async () => {
    await writeBoard(CHECKS_GATE);
    const gateConfinement = fakeGateConfinement('confined');
    await passUntil(startedOverseer(recordingAdapter('applies-the-profile'), gateConfinement), workerSessionLaunched, 'no session launched');

    expect(launchedPlans.map((plan) => plan.argv)).toEqual(adapterPlans.map((plan) => plan.argv));
    expect(gateConfinement.plans).toEqual([]);
  });

  test('with an agent that brings no sandbox, the port wraps the session\'s argv under a plan of its profile and the agent\'s own folders', async () => {
    await writeBoard(CHECKS_GATE);
    const gateConfinement = fakeGateConfinement('confined');
    const adapter = recordingAdapter('none');
    await passUntil(startedOverseer(adapter, gateConfinement), workerSessionLaunched, 'no session launched');

    expect(launchedPlans.map((plan) => plan.argv)).toEqual(adapterPlans.map((plan) => [...FAKE_CONFINER_ARGV, ...plan.argv]));
    expect(gateConfinement.plans.length).toBe(launchedPlans.length);
    for (const plan of gateConfinement.plans) {
      expect(plan).toMatchObject({ network: true, writableCachePaths: [], worktreeAdminFolder: null });
      expect(plan.writableRoots).toEqual(expect.arrayContaining([...adapter.sessionWritablePathsOf(monitorFolder)]));
    }
  });

  test('with an agent that brings no sandbox, an unavailable port refuses the build session with the sandbox-unavailable incident', async () => {
    await writeBoard(CHECKS_GATE);
    const drivePass = startedOverseer(recordingAdapter('none'), fakeGateConfinement('unavailable'));
    await passUntil(drivePass, () => sandboxIncidents().length > 0, 'no sandbox-unavailable incident opened');

    expect(launchedPlans).toEqual([]);
    expect(sandboxIncidents()[0]?.facts).toEqual({ step: 'worker', reason: FAKE_MISSING_TOOLS_REASON });
  });

  test('with an agent that brings no sandbox, a profile with network domains is refused, never widened to the whole network', async () => {
    await writeBoard({ ...CHECKS_GATE, network: ['registry.example.org'] });
    const drivePass = startedOverseer(recordingAdapter('none'), fakeGateConfinement('confined'));
    await passUntil(drivePass, () => sandboxIncidents().length > 0, 'no sandbox-unavailable incident opened');

    expect(sandboxIncidents()[0]?.facts).toEqual({ step: 'worker', reason: NETWORK_DOMAINS_REFUSAL });
    expect(workerArgvs).toEqual([]);
  });
});
