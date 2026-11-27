/**
 * Talos's launch registry read line by line. What matters: every line Talos's own writer appends reads back as its launch; a Talos that
 * accepted no launch has no registry, which is absent; a line that does not fit is named with its number while the other lines still count;
 * an unterminated last line that does not parse was cut short by a Talos that died appending it and is passed over unnamed, while one that
 * parses is whole and named when it does not fit; nothing throws.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join }                     from 'node:path';
import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import type { LaunchRegistryEntry }                       from '../../lib/talos/ChildLaunch.ts';
import { launchRegistryEntryLineOf }                      from '../../lib/talos/LaunchRegistry.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { LaunchRegistryIngestion }                        from './LaunchRegistryIngestion.ts';
import { LaunchRegistryProblemWording }                   from './LaunchRegistryProblemWording.ts';

const AGENT: LaunchRegistryEntry = {
  childId: 'jobs/J-1#1', childFolder: 'jobs/J-1', instance: 1, kind: 'agent'
};
const LINE: LaunchRegistryEntry = {
  childId: 'steps/S-2#3', childFolder: 'steps/S-2', instance: 3, kind: 'line'
};

let scratchDirectory = '';

const registryPath = (): string => join(scratchDirectory, 'launches-1.ndjson');

const reading = (): ReturnType<LaunchRegistryIngestion['read']> => new LaunchRegistryIngestion(registryPath()).read();

beforeEach(() => {
  scratchDirectory = createScratchDirectory('launch-registry-ingestion');
});

afterEach(() => {
  removeScratchDirectory(scratchDirectory);
});

test('every line Talos appends reads back as its launch', () => {
  writeFileSync(registryPath(), `${launchRegistryEntryLineOf(AGENT)}${launchRegistryEntryLineOf(LINE)}`);

  expect(reading()).toEqual({ verdict: 'readable', entries: [AGENT, LINE], unreadableLines: [] });
});

test('a Talos that accepted no launch has no registry, which is absent', () => {
  expect(reading()).toEqual({ verdict: 'absent' });
});

test('a registry that cannot be read at all is unreadable', () => {
  mkdirSync(registryPath());

  expect(reading().verdict).toBe('unreadable');
});

test('an unterminated last line that does not parse is passed over unnamed, and one that parses still counts', () => {
  writeFileSync(registryPath(), `${launchRegistryEntryLineOf(AGENT)}{"childId":"steps/S-2#3","chi`);
  expect(reading()).toEqual({ verdict: 'readable', entries: [AGENT], unreadableLines: [] });

  writeFileSync(registryPath(), `${launchRegistryEntryLineOf(AGENT)}${JSON.stringify(LINE)}`);
  expect(reading()).toEqual({ verdict: 'readable', entries: [AGENT, LINE], unreadableLines: [] });
});

test('an unterminated last line that parses but does not fit is whole, not cut short, so it is named', () => {
  writeFileSync(registryPath(), `${launchRegistryEntryLineOf(AGENT)}${JSON.stringify({ ...LINE, kind: 'example-kind' })}`);
  expect(reading()).toEqual({ verdict: 'readable', entries: [AGENT], unreadableLines: [{ lineNumber: 2, problem: { code: 'registry-line-field-malformed', field: 'kind' } }] });
});

test.each([
  ['not JSON', 'not a launch', 'it is not valid JSON'],
  ['a list', '[]', 'it is not a JSON object'],
  ['no child id', JSON.stringify({ ...AGENT, childId: undefined }), 'childId is not a string'],
  ['no child folder', JSON.stringify({ ...AGENT, childFolder: 7 }), 'childFolder is not a string'],
  ['an instance that is no whole number', JSON.stringify({ ...AGENT, instance: '1' }), 'instance is not a whole number'],
  ['an unknown kind', JSON.stringify({ ...AGENT, kind: 'example-kind' }), 'kind is neither agent nor line'],
])('a terminated line of %s is named by its number, and the lines around it still count', (_case, line, reason) => {
  writeFileSync(registryPath(), `${launchRegistryEntryLineOf(AGENT)}${line}\n${launchRegistryEntryLineOf(LINE)}`);

  const read = reading();

  expect(read).toMatchObject({ verdict: 'readable', entries: [AGENT, LINE] });
  const wordedLines = read.verdict === 'readable'
    ? read.unreadableLines.map(({ lineNumber, problem }) => ({ lineNumber, reason: LaunchRegistryProblemWording.lineSentenceOf(problem) }))
    : [];
  expect(wordedLines).toEqual([{ lineNumber: 2, reason: expect.stringContaining(reason) as unknown as string }]);
});
