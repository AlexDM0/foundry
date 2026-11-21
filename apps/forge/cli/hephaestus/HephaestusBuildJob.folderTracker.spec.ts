/**
 * A build job's code for a tracker in a folder of its repository with a branch namespace, on the recorded folder flow of
 * `src/testing/RecordedGitFlow.ts` behind the Talos boundary, as `cli/hephaestus/HephaestusBuildJob.spec.ts` runs a root tracker's. What
 * matters: a folder tracker's git calls are frozen, so no change moves them unnoticed. Each flow asks
 * git exactly the calls in `cli/hephaestus/FrozenFolderTrackerGitCalls.json`: a clean run to the landing, a conflict an Airlock agent
 * resolves, whose resolution V5, V17 and V13 then judge against git's own merge, a red merged tree whose fix by the resumed Airlock agent
 * they judge again before the landing, and a red handoff that parks the ticket.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join }                                   from 'node:path';

import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import type { AgentAdapter }                           from '../../src/lib/agent-launch/AgentAdapter.ts';
import type { Board }                                  from '../../src/lib/tracker-model/Board.ts';
import type { DrivePass }                              from '../../src/services/hephaestus/DrivePass.ts';
import { requireWorkspace }                            from '../../src/services/tracker/Workspace.ts';
import { branchNamesOf }                               from '../../src/shared/BranchNames.ts';
import { createScratchDrivePass, seatbeltThatApplies } from '../../src/testing/DrivePassHarness.ts';
import {
  type FakeAgentStep,
  FAKE_HEAD_PLACEHOLDER,
  fakeAgentAdapter,
  fakeResultLine,
  fakeStartedLine
} from '../../src/testing/FakeAgentAdapter.ts';
import { type LoggedGitCall, startGitCallLog } from '../../src/testing/GitCallLog.ts';
import { inheritedEnvironment }                from '../../src/testing/InheritedEnvironment.ts';
import { nativePlatformPorts }                 from '../../src/testing/NativePlatformPorts.ts';
import { useRecordedGit }                      from '../../src/testing/RecordedGit.ts';
import {
  RECORDED_FLOW_IGNORE_FILE_TEXT,
  RECORDED_FLOW_MAIN_LINE,
  RECORDED_FOLDER_FLOW_COMMIT,
  RECORDED_FOLDER_FLOW_CONFLICT_PATH,
  RECORDED_FOLDER_FLOW_MERGED_TREE_FIX,
  RECORDED_FOLDER_FLOW_PROJECT,
  type RecordedFolderFlowStageName
} from '../../src/testing/RecordedGitFlow.ts';
import { type RecordedTalosStages, useRecordedTalosStages }               from '../../src/testing/RecordedTalosStages.ts';
import { createScratchDirectory, removeScratchDirectory, runScratchRoot } from '../../src/testing/ScratchWorkspace.ts';
import { describeWhenRecorded, EVERY_RECORDING_REQUIREMENT }              from '../../src/testing/ToolGuard.ts';
import { waitUntil }                                                      from '../../src/testing/WaitUntil.ts';
import { runCommandLine }                                                 from '../Main.ts';
import { createCapturedCommandContext }                                   from '../testing/CapturedCommandContext.ts';
import { createRecordedGitRepository }                                    from '../testing/InitializedScratchRepository.ts';
import { fileReadyTicket }                                                from '../testing/ReadyTicketFiling.ts';
import { storedLogTextOf }                                                from '../testing/StoredLogText.ts';
import { HephaestusWording }                                              from './HephaestusWording.ts';

const recordedGit = useRecordedGit();

const SPEC_CLOCK = (): Date => new Date('2026-09-18T20:11:03Z');
const GATE_LINE = 'echo example-checks';
const RED_GATE_END = { exitCode: 1, output: 'expected 2, received 3\n' };
const FROZEN_FOLDER_TRACKER_GIT_CALLS_PATH = join(import.meta.dir, 'FrozenFolderTrackerGitCalls.json');
const CLAIMED_GATE_NAMES = ['checks'];

const world = useRecordedTalosStages(nativePlatformPorts());
let ports: RecordedTalosStages['ports'];
let repositoryDirectory = '';
let projectDirectory = '';
let monitorFolder = '';
let hephaestusLog: string[] = [];
let afterEachHoldPhase: (board: Board) => void = () => undefined;
let airlockAgentSteps: readonly FakeAgentStep[] | null = null;
let flowCallsBeforeTheFix = 0;

async function run(commandLineArguments: readonly string[]) {
  const context  = createCapturedCommandContext({ currentDirectory: projectDirectory, now: SPEC_CLOCK, platformPorts: ports });
  const exitCode = await runCommandLine(commandLineArguments, context);
  expect(exitCode, `\`${commandLineArguments.join(' ')}\` failed: ${context.errorText()}`).toBe(0);
  return context;
}

function enterFlowStage(stage: RecordedFolderFlowStageName): void {
  recordedGit.enterFlowStage(stage, repositoryDirectory);
}

/** The Airlock agent plays the steps a case names for it; every other session plays the builder's. */
function airlockCapturingAdapterOf(adapter: AgentAdapter): AgentAdapter {
  return {
    ...adapter,
    planOf: (request) => {
      const reportTitle = (request.reportSchema as { title?: string } | null)?.title ?? '';
      if (reportTitle === 'airlock agent report' && airlockAgentSteps !== null) return fakeAgentAdapter(airlockAgentSteps).planOf(request);
      return adapter.planOf(request);
    },
  };
}

