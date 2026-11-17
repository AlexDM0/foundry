/**
 * One pipeline setup end to end, in-process: User's `pipeline` verbs on the command line, a DrivePass launching the record's pipeline
 * agent under the fake agent, and the agent's own verbs relayed under its job the way `cli/HatchUnderJob.spec.ts` relays them, each applied
 * by the next pass. What matters: the setup start launches the agent on setup S1's snapshot; its finding, question, constitution with its
 * sources, and proposal reach the record; User's answer and Continues bring the record to the apply step; and Apply, with main holding no
 * `CONSTITUTION.md`, stores only the request, waiting for the constitution commit, with no `pipeline.json` written. An advise at an
 * entity of the stored pipeline launches that entity's own session alone, stamped with its entity, and the Overseer stamps the entity on
 * what it relays, so its finding lands in that entity's part alone; an advise at an entity the stored pipeline does not hold launches
 * nothing. Git answers from the recorded flow of `src/testing/RecordedGitFlow.ts`; the session plays
 * `src/testing/RecordedWatcherStages.ts`.
 */
import { existsSync } from 'node:fs';
import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import { PipelineSetupFile }                                         from '../../src/adapters/pipeline/PipelineSetupFile.ts';
import type { Pipeline }                                             from '../../src/lib/tracker-model/@types/Pipeline.ts';
import type { PipelineSetup }                                        from '../../src/lib/tracker-model/@types/PipelineSetup.ts';
import { ControlService }                                            from '../../src/services/control/ControlService.ts';
import type { DrivePass }                                            from '../../src/services/overseer/DrivePass.ts';
import { HatchInbox }                                                from '../../src/services/overseer/HatchInbox.ts';
import { WatcherFleet }                                              from '../../src/services/overseer/WatcherFleet.ts';
import { type TrackerChange, writeTracker }                          from '../../src/services/tracker/TrackerPipeline.ts';
import { requireWorkspace }                                          from '../../src/services/tracker/Workspace.ts';
import { OperationRefusal }                                          from '../../src/shared/OperationRefusal.ts';
import { entityPipelineFixture }                                     from '../../src/testing/BoardFixtures.ts';
import { createScratchDrivePass, FAKE_WATCHER_BUNDLE_PATH }          from '../../src/testing/DrivePassHarness.ts';
import { ECHOED_CONTROL_CONTEXT }                                    from '../../src/testing/EchoedControlContext.ts';
import { fakeAgentAdapter, fakeStartedLine }                         from '../../src/testing/FakeAgentAdapter.ts';
import { fakeGateConfinement }                                       from '../../src/testing/FakeGateConfinement.ts';
import { nativePlatformPorts }                                       from '../../src/testing/NativePlatformPorts.ts';
import { useRecordedGit }                                            from '../../src/testing/RecordedGit.ts';
import { RECORDED_FLOW_MAIN_LINE }                                   from '../../src/testing/RecordedGitFlow.ts';
import { useRecordedWatcherStages }                                  from '../../src/testing/RecordedWatcherStages.ts';
import { createScratchDirectory, removeScratchDirectory }            from '../../src/testing/ScratchWorkspace.ts';
import { describeWhenRecorded, EVERY_RECORDING_REQUIREMENT }         from '../../src/testing/ToolGuard.ts';
import { waitUntil }                                                 from '../../src/testing/WaitUntil.ts';
import type { CommandContext }                                       from '../CommandContext.ts';
import { runCommandLine }                                            from '../Main.ts';
import { type CapturedCommandContext, createCapturedCommandContext } from '../testing/CapturedCommandContext.ts';
import { createInitializedRecordedGitRepository }                    from '../testing/InitializedScratchRepository.ts';
import { storedProgressOf }                                          from '../testing/StoredProgress.ts';
import { OverseerWording }                                           from './OverseerWording.ts';

const recordedGit = useRecordedGit();

const SPEC_CLOCK = (): Date => new Date('2026-11-12T09:00:00Z');

const SPEC_STAMP = '2026-11-12T10:00:00+01:00';

const CONSTITUTION_TEXT = '# Example Agency\n\n## Rules\n- Keep the basket page fast.\n';

const MESSAGES_THE_AGENT_READS = 12;

/** The agent's session starts, then reads every message the record's moves send it, until the spec ends. */
const LISTENING_SESSION = fakeAgentAdapter([
  { kind: 'print', line: fakeStartedLine('fake-pipeline-agent') },
  ...Array.from({ length: MESSAGES_THE_AGENT_READS }, () => ({ kind: 'await-line' as const })),
]);

const world = useRecordedWatcherStages(nativePlatformPorts());
let repositoryDirectory = '';
let monitorFolder = '';
let overseerLog: string[] = [];
let drivePass: DrivePass | null = null;

