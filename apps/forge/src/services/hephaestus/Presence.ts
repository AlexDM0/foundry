/**
 * `presence.json` and `heartbeat.json` under the board's `hephaestus` folder: a generation's start, its abandoned passes and how it ended, and
 * its beats at each renewal Talos confirmed. Every write is synchronous and atomic, so a dying process can still make it; a read is a verdict.
 */
import type { HephaestusLog }                       from '../../adapters/@types/HephaestusLogRecord.ts';
import type { HeartbeatProblem }                    from '../../adapters/heartbeat/@types/HeartbeatProblem.ts';
import type { HeartbeatRecord }                     from '../../adapters/heartbeat/@types/HeartbeatRecord.ts';
import { HeartbeatIngestion }                       from '../../adapters/heartbeat/HeartbeatIngestion.ts';
import { createHeartbeatWriter }                    from '../../adapters/heartbeat/HeartbeatWriter.ts';
import { HEARTBEAT_FORMAT_VERSION }                 from '../../adapters/heartbeat/constants/HeartbeatFileVersions.ts';
import type { PresenceProblem }                     from '../../adapters/presence/@types/PresenceProblem.ts';
import type { AbandonedPassReason, PresenceRecord } from '../../adapters/presence/@types/PresenceRecord.ts';
import { PresenceIngestion }                        from '../../adapters/presence/PresenceIngestion.ts';
import { createPresenceWriter }                     from '../../adapters/presence/PresenceWriter.ts';
import { PRESENCE_FORMAT_VERSION }                  from '../../adapters/presence/constants/PresenceFileVersions.ts';
import type {
  HeartbeatWrite,
  PresenceEndingToWrite,
  PresenceFileReading,
  PresenceStart,
  PresenceUpdate
} from './@types/PresenceRecord.ts';
import type { HephaestusFiles }      from './HephaestusFiles.ts';
import type { UnreadableBoardFiles } from './UnreadableBoardFiles.ts';

/** The path of `presence.json` inside the board's data folder, as a header warning names it. */
const PRESENCE_BOARD_FILE = 'hephaestus/presence.json';

function readPresence(files: HephaestusFiles): PresenceFileReading<PresenceRecord, PresenceProblem> {
  const reading = new PresenceIngestion(files.presenceFilePath).read();
  return reading.verdict === 'readable' ? { verdict: 'read', record: reading.record } : reading;
}

/** The record heals only when the next start overwrites it, so Hephaestus warns in the board header until it restarts. */
function reportUnreadablePresence(reading: PresenceFileReading<PresenceRecord, PresenceProblem>, unreadableBoardFiles: UnreadableBoardFiles): void {
  if (reading.verdict === 'unreadable') unreadableBoardFiles.report({ file: PRESENCE_BOARD_FILE, problem: reading.problem });
}

/** Overwrites the previous generation's record, which the start's classification has already read. */
function writeStartedPresence(files: HephaestusFiles, start: PresenceStart): PresenceRecord {
  const record: PresenceRecord = {
    presenceVersion: PRESENCE_FORMAT_VERSION,
    ...start,
    abandonedPasses: { inARow: 0, last: null },
    ending:          null,
  };
  createPresenceWriter(files.presenceFilePath).write(record);
  return record;
}

/** Reads the record, changes it only while it is still `generation`'s, and writes it back whole. */
function updatePresence(files: HephaestusFiles, generation: number, change: (record: PresenceRecord) => PresenceRecord | null): PresenceUpdate {
  const reading = readPresence(files);
  if (reading.verdict !== 'read') return { verdict: 'no-record', reading };
  if (reading.record.generation !== generation) return { verdict: 'not-this-generation', storedGeneration: reading.record.generation };
  const changed = change(reading.record);
  if (changed === null) return { verdict: 'unchanged' };
  createPresenceWriter(files.presenceFilePath).write(changed);
  return { verdict: 'written', record: changed };
}

function writeEnding(files: HephaestusFiles, generation: number, ending: PresenceEndingToWrite, at: string): PresenceUpdate {
  return updatePresence(files, generation, (record) => ({ ...record, ending: { ...ending, at } }));
}

function recordAbandonedPass(files: HephaestusFiles, generation: number, reason: AbandonedPassReason, detail: string, at: string): PresenceUpdate {
  return updatePresence(files, generation, (record) => ({
    ...record,
    abandonedPasses: { inARow: record.abandonedPasses.inARow + 1, last: { reason, detail, at } },
  }));
}

/** Writes only when abandoned passes stood in a row, so a pass that follows a completed one rewrites nothing; the last one stays shown. */
function recordCompletedPass(files: HephaestusFiles, generation: number): PresenceUpdate {
  return updatePresence(files, generation, (record) => {
    if (record.abandonedPasses.inARow === 0) return null;
    return { ...record, abandonedPasses: { ...record.abandonedPasses, inARow: 0 } };
  });
}

function readHeartbeat(files: HephaestusFiles): PresenceFileReading<HeartbeatRecord, HeartbeatProblem> {
  const reading = new HeartbeatIngestion(files.heartbeatFilePath).read();
  return reading.verdict === 'readable' ? { verdict: 'read', record: reading.record } : reading;
}

/**
 * Generations start again at 1 once a stop released the last Hephaestus lock, so only a stored beat whose generation's record is current is
 * newer. An unreadable record is current for no generation; the pass's own presence write reports it.
 */
function beatOfTheCurrentRecordAbove(storedGeneration: number | null, generation: number, files: HephaestusFiles): storedGeneration is number {
  if (storedGeneration === null || storedGeneration <= generation) return false;
  const presence = readPresence(files);
  return presence.verdict === 'read' && presence.record.generation === storedGeneration;
}

/**
 * During a restart the predecessor and the successor both beat: a process beats only while the stored beat is not of a newer generation
 * whose record is current, so the old generation's last beat never hides the new one's, and an ended run's beat never silences a new run.
 */
function writeHeartbeat(files: HephaestusFiles, generation: number, at: string, log: HephaestusLog): HeartbeatWrite {
  const stored = readHeartbeat(files);
  // The beat below rewrites the file whole, so an unreadable one heals at once and is only logged.
  if (stored.verdict === 'unreadable') log({ kind: 'heartbeat-unreadable-rewritten', problem: stored.problem });
  const storedGeneration = stored.verdict === 'read' ? stored.record.generation : null;
  if (beatOfTheCurrentRecordAbove(storedGeneration, generation, files)) return { verdict: 'newer-generation-beats', storedGeneration };
  const sequence = stored.verdict === 'read' && storedGeneration === generation ? stored.record.sequence + 1 : 1;
  const record: HeartbeatRecord = {
    heartbeatVersion: HEARTBEAT_FORMAT_VERSION, generation, sequence, at
  };
  createHeartbeatWriter(files.heartbeatFilePath).write(record);
  return { verdict: 'written', record };
}

export const Presence = Object.freeze({
  readPresence,
  reportUnreadablePresence,
  writeStartedPresence,
  writeEnding,
  readHeartbeat,
  writeHeartbeat,
  recordAbandonedPass,
  recordCompletedPass,
});
