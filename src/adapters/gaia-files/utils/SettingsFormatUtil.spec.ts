/**
 * The pure steps of the settings format: a version is a whole number or nothing, version 1 is accepted only whole and typed, a forge
 * program path only absolute, and the mapping in and back out keeps every key, so a stored file and the model never drift apart.
 */
import { describe, expect, test } from 'bun:test';

import { GAIA_SETTINGS_DEFAULTS }      from '../../../shared/constants/GaiaSettingsDefaults.ts';
import { SETTINGS_CHOICES }            from '../../../shared/constants/SettingsChoices.ts';
import type { StoredSettingsVersion1 } from '../@types/StoredSettings.ts';
import { SettingsFormatUtil }          from './SettingsFormatUtil.ts';

const STORED_EXAMPLE: StoredSettingsVersion1 = {
  version:          1,
  theme:            'dark',
  hiddenTrackerIds: ['example-tracker-one', 'example-tracker-two'],
  forgeProgramPath: '/Users/alex-example/development/forge/bin/forge',
  notifications:    {
    enabled: false,
    kinds:   {
      'escalated-questions':        false,
      'questions':                  true,
      'reviews-and-merge-accepts':  false,
      'forges-held-or-unreachable': true,
      'quiet-agents':               false,
      'machine-at-agent-limit':     true,
      'draft-tickets':              true,
    },
  },
  startForgesAtLogin: true,
};

function exampleWith(key: string, value: unknown): Record<string, unknown> {
  return { ...STORED_EXAMPLE, [key]: value };
}

function exampleWithout(key: string): Record<string, unknown> {
  return Object.fromEntries(Object.entries(STORED_EXAMPLE).filter(([entryKey]) => entryKey !== key));
}

describe('the notification kinds', () => {
  test('list exactly the kinds the defaults name, once each', () => {
    const listedKinds: string[] = [...SETTINGS_CHOICES.notificationKinds].sort();
    expect(listedKinds).toEqual(Object.keys(GAIA_SETTINGS_DEFAULTS.notifications.kinds).sort());
    expect(new Set(SETTINGS_CHOICES.notificationKinds).size).toBe(SETTINGS_CHOICES.notificationKinds.length);
  });

  test('are on by default except the machine at its limit and draft tickets', () => {
    const offByDefault = SETTINGS_CHOICES.notificationKinds.filter((kind) => !GAIA_SETTINGS_DEFAULTS.notifications.kinds[kind]);
    expect(offByDefault).toEqual(['machine-at-agent-limit', 'draft-tickets']);
  });
});

describe('versionOf', () => {
  test('answers a whole-number version key', () => {
    expect(SettingsFormatUtil.versionOf({ version: 1 })).toBe(1);
    expect(SettingsFormatUtil.versionOf({ version: 7 })).toBe(7);
  });

  test('answers null for a missing, textual, fractional or non-object version', () => {
    expect(SettingsFormatUtil.versionOf({})).toBeNull();
    expect(SettingsFormatUtil.versionOf({ version: '1' })).toBeNull();
    expect(SettingsFormatUtil.versionOf({ version: 1.5 })).toBeNull();
    expect(SettingsFormatUtil.versionOf([1])).toBeNull();
    expect(SettingsFormatUtil.versionOf(null)).toBeNull();
  });

  test('reads only an own version key, never one inherited from the prototype', () => {
    expect(SettingsFormatUtil.versionOf(Object.create({ version: 1 }))).toBeNull();
  });
});

