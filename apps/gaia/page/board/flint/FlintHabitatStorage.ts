/**
 * The board's storage port for Flint (`flint/`): the habitat Flint lives in, kept per board in the preference store as the package's own
 * value, under the board's `flint-habitat` choice.
 */
import type { FlintStorage }    from 'flint';
import type { PreferenceStore } from '../preferences/PreferenceStore.ts';

export const FLINT_HABITAT_CHOICE_NAME = 'flint-habitat';

/** No value the package stores is empty, so every value it writes is kept. */
const NO_DEFAULT_HABITAT = '';

export function flintHabitatStorageOf(boardStore: PreferenceStore): FlintStorage {
  return Object.freeze({
    readHabitatKind:  () => boardStore.readChoice(FLINT_HABITAT_CHOICE_NAME),
    writeHabitatKind: (storedValue: string) => boardStore.writeChoice(FLINT_HABITAT_CHOICE_NAME, storedValue, NO_DEFAULT_HABITAT),
  });
}
