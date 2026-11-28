/**
 * A spec agent run by the DrivePass under the fake agent: its request applies only after its turn ends and Customs found the snapshot untouched;
 * with nothing queued it waits with no session; User's comment resumes it, and User's stop ends the turn but keeps the job.
 */
import { readFileSync } from 'node:fs';

import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import { writeHatchRequest }                                 from '../../src/adapters/hatch/HatchFolder.ts';
import type { Job }                                          from '../../src/domain/tracker-model/@types/Job.ts';
import type { TicketDocument, TicketDocumentRecord }         from '../../src/domain/tracker-model/@types/TicketDocument.ts';
import { ControlService }                                    from '../../src/services/control/ControlService.ts';
import type { DrivePass }                                    from '../../src/services/hephaestus/DrivePass.ts';
import { HatchInbox }                                        from '../../src/services/hephaestus/HatchInbox.ts';
import { jobFolderIn }                                       from '../../src/services/hephaestus/HephaestusFiles.ts';
import type { BoardTransaction }                             from '../../src/services/tracker/BoardTransaction.ts';
import { ticketDocumentRecordPathOf }                        from '../../src/services/tracker/TicketDocumentStore.ts';
import { writeTracker }                                      from '../../src/services/tracker/TrackerPipeline.ts';
import { requireWorkspace }                                  from '../../src/services/tracker/Workspace.ts';
import { createScratchDrivePass }                            from '../../src/testing/DrivePassHarness.ts';
import { ECHOED_CONTROL_CONTEXT }                            from '../../src/testing/EchoedControlContext.ts';
import { fakeAgentAdapter, fakeResultLine, fakeStartedLine } from '../../src/testing/FakeAgentAdapter.ts';
import { fakeGateConfinement }                               from '../../src/testing/FakeGateConfinement.ts';
import { LIVE_HOLDERS_LOCK_TAKER }                           from '../../src/testing/LockTakers.ts';
import { detailsLoggerOf }                                   from '../../src/testing/LoggedDetails.ts';
import { nativePlatformPorts }                               from '../../src/testing/NativePlatformPorts.ts';
import { useRecordedGit }                                    from '../../src/testing/RecordedGit.ts';
import { RECORDED_FLOW_MAIN_LINE }                           from '../../src/testing/RecordedGitFlow.ts';
import { useRecordedTalosStages }                            from '../../src/testing/RecordedTalosStages.ts';
import { createScratchDirectory, removeScratchDirectory }    from '../../src/testing/ScratchWorkspace.ts';
import { childFilesIn, talosChildReadingsWith }              from '../../src/testing/TalosChildReadings.ts';
import { describeWhenRecorded, EVERY_RECORDING_REQUIREMENT } from '../../src/testing/ToolGuard.ts';
import { waitUntil }                                         from '../../src/testing/WaitUntil.ts';
import { createCapturedCommandContext }                      from '../testing/CapturedCommandContext.ts';
import { runCommandLineWithHephaestusMoves }                 from '../testing/HephaestusTicketMoves.ts';
import { createInitializedRecordedGitRepository }            from '../testing/InitializedScratchRepository.ts';
import { filedTicketIdOf }                                   from '../testing/ReadyTicketFiling.ts';
import { storedLogTextOf }                                   from '../testing/StoredLogText.ts';
import { storedProgressOf }                                  from '../testing/StoredProgress.ts';
import { HephaestusWording }                                 from './HephaestusWording.ts';

const recordedGit = useRecordedGit();

const SPEC_CLOCK = (): Date => new Date('2026-11-24T09:00:00Z');

const SPEC_STAMP = '2026-11-24T10:00:00+01:00';

const SPEC_LINES = ['# Basket total', '', '## Acceptance', '', 'A1. Alex Example sees the basket total.'];

const PROPOSE_COMMAND = 'propose the spec';

const world = useRecordedTalosStages(nativePlatformPorts());
let repositoryDirectory = '';
let monitorFolder = '';
let hephaestusLog: string[] = [];
let drivePass: DrivePass | null = null;
let requestCount = 0;

const OBJECT_ID_PATTERN = /^[0-9a-f]{40}$/;

