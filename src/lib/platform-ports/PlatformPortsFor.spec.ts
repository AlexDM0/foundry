/** The composition root: a frozen record for every platform, the one with no adapter included, so a process starts whatever it runs on. */
import { expect, test } from 'bun:test';

import { platformPortsFor } from './PlatformPortsFor.ts';

const HOST_FACTS = { userShell: () => undefined, monitorFolderName: '.example-monitor', pipeNamePrefix: 'example-product' };

test('the record is frozen and carries both ports', () => {
  const ports = platformPortsFor('darwin', HOST_FACTS);
  expect(Object.isFrozen(ports)).toBe(true);
  expect(Object.isFrozen(ports.processSupervision)).toBe(true);
  expect(Object.isFrozen(ports.localEndpoint)).toBe(true);
});

test('a platform with no adapter still gets a record, whose ports refuse', () => {
  const ports = platformPortsFor('example-platform', HOST_FACTS);
  expect(ports.processSupervision.identityOf(process.pid)).toBeNull();
  expect(ports.localEndpoint.prepareEndpoint('/any').verdict).toBe('refused');
});
