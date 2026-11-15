/**
 * The settings store over the real settings file and writer under a scratch home: it runs on the defaults until it has read the file and
 * whenever the file cannot be read, says which state the file is in, and keeps a change in memory only once it is written, so a newer
 * file or an unwritable folder leaves Gaia on what it ran on before. Updates started at once are made one after another, each from what the
 * one before it wrote, so none is lost.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test
} from 'bun:test';

import { SettingsFile, settingsFilePathIn }          from '../adapters/gaia-files/SettingsFile.ts';
import { createSettingsWriter }                      from '../adapters/gaia-files/SettingsWriter.ts';
import type { GaiaSettings }                         from '../shared/@types/GaiaSettings.ts';
import { GAIA_SETTINGS_DEFAULTS }                    from '../shared/constants/GaiaSettingsDefaults.ts';
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

    expect(await store.change(DARK_AND_ONE_HIDDEN)).toEqual({ verdict: 'kept-newer-version', storedVersion: { major: 2, minor: 0 } });
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

describe('updating', () => {
  function hiding(trackerId: string): (settings: GaiaSettings) => GaiaSettings {
    return (settings) => ({ ...settings, hiddenTrackerIds: [...settings.hiddenTrackerIds, trackerId] });
  }

  test('makes updates started at once one after another, each from what the one before it wrote', async () => {
    const store = storeInHome();
    await store.load();

    const verdicts = await Promise.all([store.update(hiding('example-storefront-7c41')), store.update(hiding('research-wiki-2b90'))]);
    expect(verdicts).toEqual([{ verdict: 'written' }, { verdict: 'written' }]);
    expect(store.settings().hiddenTrackerIds).toEqual(['example-storefront-7c41', 'research-wiki-2b90']);
    expect((await new SettingsFile(homeDirectory).read()).settings.hiddenTrackerIds).toEqual(['example-storefront-7c41', 'research-wiki-2b90']);
  });

  test('makes an update from a change started before it', async () => {
    const store = storeInHome();
    await store.load();

    const [changeVerdict, updateVerdict] = await Promise.all([store.change(DARK_AND_ONE_HIDDEN), store.update(hiding('research-wiki-2b90'))]);
    expect([changeVerdict, updateVerdict]).toEqual([{ verdict: 'written' }, { verdict: 'written' }]);
    expect(store.settings()).toEqual({ ...DARK_AND_ONE_HIDDEN, hiddenTrackerIds: ['example-hidden-forge', 'research-wiki-2b90'] });
  });

  test('answers unchanged and writes nothing when the settings already hold what was asked', async () => {
    const store = storeInHome();
    await store.load();
    const heard: GaiaSettings[] = [];
    store.subscribe((settings) => heard.push(settings));

    expect(await store.update(() => null)).toEqual({ verdict: 'unchanged' });
    expect(existsSync(settingsFilePathIn(homeDirectory))).toBe(false);
    expect(heard).toEqual([]);
  });

  test('keeps a newer file untouched and answers so', async () => {
    writeStoredFile({ version: 2, theme: 'dark' });
    const store = storeInHome();
    await store.load();

    expect(await store.update(hiding('research-wiki-2b90'))).toEqual({ verdict: 'kept-newer-version', storedVersion: { major: 2, minor: 0 } });
    expect(store.settings()).toEqual(GAIA_SETTINGS_DEFAULTS);
  });
});
