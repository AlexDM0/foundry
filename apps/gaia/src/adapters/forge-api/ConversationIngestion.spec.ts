/**
 * The conversation streams mapped into Gaia's model, on a job stream and a profile run a scratch forge recorded. What matters: a history
 * entry keeps its fields, an absent one reads as `null` or empty; a message is one entry; a profile line keeps its text; a malformed entry or
 * line maps to nothing and names its keys; a key Gaia does not read is passed over.
 */
import { describe, expect, test } from 'bun:test';

import { JsonValueUtil }                                                                   from '../../lib/json-value/JsonValueUtil.ts';
import { ConversationIngestion }                                                           from './ConversationIngestion.ts';
import { recordedJobStreamEventsOf, recordedPathSegmentOf, recordedProfileStreamEventsOf } from './testing/BoardDocuments.ts';

const INGESTION = new ConversationIngestion();

const RECORDED_JOB_ID = recordedPathSegmentOf('intake-conversation', /\/jobs\/([^/]+)\/stream/);
const RECORDED_PROFILE_RUN_ID = recordedPathSegmentOf('gate-profile-run', /\/profiles\/([^/]+)\/stream/);

function parsedDataOf(data: string): unknown {
  const parsing = JsonValueUtil.parsedValueOf(data);
  if (parsing === null) throw new Error('The recorded event holds no JSON.');
  return parsing.parsed;
}

async function recordedHistoryData(): Promise<unknown> {
  const history = (await recordedJobStreamEventsOf(RECORDED_JOB_ID)).find((event) => event.eventName === 'history');
  if (history === undefined) throw new Error('The recorded job stream sent no history.');
  return parsedDataOf(history.data);
}

describe('historyOf', () => {
  test('maps the recorded history: the intake request with the picture it carried', async () => {
    const reading = INGESTION.historyOf(await recordedHistoryData());
    expect(reading.entries).toEqual([{
      cursor:          '1.2',
      entryKey:        '1.2.0',
      role:            'hephaestus',
      text:            expect.stringContaining('suggest searches as the shopper types'),
      at:              expect.any(String),
      toolName:        null,
      parentToolUseId: null,
      toolUseId:       null,
      asksUser:        false,
      model:           null,
      tokens:          null,
      clientAct:       'chat',
      sentBy:          'hephaestus',
      chatSequence:    null,
      incidentIds:     [],
      pictures:        [{
        pictureId: expect.stringMatching(/^[0-9a-f]{64}$/), name: 'example-sketch.png', mediaType: 'image/png', bytes: 70
      }],
    }]);
  });

  test('names the keys of a malformed entry, from `entries`', async () => {
    const [entry] = await recordedHistoryData() as Record<string, unknown>[];
    expect(INGESTION.historyOf([{ ...entry, cursor: 12, clientAct: 'example-act' }])).toEqual({
      entries: null,
      reason:  { invalidKeys: ['entries[0].cursor', 'entries[0].clientAct'] },
    });
    expect(INGESTION.historyOf({ entries: [] }).entries).toBeNull();
  });
});

describe('messageOf', () => {
  test('maps one entry, passing over a key Gaia does not read', async () => {
    const [entry] = await recordedHistoryData() as Record<string, unknown>[];
    const reading = INGESTION.messageOf({ ...entry, exampleAddedKey: true });
    expect(reading.entry).toMatchObject({ cursor: '1.2', role: 'hephaestus', clientAct: 'chat' });
  });

  test('names a missing key', () => {
    expect(INGESTION.messageOf({
      cursor: '1.3', entryKey: '1.3.0', role: 'assistant', at: null
    })).toEqual({ entry: null, reason: { invalidKeys: ['text'] } });
  });
});

describe('profileLineOf', () => {
  test('maps the recorded profile line', async () => {
    const line = (await recordedProfileStreamEventsOf(RECORDED_PROFILE_RUN_ID)).find((event) => event.eventName === 'line');
    expect(INGESTION.profileLineOf(parsedDataOf(line?.data ?? 'null'))).toEqual({ line: { text: 'Example gate passed\n' } });
  });

  test('names a line with no text', () => {
    expect(INGESTION.profileLineOf({ text: 3 })).toEqual({ line: null, reason: { invalidKeys: ['text'] } });
  });
});
