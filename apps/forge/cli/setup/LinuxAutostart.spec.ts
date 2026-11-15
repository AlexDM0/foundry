/**
 * The systemd user unit: it runs the Overseer in the foreground under `Type=simple`, since `--detach`'s launcher exits at once, and with
 * `KillMode=process`, since the default kills the whole control group and with it every Watcher on a stop or restart. A host with no
 * systemctl or no user service manager gets nothing written, and a failed enable is reported, never a success.
 */
import { join } from 'node:path';
import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import { createCanonicalScratchDirectory, removeScratchDirectory } from '../../src/testing/ScratchWorkspace.ts';
import { FakeAutostartHost }                                       from '../testing/FakeAutostartHost.ts';
import { linuxAutostartOver }                                      from './LinuxAutostart.ts';

let scratchDirectory = '';

beforeEach(() => {
  scratchDirectory = createCanonicalScratchDirectory('linux-autostart');
});

afterEach(() => {
  removeScratchDirectory(scratchDirectory);
});

const LABEL = 'com.example-agency.overseer';

test('the unit runs oversee in the foreground under Type=simple and KillMode=process, then systemctl --user reloads and enables it', () => {
  const fake = FakeAutostartHost.posixPrimitives(scratchDirectory);
  const autostart = linuxAutostartOver(fake.primitives);
  const item = FakeAutostartHost.posixItem(LABEL, '/home/alex-example/code/100% storefront');
  expect(autostart.write(item)).toEqual({ verdict: 'written' });
  const unitPath = join(scratchDirectory, '.config', 'systemd', 'user', `${LABEL}.service`);
  expect(autostart.locationOf(LABEL)).toBe(unitPath);
  const unitText = fake.primitives.readText(unitPath) ?? '';
  const unitLines = unitText.split('\n');
  expect(unitLines).toContain('Type=simple');
  expect(unitLines).toContain('KillMode=process');
  expect(unitLines).toContain('Restart=on-failure');
  expect(unitLines).toContain('WorkingDirectory=/home/alex-example/code/100%% storefront');
  expect(unitLines).toContain('Environment="PATH=/Users/alex-example/.bun/bin:/usr/bin:/bin"');
  expect(unitLines).toContain('ExecStart="/Users/alex-example/.bun/bin/bun" "--no-env-file" "--config=/Users/alex-example/agent-progress/bunfig.toml" '
    + '"/Users/alex-example/agent-progress/agent-progress.ts" "oversee"');
  expect(unitText).not.toContain('--detach');
  expect(autostart.registeredRepositoryOf(LABEL)).toBe(item.repository);
  expect(fake.commands).toEqual([
    ['/usr/bin/systemctl', '--user', 'daemon-reload'],
    ['/usr/bin/systemctl', '--user', 'enable', `${LABEL}.service`],
  ]);
});

test('a host with no systemctl, or whose systemctl reaches no user manager, has a reason and the probe writes nothing', () => {
  const missing = linuxAutostartOver(FakeAutostartHost.posixPrimitives(scratchDirectory, { systemctlPath: null }).primitives);
  expect(missing.unavailableReason()).toContain('no systemctl is on PATH');
  const noBus = { answerOf: () => ({ exitCode: 1, output: 'Failed to connect to bus: No medium found' }) };
  const noUserManager = linuxAutostartOver(FakeAutostartHost.posixPrimitives(scratchDirectory, noBus).primitives);
  expect(noUserManager.unavailableReason()).toContain('Failed to connect to bus');
  expect(missing.registeredRepositoryOf(LABEL)).toBeNull();
});

test('a failed enable is refused with systemctl\'s words, never reported as written', () => {
  const enableFails = (command: readonly string[]) => (command.includes('enable') ? { exitCode: 1, output: 'Failed to enable unit' } : { exitCode: 0, output: '' });
  const fake = FakeAutostartHost.posixPrimitives(scratchDirectory, { answerOf: enableFails });
  const written = linuxAutostartOver(fake.primitives).write(FakeAutostartHost.posixItem(LABEL, '/home/alex-example/code/example-storefront'));
  expect(written.verdict).toBe('refused');
  expect(written.verdict === 'refused' ? written.reason : '').toContain('Failed to enable unit');
});
