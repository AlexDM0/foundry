/**
 * The process table of a default spec: `useRecordedProcessTable` mocks `ProcessSupervision` with the answers the real table gave, which
 * `src/lib/process-identity/ProcessIdentity.integration.spec.ts` records under `bun run record src/lib/process-identity/`. A process here
 * is in one recorded stage, and each call is answered by the call shape of that stage. A call no stage holds fails the case, and so does
 * a call the real table refuses: a stop of a process after its end, or of an identity whose start stamp does not match.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join }                     from 'node:path';

import { afterEach, beforeEach } from 'bun:test';

import type { PlatformPorts }                           from '../lib/platform-ports/PlatformPortsFor.ts';
import type { ProcessIdentity, ProcessTreeStopOutcome } from '../lib/process-identity/ProcessIdentity.ts';
import type { ProcessStopStage, ProcessTreeMember }     from '../lib/process-identity/ProcessSupervision.ts';
import type { BoundaryRecording }                       from './BoundaryRecordings.ts';
import { recordCommandOf, recordingPathOf }             from './BoundaryRecordings.ts';

const PROCESS_TABLE_BOUNDARY = 'src/lib/process-identity/';
const REPOSITORY_ROOT = join(import.meta.dir, '..', '..');
const FIRST_MOCKED_PROCESS_ID = 5_000_000;

/** The places a recorded answer holds for a process id, which a replay fills in with the id of its own process and of the spec's. */
export const RECORDED_PROCESS_PLACEHOLDERS = {
  PROCESS: '<process>',
  CALLER:  '<caller>',
} as const;

/** The call shapes the boundary spec records, each named for the stage of the process it was asked in. */
export const PROCESS_CALL_SHAPES = {
  IDENTITY_OF_A_BORN_LEADER:           'identityOf <process>, the process born as the leader of its own group',
  GONE_OF_A_BORN_LEADER:               'processIsGone <process>, the process born as the leader of its own group',
  SAME_PROCESS_OF_ONE_IDENTITY:        'sameProcess <identity> <identity>, one identity read twice',
  SAME_PROCESS_OF_ANOTHER_START_STAMP: 'sameProcess <identity> <identity with another start stamp>',
  TREE_OF_A_BORN_LEADER:               'treeMembersOf <identity>, the process born as the leader of its own group',
  FORCED_STOP_OF_ANOTHER_START_STAMP:  'stopTree <identity with another start stamp> force, no tree members, the process born',
  FORCED_STOP_OF_A_BORN_LEADER:        'stopTree <identity> force <its tree members>, the process born as the leader of its own group',
  IDENTITY_AFTER_A_FORCED_STOP:        'identityOf <process>, the process stopped by stopTree force',
  GONE_AFTER_A_FORCED_STOP:            'processIsGone <process>, the process stopped by stopTree force',
  IDENTITY_AFTER_ITS_OWN_END:          'identityOf <process>, the process ended by itself',
  GONE_AFTER_ITS_OWN_END:              'processIsGone <process>, the process ended by itself',
  IDENTITY_IN_THE_CALLERS_GROUP:       'identityOf <process>, a member of the caller\'s group',
  GONE_IN_THE_CALLERS_GROUP:           'processIsGone <process>, a member of the caller\'s group',
  TREE_IN_THE_CALLERS_GROUP:           'treeMembersOf <identity>, a member of the caller\'s group',
  FORCED_STOP_IN_THE_CALLERS_GROUP:    'stopTree <identity> force <its tree members>, a member of the caller\'s group',
  IDENTITY_AFTER_OUTLIVING_A_STOP:     'identityOf <process>, a member of the caller\'s group after stopTree force',
  GONE_AFTER_OUTLIVING_A_STOP:         'processIsGone <process>, a member of the caller\'s group after stopTree force',
  FORCED_STOP_OF_ANOTHER_USERS_LEADER: 'stopTree <identity> force <its tree members>, a process of another user leading its own group',
  BOOT_START:                          'bootStartedAtEpochSeconds, the current boot',
} as const;

export type ProcessCallShape = typeof PROCESS_CALL_SHAPES[keyof typeof PROCESS_CALL_SHAPES];

/**
 * `outlived-stop`: a member of the caller's group, which a stop of its own tree does not reach. `refuses-stop`: a born leader whose forced
 * stop is refused, as a process of another user refuses it; every other call reads it as the born leader it is.
 */
type ProcessStage = 'born-leader' | 'stopped' | 'ended' | 'callers-group-member' | 'outlived-stop' | 'refuses-stop';

interface MockedProcess {
  readonly identity: ProcessIdentity;
  stage:             ProcessStage;
}

