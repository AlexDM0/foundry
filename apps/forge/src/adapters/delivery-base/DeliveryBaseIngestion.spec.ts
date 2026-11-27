/**
 * A document agent's launch note both ways. What matters: what the writer stores reads back as the same delivery base; no file is absent,
 * the case before the launch was noted; and the note of before the version, another version and a wrong delivery base are unreadable, never
 * a throw, since a wrong base would hand the agent another job's messages or none.
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
import { DeliveryBaseIngestion }                          from './DeliveryBaseIngestion.ts';
import { DeliveryBaseProblemWording }                     from './DeliveryBaseProblemWording.ts';
import { createDeliveryBaseWriter }                       from './DeliveryBaseWriter.ts';

let scratchDirectory = '';

const launchFilePath = (): string => join(scratchDirectory, 'document-agent-launch.json');

const reading = (): ReturnType<DeliveryBaseIngestion['read']> => new DeliveryBaseIngestion(launchFilePath()).read();

beforeEach(() => {
  scratchDirectory = createScratchDirectory('delivery-base-ingestion');
});

afterEach(() => {
  removeScratchDirectory(scratchDirectory);
});

test('no file is absent', () => {
  expect(reading()).toEqual({ verdict: 'absent' });
});

test.each([0, 7])('a delivery base of %d the writer stores reads back the same, under version 1', (deliveryBase) => {
  createDeliveryBaseWriter(launchFilePath()).write(deliveryBase);

  expect(reading()).toEqual({ verdict: 'readable', deliveryBase });
  expect(JSON.parse(readFileSync(launchFilePath(), 'utf8'))).toEqual({ version: 1, deliveryBase });
});

test.each([
  ['not JSON', '{', 'it is not valid JSON'],
  ['the note of before the version', '{"deliveryBase":3}', 'its version is not 1'],
  ['another version', '{"version":2,"deliveryBase":3}', 'its version is not 1'],
  ['no delivery base', '{"version":1}', 'its deliveryBase is not a whole number of at least 0'],
  ['a negative delivery base', '{"version":1,"deliveryBase":-1}', 'its deliveryBase is not a whole number of at least 0'],
  ['a fractional delivery base', '{"version":1,"deliveryBase":1.5}', 'its deliveryBase is not a whole number of at least 0'],
])('%s is unreadable, never a throw', (_case, storedText, reason) => {
  writeFileSync(launchFilePath(), storedText);

  const launchReading = reading();

  expect(launchReading.verdict).toBe('unreadable');
  expect(launchReading.verdict === 'unreadable' ? DeliveryBaseProblemWording.sentenceOf(launchReading.problem) : '').toContain(reason);
});