function userContext(): CapturedCommandContext {
  return createCapturedCommandContext({ currentDirectory: repositoryDirectory, now: SPEC_CLOCK, platformPorts: world.ports });
}

async function run(commandLineArguments: readonly string[], context: CapturedCommandContext = userContext()): Promise<CapturedCommandContext> {
  const exitCode = await runCommandLine(commandLineArguments, context);
  expect(exitCode, `\`${commandLineArguments.join(' ')}\` failed: ${context.errorText()}`).toBe(0);
  return context;
}

/** A command line in the pipeline agent's session: under its job it writes a Hatch request and, with no reply yet, prints `queued`. */
async function relayAsTheAgent(jobId: string, commandLineArguments: readonly string[]): Promise<void> {
  const context: CapturedCommandContext & Required<Pick<CommandContext, 'job'>> = {
    ...userContext(),
    job: {
      jobId, hatchDirectory: HatchInbox.hatchDirectoryOf(repositoryDirectory, jobId), replyTries: 1, replyIntervalMilliseconds: 10
    },
  };
  expect((await run(commandLineArguments, context)).outputText()).toStartWith('queued ');
  drivePass?.wake(true);
  await drivePass?.idle();
}

/**
 * The real advise command at `web`. This build refuses a stored pipeline or a record's draft that holds entities, so the hold's pipeline
 * holds `web` only while the command runs, and the stored draft keeps none.
 */
function adviseAtWebOf(change: TrackerChange): unknown {
  const storedPipeline = change.board.pipeline() as Pipeline | null;
  const webEntity = entityPipelineFixture().entities?.['web'];
  if (storedPipeline === null || webEntity === undefined) throw new Error('no stored pipeline to advise on');
  storedPipeline.entities = { web: webEntity };
  const advised = ControlService.apply({ kind: 'pipeline-agent-advise', entity: 'web' }, change, ECHOED_CONTROL_CONTEXT);
  delete storedPipeline.entities;
  delete advised.result.setup.draft?.entities;
  return advised.result;
}

function setupRecord(): PipelineSetup {
  const reading = PipelineSetupFile.read(requireWorkspace(repositoryDirectory).pipelineSetupFilePath);
  if (reading.verdict !== 'readable') throw new Error(`no readable setup record: ${JSON.stringify(reading)}`);
  return reading.setup;
}

async function untilTheAgentSessionIsLive(jobId: string): Promise<void> {
  const jobFolder = WatcherFleet.jobFolderOf(requireWorkspace(repositoryDirectory).trackerDirectory, jobId);
  await waitUntil(async () => {
    drivePass?.wake(true);
    await drivePass?.idle();
    return WatcherFleet.livenessOf(world.ports, jobFolder, 1).verdict === 'live';
  }, () => `the pipeline agent's session being spawned: ${overseerLog.join('\n')}`);
}

beforeEach(async () => {
  repositoryDirectory = await createInitializedRecordedGitRepository('pipeline-setup', ['--project', 'Example Agency'], SPEC_CLOCK, recordedGit);
  recordedGit.enterFlowStage('tracker ready', repositoryDirectory);
  monitorFolder = createScratchDirectory('pipeline-setup-monitor');
  overseerLog = [];
  drivePass = createScratchDrivePass({
    platformPorts:     { ...world.ports, gateConfinement: fakeGateConfinement('unconfined-by-design') },
    processStarts:     world.processStarts,
    workspace:         requireWorkspace(repositoryDirectory),
    now:               () => new Date(Date.parse(SPEC_STAMP)),
    formatStamp:       () => SPEC_STAMP,
    watcherBundlePath: FAKE_WATCHER_BUNDLE_PATH,
    agentAdapter:      LISTENING_SESSION,
    monitorFolder,
    mainLine:          RECORDED_FLOW_MAIN_LINE,
    log:               (line) => overseerLog.push(line),
    decisionWordingOf: OverseerWording.decisionWordingOf,
    launchTextOf:      OverseerWording.launchTextOf,
  });
});

afterEach(async () => {
  await drivePass?.stop();
  drivePass = null;
  removeScratchDirectory(monitorFolder);
  removeScratchDirectory(repositoryDirectory);
});

