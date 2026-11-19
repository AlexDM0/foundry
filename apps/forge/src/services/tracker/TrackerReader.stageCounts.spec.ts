/**
 * A crossing ticket's per-stage counts across a restart (E74). What matters: red handoffs, failed passes and review rounds per stage are
 * read from the log alone, so a board read again from progress.json and log.jsonl on disk counts what the running board counted, and its
 * next launches carry the same attempt and round; no row key holds them.
 */
import { mkdirSync, readFileSync } from 'node:fs';
import {
  afterEach,
  beforeEach,
  expect,
  test,
} from 'bun:test';
import { createLogFileWriter }                            from '../../adapters/log/LogFileWriter.ts';
import { createProgressFileWriter }                       from '../../adapters/progress/ProgressFileWriter.ts';
import type { Job, JobOutcome }                           from '../../lib/tracker-model/@types/Job.ts';
import type { LifecycleLimits }                           from '../../lib/tracker-model/@types/LifecycleLimits.ts';
import type { LogRecord }                                 from '../../lib/tracker-model/@types/LogRecord.ts';
import type { PlaybookObservations }                      from '../../lib/tracker-model/@types/PlaybookStep.ts';
import type { TicketStage }                               from '../../lib/tracker-model/@types/Task.ts';
import type { TrackerProgress }                           from '../../lib/tracker-model/@types/TrackerProgress.ts';
import type { Board }                                     from '../../lib/tracker-model/Board.ts';
import { Playbook }                                       from '../../lib/tracker-model/Playbook.ts';
import { readingBoardOf }                                 from '../../lib/tracker-model/ReadingBoard.ts';
import { HANDOFF_RED_INTERRUPTION }                       from '../../lib/tracker-model/constants/JobStates.ts';
import { FailedPassUtil }                                 from '../../lib/tracker-model/utils/FailedPassUtil.ts';
import { taskFixture, ticketFixture }                     from '../../testing/BoardFixtures.ts';
import { ENTITY_FORGE_ENTITIES, entityForgePipelineOf }   from '../../testing/EntityForgeFixture.ts';
import { emptyProgress }                                  from '../../testing/ProgressFixtures.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { readTracker }                                    from './TrackerReader.ts';
import { workspacePathsFor, type Workspace }              from './Workspace.ts';

const AT = '2026-11-18T10:00:00+01:00';

const { SHOP, UI_KIT } = ENTITY_FORGE_ENTITIES;

const CROSSING_PIPELINE = entityForgePipelineOf('shop-crosses-into-ui-kit');

const PACKAGE_BUILD: TicketStage  = { name: 'package-build', entity: UI_KIT.key };
const PACKAGE_REVIEW: TicketStage = { name: 'package-review', entity: UI_KIT.key };

const LIMITS: LifecycleLimits = {
  FAILED_PASSES_BEFORE_PARKING:             3,
  CONSECUTIVE_DEAD_AGENTS_BEFORE_STOPPING:  2,
  ROUND_GRANTED_ON_REWORK_ALONE:            2,
  FINDINGS_SHRINK_FACTOR_PER_ROUND:         2,
  REWORK_ROUND_THRESHOLD_LINES:             750,
  JOB_RESUMES_BEFORE_FRESH:                 2,
  RED_HANDOFF_RESUMES_BEFORE_PARKING:       3,
  REPLACED_JOBS_BEFORE_JOB_LOST:            2,
  FAILED_ASSISTANT_BOOTS_BEFORE_DEFAULTING: 2,
  now:                                      AT,
  usageResetsAt:                            null,
};

const OBSERVATIONS: PlaybookObservations = {
  mainLine:                     'main',
  groupTargetPrefix:            'group-',
  installVersionChanged:        false,
  targetsHoldingManagedBlock:   [],
  ticketIdsTouchingAgentConfig: [],
  closedDeliveryTurns:          [],
  budgetSpentDeliveryTurns:     [],
  assistantHasAnswered:         true,
  assistantBootRetryDue:        false,
};

function launchedRecord(jobId: string, kind: 'build' | 'review', ticketId: string, entity: string, stage: number, attempt: number): LogRecord {
  return {
    kind:   'job-launched',
    jobId,
    fields: {
      kind, role: kind === 'build' ? 'builder' : 'reviewer', ticketIds: [ticketId], attempt, target: 'main', parentJobId: null, entity, stage,
    },
    at: AT,
  };
}

function endedRecord(jobId: string, outcome: JobOutcome): LogRecord {
  return {
    kind: 'job-ended', jobId, fields: { outcome, deniedPermissions: [] }, at: AT,
  };
}

function redHandoffRecord(jobId: string): LogRecord {
  return {
    kind: 'job-resumed', jobId, fields: { childInstance: 1, cause: HANDOFF_RED_INTERRUPTION }, at: AT,
  };
}

