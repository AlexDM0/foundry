/**
 * `BoardChildren` over the board's one Talos: liveness from each child's record and Talos's own, events from the child's log, and every act
 * as a frame over the one connection, taken only when Talos answered it.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync
} from 'node:fs';
import {
  dirname,
  isAbsolute,
  join,
  relative,
  sep
} from 'node:path';

import type { AgentLaunchPlan }                            from '../../lib/agent-launch/AgentLaunchPlan.ts';
import { writeFileAtomically }                             from '../../lib/atomic-file/AtomicFile.ts';
import type { PlatformPorts }                              from '../../lib/platform-ports/PlatformPortsFor.ts';
import type { ChildInput, DoneFrame }                      from '../../lib/talos/@types/TalosFrame.ts';
import { type ChildLaunch, type QuitAtTurnEnd, childIdOf } from '../../lib/talos/ChildLaunch.ts';
import { type ChildRecord, childRecordOf }                 from '../../lib/talos/ChildRecord.ts';
import type { EndingPattern }                              from '../../lib/talos/EndingPatterns.ts';
import { type EventLogEntry, eventLogEntriesOf }           from '../../lib/talos/EventLog.ts';
import type { LineConditions }                             from '../../lib/talos/LineConditions.ts';
import type { StandingReply }                              from '../../lib/talos/StandingReplies.ts';
import { childFilesOf }                                    from '../../lib/talos/TalosFiles.ts';
import type { StoredRecordReading }                        from '../../lib/talos/utils/ParsedValueUtil.ts';
import { SESSION_STOP_GRACE_MILLISECONDS }                 from '../../shared/constants/OverseerLimits.ts';
import type {
  AgentChildRequest,
  BoardChildren,
  ChildLaunchOutcome,
  ChildLiveness,
  LineChildRequest
} from './BoardChildren.ts';
import { jobFolderIn }                             from './OverseerFiles.ts';
import type { TalosConnection, TalosFrameRequest } from './TalosConnection.ts';
import { runningIdentityOf, talosRecordAt }        from './TalosStart.ts';

/** Whether the Talos of a start number still runs. */
export type TalosLiveness = (startNumber: number) => boolean;

export interface TalosChildrenFacts {
  /** Absolute; a child folder is named under it, absolute or `/`-separated and relative. */
  boardFolder:    string;
  platformPorts:  PlatformPorts;
  /** The connection `ensureTalos` answered, read at each act, so a Talos started while serving is followed; `null` while none is welcomed. */
  connection:     () => TalosConnection | null;
  /** Read at most once per start number and pass; by default the identity check of the process Talos's record names. */
  talosLiveness?: TalosLiveness;
}

const CHILD_RECORD_FILE_PATTERN = /^child-(?<instance>[1-9]\d*)\.json$/;
const CHILD_FOLDER_SEPARATOR = '/';

/** The process Talos's record names, while it still is that process: a reused process id or a reboot reads as gone. */
export function recordedTalosLiveness(boardFolder: string, platformPorts: PlatformPorts): TalosLiveness {
  return (startNumber) => runningIdentityOf(platformPorts, talosRecordAt(boardFolder, startNumber)?.talos ?? null) !== null;
}

