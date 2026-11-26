/**
 * The Assistant's chats file both ways. What matters: what the writer stores reads back as the same chats, an empty list included; no file
 * is absent, the case before the first chat past the first message; and the bare list of before the version, another version and each wrong
 * field are unreadable, never a throw, since a wrong chat list renumbers the Assistant's chats against their markers.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join }                        from 'node:path';

import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { AssistantChatsIngestion, type AssistantChat }    from './AssistantChatsIngestion.ts';
import { createAssistantChatsWriter }                     from './AssistantChatsWriter.ts';

const CHATS: AssistantChat[] = [
  { sequence: 2, incidentIds: ['I3', 'I4'], messageNumber: null },
  { sequence: 3, incidentIds: [], messageNumber: 1 },
];

let scratchDirectory = '';

const chatsFilePath = (): string => join(scratchDirectory, 'assistant-chats.json');

const reading = (): ReturnType<AssistantChatsIngestion['read']> => new AssistantChatsIngestion(chatsFilePath()).read();

beforeEach(() => {
  scratchDirectory = createScratchDirectory('assistant-chats-ingestion');
});

afterEach(() => {
  removeScratchDirectory(scratchDirectory);
});

test('no file is absent', () => {
  expect(reading()).toEqual({ verdict: 'absent' });
});

test.each([[CHATS], [[]]])('what the writer stores reads back as the same chats, under version 1', (chats) => {
  createAssistantChatsWriter(chatsFilePath()).write(chats);

  expect(reading()).toEqual({ verdict: 'readable', chats });
  expect(JSON.parse(readFileSync(chatsFilePath(), 'utf8'))).toEqual({ version: 1, chats });
});

test.each([
  ['not JSON', '{', 'it is not valid JSON'],
  ['the bare list of before the version', '[{"sequence":2,"incidentIds":[],"messageNumber":1}]', 'it is not a JSON object'],
  ['another version', '{"version":2,"chats":[]}', 'its version is not 1'],
  ['chats that are no list', '{"version":1,"chats":{}}', 'its chats is not a list'],
  ['a chat that is no object', '{"version":1,"chats":[5]}', 'its chats[0] is not an object'],
  ['a sequence below 1', '{"version":1,"chats":[{"sequence":0,"incidentIds":[],"messageNumber":null}]}', 'its chats[0].sequence is not a whole number of at least 1'],
  ['incident ids that are no text', '{"version":1,"chats":[{"sequence":2,"incidentIds":[3],"messageNumber":null}]}', 'its chats[0].incidentIds is not a list of incident ids'],
  ['no message number', '{"version":1,"chats":[{"sequence":2,"incidentIds":[]}]}', 'its chats[0].messageNumber is neither'],
  ['a message number of 0', '{"version":1,"chats":[{"sequence":2,"incidentIds":[],"messageNumber":0}]}', 'its chats[0].messageNumber is neither'],
])('%s is unreadable, never a throw', (_case, storedText, reason) => {
  writeFileSync(chatsFilePath(), storedText);

  const chatsReading = reading();

  expect(chatsReading.verdict).toBe('unreadable');
  expect(chatsReading.verdict === 'unreadable' ? chatsReading.reason : '').toContain(reason);
});