function drivePassPlaying(steps: readonly FakeAgentStep[]): DrivePass {
  return createScratchDrivePass({
    platformPorts:        { ...ports, gateConfinement: seatbeltThatApplies() },
    processStarts:        world.processStarts,
    workspace:            requireWorkspace(projectDirectory),
    now:                  SPEC_CLOCK,
    talosConnection:      () => world.connectionFor(requireWorkspace(projectDirectory).trackerDirectory),
    agentAdapter:         airlockCapturingAdapterOf(fakeAgentAdapter(steps)),
    monitorFolder,
    inheritedEnvironment: inheritedEnvironment(),
    mainLine:             RECORDED_FLOW_MAIN_LINE,
    branchNames:          branchNamesOf(RECORDED_FOLDER_FLOW_PROJECT.namespace),
    decisionWordingOf:    (draft) => HephaestusWording.decisionWordingOf(draft, fakeAgentAdapter().credentials),
    redHandoffMessageOf:  HephaestusWording.redHandoffMessageOf,
    log:                  (line) => hephaestusLog.push(line),
    afterHoldPhase:       (_phase, board) => afterEachHoldPhase(board),
  });
}

interface LoggedEntry {
  kind:   string;
  jobId?: string;
  fields: Record<string, unknown>;
}

function loggedEntries(kind: string): LoggedEntry[] {
  return storedLogTextOf(projectDirectory).split('\n').filter((line) => line !== '')
    .map((line) => JSON.parse(line) as LoggedEntry).filter((entry) => entry.kind === kind);
}

function buildJobEnding(): Record<string, unknown> | undefined {
  const buildJobId = loggedEntries('job-launched').find((entry) => entry.fields['kind'] === 'build')?.jobId;
  return loggedEntries('job-ended').find((entry) => entry.jobId === buildJobId)?.fields;
}

async function passUntil(drivePass: DrivePass, holds: () => boolean, what: string): Promise<void> {
  await waitUntil(async () => {
    drivePass.wake(true);
    await drivePass.idle();
    return holds();
  }, () => `${what}:\n${hephaestusLog.join('\n')}`);
}

/** A shell step that acts in the ticket worktree only: the Assistant plays the same steps in its session folder. */
function shellStepInTicketWorktree(command: string, stage: RecordedFolderFlowStageName): FakeAgentStep {
  world.scriptShell(command, (workingDirectory) => {
    if (workingDirectory.includes('/ticket-')) enterFlowStage(stage);
  });
  return { kind: 'shell', command };
}

function buildingSession(): FakeAgentStep[] {
  const report = fakeResultLine({
    role:              'builder',
    outcome:           'built',
    headCommit:        FAKE_HEAD_PLACEHOLDER,
    acceptance:        [{ item: 'A1', state: 'met', evidence: 'Example spec proves it' }, { item: 'A2', state: 'met', evidence: 'Example probe' }],
    alsoFixed:         [],
    gates:             CLAIMED_GATE_NAMES.map((name) => ({ name, commit: FAKE_HEAD_PLACEHOLDER })),
    handoff:           'Example handoff by Alex Example: the example holds.',
    blockedReason:     null,
    cannotBuildReason: null,
  });
  return [
    { kind: 'print', line: fakeStartedLine('fake-session') },
    shellStepInTicketWorktree(`commit ${RECORDED_FOLDER_FLOW_COMMIT.path}: ${RECORDED_FOLDER_FLOW_COMMIT.message}`, 'folder tree changed'),
    { kind: 'print', line: report },
    { kind: 'await-line' },
  ];
}

