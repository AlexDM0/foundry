/**
 * What kind of start this is, judged from plain readings of what the generation before it left: its presence record, its heartbeat, the newest
 * Hephaestus lock, Talos's newest record, the boot, and how this start came about. It reads no file, process or clock; the start gate, `status`
 * and the presence document all read its one verdict.
 */
import type { PresenceRecord }                       from '../../adapters/presence/@types/PresenceRecord.ts';
import type { StartClassificationVerdict }           from '../../adapters/presence/@types/StartClassificationVerdict.ts';
import { LocalTimeUtil }                             from '../../lib/local-time/LocalTimeUtil.ts';
import { sameBoot, sameProcess }                     from '../../lib/process-identity/ProcessIdentity.ts';
import type { StartKind, StartOrigin }               from '../../lib/tracker-model/@types/Job.ts';
import type { HeartbeatRecord, PresenceFileReading } from './@types/PresenceRecord.ts';
import type { HephaestusLockReading }                from './HephaestusLock.ts';
import { HEARTBEAT_STALE_BEFORE_BOOT_MILLISECONDS }  from './constants/PresenceLimits.ts';

/** Talos's newest record: none, quit, still live, or not quit with its process gone, in the boot it ran in. */
export type TalosRecordReading =
  | { verdict: 'none' }
  | { verdict: 'quit' }
  | { verdict: 'live' }
  | { verdict: 'gone'; bootIdentity: string };

/** How this start came about; a successor names the generation it takes the Hephaestus lock over from. */
export type StartOriginReading =
  | { startOrigin: Exclude<StartOrigin, 'successor'> }
  | { startOrigin: 'successor'; predecessorGeneration: number };

export interface StartEvidence {
  presence:                  PresenceFileReading<PresenceRecord>;
  heartbeat:                 PresenceFileReading<HeartbeatRecord>;
  newestLock:                HephaestusLockReading;
  talos:                     TalosRecordReading;
  currentBootIdentity:       string;
  bootStartedAtEpochSeconds: number | null;
  origin:                    StartOriginReading;
}

type CrashedComponent = NonNullable<StartClassificationVerdict['crashedComponent']>;

type TalosEvidence = StartClassificationVerdict['evidence']['talos'];

type DeadLockReading = Extract<HephaestusLockReading, { verdict: 'dead' }>;

interface PreviousGenerationJudgement {
  kind:                 StartKind;
  previousGeneration:   number | null;
  crashedComponent:     CrashedComponent | null;
  previousBootIdentity: string | null;
  /** It stopped with no end on record and kept its Hephaestus lock: only then does its last beat say when it stopped. */
  endedUnrecorded:      boolean;
}

const MILLISECONDS_PER_SECOND = 1_000;

function judgementOf(kind: StartKind, previousGeneration: number | null, previousBootIdentity: string | null): PreviousGenerationJudgement {
  return {
    kind, previousGeneration, crashedComponent: null, previousBootIdentity, endedUnrecorded: false
  };
}

function crashJudgementOf(previousGeneration: number | null, crashedComponent: CrashedComponent, previousBootIdentity: string | null): PreviousGenerationJudgement {
  return { ...judgementOf('crashed', previousGeneration, previousBootIdentity), crashedComponent };
}

/** A generation that died with no end on record: in this boot a crash, in another the machine going down. */
function unrecordedEndJudgementOf(previousGeneration: number, previousBootIdentity: string, currentBootIdentity: string): PreviousGenerationJudgement {
  if (sameBoot(previousBootIdentity, currentBootIdentity)) return crashJudgementOf(previousGeneration, 'hephaestus', previousBootIdentity);
  return { ...judgementOf('machine-went-down', previousGeneration, previousBootIdentity), endedUnrecorded: true };
}

/**
 * Generations start again at 1 once a stop released the last Hephaestus lock, so only the holder, never the generation, tells a lock taken after the
 * record apart: a dead Hephaestus lock of another process than the record names was taken by a start that died before it wrote presence. An
 * unreadable Hephaestus lock names no holder, so it is no proof of the record's process.
 */
function lockOfAStartThatDiedBeforePresence(newestLock: HephaestusLockReading, presenceRecord: PresenceRecord | null): newestLock is DeadLockReading {
  if (newestLock.verdict !== 'dead') return false;
  if (presenceRecord === null || newestLock.record === null) return true;
  const { processId, processStartStamp, bootIdentity } = newestLock.record;
  return !sameProcess({ processId, startStamp: processStartStamp, bootIdentity }, presenceRecord.process);
}

/** A start that died before it wrote presence never beat, so a beat of its generation number is an earlier run's. */
function startThatDiedBeforePresenceJudgementOf(deadHephaestusLock: DeadLockReading, currentBootIdentity: string): PreviousGenerationJudgement {
  if (deadHephaestusLock.record === null) return crashJudgementOf(deadHephaestusLock.generation, 'hephaestus', null);
  const judgement = unrecordedEndJudgementOf(deadHephaestusLock.generation, deadHephaestusLock.record.bootIdentity, currentBootIdentity);
  return { ...judgement, endedUnrecorded: false };
}

function successorTakesOver(origin: StartOriginReading, generation: number): boolean {
  return origin.startOrigin === 'successor' && origin.predecessorGeneration === generation;
}

/**
 * Only a stop, a handover and a start that failed after its presence write let go of their own Hephaestus lock, and the first two write their ending
 * first; a crashed process leaves its Hephaestus lock behind. So no ending and no Hephaestus lock left at all is a start that never served.
 */
