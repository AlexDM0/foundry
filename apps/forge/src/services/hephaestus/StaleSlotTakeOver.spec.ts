/**
 * Freeing a stale slot under a taking marker. What matters: of two takers that judged one slot stale, the second never removes the slot
 * the first freed and another claimer created since; a marker whose taker runs leaves the slot to it; a marker whose taker is gone is taken
 * over; and no marker is left behind.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from 'node:fs';
import { join } from 'node:path';
import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import { fileReplaceOfThisProcess }                                from '../../lib/atomic-file/FileReplaceFor.ts';
import { createScratchDirectory, removeScratchDirectory }          from '../../testing/ScratchWorkspace.ts';
import { type SlotTaker, StaleSlotTakeOver, TAKING_MARKER_SUFFIX } from './StaleSlotTakeOver.ts';

const STALE_TEXT    = 'example stale holding';
const CLAIMED_TEXT  = 'example holding claimed since';
const LIVE_TAKER    = 'example live taker';
const GONE_TAKER    = 'example gone taker';

let scratchDirectory = '';

const slotPath   = (): string => join(scratchDirectory, 'slot-1');
const markerPath = (): string => `${slotPath()}${TAKING_MARKER_SUFFIX}`;

function storedTextAt(path: string): string | null {
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
}

/** A taker whose marker text is its name; a marker naming `LIVE_TAKER` is one whose taker still runs. */
function takerNamed(name: string): SlotTaker {
  return {
    fileReplace:   fileReplaceOfThisProcess(),
    storedTextAt,
    createdMarker: (path) => {
      if (existsSync(path)) return false;
      writeFileSync(path, name, { flag: 'wx' });
      return true;
    },
    markerAt: (path) => {
      const storedText = storedTextAt(path);
      return storedText === null ? null : { storedText, takerIsLive: storedText === LIVE_TAKER };
    },
  };
}

beforeEach(() => {
  scratchDirectory = createScratchDirectory('stale-slot-take-over');
  mkdirSync(scratchDirectory, { recursive: true });
  writeFileSync(slotPath(), STALE_TEXT);
});

afterEach(() => {
  removeScratchDirectory(scratchDirectory);
});

test('a slot still holding the text it was judged by is freed, and its taking marker removed', () => {
  expect(StaleSlotTakeOver.staleSlotFreed(slotPath(), STALE_TEXT, takerNamed('example first taker'))).toBe(true);
  expect(existsSync(slotPath())).toBe(false);
  expect(existsSync(markerPath())).toBe(false);
});

test('a second taker that judged the slot stale never removes the slot another claimer created after the first freed it', () => {
  expect(StaleSlotTakeOver.staleSlotFreed(slotPath(), STALE_TEXT, takerNamed('example first taker'))).toBe(true);
  writeFileSync(slotPath(), CLAIMED_TEXT, { flag: 'wx' });

  expect(StaleSlotTakeOver.staleSlotFreed(slotPath(), STALE_TEXT, takerNamed('example second taker'))).toBe(false);

  expect(readFileSync(slotPath(), 'utf8')).toBe(CLAIMED_TEXT);
  expect(existsSync(markerPath())).toBe(false);
});

test('a taking marker whose taker still runs leaves the slot to that taker', () => {
  writeFileSync(markerPath(), LIVE_TAKER);

  expect(StaleSlotTakeOver.staleSlotFreed(slotPath(), STALE_TEXT, takerNamed('example second taker'))).toBe(false);

  expect(readFileSync(slotPath(), 'utf8')).toBe(STALE_TEXT);
  expect(readFileSync(markerPath(), 'utf8')).toBe(LIVE_TAKER);
});

test('a taking marker whose taker is gone is taken over, and the slot freed', () => {
  writeFileSync(markerPath(), GONE_TAKER);

  expect(StaleSlotTakeOver.staleSlotFreed(slotPath(), STALE_TEXT, takerNamed('example second taker'))).toBe(true);

  expect(existsSync(slotPath())).toBe(false);
  expect(existsSync(markerPath())).toBe(false);
});
