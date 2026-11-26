/**
 * A job's recorded launch pair both ways. What matters: what the writer stores reads back as the same pair, a model or effort outside
 * today's vocabularies included, since whether a later forge still offers it is the caller's question; a missing file is absent, a job
 * before its first launch; and a file that is not JSON, of another version or none, or with a model or effort that is not text is
 * unreadable, never a session resolved afresh, and never a throw.
 */
import { writeFileSync } from 'node:fs';
import { join }          from 'node:path';
import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import { createScratchDirectory, removeScratchDirectory }                                       from '../../testing/ScratchWorkspace.ts';
import { LAUNCH_SETTINGS_FORMAT_VERSION, LaunchSettingsIngestion, type RecordedLaunchSettings } from './LaunchSettingsIngestion.ts';
import { createLaunchSettingsWriter }                                                           from './LaunchSettingsWriter.ts';

let scratchDirectory = '';

const settingsFilePath = (): string => join(scratchDirectory, 'launch-settings.json');

const reading = (): ReturnType<LaunchSettingsIngestion['read']> => new LaunchSettingsIngestion(settingsFilePath()).read();

const SETTINGS: RecordedLaunchSettings = { model: 'fable', effort: 'xhigh' };

beforeEach(() => {
  scratchDirectory = createScratchDirectory('launch-settings-ingestion');
});

afterEach(() => {
  removeScratchDirectory(scratchDirectory);
});

test('no file is absent', () => {
  expect(reading()).toEqual({ verdict: 'absent' });
});

test.each<[string, RecordedLaunchSettings]>([
  ['a pair forge offers', SETTINGS],
  ['a model a later forge retired', { model: 'retired-model', effort: 'low' }],
])('what the writer stores of %s reads back as the same pair', (_pair, settings) => {
  createLaunchSettingsWriter(settingsFilePath()).write(settings);
  expect(reading()).toEqual({ verdict: 'readable', settings });
});

test('a file that is not JSON is unreadable', () => {
  writeFileSync(settingsFilePath(), '{"model": ');
  expect(reading()).toMatchObject({ verdict: 'unreadable' });
});

test('a pair of another version, or of none, is unreadable', () => {
  writeFileSync(settingsFilePath(), `${JSON.stringify({ ...SETTINGS, version: LAUNCH_SETTINGS_FORMAT_VERSION + 1 })}\n`);
  expect(reading()).toEqual({ verdict: 'unreadable', reason: `its version is not ${LAUNCH_SETTINGS_FORMAT_VERSION}` });
  writeFileSync(settingsFilePath(), `${JSON.stringify(SETTINGS)}\n`);
  expect(reading()).toEqual({ verdict: 'unreadable', reason: `its version is not ${LAUNCH_SETTINGS_FORMAT_VERSION}` });
});

test.each([
  ['model', { model: null }, 'its "model" is not text'],
  ['effort', { effort: 3 }, 'its "effort" is not text'],
])('a wrong %s is unreadable', (_field, change, reason) => {
  writeFileSync(settingsFilePath(), `${JSON.stringify({ version: LAUNCH_SETTINGS_FORMAT_VERSION, ...SETTINGS, ...change })}\n`);
  expect(reading()).toEqual({ verdict: 'unreadable', reason });
});

test('a folder where the file belongs is unreadable, not absent, and does not throw', () => {
  const ingestion = new LaunchSettingsIngestion(scratchDirectory);
  expect(() => ingestion.read()).not.toThrow();
  expect(ingestion.read()).toMatchObject({ verdict: 'unreadable' });
});