function letGoOfItsHephaestusLockWithoutAnEnding(newestLock: HephaestusLockReading): boolean {
  return newestLock.verdict === 'none';
}

function previousGenerationJudgementOf({
  presence, newestLock, currentBootIdentity, origin
}: StartEvidence): PreviousGenerationJudgement {
  const newestLockGeneration = newestLock.verdict === 'none' ? null : newestLock.generation;
  if (presence.verdict === 'unreadable') return crashJudgementOf(newestLockGeneration, 'hephaestus', null);
  const presenceRecord = presence.verdict === 'read' ? presence.record : null;
  if (lockOfAStartThatDiedBeforePresence(newestLock, presenceRecord)) return startThatDiedBeforePresenceJudgementOf(newestLock, currentBootIdentity);
  if (presenceRecord === null) return judgementOf('first-start', null, null);
  const { generation, ending, process: { bootIdentity } } = presenceRecord;
  if (ending?.kind === 'crashed') return crashJudgementOf(generation, ending.component, bootIdentity);
  if (ending?.kind === 'stopped') return judgementOf('stopped-on-purpose', generation, bootIdentity);
  if (ending?.kind === 'handed-over') return judgementOf(successorTakesOver(origin, generation) ? 'handover' : 'stopped-on-purpose', generation, bootIdentity);
  if (letGoOfItsHephaestusLockWithoutAnEnding(newestLock)) return judgementOf('stopped-on-purpose', generation, bootIdentity);
  return unrecordedEndJudgementOf(generation, bootIdentity, currentBootIdentity);
}

function talosEvidenceOf(talos: TalosRecordReading, currentBootIdentity: string): TalosEvidence {
  if (talos.verdict !== 'gone') return talos.verdict;
  return sameBoot(talos.bootIdentity, currentBootIdentity) ? 'lost-this-boot' : 'lost-other-boot';
}

/** A Talos lost in this boot crashed, also while the forge was off; one lost in another boot went down with the machine. */
function judgementWithTalos(judgement: PreviousGenerationJudgement, talosEvidence: TalosEvidence): PreviousGenerationJudgement {
  if (judgement.kind === 'handover' || judgement.kind === 'first-start') return judgement;
  if (talosEvidence === 'lost-this-boot') return {
    ...judgement, kind: 'crashed', crashedComponent: 'talos', endedUnrecorded: false
  };
  if (talosEvidence === 'lost-other-boot' && judgement.kind === 'stopped-on-purpose') return { ...judgement, kind: 'machine-went-down' };
  return judgement;
}

/** A beat of another generation says nothing of when this one stopped. */
function lastBeatOf(heartbeat: PresenceFileReading<HeartbeatRecord>, previousGeneration: number | null): HeartbeatRecord | null {
  if (heartbeat.verdict !== 'read' || heartbeat.record.generation !== previousGeneration) return null;
  return heartbeat.record;
}

function crashSuspectedOf(judgement: PreviousGenerationJudgement, lastBeat: HeartbeatRecord | null, bootStartedAtEpochSeconds: number | null): boolean {
  if (judgement.kind !== 'machine-went-down' || !judgement.endedUnrecorded || lastBeat === null || bootStartedAtEpochSeconds === null) return false;
  const lastBeatInstant = LocalTimeUtil.parseIso(lastBeat.at);
  if (lastBeatInstant === null) return false;
  // Against "a clock gives no fact": two recorded instants judge whether the forge crashed before the reboot, since the heartbeat is the only
  // witness of when the process stopped beating.
  return bootStartedAtEpochSeconds * MILLISECONDS_PER_SECOND - lastBeatInstant.getTime() > HEARTBEAT_STALE_BEFORE_BOOT_MILLISECONDS;
}

function classify(evidence: StartEvidence): StartClassificationVerdict {
  const {
    presence, newestLock, currentBootIdentity, bootStartedAtEpochSeconds
  } = evidence;
  const talosEvidence = talosEvidenceOf(evidence.talos, currentBootIdentity);
  const judgement = judgementWithTalos(previousGenerationJudgementOf(evidence), talosEvidence);
  const lastBeat = lastBeatOf(evidence.heartbeat, judgement.previousGeneration);
  const presenceRecord = presence.verdict === 'read' ? presence.record : null;
  return {
    kind:               judgement.kind,
    previousGeneration: judgement.previousGeneration,
    crashSuspected:     crashSuspectedOf(judgement, lastBeat, bootStartedAtEpochSeconds),
    crashedComponent:   judgement.kind === 'crashed' ? judgement.crashedComponent : null,
    evidence:           {
      presence:                        presence.verdict,
      previousEnding:                  presenceRecord?.ending?.kind ?? null,
      previousBootIdentity:            judgement.previousBootIdentity,
      currentBootIdentity,
      newerHephaestusLockThanPresence: presence.verdict !== 'unreadable' && lockOfAStartThatDiedBeforePresence(newestLock, presenceRecord),
      talos:                           talosEvidence,
      lastHeartbeatAt:                 lastBeat?.at ?? null,
      bootStartedAt:                   bootStartedAtEpochSeconds === null ? null : LocalTimeUtil.formatLocalIso(new Date(bootStartedAtEpochSeconds * MILLISECONDS_PER_SECOND)),
    },
  };
}

export const StartClassification = Object.freeze({ classify });