function airlockAgentResolvingTheConflict(): FakeAgentStep[] {
  const report = {
    role: 'builder', outcome: 'resolved', headCommit: FAKE_HEAD_PLACEHOLDER, resolvedFiles: [RECORDED_FOLDER_FLOW_CONFLICT_PATH], notes: 'Example notes', reportKind: null
  };
  return [
    { kind: 'print', line: fakeStartedLine('fake-airlock-session') },
    shellStepInTicketWorktree(`resolve ${RECORDED_FOLDER_FLOW_CONFLICT_PATH}`, 'folder conflict resolved'),
    { kind: 'print', line: fakeResultLine(report) },
    { kind: 'await-line' },
  ];
}

/**
 * The Airlock agent's resolution leaves the merged tree red; the resumed session plays the same steps, and its second commit in the ticket
 * worktree is the fix, which turns the gate green.
 */
function airlockAgentResolvingThenFixingTheMergedTree(): FakeAgentStep[] {
  const command = `resolve ${RECORDED_FOLDER_FLOW_CONFLICT_PATH}, then fix ${RECORDED_FOLDER_FLOW_MERGED_TREE_FIX.path}`;
  let commitsInTicketWorktree = 0;
  world.scriptShell(command, (workingDirectory) => {
    if (!workingDirectory.includes('/ticket-')) return;
    commitsInTicketWorktree += 1;
    const isTheResolution = commitsInTicketWorktree === 1;
    if (!isTheResolution) flowCallsBeforeTheFix = recordedGit.flowCalls().length;
    world.scriptLine(GATE_LINE, isTheResolution ? RED_GATE_END : { exitCode: 0 });
    enterFlowStage(isTheResolution ? 'folder conflict resolved' : 'folder merged tree fixed');
  });
  const report = {
    role: 'builder', outcome: 'resolved', headCommit: FAKE_HEAD_PLACEHOLDER, resolvedFiles: [RECORDED_FOLDER_FLOW_CONFLICT_PATH], notes: 'Example notes', reportKind: null
  };
  return [
    { kind: 'print', line: fakeStartedLine('fake-airlock-session') },
    { kind: 'shell', command },
    { kind: 'print', line: fakeResultLine(report) },
    { kind: 'await-line' },
  ];
}

/** The ticket branch conflicts with the main line once the merge is queued, and the Airlock agent plays `steps`. */
function conflictWithTheMovedMainLineResolvedBy(steps: readonly FakeAgentStep[]): void {
  afterEachHoldPhase = (board) => {
    if (!board.logRecordsSoFar().some((record) => record.kind === 'merge-queued')) return;
    afterEachHoldPhase = () => undefined;
    enterFlowStage('folder branch conflicting with main');
  };
  airlockAgentSteps = steps;
  // The resolved merge is gated before it lands; its spawn options are a pure answer, so the native one stands in for the recorded table.
  const { spawnOptionsFor } = nativePlatformPorts().processSupervision;
  ports = { ...ports, processSupervision: { ...ports.processSupervision, spawnOptionsFor } };
}

async function passUntilLanded(): Promise<void> {
  const drivePass = drivePassPlaying(buildingSession());
  await passUntil(drivePass, () => loggedEntries('job-ended').some((entry) => entry.fields['outcome'] === 'landed'), 'the landing');
}

beforeEach(async () => {
  ({ ports } = world);
  world.scriptLine(GATE_LINE, { exitCode: 0 });
  repositoryDirectory = createRecordedGitRepository('folder-tracker-build-job');
  projectDirectory = join(repositoryDirectory, RECORDED_FOLDER_FLOW_PROJECT.prefix);
  mkdirSync(projectDirectory, { recursive: true });
  writeFileSync(join(projectDirectory, '.gitignore'), RECORDED_FLOW_IGNORE_FILE_TEXT);
  monitorFolder = createScratchDirectory('h');
  hephaestusLog = [];
  afterEachHoldPhase = () => undefined;
  airlockAgentSteps = null;
  flowCallsBeforeTheFix = 0;
  enterFlowStage('folder tracker ready');
  await run(['init', '--project', 'Example Agency', '--root', projectDirectory, '--namespace', RECORDED_FOLDER_FLOW_PROJECT.namespace]);
  await run(['unpause']);
  await fileReadyTicket(run, ['ticket', 'add', '--type', 'ticket', 'Export the example roles']);
  await run(['gate', 'add', 'checks', '--', GATE_LINE]);
  await run(['gate', 'assistant', 'on']);
});

afterEach(() => {
  removeScratchDirectory(monitorFolder);
  removeScratchDirectory(repositoryDirectory);
});

