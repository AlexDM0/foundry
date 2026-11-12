/**
 * The settings ingestion under a scratch home: an absent file runs on the defaults, a readable one gives its own settings, a newer one is
 * named with its version and left alone, and anything else is unreadable with the defaults, never a throw.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
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

import { createScratchDirectory, removeScratchPath } from '../../testing/ScratchRoot.ts';
import type { StoredSettingsVersion1 }               from './@types/StoredSettings.ts';
import { SettingsFile, settingsFilePathIn }          from './SettingsFile.ts';
import { GAIA_SETTINGS_DEFAULTS }                    from './constants/GaiaSettingsDefaults.ts';

let homeDirectory = '';

beforeEach(() => {
  homeDirectory = createScratchDirectory('settings-file');
});

afterEach(() => {
  removeScratchPath(homeDirectory);
});

function storeSettingsText(contents: string): void {
  mkdirSync(dirname(settingsFilePathIn(homeDirectory)), { recursive: true });
  writeFileSync(settingsFilePathIn(homeDirectory), contents);
}

const STORED_EXAMPLE: StoredSettingsVersion1 = {
  version:          1,
  theme:            'light',
  hiddenTrackerIds: ['example-tracker'],
  forgeProgramPath: null,
  notifications:    {
    enabled: true,
    kinds:   {
      'escalated-questions':        true,
      'questions':                  false,
      'reviews-and-merge-accepts':  true,
      'forges-held-or-unreachable': false,
      'quiet-agents':               true,
      'machine-at-agent-limit':     false,
      'draft-tickets':              true,
    },
  },
  startForgesAtLogin: true,
};

describe('a settings file', () => {
  test('lives in the home folder at .gaia/settings.json', () => {
    expect(settingsFilePathIn('/Users/alex-example')).toBe('/Users/alex-example/.gaia/settings.json');
  });

  test('that is absent reads as the defaults and is not created', async () => {
    expect(await new SettingsFile(homeDirectory).read()).toEqual({ verdict: 'absent', settings: GAIA_SETTINGS_DEFAULTS });
    expect(existsSync(settingsFilePathIn(homeDirectory))).toBe(false);
  });

  test('at version 1 reads as its own settings, without the version key', async () => {
    storeSettingsText(JSON.stringify(STORED_EXAMPLE));
    const { version: _version, ...settings } = STORED_EXAMPLE;
    expect(await new SettingsFile(homeDirectory).read()).toEqual({ verdict: 'readable', settings });
  });

  test('at a newer version names that version, runs on the defaults and keeps the file byte for byte', async () => {
    const newerText = JSON.stringify({ version: 2, theme: 'midnight', somethingNew: true });
    storeSettingsText(newerText);
    expect(await new SettingsFile(homeDirectory).read()).toEqual({ verdict: 'newer-version', storedVersion: 2, settings: GAIA_SETTINGS_DEFAULTS });
    expect(readFileSync(settingsFilePathIn(homeDirectory), 'utf8')).toBe(newerText);
  });

  test('that is not JSON is unreadable and runs on the defaults', async () => {
    storeSettingsText('{"version": 1, "theme": ');
    const reading = await new SettingsFile(homeDirectory).read();
    expect(reading).toMatchObject({ verdict: 'unreadable', reason: 'not-json', settings: GAIA_SETTINGS_DEFAULTS });
  });

  test('with no version, a textual one or one below 1 is unreadable as an unknown version', async () => {
    for (const storedVersion of [undefined, '1', 0]) {
      storeSettingsText(JSON.stringify({ ...STORED_EXAMPLE, version: storedVersion }));
      expect(await new SettingsFile(homeDirectory).read()).toMatchObject({ verdict: 'unreadable', reason: 'version-unknown', settings: GAIA_SETTINGS_DEFAULTS });
    }
  });

  test('at version 1 with a mistyped key is unreadable as an invalid shape', async () => {
    storeSettingsText(JSON.stringify({ ...STORED_EXAMPLE, theme: 'sepia' }));
    expect(await new SettingsFile(homeDirectory).read()).toMatchObject({ verdict: 'unreadable', reason: 'shape-invalid', settings: GAIA_SETTINGS_DEFAULTS });
  });

  test('whose path is a folder is unreadable with the system\'s reason', async () => {
    mkdirSync(settingsFilePathIn(homeDirectory), { recursive: true });
    expect(await new SettingsFile(homeDirectory).read()).toEqual({
      verdict:  'unreadable',
      reason:   'file-unreadable',
      failure:  'EISDIR',
      settings: GAIA_SETTINGS_DEFAULTS,
    });
  });
});
