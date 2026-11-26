/**
 * The first steps every versioned stored format shares. What matters: a document of another version, or of none, is unreadable, since
 * nothing migrates before 1.0; a missing file is absent and a file that exists but is not whole is unreadable, never absent.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join }                     from 'node:path';
import {
  afterEach,
  beforeEach,
  expect,
  test,
} from 'bun:test';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { StoredJsonDocumentUtil }                         from './StoredJsonDocumentUtil.ts';

let scratchDirectory: string | null = null;

let storedFilePath = '';

beforeEach(() => {
  scratchDirectory = createScratchDirectory('stored-json-document');
  storedFilePath = join(scratchDirectory, 'example.json');
});

afterEach(() => {
  if (scratchDirectory !== null) removeScratchDirectory(scratchDirectory);
  scratchDirectory = null;
});

test('a JSON object of the current version is readable, with every key it holds', () => {
  expect(StoredJsonDocumentUtil.documentOfText('{ "version": 1, "startCommit": "abc" }', 1)).toEqual({ verdict: 'readable', document: { version: 1, startCommit: 'abc' } });
});

test('the version may sit under a key of the format\'s own', () => {
  expect(StoredJsonDocumentUtil.documentOfText('{ "crashLogVersion": 2 }', 2, 'crashLogVersion')).toEqual({ verdict: 'readable', document: { crashLogVersion: 2 } });
});

test.each([
  ['another version', '{ "version": 2 }', 'its version is not 1'],
  ['no version', '{ "startCommit": "abc" }', 'its version is not 1'],
  ['a version written as text', '{ "version": "1" }', 'its version is not 1'],
  ['a list', '[1]', 'it is not a JSON object'],
  ['null', 'null', 'it is not a JSON object'],
])('%s is unreadable', (_caseName, text, reason) => {
  expect(StoredJsonDocumentUtil.documentOfText(text, 1)).toEqual({ verdict: 'unreadable', reason });
});

test('a text that is not JSON is unreadable, the reason naming the parser message', () => {
  const reading = StoredJsonDocumentUtil.documentOfText('{ "version": 1', 1);
  expect(reading.verdict === 'unreadable' ? reading.reason : '').toStartWith('it is not valid JSON (');
});

test('a missing file is absent', () => {
  expect(StoredJsonDocumentUtil.documentAt(storedFilePath, 1)).toEqual({ verdict: 'absent' });
});

test('a stored file is read whole', () => {
  writeFileSync(storedFilePath, '{ "version": 1, "refusals": 2 }\n');
  expect(StoredJsonDocumentUtil.documentAt(storedFilePath, 1)).toEqual({ verdict: 'readable', document: { version: 1, refusals: 2 } });
});

test('a file cut short is unreadable, never absent', () => {
  writeFileSync(storedFilePath, '{ "version": 1, "ref');
  expect(StoredJsonDocumentUtil.documentAt(storedFilePath, 1).verdict).toBe('unreadable');
});

test('a folder where the file should be is unreadable, never absent', () => {
  mkdirSync(storedFilePath);
  expect(StoredJsonDocumentUtil.documentAt(storedFilePath, 1).verdict).toBe('unreadable');
});