const IDENTITY_SHAPE_OF_STAGE: Readonly<Record<ProcessStage, ProcessCallShape>> = {
  'born-leader':          PROCESS_CALL_SHAPES.IDENTITY_OF_A_BORN_LEADER,
  'stopped':              PROCESS_CALL_SHAPES.IDENTITY_AFTER_A_FORCED_STOP,
  'ended':                PROCESS_CALL_SHAPES.IDENTITY_AFTER_ITS_OWN_END,
  'callers-group-member': PROCESS_CALL_SHAPES.IDENTITY_IN_THE_CALLERS_GROUP,
  'outlived-stop':        PROCESS_CALL_SHAPES.IDENTITY_AFTER_OUTLIVING_A_STOP,
  'refuses-stop':         PROCESS_CALL_SHAPES.IDENTITY_OF_A_BORN_LEADER,
};

const GONE_SHAPE_OF_STAGE: Readonly<Record<ProcessStage, ProcessCallShape>> = {
  'born-leader':          PROCESS_CALL_SHAPES.GONE_OF_A_BORN_LEADER,
  'stopped':              PROCESS_CALL_SHAPES.GONE_AFTER_A_FORCED_STOP,
  'ended':                PROCESS_CALL_SHAPES.GONE_AFTER_ITS_OWN_END,
  'callers-group-member': PROCESS_CALL_SHAPES.GONE_IN_THE_CALLERS_GROUP,
  'outlived-stop':        PROCESS_CALL_SHAPES.GONE_AFTER_OUTLIVING_A_STOP,
  'refuses-stop':         PROCESS_CALL_SHAPES.GONE_OF_A_BORN_LEADER,
};

const LIVE_STAGES: ReadonlySet<ProcessStage> = new Set(['born-leader', 'callers-group-member', 'outlived-stop', 'refuses-stop']);

/** The stages that lead their own group, so a stop or a tree of theirs is the born leader's. */
const LEADER_STAGES: ReadonlySet<ProcessStage> = new Set(['born-leader', 'refuses-stop']);

function replacedDeeply(value: unknown, replace: (leaf: unknown) => unknown): unknown {
  if (Array.isArray(value)) return value.map((element) => replacedDeeply(element, replace));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, element]) => [key, replacedDeeply(element, replace)]));
  }
  return replace(value);
}

/** What the boundary spec records: every number naming the process or the spec's own process as its placeholder. */
export function asRecordedProcessAnswer(answer: unknown, processId: number): unknown {
  return replacedDeeply(answer, (leaf) => {
    if (leaf === processId) return RECORDED_PROCESS_PLACEHOLDERS.PROCESS;
    return leaf === process.pid ? RECORDED_PROCESS_PLACEHOLDERS.CALLER : leaf;
  });
}

function asReplayedProcessAnswer(answer: unknown, processId: number): unknown {
  return replacedDeeply(answer, (leaf) => {
    if (leaf === RECORDED_PROCESS_PLACEHOLDERS.PROCESS) return processId;
    return leaf === RECORDED_PROCESS_PLACEHOLDERS.CALLER ? process.pid : leaf;
  });
}

let recordedAnswers: ReadonlyMap<string, unknown> | null = null;

function recordedAnswersOfThisOs(): ReadonlyMap<string, unknown> {
  if (recordedAnswers !== null) return recordedAnswers;
  const recordingPath = join(REPOSITORY_ROOT, recordingPathOf(PROCESS_TABLE_BOUNDARY, process.platform));
  if (!existsSync(recordingPath)) {
    throw new Error(`no process table answers are recorded for ${process.platform}: run \`${recordCommandOf(PROCESS_TABLE_BOUNDARY)}\`.`);
  }
  const recording = JSON.parse(readFileSync(recordingPath, 'utf8')) as BoundaryRecording;
  recordedAnswers = new Map(recording.answers.map(({ callShape, answer }) => [callShape, answer]));
  return recordedAnswers;
}

function sameJson(first: unknown, second: unknown): boolean {
  return JSON.stringify(first) === JSON.stringify(second);
}

export interface RecordedProcessTable {
  /** The native ports with every function of `ProcessSupervision` answered from the recording; each case starts with no process. */
  readonly ports:             PlatformPorts;
  /** A process born as the leader of its own group, as a successor is spawned. */
  readonly bornProcess:       () => ProcessIdentity;
  /** A process in the spec's own group: a stop of its tree does not reach it. */
  readonly memberOfOwnGroup:  () => ProcessIdentity;
  /** The spec's own process, under its own id: a member of its own group, as the Overseer is. */
  readonly callerProcess:     () => ProcessIdentity;
  /** It ends by itself, as a process that exits; nothing makes it live again. */
  readonly endProcess:        (identity: ProcessIdentity) => void;
  /** A born leader refuses each forced stop from now on, as a process of another user does, and lives on. */
  readonly refuseForcedStops: (identity: ProcessIdentity) => void;
  /** Every `stopTree`, in order. */
  readonly stoppedProcesses:  () => readonly ProcessIdentity[];
}

