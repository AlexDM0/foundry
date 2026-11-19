/**
 * The LaunchAgent stays byte for byte what setup wrote before the Autostart port: the frozen text below was taken from the previous
 * `cli/setup/LoginOverseer.ts` with the same item; retake it only in a change meant to alter the plist, from the adapter's output. Its
 * command is `start --started-by login-item`, so a login after a crash prints the start gate's refusal instead of starting the forge.
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
import { darwinAutostartOver }                                     from './DarwinAutostart.ts';

const FROZEN_PROPERTY_LIST = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
  '<plist version="1.0">',
  '<dict>',
  '  <key>Label</key>',
  '  <string>com.example-agency.overseer</string>',
  '  <key>ProgramArguments</key>',
  '  <array>',
  '    <string>/Users/alex-example/.bun/bin/bun</string>',
  '    <string>--no-env-file</string>',
  '    <string>--config=/Users/alex-example/agent-progress/bunfig.toml</string>',
  '    <string>/Users/alex-example/agent-progress/agent-progress.ts</string>',
  '    <string>start</string>',
  '    <string>--started-by</string>',
  '    <string>login-item</string>',
  '  </array>',
  '  <key>WorkingDirectory</key>',
  '  <string>/Users/alex-example/code/example &amp; storefront</string>',
  '  <key>EnvironmentVariables</key>',
  '  <dict>',
  '    <key>PATH</key>',
  '    <string>/Users/alex-example/.bun/bin:/usr/bin:/bin</string>',
  '  </dict>',
  '  <key>RunAtLoad</key>',
  '  <true/>',
  '</dict>',
  '</plist>',
  '',
].join('\n');

let scratchDirectory = '';

beforeEach(() => {
  scratchDirectory = createCanonicalScratchDirectory('darwin-autostart');
});

afterEach(() => {
  removeScratchDirectory(scratchDirectory);
});

test('the LaunchAgent bytes equal the frozen plist, and its escaped working directory reads back unescaped', () => {
  const fake = FakeAutostartHost.posixPrimitives(scratchDirectory);
  const autostart = darwinAutostartOver(fake.primitives);
  const item = FakeAutostartHost.posixItem('com.example-agency.overseer', '/Users/alex-example/code/example & storefront');
  expect(autostart.write(item)).toEqual({ verdict: 'written' });
  const location = join(scratchDirectory, 'Library', 'LaunchAgents', 'com.example-agency.overseer.plist');
  expect(autostart.locationOf(item.label)).toBe(location);
  expect(fake.primitives.readText(location)).toBe(FROZEN_PROPERTY_LIST);
  expect(autostart.registeredRepositoryOf(item.label)).toBe(item.repository);
  expect(fake.commands).toEqual([]);
});
