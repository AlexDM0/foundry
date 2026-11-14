/**
 * D10 over every sentence a real forge was recorded answering: none reaches the page naming a command. What matters: every string of
 * every recorded forge answer is searched, so a command-naming sentence anywhere but a refusal's text fails here first; each recorded
 * refusal reaches the page through the command answer and the frame session answer the page reads; and each recorded monitor snapshot
 * reaches it through the fleet document, its notices and warnings among it. The frozen list of refusal codes whose recorded sentence names
 * a command keeps the spec from passing on nothing; retake it after `bun run record forge-program-refused` or an overseer-fetch recording.
 * The forge at monitor contract 1 worded its notices and refusals with commands, and Gaia still reads it, so its recording is searched too.
 */
import { describe, expect, test } from 'bun:test';

import { CONTRACT_VERSIONS }                                                                         from '../../shared/constants/ContractVersions.ts';
import { everyRecordedMonitorOneAnswerOf, everyRecordedOverseerAnswerOf, type RecordedStreamAnswer } from '../../testing/RecordedAnswers.ts';
import { recordedRunsOf }                                                                            from '../../testing/RecordedRuns.ts';
import type { ForgeIdentity, ForgeRegistryFacts }                                                    from '../forge-api/@types/ForgeDocumentReading.ts';
import { MonitorSnapshotIngestion }                                                                  from '../forge-api/MonitorSnapshotIngestion.ts';
import { CommandAnswerMapUtil }                                                                      from './CommandAnswerMapUtil.ts';
import { FleetDocumentMapUtil }                                                                      from './FleetDocumentMapUtil.ts';
import { ForgeSentenceUtil }                                                                         from './ForgeSentenceUtil.ts';
import { FrameSessionAnswerMapUtil }                                                                 from './FrameSessionAnswerMapUtil.ts';
import { FLEET_SNAPSHOT_EMPTY }                                                                      from './testing/fleet-snapshot-empty.ts';

const FORGE_PROGRAM_RECORDINGS = ['forge-program', 'forge-program-done', 'forge-program-refused'] as const;

const EVENT_DATA_PREFIX = 'data: ';

const EXAMPLE_READ_STAMP = '2026-11-13T07:00:00.000Z';

/** Taken from the recordings: the refusal codes whose recorded sentence names a command, from the forge before F1 and at monitor 1. */
const REFUSALS_RECORDED_NAMING_A_COMMAND = ['arguments-refused', 'read-failed', 'unauthorized'];

interface RecordedRefusal {
  readonly refusal: string | null;
  readonly text:    string | null;
}

