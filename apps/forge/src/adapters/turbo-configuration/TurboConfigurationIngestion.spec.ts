/**
 * A repository's `turbo.json` as the caching checks read it. What matters: the cache folder and each task's inputs are read from Turborepo 2's
 * `tasks` and Turborepo 1's `pipeline` alike, keys forge does not read are left alone, a missing file is absent, and a file that is not
 * JSON, or whose fields forge reads hold the wrong type, is unreadable, never thrown, so the check flags it rather than guess.
 */
import { writeFileSync } from 'node:fs';
import { join }          from 'node:path';
import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import { createScratchDirectory, removeScratchDirectory }             from '../../testing/ScratchWorkspace.ts';
import { TURBO_CONFIGURATION_FILE_NAME, TurboConfigurationIngestion } from './TurboConfigurationIngestion.ts';

let repositoryDirectory = '';

const reading = (): ReturnType<TurboConfigurationIngestion['read']> => new TurboConfigurationIngestion(join(repositoryDirectory, TURBO_CONFIGURATION_FILE_NAME)).read();

function writeTurboText(text: string): void {
  writeFileSync(join(repositoryDirectory, TURBO_CONFIGURATION_FILE_NAME), text);
}

beforeEach(() => {
  repositoryDirectory = createScratchDirectory('turbo-configuration-ingestion');
});

afterEach(() => {
  removeScratchDirectory(repositoryDirectory);
});

test('no file is absent', () => {
  expect(reading()).toEqual({ verdict: 'absent' });
});

test('the cache folder and each task\'s inputs are read, and keys forge does not read are left alone', () => {
  writeTurboText(JSON.stringify({ $schema: 'https://turborepo.com/schema.json', cacheDir: '.cache/turbo', tasks: { test: { inputs: ['src/**'] }, lint: { cache: false } } }));
  expect(reading()).toEqual({ verdict: 'readable', configuration: { cacheFolder: '.cache/turbo', tasks: [{ name: 'test', inputs: ['src/**'] }, { name: 'lint', inputs: null }] } });
});

test('Turborepo 1\'s pipeline is read as its tasks, and a file with neither has none', () => {
  writeTurboText(JSON.stringify({ pipeline: { build: {} } }));
  expect(reading()).toEqual({ verdict: 'readable', configuration: { cacheFolder: null, tasks: [{ name: 'build', inputs: null }] } });
  writeTurboText('{}');
  expect(reading()).toEqual({ verdict: 'readable', configuration: { cacheFolder: null, tasks: [] } });
});

test.each([
  ['not JSON', '{ "tasks": '],
  ['not an object', '[]'],
  ['a cacheDir that is not a string', JSON.stringify({ cacheDir: 3 })],
  ['tasks that are not an object', JSON.stringify({ tasks: [] })],
  ['a task that is not an object', JSON.stringify({ tasks: { test: 'run' } })],
  ['inputs that are not a list of strings', JSON.stringify({ tasks: { test: { inputs: ['src/**', 3] } } })],
])('%s is unreadable', (_case, text) => {
  writeTurboText(text);
  expect(reading().verdict).toBe('unreadable');
});