/**
 * Each flow the frozen replay runs, under its name in `FrozenFolderTrackerGitCalls.json`. Each was taken from be2d36e8 by running its case
 * there with the distinct calls written out. Retake one the same way from the commit before a change meant to move a folder tracker's git,
 * never from this run.
 */
const FROZEN_FOLDER_TRACKER_FLOWS = {
  'a clean run to the landing':           passUntilLanded,
  'a conflict an Airlock agent resolves': async () => {
    conflictWithTheMovedMainLineResolvedBy(airlockAgentResolvingTheConflict());
    await passUntilLanded();
  },
  'a red merged tree an Airlock agent fixes': async () => {
    conflictWithTheMovedMainLineResolvedBy(airlockAgentResolvingThenFixingTheMergedTree());
    await passUntilLanded();
  },
  'a red handoff that parks the ticket': async () => {
    world.scriptLine(GATE_LINE, RED_GATE_END);
    const drivePass = drivePassPlaying(buildingSession());
    await passUntil(drivePass, () => buildJobEnding() !== undefined, 'the build job ending');
  },
} as const satisfies Record<string, () => Promise<void>>;

const FROZEN_FOLDER_TRACKER_FLOW_NAMES = Object.keys(FROZEN_FOLDER_TRACKER_FLOWS) as (keyof typeof FROZEN_FOLDER_TRACKER_FLOWS)[];

describeWhenRecorded(EVERY_RECORDING_REQUIREMENT, 'a folder tracker\'s build job end to end', () => {
  const frozenClaim = 'a tracker in a folder with a branch namespace, on %s, asks git exactly its frozen calls';
  test.each(FROZEN_FOLDER_TRACKER_FLOW_NAMES)(frozenClaim, async (flowName) => {
    const gitCalls = startGitCallLog({ [repositoryDirectory]: '<repository>', [monitorFolder]: '<monitor>', [runScratchRoot()]: '<scratch root>' });
    try {
      await FROZEN_FOLDER_TRACKER_FLOWS[flowName]();
    } finally {
      gitCalls.stop();
    }

    const frozenCalls = JSON.parse(readFileSync(FROZEN_FOLDER_TRACKER_GIT_CALLS_PATH, 'utf8')) as Record<string, LoggedGitCall[]>;
    expect(gitCalls.distinctCalls()).toEqual(frozenCalls[flowName] ?? []);
  });

  test('the conflict lands the agent\'s resolution, which V5, V17 and V13 judged against git\'s own merge of the two tips', async () => {
    await FROZEN_FOLDER_TRACKER_FLOWS['a conflict an Airlock agent resolves']();

    expect(loggedEntries('job-ended').filter((entry) => entry.fields['outcome'] === 'resolved')).toHaveLength(1);
    expect(loggedEntries('merge-landed')).toHaveLength(1);
    expect(recordedGit.flowCalls()).toContainEqual(['merge-tree', '--write-tree', '--no-messages', '<ticket tip>', '<moved main tip>']);
  });

  test('a red merged tree resumes the Airlock agent, whose fix V5, V17 and V13 judge again before it is gated and lands', async () => {
    await FROZEN_FOLDER_TRACKER_FLOWS['a red merged tree an Airlock agent fixes']();

    expect(loggedEntries('job-resumed').map((entry) => entry.fields['cause'])).toEqual(['handoff-red']);
    expect(loggedEntries('job-ended').filter((entry) => entry.fields['outcome'] === 'resolved')).toHaveLength(1);
    expect(loggedEntries('merge-landed')).toHaveLength(1);
    const callsSinceTheFix = recordedGit.flowCalls().slice(flowCallsBeforeTheFix).map((call) => call.join(' '));
    const landingRead = callsSinceTheFix.indexOf('diff --name-only --no-renames -z HEAD <fixed tip> --');
    const scopeCheck = callsSinceTheFix.indexOf('merge-tree --write-tree --no-messages <ticket tip> <moved main tip>');
    expect(scopeCheck).toBeGreaterThan(-1);
    expect(scopeCheck).toBeLessThan(landingRead);
  });

  test('the red handoff resumes the builder until its resumes are spent and parks the ticket', async () => {
    await FROZEN_FOLDER_TRACKER_FLOWS['a red handoff that parks the ticket']();

    expect(buildJobEnding()).toMatchObject({ outcome: 'failed', cause: 'red-resumes-spent' });
    expect(loggedEntries('decision-opened').map((entry) => entry.fields['kind'])).toEqual(['parked']);
  });
});