/** A string found in a recorded document, with the keys of its place and the object it sits in. */
interface FoundString {
  readonly place:  string;
  readonly holder: Readonly<Record<string, unknown>>;
  readonly text:   string;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parsedOrNull(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function stringsIn(value: unknown, place: string, holder: Readonly<Record<string, unknown>>): FoundString[] {
  if (typeof value === 'string') return [{ place, holder, text: value }];
  if (Array.isArray(value)) return value.flatMap((item, index) => stringsIn(item, `${place}[${index}]`, holder));
  if (!isRecord(value)) return [];
  return Object.entries(value).flatMap(([key, item]) => stringsIn(item, `${place}.${key}`, value));
}

function isStreamAnswer(answer: unknown): answer is Extract<RecordedStreamAnswer, { readonly verdict: 'streaming' }> {
  return isRecord(answer) && answer['verdict'] === 'streaming';
}

/** Every JSON document the recorded Overseers answered: whole bodies, and each event of a stream. */
function recordedOverseerDocuments(): unknown[] {
  return [...everyRecordedOverseerAnswerOf(), ...everyRecordedMonitorOneAnswerOf()].flatMap(({ answer }) => {
    if (isStreamAnswer(answer)) {
      return answer.chunks.join('').split('\n')
        .filter((line) => line.startsWith(EVENT_DATA_PREFIX))
        .map((line) => parsedOrNull(line.slice(EVENT_DATA_PREFIX.length)));
    }
    return answer.verdict === 'answered' ? [parsedOrNull(answer.bodyText)] : [];
  }).filter((document) => document !== null);
}

/** Every JSON answer the recorded forge program wrote on standard output; its standard error never reaches the page. */
function recordedProgramDocuments(): unknown[] {
  return FORGE_PROGRAM_RECORDINGS.flatMap((recordingName) => recordedRunsOf(recordingName)).flatMap(({ answer }) => {
    return answer.verdict === 'finished' ? [parsedOrNull(answer.standardOutput)] : [];
  }).filter((document) => document !== null);
}

function recordedDocuments(): unknown[] {
  return [...recordedOverseerDocuments(), ...recordedProgramDocuments()];
}

function isRefusalHolder(holder: Readonly<Record<string, unknown>>): boolean {
  return Object.hasOwn(holder, 'refusal') && Object.hasOwn(holder, 'text');
}

function recordedRefusals(): RecordedRefusal[] {
  return recordedDocuments().filter(isRecord).filter(isRefusalHolder).map((document) => ({
    refusal: typeof document['refusal'] === 'string' ? document['refusal'] : null,
    text:    typeof document['text'] === 'string' ? document['text'] : null,
  }));
}

function isMonitorSnapshot(document: unknown): document is Readonly<Record<string, unknown>> {
  return isRecord(document) && Object.hasOwn(document, 'monitorVersion');
}

function factsOf(snapshot: Readonly<Record<string, unknown>>): { readonly facts: ForgeRegistryFacts; readonly identity: ForgeIdentity } {
  const trackerId = String(snapshot['trackerId']);
  const project = String(snapshot['project']);
  return {
    facts: {
      trackerId,
      project,
      root:              String(snapshot['root']),
      overseerUrl:       'http://127.0.0.1:4951/',
      overseerProcessId: 48_107,
      lastCommand:       null,
      lastChangedAt:     null,
    },
    identity: {
      trackerId,
      project,
      codeVersion:    'example-code',
      installVersion: 27,
      processId:      48_107,
      contracts:      {
        summary: 1, monitor: Number(snapshot['monitorVersion'] ?? CONTRACT_VERSIONS.forgeMonitor), control: 1, embed: 1,
      },
    },
  };
}

/** Each recorded monitor snapshot Gaia reads in full, as the fleet document the page receives holds it. */
function recordedForgeDocuments(): unknown[] {
  return recordedOverseerDocuments().filter(isMonitorSnapshot).flatMap((snapshot) => {
    const { facts, identity } = factsOf(snapshot);
    const reading = new MonitorSnapshotIngestion(facts, identity).readingOf(snapshot, EXAMPLE_READ_STAMP);
    if (reading.verdict !== 'readable') return [];
    return FleetDocumentMapUtil.fleetDocumentOf({ ...FLEET_SNAPSHOT_EMPTY, forges: [reading.reading] }).forges;
  });
}

describe('the sentences recorded from a real forge', () => {
  test('name a command only in a refusal\'s text, and do for the codes taken from the recordings', () => {
    const commandNaming = recordedDocuments().flatMap((document) => stringsIn(document, '', {}))
      .filter((found) => ForgeSentenceUtil.sentenceNamesACommand(found.text));
    expect(commandNaming.filter((found) => !found.place.endsWith('.text') || !isRefusalHolder(found.holder)).map((found) => found.place)).toEqual([]);
    const codes = new Set(commandNaming.map((found) => String(found.holder['refusal'])));
    expect([...codes].sort()).toEqual(REFUSALS_RECORDED_NAMING_A_COMMAND);
  });

  test('reach the page in no refused command\'s answer naming a command', () => {
    const refusals = recordedRefusals();
    expect(refusals.length).toBeGreaterThan(REFUSALS_RECORDED_NAMING_A_COMMAND.length);
    for (const { refusal, text } of refusals) {
      const answer = CommandAnswerMapUtil.commandAnswerOf({
        verdict: 'refused', refusedBy: 'forge', refusal, text,
      });
      expect(answer.refusal).toBe(refusal);
      expect(ForgeSentenceUtil.sentenceNamesACommand(answer.text ?? '')).toBe(false);
    }
  });

  test('reach the page in no refused frame session\'s answer naming a command', () => {
    for (const { refusal, text } of recordedRefusals()) {
      const answer = FrameSessionAnswerMapUtil.answerDocumentOf({
        verdict: 'refused', refusedBy: 'forge', refusal, text,
      });
      expect(ForgeSentenceUtil.sentenceNamesACommand(answer.text ?? '')).toBe(false);
    }
  });

  test('reach the page in no fleet document of a recorded monitor snapshot naming a command, its notices and warnings among it', () => {
    const forgeDocuments = recordedForgeDocuments();
    expect(forgeDocuments.length).toBeGreaterThan(0);
    const commandNaming = forgeDocuments.flatMap((forgeDocument) => stringsIn(forgeDocument, 'forge', {}))
      .filter((found) => ForgeSentenceUtil.sentenceNamesACommand(found.text));
    expect(commandNaming.map((found) => found.place)).toEqual([]);
  });
});
