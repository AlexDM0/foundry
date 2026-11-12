/**
 * Gaia's settings in memory, read once through the settings ingestion and written through its writer. The settings in memory change only
 * when the write succeeded, so what Gaia runs on is what the next start reads. Changes are written one after another, so a change made
 * from the current settings never writes over one that was on its way.
 */
import type { SettingsReading }                      from '../adapters/gaia-files/SettingsFile.ts';
import type { SettingsWriter, SettingsWriteVerdict } from '../adapters/gaia-files/SettingsWriter.ts';
import { GAIA_SETTINGS_DEFAULTS }                    from '../adapters/gaia-files/constants/GaiaSettingsDefaults.ts';
import type { SettingsFileState }                    from '../shared/@types/FleetSnapshot.ts';
import type { GaiaSettings }                         from '../shared/@types/GaiaSettings.ts';

export type SettingsListener = (settings: GaiaSettings) => void;

/** The settings to write, made from the current ones; `null` when they already hold what was asked. */
export type SettingsUpdate = (currentSettings: GaiaSettings) => GaiaSettings | null;

export type SettingsUpdateVerdict = SettingsWriteVerdict | { readonly verdict: 'unchanged' };

export interface SettingsStoreOptions {
  readonly settingsFile:   { readonly read: () => Promise<SettingsReading> };
  readonly settingsWriter: SettingsWriter;
}

export interface SettingsStore {
  /** Reads the stored settings into memory; until then, and whenever the file cannot be read, Gaia runs on the defaults. */
  readonly load:      () => Promise<SettingsReading>;
  readonly settings:  () => GaiaSettings;
  readonly fileState: () => SettingsFileState;
  /** Writes the settings and keeps them in memory when they were written; any other verdict leaves memory as it was. */
  readonly change:    (settings: GaiaSettings) => Promise<SettingsWriteVerdict>;
  /** Makes the settings to write from the current ones once every change before it is written, then writes them as `change` does. */
  readonly update:    (settingsUpdate: SettingsUpdate) => Promise<SettingsUpdateVerdict>;
  /** Answers the function that ends the subscription. */
  readonly subscribe: (listener: SettingsListener) => () => void;
}

const FILE_STATE_BY_VERDICT: Readonly<Record<SettingsReading['verdict'], SettingsFileState>> = {
  'readable':      'read',
  'absent':        'absent',
  'newer-version': 'newer-version',
  'unreadable':    'unreadable',
};

export function createSettingsStore(options: SettingsStoreOptions): SettingsStore {
  let currentSettings: GaiaSettings = GAIA_SETTINGS_DEFAULTS;
  let currentFileState: SettingsFileState = 'absent';
  const listeners = new Set<SettingsListener>();
  let changesOnTheirWay: Promise<unknown> = Promise.resolve();

  function keep(settings: GaiaSettings): void {
    currentSettings = settings;
    for (const listener of [...listeners]) listener(settings);
  }

  async function load(): Promise<SettingsReading> {
    const reading = await options.settingsFile.read();
    currentFileState = FILE_STATE_BY_VERDICT[reading.verdict];
    keep(reading.settings);
    return reading;
  }

  async function write(settings: GaiaSettings): Promise<SettingsWriteVerdict> {
    const writeVerdict = await options.settingsWriter.write(settings);
    if (writeVerdict.verdict !== 'written') return writeVerdict;
    currentFileState = 'read';
    keep(settings);
    return writeVerdict;
  }

  function afterTheChangesOnTheirWay<Verdict>(nextChange: () => Promise<Verdict>): Promise<Verdict> {
    const verdict = changesOnTheirWay.then(nextChange);
    changesOnTheirWay = verdict.catch(() => undefined);
    return verdict;
  }

  function change(settings: GaiaSettings): Promise<SettingsWriteVerdict> {
    return afterTheChangesOnTheirWay(() => write(settings));
  }

  function update(settingsUpdate: SettingsUpdate): Promise<SettingsUpdateVerdict> {
    return afterTheChangesOnTheirWay(async (): Promise<SettingsUpdateVerdict> => {
      const updatedSettings = settingsUpdate(currentSettings);
      return updatedSettings === null ? { verdict: 'unchanged' } : write(updatedSettings);
    });
  }

  function subscribe(listener: SettingsListener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  return {
    load,
    settings:  () => currentSettings,
    fileState: () => currentFileState,
    change,
    update,
    subscribe,
  };
}
