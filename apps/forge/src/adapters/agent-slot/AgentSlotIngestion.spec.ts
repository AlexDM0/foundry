/**
 * An agent slot's stored format both ways: what the writer stores reads back with the current version, a slot older code wrote without
 * that version reads as the same holding, so its Hephaestus is judged, and any other file is unreadable with the text it holds, which a
 * taker compares before removing the slot.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join }                                    from 'node:path';
import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import { EXAMPLE_LINK_REFUSAL_MESSAGE, fileReplaceWithoutLinks }                from '../../testing/FileReplaceWithoutLinks.ts';
import { createScratchDirectory, removeScratchDirectory }                       from '../../testing/ScratchWorkspace.ts';
import { AGENT_SLOT_FORMAT_VERSION, AgentSlotIngestion, type AgentSlotHolding } from './AgentSlotIngestion.ts';
import { createAgentSlotWriter }                                                from './AgentSlotWriter.ts';

const HOLDING: AgentSlotHolding = { trackerId: 'tracker-a', jobId: 'J1', hephaestus: { processId: 7001, startStamp: '1700000001', bootIdentity: 'boot-example' } };

let scratchDirectory = '';

const slotFilePath = (): string => join(scratchDirectory, 'slot-1');

const reading = (): ReturnType<AgentSlotIngestion['read']> => new AgentSlotIngestion(slotFilePath()).read();

beforeEach(() => {
  scratchDirectory = createScratchDirectory('agent-slot-ingestion');
});

afterEach(() => {
  removeScratchDirectory(scratchDirectory);
});

test('no file is absent', () => {
  expect(reading()).toEqual({ verdict: 'absent' });
});

test('what the writer creates, and then rewrites, reads back as the same holding; a second create finds the slot taken', () => {
  const writer = createAgentSlotWriter(slotFilePath());
  expect(writer.create(HOLDING)).toBe('created');
  expect(reading()).toMatchObject({ verdict: 'readable', holding: HOLDING });
  expect(JSON.parse(readFileSync(slotFilePath(), 'utf8'))).toMatchObject({ version: AGENT_SLOT_FORMAT_VERSION });
  expect(writer.create({ ...HOLDING, jobId: 'J2' })).toBe('already-exists');
  writer.write({ ...HOLDING, jobId: 'J3', hephaestus: null });
  expect(reading()).toMatchObject({ verdict: 'readable', holding: { ...HOLDING, jobId: 'J3', hephaestus: null } });
});

test.each([
  ['no version', HOLDING],
  ['another version', { ...HOLDING, version: AGENT_SLOT_FORMAT_VERSION - 1 }],
])('a slot of today\'s fields with %s reads as the same holding', (_case, document) => {
  writeFileSync(slotFilePath(), JSON.stringify(document));
  expect(reading()).toMatchObject({ verdict: 'readable', holding: HOLDING });
});

test.each([
  ['not JSON', 'not json'],
  ['not an object', '[]'],
  ['a wrong trackerId', JSON.stringify({ ...HOLDING, version: AGENT_SLOT_FORMAT_VERSION, trackerId: 3 })],
  ['a wrong jobId', JSON.stringify({ ...HOLDING, version: AGENT_SLOT_FORMAT_VERSION, jobId: null })],
  ['a wrong hephaestus', JSON.stringify({ ...HOLDING, version: AGENT_SLOT_FORMAT_VERSION, hephaestus: 'a process' })],
])('%s is unreadable, with the text it holds', (_case, text) => {
  writeFileSync(slotFilePath(), text);
  expect(reading()).toMatchObject({ verdict: 'unreadable', storedText: text });
});

test('where hard links fail the writer throws the link failure and leaves no partial file, since a taker reads a partial one as stale', () => {
  expect(() => createAgentSlotWriter(slotFilePath(), fileReplaceWithoutLinks()).create(HOLDING)).toThrow(EXAMPLE_LINK_REFUSAL_MESSAGE);
  expect(existsSync(slotFilePath())).toBe(false);
});