/** Each instance: it starts, takes its opening line, proposes the spec as a first write, ends its turn and waits on its input. */
const SPEC_AGENT_SESSION = fakeAgentAdapter([
  { kind: 'print', line: fakeStartedLine('fake-spec-agent') },
  { kind: 'await-line' },
  { kind: 'shell', command: PROPOSE_COMMAND },
  { kind: 'print', line: fakeResultLine(null) },
  { kind: 'await-line' },
]);

/** An instance that takes its opening line and works on without ending its turn, until it is stopped. */
const WORKING_SESSION = fakeAgentAdapter([
  { kind: 'print', line: fakeStartedLine('fake-spec-agent') },
  { kind: 'await-line' },
  { kind: 'await-line' },
]);

async function run(commandLineArguments: readonly string[]): Promise<string> {
  const context  = createCapturedCommandContext({ currentDirectory: repositoryDirectory, now: SPEC_CLOCK, platformPorts: world.ports });
  const exitCode = await runCommandLineWithHephaestusMoves(commandLineArguments, context);
  expect(exitCode, `\`${commandLineArguments.join(' ')}\` failed: ${context.errorText()}`).toBe(0);
  return context.outputText();
}

function trackerDirectory(): string {
  return requireWorkspace(repositoryDirectory).trackerDirectory;
}

function documentAgentJob(): Job | undefined {
  return (storedProgressOf(repositoryDirectory).jobs ?? []).find((job) => job.kind === 'document-agent') as Job | undefined;
}

function requireDocumentAgentJob(): Job {
  const job = documentAgentJob();
  if (job === undefined) throw new Error(`no document agent was launched: ${hephaestusLog.join('\n')}`);
  return job;
}

function specOf(ticketId: string): TicketDocument {
  const record = JSON.parse(readFileSync(ticketDocumentRecordPathOf(requireWorkspace(repositoryDirectory), ticketId), 'utf8')) as TicketDocumentRecord;
  const spec = record.documents.find((document) => document.kind === 'spec');
  if (spec === undefined) throw new Error(`the record of #${ticketId} holds no spec`);
  return spec;
}

async function pass(): Promise<void> {
  drivePass?.wake(true);
  await drivePass?.idle();
}

async function untilPassesReach(claim: string, reached: () => boolean): Promise<void> {
  await waitUntil(async () => {
    await pass();
    return reached();
  }, () => `${claim}: ${hephaestusLog.join('\n')}`);
}

function instanceIsLive(job: Job): boolean {
  return talosChildReadingsWith(world.ports, trackerDirectory()).livenessOf(jobFolderIn(trackerDirectory(), job.id), job.childInstance).verdict === 'live';
}

/** A change of the board outside Hephaestus, as a client's command makes one, and the pass that sees it. */
async function changeBoard(mutate: (change: BoardTransaction) => unknown): Promise<void> {
  await writeTracker({
    lockTaker: LIVE_HOLDERS_LOCK_TAKER,
    workspace: requireWorkspace(repositoryDirectory),
    at:        SPEC_STAMP,
    now:       SPEC_CLOCK,
    mutate,
  });
  await pass();
}

function startDrivePass(agentAdapter: ReturnType<typeof fakeAgentAdapter>): void {
  drivePass = createScratchDrivePass({
    platformPorts:     { ...world.ports, gateConfinement: fakeGateConfinement('unconfined-by-design') },
    processStarts:     world.processStarts,
    workspace:         requireWorkspace(repositoryDirectory),
    now:               () => new Date(Date.parse(SPEC_STAMP)),
    formatStamp:       () => SPEC_STAMP,
    talosConnection:   () => world.connectionFor(trackerDirectory()),
    agentAdapter,
    monitorFolder,
    mainLine:          RECORDED_FLOW_MAIN_LINE,
    log:               detailsLoggerOf(hephaestusLog),
    decisionWordingOf: (draft) => HephaestusWording.decisionWordingOf(draft, agentAdapter),
    launchTextOf:      (job, facts) => HephaestusWording.launchTextOf(job, facts, agentAdapter.promptFills),
  });
}

/** A draft ticket whose spec and plan open, both unwritten. */
async function draftWithOpenDocuments(): Promise<string> {
  await run(['gate', 'none']);
  await run(['unpause']);
  const ticketId = filedTicketIdOf(await run(['ticket', 'add', 'Show the basket total', '--type', 'ticket']));
  await changeBoard((change) => change.board.ticketDocuments().open(ticketId, SPEC_STAMP));
  return ticketId;
}