function textOf(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

/** Talos answered the frame and acted on it, or had already: a refusal or no answer leaves it untaken. */
function frameWasTaken(answer: DoneFrame | 'no-answer'): boolean {
  return answer !== 'no-answer' && answer.verdict !== 'refused';
}

function launchOutcomeOf(answer: DoneFrame | 'no-answer'): ChildLaunchOutcome {
  if (answer === 'no-answer') return { verdict: 'talos-unavailable' };
  switch (answer.verdict) {
    case 'done':
      return { verdict: 'launched' };
    case 'already-done':
      return { verdict: 'already-launched' };
    case 'refused':
      return { verdict: 'refused', reason: answer.reason };
  }
}

function writePlanFiles(plan: AgentLaunchPlan): void {
  for (const file of plan.files) {
    mkdirSync(dirname(file.path), { recursive: true });
    writeFileAtomically(file.path, file.text);
  }
}

export function createTalosChildren(facts: TalosChildrenFacts): BoardChildren {
  const { boardFolder } = facts;
  const talosLiveness = facts.talosLiveness ?? recordedTalosLiveness(boardFolder, facts.platformPorts);
  // `null` until the first pass begins, so a reader that runs no passes never reads a stale verdict.
  let talosLivenessThisPass: Map<number, boolean> | null = null;

  function talosIsLive(startNumber: number): boolean {
    if (talosLivenessThisPass === null) return talosLiveness(startNumber);
    const known = talosLivenessThisPass.get(startNumber);
    if (known !== undefined) return known;
    const live = talosLiveness(startNumber);
    talosLivenessThisPass.set(startNumber, live);
    return live;
  }

  /** The folder as a launch names it: relative to the board and `/`-separated. */
  function launchFolderOf(childFolder: string): string {
    return isAbsolute(childFolder) ? relative(boardFolder, childFolder).split(sep).join(CHILD_FOLDER_SEPARATOR) : childFolder;
  }

  function childIdIn(childFolder: string, instance: number): string {
    return childIdOf(launchFolderOf(childFolder), instance);
  }

  function recordReadingOf(childFolder: string, instance: number): StoredRecordReading<ChildRecord> | null {
    const text = textOf(childFilesOf(boardFolder, launchFolderOf(childFolder), instance).recordPath);
    return text === null ? null : childRecordOf(text);
  }

  function recordOf(childFolder: string, instance: number): ChildRecord | null {
    const reading = recordReadingOf(childFolder, instance);
    return reading?.verdict === 'read' ? reading.record : null;
  }

  function livenessOf(childFolder: string, instance: number): ChildLiveness {
    const reading = recordReadingOf(childFolder, instance);
    if (reading === null) return { verdict: 'unlaunched' };
    // Talos replaces a record atomically, so one it cannot read, or of another format, is damage or another program's.
    if (reading.verdict !== 'read') return { verdict: 'lost' };
    const { record } = reading;
    if (record.end !== null) return { verdict: 'ended', end: record.end };
    if (record.state === 'ended') return { verdict: 'lost' };
    return talosIsLive(record.talosStartNumber) ? { verdict: 'live', state: record.state } : { verdict: 'lost' };
  }

  function eventsAfter(childFolder: string, instance: number, afterSequence: number): readonly EventLogEntry[] | 'malformed' {
    const text = textOf(childFilesOf(boardFolder, launchFolderOf(childFolder), instance).eventLogPath);
    if (text === null) return [];
    const reading = eventLogEntriesOf(text);
    if (reading.verdict !== 'read') return 'malformed';
    return reading.entries.filter((entry) => entry.sequence > afterSequence);
  }

  function newestInstanceIn(childFolder: string): number | null {
    let fileNames: string[];
    try {
      fileNames = readdirSync(join(boardFolder, ...launchFolderOf(childFolder).split(CHILD_FOLDER_SEPARATOR)));
    } catch {
      return null;
    }
    const instances = fileNames.flatMap((fileName) => {
      const instance = CHILD_RECORD_FILE_PATTERN.exec(fileName)?.groups?.['instance'];
      return instance === undefined ? [] : [Number(instance)];
    });
    return instances.length === 0 ? null : Math.max(...instances);
  }

  async function sentAndTaken(frame: TalosFrameRequest): Promise<boolean> {
    const connection = facts.connection();
    if (connection === null) return false;
    return frameWasTaken(await connection.send(frame));
  }

  /** An agent launched with no quit act refuses to be asked to quit at its turn end, so it is stopped instead. */
  async function inputSentAndTaken(childId: string, input: ChildInput): Promise<boolean> {
    const connection = facts.connection();
    if (connection === null) return false;
    const answer = await connection.send({ kind: 'input', childId, input });
    const hasNoQuitAct = answer !== 'no-answer' && answer.verdict === 'refused' && answer.reason === 'no-quit-act';
    if (!hasNoQuitAct) return frameWasTaken(answer);
    return await sentAndTaken({ kind: 'stop', childId, graceMilliseconds: SESSION_STOP_GRACE_MILLISECONDS });
  }

  async function launched(launch: ChildLaunch, beforeTheFrame: () => void): Promise<ChildLaunchOutcome> {
    const connection = facts.connection();
    if (connection === null) return { verdict: 'talos-unavailable' };
    beforeTheFrame();
    return launchOutcomeOf(await connection.send({ kind: 'launch', launch }));
  }

  async function launchAgent(request: AgentChildRequest): Promise<ChildLaunchOutcome> {
    const { plan } = request;
    const launch: ChildLaunch = {
      childFolder:                    launchFolderOf(request.childFolder),
      instance:                       request.instance,
      kind:                           'agent',
      label:                          request.label,
      argv:                           plan.argv,
      environment:                    plan.environment,
      environmentFromTalos:           plan.environmentFromTalos ?? {},
      workingDirectory:               request.workingDirectory,
      verbatimArguments:              false,
      standingReplies:                plan.standingReplies satisfies readonly StandingReply[],
      closingLine:                    plan.closingLine satisfies LineConditions | null,
      endingPatterns:                 plan.endingPatterns satisfies readonly EndingPattern[],
      quitAtTurnEnd:                  plan.quitAtTurnEnd satisfies QuitAtTurnEnd | null,
      treeStopAtEndGraceMilliseconds: request.treeStopAtEndGraceMilliseconds,
      timeBoundMilliseconds:          null,
    };
    return await launched(launch, () => writePlanFiles(plan));
  }

  async function launchLine(request: LineChildRequest): Promise<ChildLaunchOutcome> {
    const launch: ChildLaunch = {
      childFolder:                    launchFolderOf(request.childFolder),
      instance:                       request.instance,
      kind:                           'line',
      label:                          request.label,
      argv:                           request.argv,
      environment:                    request.environment,
      environmentFromTalos:           {},
      workingDirectory:               request.workingDirectory,
      verbatimArguments:              request.verbatimArguments,
      standingReplies:                [],
      closingLine:                    null,
      endingPatterns:                 [],
      quitAtTurnEnd:                  null,
      treeStopAtEndGraceMilliseconds: null,
      timeBoundMilliseconds:          request.timeBoundMilliseconds,
    };
    return await launched(launch, () => undefined);
  }

  /**
   * Each input goes once Talos took the one before, and the marker is written only after the last was taken: delivery is at least once, so
   * a pass that finds no marker sends every input again, and a repeated line reaches the session as one more line.
   */
  async function sendInputOnce(markerPath: string, childFolder: string, instance: number, inputs: readonly ChildInput[]): Promise<boolean> {
    if (existsSync(markerPath) || livenessOf(childFolder, instance).verdict !== 'live') return false;
    const childId = childIdIn(childFolder, instance);
    for (const input of inputs) {
      if (!await inputSentAndTaken(childId, input)) return false;
    }
    mkdirSync(dirname(markerPath), { recursive: true });
    writeFileSync(markerPath, '');
    return true;
  }

  return Object.freeze<BoardChildren>({
    beginPass: () => {
      talosLivenessThisPass = new Map();
    },
    jobFolderOf:         (jobId) => jobFolderIn(boardFolder, jobId),
    livenessOf,
    recordOf,
    newestInstanceIn,
    eventsAfter,
    recognisedEndingsOf: (childFolder, instance) => recordOf(childFolder, instance)?.recognisedEndings ?? [],
    launchAgent,
    launchLine,
    sendInput:           async (childFolder, instance, input) => await inputSentAndTaken(childIdIn(childFolder, instance), input),
    sendInputOnce,
    stop:                async (childFolder, instance, graceMilliseconds) => await sentAndTaken({ kind: 'stop', childId: childIdIn(childFolder, instance), graceMilliseconds }),
    stopLiveLines:       async () => await sentAndTaken({ kind: 'stop-lines' }),
  });
}