export interface ControlledRecordedProcessTable {
  readonly table:               RecordedProcessTable;
  /** Each call that had no recorded answer since the last take, described; the list is then empty. */
  readonly takeUnansweredCalls: () => string[];
  readonly forgetProcesses:     () => void;
}

/** Call at a spec file's top level: each case gets an empty table, and a call it could not answer fails the case. */
export function useRecordedProcessTable(nativePorts: PlatformPorts): RecordedProcessTable {
  const { table, takeUnansweredCalls, forgetProcesses } = createRecordedProcessTable(nativePorts);
  beforeEach(forgetProcesses);
  afterEach(() => {
    // Production code may catch the throw of an unanswered call, so the case fails here too.
    const unanswered = takeUnansweredCalls();
    if (unanswered.length > 0) throw new Error(unanswered.join('\n'));
  });
  return table;
}

export function createRecordedProcessTable(nativePorts: PlatformPorts): ControlledRecordedProcessTable {
  let processes = new Map<number, MockedProcess>();
  let stopped: ProcessIdentity[] = [];
  let lastProcessId = FIRST_MOCKED_PROCESS_ID;
  const unansweredCalls: string[] = [];

  const unansweredError = (call: string, reason: string): Error => {
    const unanswered = `${call} has no recorded answer: ${reason}`;
    unansweredCalls.push(unanswered);
    return new Error(unanswered);
  };
  const answerOf = (callShape: ProcessCallShape, processId: number): unknown => {
    if (!recordedAnswersOfThisOs().has(callShape)) {
      throw unansweredError(callShape, `the recording holds no such call shape: run \`${recordCommandOf(PROCESS_TABLE_BOUNDARY)}\``);
    }
    return asReplayedProcessAnswer(recordedAnswersOfThisOs().get(callShape), processId);
  };
  const processOf = (call: string, processId: number): MockedProcess => {
    const found = processes.get(processId);
    if (found === undefined) throw unansweredError(call, `process ${processId} was never born in this table`);
    return found;
  };
  const born = (stage: ProcessStage, identityShape: ProcessCallShape): ProcessIdentity => {
    lastProcessId += 1;
    const identity = answerOf(identityShape, lastProcessId) as ProcessIdentity;
    processes.set(lastProcessId, { identity, stage });
    return identity;
  };

  const stopTree = (leader: ProcessIdentity, stage: ProcessStopStage, treeMembers: readonly ProcessTreeMember[] = []): ProcessTreeStopOutcome => {
    const call = `stopTree(${JSON.stringify(leader)}, ${stage}, ${JSON.stringify(treeMembers)})`;
    const mocked = processOf(call, leader.processId);
    stopped.push(leader);
    if (stage !== 'force') throw unansweredError(call, 'only a forced stop is recorded');
    if (!LIVE_STAGES.has(mocked.stage)) throw unansweredError(call, `the process is ${mocked.stage}, and the real table never stops it again`);
    if (!sameJson(leader, mocked.identity)) {
      if (!sameJson({ ...leader, startStamp: mocked.identity.startStamp }, mocked.identity) || treeMembers.length > 0) {
        throw unansweredError(call, 'the identity is not the process\'s own, nor only its start stamp another');
      }
      return answerOf(PROCESS_CALL_SHAPES.FORCED_STOP_OF_ANOTHER_START_STAMP, leader.processId) as ProcessTreeStopOutcome;
    }
    const leadsItsGroup = LEADER_STAGES.has(mocked.stage);
    const treeShape = leadsItsGroup ? PROCESS_CALL_SHAPES.TREE_OF_A_BORN_LEADER : PROCESS_CALL_SHAPES.TREE_IN_THE_CALLERS_GROUP;
    if (!sameJson(treeMembers, answerOf(treeShape, leader.processId))) throw unansweredError(call, 'the tree members are not those treeMembersOf answered');
    if (mocked.stage === 'refuses-stop') return answerOf(PROCESS_CALL_SHAPES.FORCED_STOP_OF_ANOTHER_USERS_LEADER, leader.processId) as ProcessTreeStopOutcome;
    mocked.stage = leadsItsGroup ? 'stopped' : 'outlived-stop';
    const stopShape = leadsItsGroup ? PROCESS_CALL_SHAPES.FORCED_STOP_OF_A_BORN_LEADER : PROCESS_CALL_SHAPES.FORCED_STOP_IN_THE_CALLERS_GROUP;
    return answerOf(stopShape, leader.processId) as ProcessTreeStopOutcome;
  };

  const unrecorded = (name: string) => (): never => {
    throw unansweredError(`${name}()`, 'this call is not recorded');
  };

  const table: RecordedProcessTable = {
    ports: {
      ...nativePorts,
      processSupervision: {
        ...nativePorts.processSupervision,
        identitySourcesOf: unrecorded('identitySourcesOf'),
        startedBefore:     unrecorded('startedBefore'),
        stopProcess:       unrecorded('stopProcess'),
        spawnOptionsFor:   unrecorded('spawnOptionsFor'),
        endOf:             unrecorded('endOf'),
        identityOf:        (processId) => {
          const mocked = processOf(`identityOf(${processId})`, processId);
          return answerOf(IDENTITY_SHAPE_OF_STAGE[mocked.stage], processId) as ProcessIdentity | null;
        },
        processIsGone: (processId) => {
          const mocked = processOf(`processIsGone(${processId})`, processId);
          return answerOf(GONE_SHAPE_OF_STAGE[mocked.stage], processId) as boolean;
        },
        sameProcess: (first, second) => {
          if (sameJson(first, second)) return answerOf(PROCESS_CALL_SHAPES.SAME_PROCESS_OF_ONE_IDENTITY, first.processId) as boolean;
          if (sameJson({ ...first, startStamp: second.startStamp }, second)) {
            return answerOf(PROCESS_CALL_SHAPES.SAME_PROCESS_OF_ANOTHER_START_STAMP, first.processId) as boolean;
          }
          throw unansweredError(`sameProcess(${JSON.stringify(first)}, ${JSON.stringify(second)})`, 'the identities differ in more than the start stamp');
        },
        treeMembersOf: (leader, earlierMembers = []) => {
          const call = `treeMembersOf(${JSON.stringify(leader)}, ${JSON.stringify(earlierMembers)})`;
          const mocked = processOf(call, leader.processId);
          if (!sameJson(leader, mocked.identity) || earlierMembers.length > 0) {
            throw unansweredError(call, 'only the tree of the process\'s own identity, with no earlier members, is recorded');
          }
          if (LEADER_STAGES.has(mocked.stage)) return answerOf(PROCESS_CALL_SHAPES.TREE_OF_A_BORN_LEADER, leader.processId) as readonly ProcessTreeMember[];
          if (mocked.stage === 'callers-group-member') return answerOf(PROCESS_CALL_SHAPES.TREE_IN_THE_CALLERS_GROUP, leader.processId) as readonly ProcessTreeMember[];
          throw unansweredError(call, `no tree of a process ${mocked.stage} is recorded`);
        },
        stopTree,
        bootStartedAtEpochSeconds: () => answerOf(PROCESS_CALL_SHAPES.BOOT_START, process.pid) as number | null,
      },
    },
    bornProcess:      () => born('born-leader', PROCESS_CALL_SHAPES.IDENTITY_OF_A_BORN_LEADER),
    memberOfOwnGroup: () => born('callers-group-member', PROCESS_CALL_SHAPES.IDENTITY_IN_THE_CALLERS_GROUP),
    callerProcess:    () => {
      const known = processes.get(process.pid);
      if (known !== undefined) return known.identity;
      const identity = answerOf(PROCESS_CALL_SHAPES.IDENTITY_IN_THE_CALLERS_GROUP, process.pid) as ProcessIdentity;
      processes.set(process.pid, { identity, stage: 'callers-group-member' });
      return identity;
    },
    endProcess: (identity) => {
      const mocked = processOf(`endProcess(${identity.processId})`, identity.processId);
      if (LIVE_STAGES.has(mocked.stage)) mocked.stage = 'ended';
    },
    refuseForcedStops: (identity) => {
      const call = `refuseForcedStops(${identity.processId})`;
      const mocked = processOf(call, identity.processId);
      if (mocked.stage !== 'born-leader') throw unansweredError(call, `only a born leader is recorded refusing a stop, not a process ${mocked.stage}`);
      mocked.stage = 'refuses-stop';
    },
    stoppedProcesses: () => stopped,
  };

  return {
    table,
    takeUnansweredCalls: () => unansweredCalls.splice(0),
    forgetProcesses:     () => {
      processes = new Map();
      stopped = [];
    },
  };
}