beforeEach(async () => {
  repositoryDirectory = await createInitializedRecordedGitRepository('document-agents', ['--project', 'Example Agency'], SPEC_CLOCK, recordedGit);
  recordedGit.enterFlowStage('tracker ready', repositoryDirectory);
  monitorFolder = createScratchDirectory('document-agents-monitor');
  hephaestusLog = [];
  requestCount = 0;
  world.scriptShell(PROPOSE_COMMAND, () => {
    const job = requireDocumentAgentJob();
    requestCount += 1;
    const requestId = `R${requestCount}`;
    writeHatchRequest(HatchInbox.hatchDirectoryOf(repositoryDirectory, job.id), {
      hatchFormatVersion: 1,
      requestId,
      command:            {
        kind:        'ticket-document-agent-propose',
        baseVersion: null,
        edits:       [{
          fromLine: 1, toLine: 0, originalLines: [], replacementLines: SPEC_LINES
        }],
        summary: 'Write the spec',
      },
    } as unknown as Parameters<typeof writeHatchRequest>[1]);
  });
});

afterEach(async () => {
  await drivePass?.stop();
  drivePass = null;
  removeScratchDirectory(monitorFolder);
  removeScratchDirectory(repositoryDirectory);
});

describeWhenRecorded(EVERY_RECORDING_REQUIREMENT, 'a spec agent', () => {
  test('writes the spec at its turn end, waits with its input closed, and resumes with User\'s comment as its opening line', async () => {
    startDrivePass(SPEC_AGENT_SESSION);
    const ticketId = await draftWithOpenDocuments();

    await untilPassesReach('the spec agent\'s first version and its wait', () => documentAgentJob()?.state === 'awaiting-answer');
    const firstJob = requireDocumentAgentJob();
    expect([firstJob.role, firstJob.ticketIds, firstJob.childInstance]).toEqual(['spec-agent', [ticketId], 1]);
    expect(specOf(ticketId).versions).toEqual([expect.objectContaining({
      number: 1, author: 'agent', jobId: firstJob.id, constitutionCommit: expect.stringMatching(OBJECT_ID_PATTERN)
    })]);
    expect(storedLogTextOf(repositoryDirectory)).not.toContain('document-snapshot-touched');

    await changeBoard((change) => change.board.ticketDocuments().comment(ticketId, 'spec', null, 'Name the currency.', SPEC_STAMP));
    await untilPassesReach('the resumed instance\'s turn end and its second wait', () => {
      const job = documentAgentJob();
      return job?.childInstance === 2 && job.state === 'awaiting-answer';
    });
    expect(requireDocumentAgentJob().id).toBe(firstJob.id);
    const spec = specOf(ticketId);
    expect(spec.messages).toEqual([expect.objectContaining({
      messageId: 'M1', state: 'sent', deliveryNumber: 1, agentTurn: 2
    })]);
    expect(spec.proposals.map((proposal) => [proposal.proposalId, proposal.state])).toEqual([['P1', 'applied'], ['P2', 'proposed']]);
    expect(readFileSync(childFilesIn(jobFolderIn(trackerDirectory(), firstJob.id), 2).eventLogPath, 'utf8')).toContain('Name the currency.');
  });
});

describeWhenRecorded(EVERY_RECORDING_REQUIREMENT, 'a turn stop', () => {
  test('ends the running turn and keeps the job, which waits for its next message', async () => {
    startDrivePass(WORKING_SESSION);
    const ticketId = await draftWithOpenDocuments();
    await untilPassesReach('the spec agent\'s live session', () => {
      const job = documentAgentJob();
      return job?.state === 'running' && instanceIsLive(job);
    });

    await changeBoard((change) => ControlService.apply({ kind: 'ticket-document-turn-stop', ticketReference: ticketId, document: 'spec' }, change, ECHOED_CONTROL_CONTEXT));
    await untilPassesReach('the stopped agent\'s wait', () => documentAgentJob()?.state === 'awaiting-answer');
    expect(requireDocumentAgentJob().childInstance).toBe(1);
  });
});