describeWhenRecorded(EVERY_RECORDING_REQUIREMENT, 'one setup end to end', () => {
  test('the agent\'s relayed finding, question, constitution and proposal and User\'s answer bring S1 to an Apply that waits for its commit', async () => {
    await run(['pipeline', 'setup']);
    const { agentJobId } = setupRecord();
    if (agentJobId === null) throw new Error('the setup start launched no pipeline agent');
    await untilTheAgentSessionIsLive(agentJobId);
    expect(setupRecord().snapshotCommit).not.toBeNull();

    await relayAsTheAgent(agentJobId, ['pipeline', 'finding', '--', JSON.stringify({
      topic: 'scripts', label: 'Tests', value: 'bun test', sourcePaths: ['package.json']
    })]);
    await relayAsTheAgent(agentJobId, ['pipeline', 'ask', '--', JSON.stringify({
      step: 'research', question: 'Is the test run a gate?', options: ['Yes', 'No'], recommended: ['a']
    })]);
    await run(['pipeline', 'answer', 'S1', 'Q1', 'a']);
    await run(['pipeline', 'continue', 'S1', 'research']);
    await relayAsTheAgent(agentJobId, ['pipeline', 'draft-constitution', '--', JSON.stringify({
      markdown: CONSTITUTION_TEXT,
      sources:  [{
        lineText: '- Keep the basket page fast.', occurrence: 1, kind: 'research', path: 'package.json'
      }]
    })]);
    await run(['pipeline', 'continue', 'S1', 'constitution']);
    await relayAsTheAgent(agentJobId, ['pipeline', 'propose', '--', JSON.stringify({
      edits: [
        { field: 'gate:test', value: { name: 'test', run: 'bun test' }, summary: 'Run the tests.' },
        { field: 'phase-order:build', value: ['test'], summary: 'Run the tests before the review.' },
      ]
    })]);
    await run(['pipeline', 'continue', 'S1', 'design']);

    const beforeApply = setupRecord();
    expect(beforeApply.findings.map((finding) => finding.label)).toEqual(['Tests']);
    expect(beforeApply.questions.map((question) => question.answer)).toEqual([expect.objectContaining({ letters: ['a'] })]);
    expect(beforeApply.constitution).toMatchObject({
      markdown:    CONSTITUTION_TEXT,
      annotations: [{
        lineText: '- Keep the basket page fast.', occurrence: 1, kind: 'research', path: 'package.json'
      }]
    });
    expect(beforeApply.draft?.phases.build).toEqual(['test']);
    expect(beforeApply.currentStep).toBe('apply');

    await run(['pipeline', 'apply', 'S1', '--revision', String(beforeApply.draftRevision), '--resume']);

    expect(setupRecord().applyRequest).toEqual({
      draftRevision: beforeApply.draftRevision, resumesBoard: true, commitJobId: null, state: 'committing', reason: null
    });
    expect(existsSync(requireWorkspace(repositoryDirectory).pipelineFilePath)).toBe(false);
    expect((storedProgressOf(repositoryDirectory).jobs ?? []).find((job) => job.id === agentJobId)?.kind).toBe('pipeline-agent');
  });
});

describeWhenRecorded(EVERY_RECORDING_REQUIREMENT, 'a session at an entity', () => {
  test('an advise at an entity launches that entity\'s session alone, stamped with its entity, and its relayed finding lands in its part', async () => {
    await run(['gate', 'none']);

    await writeTracker({
      workspace: requireWorkspace(repositoryDirectory),
      at:        SPEC_STAMP,
      now:       SPEC_CLOCK,
      mutate:    (change) => adviseAtWebOf(change),
    });
    const webJobId = setupRecord().entities?.['web']?.agentJobId ?? null;
    if (webJobId === null) throw new Error('the advise launched no session for web');
    await untilTheAgentSessionIsLive(webJobId);
    await relayAsTheAgent(webJobId, ['pipeline', 'finding', '--', JSON.stringify({
      topic: 'scripts', label: 'Web tests', value: 'bun test', sourcePaths: ['apps/web/package.json']
    })]);

    const record = setupRecord();
    expect(record).toMatchObject({
      mode: 'advise', openedAtEntity: 'web', agentJobId: null, findings: []
    });
    expect(record.entities?.['web']?.findings.map((finding) => finding.label)).toEqual(['Web tests']);
    const pipelineAgentJobs = (storedProgressOf(repositoryDirectory).jobs ?? []).filter((job) => job.kind === 'pipeline-agent');
    expect(pipelineAgentJobs).toEqual([expect.objectContaining({ id: webJobId, entity: 'web' })]);
  });

  test('an advise at an entity the stored pipeline does not hold is refused, with no record opened and no session launched', async () => {
    await run(['gate', 'none']);

    const attempt = writeTracker({
      workspace: requireWorkspace(repositoryDirectory),
      at:        SPEC_STAMP,
      now:       SPEC_CLOCK,
      mutate:    (change) => ControlService.apply({ kind: 'pipeline-agent-advise', entity: 'web' }, change, ECHOED_CONTROL_CONTEXT),
    });

    const refusal = await attempt.then(() => null, (thrown: unknown) => (thrown instanceof OperationRefusal ? thrown.detail : thrown));
    expect(refusal).toEqual({ kind: 'board-refusal', boardRefusal: { reason: 'setup-entity-unknown', entity: 'web', entityKeys: [] } });
    expect(existsSync(requireWorkspace(repositoryDirectory).pipelineSetupFilePath)).toBe(false);
    expect(storedProgressOf(repositoryDirectory).jobs ?? []).toEqual([]);
  });
});