/**
 * Ticket 001's package build took a red handoff and then failed, a failed pass; ticket 002's package review was granted a further round.
 * Both tickets built their stage 1 in the shop first.
 */
const CROSSING_LOG: LogRecord[] = [
  launchedRecord('J1', 'build', '001', SHOP.key, 1, 1),
  endedRecord('J1', 'built'),
  launchedRecord('J2', 'build', '001', UI_KIT.key, 2, 1),
  redHandoffRecord('J2'),
  endedRecord('J2', 'failed'),
  launchedRecord('J3', 'build', '002', SHOP.key, 1, 1),
  endedRecord('J3', 'built'),
  launchedRecord('J4', 'build', '002', UI_KIT.key, 2, 1),
  endedRecord('J4', 'built'),
  launchedRecord('J5', 'review', '002', UI_KIT.key, 3, 1),
  endedRecord('J5', 'round-granted'),
];

function crossingProgress(): TrackerProgress {
  return {
    ...emptyProgress(),
    concurrencyLimit: 3,
    overseerState:    'running',
    nextTaskId:       3,
    tasks:            [
      taskFixture({
        id: 1, ticket: '001', status: 'in-progress', stage: PACKAGE_BUILD
      }),
      taskFixture({
        id: 2, ticket: '002', status: 'in-progress', stage: PACKAGE_REVIEW
      }),
    ],
  };
}

function crossingBoardOf(progress: TrackerProgress, logRecords: readonly LogRecord[]): Board {
  const tickets = ['001', '002'].map((ticketId, index) => ticketFixture({
    id: ticketId, status: 'in-progress', task: index + 1, entity: SHOP.key
  }));
  return readingBoardOf(progress, tickets, [], [], logRecords, CROSSING_PIPELINE);
}

interface StageCounts {
  failedPassesByStage:     Record<string, number>;
  packageBuildRedHandoffs: number;
  nextLaunches:            (Pick<Job, 'kind' | 'ticketIds' | 'attempt'> & { entity: string | undefined; stage: number | undefined })[];
}

/** What the board counts per stage, and the attempt and round of the launches its next pass makes from those counts. */
function stageCountsOf(board: Board): StageCounts {
  const logRecords = board.logRecordsSoFar();
  const failedPassesByStage = Object.fromEntries(FailedPassUtil.failedPassesByStageOf('001', logRecords));
  const packageBuildRedHandoffs = Playbook.handoffCycleResumesOf({
    kind: 'build', ticketIds: ['001'], attempt: 1, entity: UI_KIT.key, stage: 2
  }, logRecords);
  board.followPlaybook(LIMITS, OBSERVATIONS, () => ({ questions: [], context: '' }));
  const nextLaunches = board.jobs()
    .filter((job) => job.kind === 'build' || job.kind === 'review')
    .map(({
      kind, ticketIds, attempt, entity, stage
    }) => ({
      kind, ticketIds, attempt, entity, stage
    }));
  return { failedPassesByStage, packageBuildRedHandoffs, nextLaunches };
}

let workspace: Workspace;

beforeEach(() => {
  workspace = workspacePathsFor(createScratchDirectory('tracker-reader-stage-counts'));
  mkdirSync(workspace.ticketsDirectory, { recursive: true });
});

afterEach(() => {
  removeScratchDirectory(workspace.rootDirectory);
});

function boardReadFromDisk(): Board {
  const reading = readTracker(workspace);
  if (reading.verdict !== 'readable') throw new Error(`the scratch tracker reads back: ${JSON.stringify(reading)}`);
  return crossingBoardOf(reading.contents.progress, reading.contents.storedLog.records);
}

test('E74: a crossing ticket\'s red handoffs, failed passes and review rounds per stage read back the same after the board is read again from disk', () => {
  const runningCounts = stageCountsOf(crossingBoardOf(crossingProgress(), CROSSING_LOG));
  createProgressFileWriter(workspace.progressFilePath).write(crossingProgress());
  createLogFileWriter(workspace.logFilePath).write(CROSSING_LOG);

  const firstReadCounts  = stageCountsOf(boardReadFromDisk());
  const secondReadCounts = stageCountsOf(boardReadFromDisk());

  expect(runningCounts).toEqual({
    failedPassesByStage:     { [`${UI_KIT.key}/2`]: 1 },
    packageBuildRedHandoffs: 1,
    nextLaunches:            [
      {
        kind: 'review', ticketIds: ['002'], attempt: 2, entity: UI_KIT.key, stage: 3
      },
      {
        kind: 'build', ticketIds: ['001'], attempt: 2, entity: UI_KIT.key, stage: 2
      },
    ],
  });
  expect(firstReadCounts).toEqual(runningCounts);
  expect(secondReadCounts).toEqual(runningCounts);
  expect(readFileSync(workspace.progressFilePath, 'utf8')).not.toContain('stageCounters');
});