describe('storedSettingsOf', () => {
  test('accepts a whole version 1 file as it is', () => {
    expect(SettingsFormatUtil.storedSettingsOf(STORED_EXAMPLE)).toEqual(STORED_EXAMPLE);
  });

  test('leaves out keys the format does not name', () => {
    expect(SettingsFormatUtil.storedSettingsOf(exampleWith('futureKey', 'kept nowhere'))).toEqual(STORED_EXAMPLE);
  });

  test('refuses another version', () => {
    expect(SettingsFormatUtil.storedSettingsOf(exampleWith('version', 2))).toBeNull();
    expect(SettingsFormatUtil.storedSettingsOf(exampleWithout('version'))).toBeNull();
  });

  test('refuses a file that misses any key of version 1', () => {
    for (const key of Object.keys(STORED_EXAMPLE).filter((storedKey) => storedKey !== 'version')) {
      expect(SettingsFormatUtil.storedSettingsOf(exampleWithout(key))).toBeNull();
    }
  });

  test('refuses a theme outside auto, light and dark', () => {
    expect(SettingsFormatUtil.storedSettingsOf(exampleWith('theme', 'sepia'))).toBeNull();
  });

  test('refuses hidden tracker ids that are not all text', () => {
    expect(SettingsFormatUtil.storedSettingsOf(exampleWith('hiddenTrackerIds', ['example-tracker', 3]))).toBeNull();
    expect(SettingsFormatUtil.storedSettingsOf(exampleWith('hiddenTrackerIds', 'example-tracker'))).toBeNull();
  });

  test('accepts a null forge program path and refuses one that is neither text nor null', () => {
    expect(SettingsFormatUtil.storedSettingsOf(exampleWith('forgeProgramPath', null))?.forgeProgramPath).toBeNull();
    expect(SettingsFormatUtil.storedSettingsOf(exampleWith('forgeProgramPath', 42))).toBeNull();
  });

  test('refuses an empty or relative forge program path, as the command that sets it does', () => {
    expect(SettingsFormatUtil.storedSettingsOf(exampleWith('forgeProgramPath', ''))).toBeNull();
    expect(SettingsFormatUtil.storedSettingsOf(exampleWith('forgeProgramPath', 'bin/forge'))).toBeNull();
  });

  test('refuses a start-at-login choice that is not a boolean', () => {
    expect(SettingsFormatUtil.storedSettingsOf(exampleWith('startForgesAtLogin', 'yes'))).toBeNull();
  });

  test('refuses notifications without a boolean enabled', () => {
    expect(SettingsFormatUtil.storedSettingsOf(exampleWith('notifications', { ...STORED_EXAMPLE.notifications, enabled: 1 }))).toBeNull();
    expect(SettingsFormatUtil.storedSettingsOf(exampleWith('notifications', null))).toBeNull();
  });

  test('refuses notification kinds that miss a kind or hold a non-boolean', () => {
    for (const kind of SETTINGS_CHOICES.notificationKinds) {
      const kindsWithoutOne = Object.fromEntries(Object.entries(STORED_EXAMPLE.notifications.kinds).filter(([storedKind]) => storedKind !== kind));
      expect(SettingsFormatUtil.storedSettingsOf(exampleWith('notifications', { enabled: true, kinds: kindsWithoutOne }))).toBeNull();
      const kindsWithText = { ...STORED_EXAMPLE.notifications.kinds, [kind]: 'on' };
      expect(SettingsFormatUtil.storedSettingsOf(exampleWith('notifications', { enabled: true, kinds: kindsWithText }))).toBeNull();
    }
  });

  test('reads only own keys, never ones inherited from the prototype', () => {
    const inheritedTheme = Object.assign(Object.create({ theme: 'dark' }) as Record<string, unknown>, exampleWithout('theme'));
    expect(SettingsFormatUtil.storedSettingsOf(inheritedTheme)).toBeNull();
  });
});

describe('settingsOf and storedFormOf', () => {
  test('map a stored file in and back out unchanged, key for key', () => {
    expect(SettingsFormatUtil.storedFormOf(SettingsFormatUtil.settingsOf(STORED_EXAMPLE))).toEqual(STORED_EXAMPLE);
  });

  test('map the model out and back in unchanged', () => {
    expect(SettingsFormatUtil.settingsOf(SettingsFormatUtil.storedFormOf(GAIA_SETTINGS_DEFAULTS))).toEqual(GAIA_SETTINGS_DEFAULTS);
  });

  test('stamp the stored form with version 1 first', () => {
    expect(Object.keys(SettingsFormatUtil.storedFormOf(GAIA_SETTINGS_DEFAULTS))[0]).toBe('version');
    expect(SettingsFormatUtil.storedFormOf(GAIA_SETTINGS_DEFAULTS).version).toBe(1);
  });

  test('hand out lists and records of their own, so a change to one never reaches the other', () => {
    const settings = SettingsFormatUtil.settingsOf(STORED_EXAMPLE);
    expect(settings.hiddenTrackerIds).not.toBe(STORED_EXAMPLE.hiddenTrackerIds);
    expect(settings.notifications.kinds).not.toBe(STORED_EXAMPLE.notifications.kinds);
  });
});
