/**
 * The settings writer with the ingestion under a scratch home: a round trip keeps every key, the stored form is exactly version 1's keys,
 * Gaia's folder is made owner-only, and a file of a newer version is kept untouched.
 */
import {
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname } from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test
} from 'bun:test';

import type { GaiaSettings }                         from '../../shared/@types/GaiaSettings.ts';
import { createScratchDirectory, removeScratchPath } from '../../testing/ScratchRoot.ts';
import { SettingsFile, settingsFilePathIn }          from './SettingsFile.ts';
import { createSettingsWriter }                      from './SettingsWriter.ts';
import { GAIA_SETTINGS_DEFAULTS }                    from './constants/GaiaSettingsDefaults.ts';

const PERMISSION_BITS = 0o777;
const OWNER_ONLY_FOLDER_MODE = 0o700;

/** Every key differs from its default, so a key the round trip dropped would come back as the default and show. */
const EVERY_KEY_CHANGED: GaiaSettings = {
  theme:            'dark',
  hiddenTrackerIds: ['example-tracker-one', 'example-tracker-two'],
  forgeProgramPath: '/Users/alex-example/development/forge/bin/forge',
  notifications:    {
    enabled: false,
    kinds:   {
      'escalated-questions':        false,
      'questions':                  false,
      'reviews-and-merge-accepts':  false,
      'forges-held-or-unreachable': false,
      'quiet-agents':               false,
      'machine-at-agent-limit':     true,
      'draft-tickets':              true,
    },
  },
  startForgesAtLogin: true,
};

let homeDirectory = '';

beforeEach(() => {
  homeDirectory = createScratchDirectory('settings-writer');
});

afterEach(() => {
  removeScratchPath(homeDirectory);
});

function storedJson(): unknown {
  return JSON.parse(readFileSync(settingsFilePathIn(homeDirectory), 'utf8'));
}

describe('a settings round trip', () => {
  test('keeps every key: what is written reads back equal', async () => {
    expect(EVERY_KEY_CHANGED).not.toEqual(GAIA_SETTINGS_DEFAULTS);
    expect(await createSettingsWriter(homeDirectory).write(EVERY_KEY_CHANGED)).toEqual({ verdict: 'written' });
    expect(await new SettingsFile(homeDirectory).read()).toEqual({ verdict: 'readable', settings: EVERY_KEY_CHANGED });
  });

  test('keeps every key of a stored file: read, written again and stored the same', async () => {
    await createSettingsWriter(homeDirectory).write(EVERY_KEY_CHANGED);
    const storedBefore = storedJson();
    const reading      = await new SettingsFile(homeDirectory).read();
    expect(await createSettingsWriter(homeDirectory).write(reading.settings)).toEqual({ verdict: 'written' });
    expect(storedJson()).toEqual(storedBefore);
  });

  test('stores exactly the keys of version 1, with the version', async () => {
    await createSettingsWriter(homeDirectory).write(EVERY_KEY_CHANGED);
    expect(storedJson()).toEqual({ version: 1, ...EVERY_KEY_CHANGED });
  });
});

describe('a settings write', () => {
  test('makes Gaia\'s folder owner-only when it makes it', async () => {
    await createSettingsWriter(homeDirectory).write(GAIA_SETTINGS_DEFAULTS);
    expect(statSync(dirname(settingsFilePathIn(homeDirectory))).mode & PERMISSION_BITS).toBe(OWNER_ONLY_FOLDER_MODE);
  });

  test('replaces an unreadable file with the settings it is given', async () => {
    mkdirSync(dirname(settingsFilePathIn(homeDirectory)), { recursive: true });
    writeFileSync(settingsFilePathIn(homeDirectory), 'not json');
    expect(await createSettingsWriter(homeDirectory).write(EVERY_KEY_CHANGED)).toEqual({ verdict: 'written' });
    expect(await new SettingsFile(homeDirectory).read()).toEqual({ verdict: 'readable', settings: EVERY_KEY_CHANGED });
  });

  test('keeps a file of a newer version byte for byte and says so', async () => {
    const newerText = JSON.stringify({ version: 2, theme: 'midnight' });
    mkdirSync(dirname(settingsFilePathIn(homeDirectory)), { recursive: true });
    writeFileSync(settingsFilePathIn(homeDirectory), newerText);
    expect(await createSettingsWriter(homeDirectory).write(EVERY_KEY_CHANGED)).toEqual({ verdict: 'kept-newer-version', storedVersion: 2 });
    expect(readFileSync(settingsFilePathIn(homeDirectory), 'utf8')).toBe(newerText);
  });

  test('that cannot make Gaia\'s folder is unwritable with the system\'s reason', async () => {
    writeFileSync(dirname(settingsFilePathIn(homeDirectory)), 'a file where the folder belongs');
    const verdict = await createSettingsWriter(homeDirectory).write(GAIA_SETTINGS_DEFAULTS);
    expect(verdict.verdict).toBe('unwritable');
  });
});
