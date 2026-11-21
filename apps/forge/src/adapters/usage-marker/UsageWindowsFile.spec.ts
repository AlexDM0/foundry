/**
 * The machine-wide usage windows both ways. What matters: recorded observations read back, into a monitor folder that does not exist yet;
 * a later observation replaces its window's values in place and keeps every key the program does not know, in order, so a file written
 * by another version round-trips byte for byte; an observation that changes nothing writes nothing; and a file any Hephaestus could misread
 * is `malformed`, never a throw, so a hand-edited file cannot take Hephaestus down.
 */
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync
} from 'node:fs';
import { join } from 'node:path';
import {
  afterEach,
  beforeEach,
  expect,
  test,
} from 'bun:test';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { type UsageWindowObservation, UsageWindowsFile }  from './UsageWindowsFile.ts';

const FIVE_HOUR: UsageWindowObservation = {
  window: 'five_hour', lengthHours: 5, utilization: 0.19, resetsAt: '2026-11-01T22:00:34.000Z'
};
const SEVEN_DAY: UsageWindowObservation = {
  window: 'seven_day', lengthHours: 168, utilization: 0.46, resetsAt: '2026-11-04T09:00:00.000Z'
};

let scratchDirectory = '';

const monitorFolder = (): string => join(scratchDirectory, 'monitor');
const storedText = (): string => readFileSync(UsageWindowsFile.pathIn(monitorFolder()), 'utf8');

beforeEach(() => {
  scratchDirectory = createScratchDirectory('usage-windows');
});

afterEach(() => {
  removeScratchDirectory(scratchDirectory);
});

test('a window of unknown length reads back with a null length', () => {
  const unknownWindow: UsageWindowObservation = {
    window: 'example_window', lengthHours: null, utilization: 0.3, resetsAt: '2026-11-02T09:00:00.000Z'
  };
  UsageWindowsFile.record(monitorFolder(), [unknownWindow]);
  expect(UsageWindowsFile.read(monitorFolder())).toMatchObject({ verdict: 'read', windows: [unknownWindow] });
});

test('no file reads as absent, and recording no observation writes none', () => {
  UsageWindowsFile.record(monitorFolder(), []);
  expect(UsageWindowsFile.read(monitorFolder())).toEqual({ verdict: 'absent' });
});

test('recorded windows read back in the order first seen, the monitor folder created, and leave no temporary file behind', () => {
  UsageWindowsFile.record(monitorFolder(), [FIVE_HOUR, SEVEN_DAY]);
  expect(UsageWindowsFile.read(monitorFolder())).toMatchObject({ verdict: 'read', windows: [FIVE_HOUR, SEVEN_DAY] });
  expect(readdirSync(monitorFolder())).toEqual(['usage-windows.json']);
});

test('the later observation of a window replaces its values in place, and every unknown key stays in order', () => {
  writeFileSync(UsageWindowsFile.pathIn(createdMonitorFolder()), `${JSON.stringify({
    note:    'kept',
    windows: {
      five_hour: {
        lengthHours: 5, utilization: 0.19, plan: 'example', resetsAt: '2026-11-01T22:00:34.000Z'
      },
      seven_day: { lengthHours: 168, utilization: 0.46, resetsAt: '2026-11-04T09:00:00.000Z' },
    },
    later: 1,
  }, null, 2)}\n`);
  UsageWindowsFile.record(monitorFolder(), [{
    window: 'five_hour', lengthHours: 5, utilization: 0.2, resetsAt: '2026-11-01T22:00:34.000Z'
  }, { ...FIVE_HOUR, utilization: 0.25 }]);
  expect(storedText()).toBe(`${JSON.stringify({
    note:    'kept',
    windows: {
      five_hour: {
        lengthHours: 5, utilization: 0.25, plan: 'example', resetsAt: '2026-11-01T22:00:34.000Z'
      },
      seven_day: { lengthHours: 168, utilization: 0.46, resetsAt: '2026-11-04T09:00:00.000Z' },
    },
    later: 1,
  }, null, 2)}\n`);
});

test('an observation that changes no value leaves the file byte-identical and unwritten', () => {
  UsageWindowsFile.record(monitorFolder(), [FIVE_HOUR, SEVEN_DAY]);
  const textBefore = storedText();
  const modifiedBefore = statSync(UsageWindowsFile.pathIn(monitorFolder())).mtimeMs;
  UsageWindowsFile.record(monitorFolder(), [SEVEN_DAY]);
  expect(storedText()).toBe(textBefore);
  expect(statSync(UsageWindowsFile.pathIn(monitorFolder())).mtimeMs).toBe(modifiedBefore);
});

test.each([
  ['not JSON', '{'],
  ['a list', '[]'],
  ['no windows object', JSON.stringify({ windows: [] })],
  ['a window that is no object', JSON.stringify({ windows: { five_hour: 1 } })],
  ['no number or null lengthHours', JSON.stringify({ windows: { five_hour: { utilization: 0.19, resetsAt: FIVE_HOUR.resetsAt } } })],
  ['no number utilization', JSON.stringify({ windows: { five_hour: { lengthHours: 5, utilization: '19%', resetsAt: FIVE_HOUR.resetsAt } } })],
  ['no stamp', JSON.stringify({ windows: { five_hour: { lengthHours: 5, utilization: 0.19, resetsAt: 'soon' } } })],
  ['a window with no name', JSON.stringify({ windows: { '': { lengthHours: 5, utilization: 0.19, resetsAt: FIVE_HOUR.resetsAt } } })],
])('a file with %s is malformed, never a throw, and the next observation replaces it', (_case, malformedText) => {
  writeFileSync(UsageWindowsFile.pathIn(createdMonitorFolder()), malformedText);
  expect(UsageWindowsFile.read(monitorFolder()).verdict).toBe('malformed');
  UsageWindowsFile.record(monitorFolder(), [FIVE_HOUR]);
  expect(UsageWindowsFile.read(monitorFolder())).toMatchObject({ verdict: 'read', windows: [FIVE_HOUR] });
});

function createdMonitorFolder(): string {
  mkdirSync(monitorFolder(), { recursive: true });
  return monitorFolder();
}
