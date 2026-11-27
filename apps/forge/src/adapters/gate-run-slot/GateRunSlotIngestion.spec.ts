/**
 * A gate run slot's stored format both ways: what the writer stores reads back the same, the forms older code wrote read as their holding,
 * and any other file is unreadable with the text it holds, which a taker compares before it removes the slot.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join }                                    from 'node:path';
import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import { EXAMPLE_LINK_REFUSAL_MESSAGE, fileReplaceWithoutLinks }                   from '../../testing/FileReplaceWithoutLinks.ts';
import { createScratchDirectory, removeScratchDirectory }                          from '../../testing/ScratchWorkspace.ts';
import { GATE_RUN_SLOT_FORMAT_VERSION, GateRunSlotIngestion, type GateRunHolding } from './GateRunSlotIngestion.ts';
import { createGateRunSlotWriter }                                                 from './GateRunSlotWriter.ts';

const HOLDING: GateRunHolding = { holder: '/example/tracker/children/J4/gate-tests', process: { processId: 5001, startStamp: '1700000001', bootIdentity: 'boot-example' } };

const DOCUMENT = { version: GATE_RUN_SLOT_FORMAT_VERSION, process: HOLDING.process };

let scratchDirectory = '';

const slotFilePath = (): string => join(scratchDirectory, 'slot-1');

const reading = (): ReturnType<GateRunSlotIngestion['read']> => new GateRunSlotIngestion(slotFilePath()).read();

beforeEach(() => {
  scratchDirectory = createScratchDirectory('gate-run-slot-ingestion');
});

afterEach(() => {
  removeScratchDirectory(scratchDirectory);
});

test('no file is absent', () => {
  expect(reading()).toEqual({ verdict: 'absent' });
});

test('what the writer creates, and then rewrites, reads back as the same holding; a second create finds the slot taken', () => {
  const writer = createGateRunSlotWriter(slotFilePath());
  expect(writer.create(HOLDING)).toBe('created');
  expect(reading()).toMatchObject({ verdict: 'readable', holding: HOLDING });
  expect(readFileSync(slotFilePath(), 'utf8')).toBe(`${HOLDING.holder}\n${JSON.stringify(DOCUMENT, null, 2)}\n`);
  expect(writer.create({ ...HOLDING, holder: '/example/other' })).toBe('already-exists');
  writer.write({ ...HOLDING, process: null });
  expect(reading()).toMatchObject({ verdict: 'readable', holding: { ...HOLDING, process: null } });
});

test.each([
  ['a process document of no version', `${HOLDING.holder}\n${JSON.stringify({ process: HOLDING.process })}`, HOLDING],
  ['a process document of another version', `${HOLDING.holder}\n${JSON.stringify({ ...DOCUMENT, version: GATE_RUN_SLOT_FORMAT_VERSION + 1 })}`, HOLDING],
  ['the process identity itself as the line, as older code wrote', `${HOLDING.holder}\n${JSON.stringify(HOLDING.process)}`, HOLDING],
  ['a holder line alone, as older code wrote for no process', HOLDING.holder, { ...HOLDING, process: null }],
])('%s reads as its holding', (_case, text, holding) => {
  writeFileSync(slotFilePath(), text);
  expect(reading()).toEqual({ verdict: 'readable', holding, storedText: text });
});

test.each([
  ['an empty file', ''],
  ['no holder line', `\n${JSON.stringify(DOCUMENT)}`],
  ['a process line that is not JSON', `${HOLDING.holder}\nnot json`],
  ['a wrong process', `${HOLDING.holder}\n${JSON.stringify({ ...DOCUMENT, process: 'a process' })}`],
  ['a line that names no process identity', `${HOLDING.holder}\n${JSON.stringify({ version: GATE_RUN_SLOT_FORMAT_VERSION })}`],
])('%s is unreadable, with the text it holds', (_case, text) => {
  writeFileSync(slotFilePath(), text);
  expect(reading()).toMatchObject({ verdict: 'unreadable', storedText: text });
});

test('where hard links fail the writer throws the link failure and leaves no partial file, since a taker reads a partial one as stale', () => {
  expect(() => createGateRunSlotWriter(slotFilePath(), fileReplaceWithoutLinks()).create(HOLDING)).toThrow(EXAMPLE_LINK_REFUSAL_MESSAGE);
  expect(existsSync(slotFilePath())).toBe(false);
});
