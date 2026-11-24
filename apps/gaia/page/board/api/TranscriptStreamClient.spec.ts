/**
 * The transcript client against fake relay sources. What matters: the stream opens the relay's job stream at its version after the cursor
 * it was given, `history` and `message` both reach the handler, the history says it arrived also when it brought no entry, an entry of
 * another shape is dropped and a document of another `boardVersion` too, and the last cursor received is kept for a reopened panel; a stream
 * the browser gave up on reopens after that cursor once the wait fires, and an entry replayed across the reopen is delivered once. Entries
 * of one log line share a cursor and differ in `entryKey`, so all of them arrive, every field intact, a chat's pictures among them.
 */
import { describe, expect, test } from 'bun:test';

import { GAIA_ENDPOINT_VERSIONS }            from '../../../src/shared/constants/GaiaSystemVersions.ts';
import type { BoardTranscriptEntryDocument } from '../../@types/board/ConversationDocument.ts';
import { fakeRelayStreams }                  from '../testing/FakeRelay.ts';
import { TranscriptStreamClient }            from './TranscriptStreamClient.ts';

const JOB_STREAM_PATH = `/api/v${GAIA_ENDPOINT_VERSIONS.forgeJobStream}/forges/example-tracker/jobs/J12/stream`;

function entryOf(cursor: string, part: number, role: string, text: string): BoardTranscriptEntryDocument {
  return {
    cursor,
    entryKey:        `${cursor}.${part}`,
    role,
    text,
    at:              '2026-11-10T09:30:00.000Z',
    toolName:        null,
    parentToolUseId: null,
    toolUseId:       null,
    asksUser:        false,
    model:           null,
    tokens:          null,
    clientAct:       null,
    sentBy:          null,
    chatSequence:    null,
    incidentIds:     [],
    pictures:        [],
  };
}

function historyOf(entries: readonly unknown[]): unknown {
  return { boardVersion: 2, kind: 'history', entries };
}

function messageOf(entry: unknown): unknown {
  return { boardVersion: 2, kind: 'message', entry };
}

describe('the transcript client', () => {
  test('says the history arrived after its entries, also when it brought none, and never for a message', () => {
    const relay = fakeRelayStreams();
    const heard: string[] = [];
    TranscriptStreamClient.follow('example-tracker', 'J12', {
      onEntries: (entries) => heard.push(...entries.map((entry) => entry.cursor)),
      onHistory: () => heard.push('history'),
    }, { surroundings: relay.surroundings });
    const [source] = relay.sources;
    source?.fire('history', historyOf([]));
    source?.fire('message', messageOf(entryOf('1.1', 0, 'assistant', 'Example reply')));
    source?.fire('history', historyOf([entryOf('1.2', 0, 'assistant', 'Example replay')]));
    expect(heard).toEqual(['history', '1.1', '1.2', 'history']);
  });

  test('follows history then messages after the cursor, keeping the last cursor and dropping malformed entries and other versions', () => {
    const relay = fakeRelayStreams();
    const received: string[] = [];
    const onEntries = (entries: readonly BoardTranscriptEntryDocument[]): number => received.push(...entries.map((entry) => entry.cursor));
    const stream = TranscriptStreamClient.follow('example-tracker', 'J12', { onEntries }, { after: '1.4', surroundings: relay.surroundings });
    const [source] = relay.sources;
    source?.fire('history', historyOf([entryOf('1.5', 0, 'assistant', 'Reading the ticket.'), { cursor: 'broken' }]));
    source?.fire('message', messageOf(entryOf('2.1', 0, 'tool-call', 'Bash')));
    source?.fire('message', { boardVersion: 3, kind: 'message', entry: entryOf('2.2', 0, 'assistant', 'Of another version.') });
    expect(source?.path).toBe(`${JOB_STREAM_PATH}?after=1.4`);
    expect(received).toEqual(['1.5', '2.1']);
    expect(stream.lastCursor()).toBe('2.1');
  });

  test('a stream the browser gave up on reopens after the last cursor received once the wait fires, and a replayed entry arrives once', () => {
    const relay = fakeRelayStreams();
    const received: string[] = [];
    const onEntries = (entries: readonly BoardTranscriptEntryDocument[]): number => received.push(...entries.map((entry) => entry.cursor));
    const stream = TranscriptStreamClient.follow('example-tracker', 'J12', { onEntries }, { surroundings: relay.surroundings });
    relay.sources[0]?.fire('history', historyOf([entryOf('1.1', 0, 'assistant', 'Reading.')]));
    relay.sources[0]?.giveUp();
    expect(relay.sources).toHaveLength(1);
    relay.fireWaits();
    relay.sources[1]?.fire('history', historyOf([entryOf('1.1', 0, 'assistant', 'Reading.'), entryOf('1.2', 0, 'tool-call', 'Read')]));
    stream.close();
    expect(relay.sources.map(({ path }) => path)).toEqual([JOB_STREAM_PATH, `${JOB_STREAM_PATH}?after=1.1`]);
    expect(received).toEqual(['1.1', '1.2']);
  });

  test('entries of one log line share a cursor and all arrive, each delivered once by its entry key', () => {
    const relay = fakeRelayStreams();
    const received: string[] = [];
    const onEntries = (entries: readonly BoardTranscriptEntryDocument[]): number => received.push(...entries.map((entry) => entry.entryKey));
    TranscriptStreamClient.follow('example-tracker', 'J12', { onEntries }, { surroundings: relay.surroundings });
    const [source] = relay.sources;
    source?.fire('message', messageOf(entryOf('4.17', 0, 'assistant', 'Two calls.')));
    source?.fire('message', messageOf(entryOf('4.17', 1, 'tool-call', 'Read')));
    source?.fire('message', messageOf(entryOf('4.17', 2, 'tool-call', 'Grep')));
    source?.fire('message', messageOf(entryOf('4.17', 1, 'tool-call', 'Read')));
    expect(received).toEqual(['4.17.0', '4.17.1', '4.17.2']);
  });

  test('a chat entry reaches the handler with every field intact, its pictures among them', () => {
    const relay = fakeRelayStreams();
    const received: BoardTranscriptEntryDocument[] = [];
    TranscriptStreamClient.follow('example-tracker', 'J7', { onEntries: (entries) => received.push(...entries) }, { surroundings: relay.surroundings });
    const withPicture: BoardTranscriptEntryDocument = {
      ...entryOf('1.3', 0, 'user', 'Make the header like this.'),
      clientAct:    'chat',
      sentBy:       'user',
      chatSequence: 4,
      incidentIds:  ['I3'],
      pictures:     [{
        pictureId: 'a'.repeat(64), name: 'header-mockup.png', mediaType: 'image/png', bytes: 41_200
      }],
    };
    relay.sources[0]?.fire('message', messageOf(withPicture));
    expect(received).toEqual([withPicture]);
  });
});
