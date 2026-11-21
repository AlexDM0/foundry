/**
 * The one board module that touches browser storage. A board's choices are kept per forge under `gaia:board:<trackerId>:<choice>`, and the
 * Progress chart's range under the bare `gaia:board:<trackerId>`. No key of the Bridge is read; the theme is Gaia's, not the board's.
 */
import { PRODUCT_NAMES } from '../../../src/shared/constants/ProductNames.ts';

/** The part of a browser storage area the preference store uses, so a spec can hand it an in-memory one. */
export type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface PreferenceStore {
  readonly readChoice:    (choiceName: string) => string | null;
  /** A choice equal to its default removes the key, so a viewer who never departs from a default leaves nothing behind. */
  readonly writeChoice:   (choiceName: string, choice: string, defaultChoice: string) => void;
  /** A JSON list of texts; anything else reads as the empty list. */
  readonly readTextList:  (choiceName: string) => string[];
  /** An empty list removes the key. */
  readonly writeTextList: (choiceName: string, texts: readonly string[]) => void;
  /** The text stored under the board's prefix itself, no choice name after it. */
  readonly readText:      () => string | null;
  /** Null removes the key. */
  readonly writeText:     (text: string | null) => void;
}

const BOARD_KEY_SEGMENT = 'board';

function textListOf(storedText: string | null): string[] {
  try {
    const value: unknown = JSON.parse(storedText ?? '[]');
    return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
  } catch {
    return [];
  }
}

export const BROWSER_STORAGE_AREAS = Object.freeze({ local: (): PreferenceStorage => window.localStorage });

/** `storageOf` is called inside each read and write, so blocked storage reads as nothing and drops every write, never throwing. */
function createPreferenceStore(keyPrefix: string, storageOf: () => PreferenceStorage): PreferenceStore {
  const keyOf = (choiceName: string): string => `${keyPrefix}:${choiceName}`;
  const readKey = (key: string): string | null => {
    try {
      return storageOf().getItem(key);
    } catch {
      return null;
    }
  };
  const writeKey = (key: string, text: string | null): void => {
    try {
      if (text === null) storageOf().removeItem(key);
      else storageOf().setItem(key, text);
    } catch {
      // The board works without persistence.
    }
  };
  const readStoredText = (choiceName: string): string | null => readKey(keyOf(choiceName));
  const writeStoredText = (choiceName: string, text: string | null): void => writeKey(keyOf(choiceName), text);
  return {
    readChoice:    readStoredText,
    writeChoice:   (choiceName, choice, defaultChoice) => writeStoredText(choiceName, choice === defaultChoice ? null : choice),
    readTextList:  (choiceName) => textListOf(readStoredText(choiceName)),
    writeTextList: (choiceName, texts) => writeStoredText(choiceName, texts.length === 0 ? null : JSON.stringify(texts)),
    readText:      () => readKey(keyPrefix),
    writeText:     (text) => writeKey(keyPrefix, text),
  };
}

export function boardPreferenceStoreOf(trackerId: string, storageOf: () => PreferenceStorage = BROWSER_STORAGE_AREAS.local): PreferenceStore {
  return createPreferenceStore(`${PRODUCT_NAMES.programName}:${BOARD_KEY_SEGMENT}:${trackerId}`, storageOf);
}
