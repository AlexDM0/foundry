/**
 * The Run entry: written through reg.exe by absolute path under the system folder, never searched for; its command line is a `start` by the
 * login item, which detaches, and names the repository, since a Run value has no working directory; and one over the documented 260
 * characters is refused before reg.exe runs. With no absolute `SystemRoot` there is a reason, so setup writes nothing.
 */
import { expect, test } from 'bun:test';

import { FakeAutostartHost }                                     from '../testing/FakeAutostartHost.ts';
import { RUN_COMMAND_LINE_CHARACTERS_MAX, windowsAutostartOver } from './WindowsAutostart.ts';

const LABEL = 'com.example-agency.hephaestus';
const RUN_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';

test('the Run value is added through the absolute reg.exe, quoted so a path with spaces and a quote reads back whole', () => {
  const fake = FakeAutostartHost.windowsPrimitives();
  const autostart = windowsAutostartOver(fake.primitives);
  const item = FakeAutostartHost.windowsItem(LABEL, 'C:\\Users\\Alex Example\\code\\the "example" storefront\\');
  expect(autostart.write(item)).toEqual({ verdict: 'written' });
  expect(autostart.locationOf(LABEL)).toBe(`${RUN_KEY}\\${LABEL}`);
  expect(fake.commands[0]?.slice(0, 7)).toEqual(['C:\\Windows\\System32\\reg.exe', 'add', RUN_KEY, '/v', LABEL, '/t', 'REG_SZ']);
  expect(fake.registry.get(LABEL)).toBe('"C:\\Users\\Alex Example\\.bun\\bin\\bun.exe" --no-env-file "--config=C:\\Users\\Alex Example\\forge\\bunfig.toml" '
    + '"C:\\Users\\Alex Example\\forge\\agent-progress.ts" start --started-by login-item --repository "C:\\Users\\Alex Example\\code\\the \\"example\\" storefront\\\\"');
  expect(autostart.registeredRepositoryOf(LABEL)).toBe(item.repository);
});

test('a login command over 260 characters is refused and reg.exe never runs', () => {
  const fake = FakeAutostartHost.windowsPrimitives();
  const autostart = windowsAutostartOver(fake.primitives);
  const longRepository = `C:\\Users\\Alex Example\\code\\${'example-storefront-'.repeat(12)}`;
  const written = autostart.write(FakeAutostartHost.windowsItem(LABEL, longRepository));
  expect(written.verdict).toBe('refused');
  expect(written.verdict === 'refused' ? written.reason : '').toContain(`at most ${RUN_COMMAND_LINE_CHARACTERS_MAX}`);
  expect(fake.commands).toEqual([]);
  expect(fake.registry.size).toBe(0);
});

test('with no absolute SystemRoot there is a reason, and nothing reads back', () => {
  const fake = FakeAutostartHost.windowsPrimitives();
  const autostart = windowsAutostartOver({ ...fake.primitives, systemFolder: () => undefined });
  expect(autostart.unavailableReason()).toContain('SystemRoot');
  expect(autostart.registeredRepositoryOf(LABEL)).toBeNull();
  expect(fake.commands).toEqual([]);
});
