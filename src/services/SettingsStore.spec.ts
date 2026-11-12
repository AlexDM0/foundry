/**
 * The settings store over the real settings file and writer under a scratch home: it runs on the defaults until it has read the file and
 * whenever the file cannot be read, says which state the file is in, and keeps a change in memory only once it is written, so a newer
 * file or an unwritable folder leaves Gaia on what it ran on before.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join }                          from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test
} from 'bun:test';

import { SettingsFile, settingsFilePathIn }          from '../adapters/gaia-files/SettingsFile.ts';
import { createSettingsWriter }                      from '../adapters/gaia-files/SettingsWriter.ts';
import { GAIA_SETTINGS_DEFAULTS }                    from '../adapters/gaia-files/constants/GaiaSettingsDefaults.ts';
import type { GaiaSettings }                         from '../shared/@types/GaiaSettings.ts';
import { createScratchDirectory, removeScratchPath } from '../testing/ScratchRoot.ts';
import { createSettingsStore, type SettingsStore }   from './SettingsStore.ts';

const DARK_AND_ONE_HIDDEN: GaiaSettings = { ...GAIA_SETTINGS_DEFAULTS, theme: 'dark', hiddenTrackerIds: ['example-hidden-forge'] };

let homeDirectory: string;

beforeEach(() => {
  homeDirectory = createScratchDirectory('settings-store');
});

afterEach(() => {
  removeScratchPath(homeDirectory);
});

function storeInHome(): SettingsStore {
  return createSettingsStore({ settingsFile: new SettingsFile(homeDirectory), settingsWriter: createSettingsWriter(homeDirectory) });
}

function writeStoredFile(contents: unknown): void {
  const settingsPath = settingsFilePathIn(homeDirectory);
  mkdirSync(dirname(settingsPath), { recursive: true });
  writeFileSync(settingsPath, JSON.stringify(contents));
}

describe('reading', () => {
  test('runs on the defaults before it has read the file', () => {
    const store = storeInHome();
    expect(store.settings()).toEqual(GAIA_SETTINGS_DEFAULTS);
    expect(store.fileState()).toBe('absent');
  });

  test('runs on the defaults when no file is stored', async () => {
    const store = storeInHome();
    expect((await store.load()).verdict).toBe('absent');
    expect(store.settings()).toEqual(GAIA_SETTINGS_DEFAULTS);
    expect(store.fileState()).toBe('absent');
  });

  test('runs on the stored settings once it has read them', async () => {
    await createSettingsWriter(homeDirectory).write(DARK_AND_ONE_HIDDEN);
    const store = storeInHome();
    await store.load();
    expect(store.settings()).toEqual(DARK_AND_ONE_HIDDEN);
    expect(store.fileState()).toBe('read');
  });

  test('runs on the defaults and says so when the file is newer than this Gaia', async () => {
    writeStoredFile({ version: 2, theme: 'dark' });
    const store = storeInHome();
    await store.load();
    expect(store.settings()).toEqual(GAIA_SETTINGS_DEFAULTS);
    expect(store.fileState()).toBe('newer-version');
  });
});

describe('changing', () => {
  test('keeps a written change in memory, tells every subscriber, and the next start reads it', async () => {
    const store = storeInHome();
    await store.load();
    const heard: GaiaSettings[] = [];
    store.subscribe((settings) => heard.push(settings));

    expect(await store.change(DARK_AND_ONE_HIDDEN)).toEqual({ verdict: 'written' });
    expect(store.settings()).toEqual(DARK_AND_ONE_HIDDEN);
    expect(store.fileState()).toBe('read');
    expect(heard).toEqual([DARK_AND_ONE_HIDDEN]);
    expect((await new SettingsFile(homeDirectory).read()).settings).toEqual(DARK_AND_ONE_HIDDEN);
  });

  test('keeps a newer file untouched and Gaia on the defaults', async () => {
    writeStoredFile({ version: 2, theme: 'dark' });
    const storedBefore = readFileSync(settingsFilePathIn(homeDirectory), 'utf8');
    const store = storeInHome();
    await store.load();
    const heard: GaiaSettings[] = [];
    store.subscribe((settings) => heard.push(settings));

    expect(await store.change(DARK_AND_ONE_HIDDEN)).toEqual({ verdict: 'kept-newer-version', storedVersion: 2 });
    expect(store.settings()).toEqual(GAIA_SETTINGS_DEFAULTS);
    expect(store.fileState()).toBe('newer-version');
    expect(heard).toEqual([]);
    expect(readFileSync(settingsFilePathIn(homeDirectory), 'utf8')).toBe(storedBefore);
  });

  test('leaves memory as it was when the settings cannot be written', async () => {
    writeFileSync(join(homeDirectory, '.gaia'), 'a file where the folder belongs');
    const store = storeInHome();
    await store.load();
    expect(store.fileState()).toBe('unreadable');

    const writeVerdict = await store.change(DARK_AND_ONE_HIDDEN);
    expect(writeVerdict.verdict).toBe('unwritable');
    expect(store.settings()).toEqual(GAIA_SETTINGS_DEFAULTS);
    expect(store.fileState()).toBe('unreadable');
  });

  test('tells a subscription that has ended nothing', async () => {
    const store = storeInHome();
    const heard: GaiaSettings[] = [];
    const endSubscription = store.subscribe((settings) => heard.push(settings));
    endSubscription();

    await store.change(DARK_AND_ONE_HIDDEN);
    expect(heard).toEqual([]);
  });
});
