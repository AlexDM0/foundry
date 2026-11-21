/**
 * What a forge document is read with, and what reading one answers: a `ForgeReading`, or a verdict that maps nothing of the document.
 */
import type { ForgeContracts, ForgeReading } from '../../../shared/@types/ForgeReading.ts';

/** What the registry holds of a forge with a live Hephaestus that a reading carries and no forge document repeats. */
export interface ForgeRegistryFacts {
  readonly trackerId:           string;
  readonly project:             string;
  readonly root:                string;
  readonly hephaestusUrl:       string;
  readonly hephaestusProcessId: number;
  readonly program:             string | null;
  readonly lastCommand:         string | null;
  readonly lastChangedAt:       string | null;
}

/** A Hephaestus's identity mapped in. `contracts` is `null` from a forge before F1, which names none. */
export interface ForgeIdentity {
  readonly trackerId:      string;
  readonly project:        string;
  readonly codeVersion:    string;
  readonly installVersion: number;
  readonly processId:      number;
  readonly contracts:      ForgeContracts | null;
}

export type ForgeContractName = 'identity' | 'summary' | 'monitor';

/** The forge speaks a contract newer than this Gaia knows: the reading names the forge and its numbers, and nothing of the document. */
export interface NewerContractVerdict {
  readonly verdict:  'newer-contract';
  readonly contract: ForgeContractName;
  readonly version:  number;
  readonly reading:  ForgeReading;
}

/** The forge speaks only a contract older than Gaia reads; `version` is `null` when it names no number for it. */
export interface OlderContractVerdict {
  readonly verdict:  'older-contract';
  readonly contract: ForgeContractName;
  readonly version:  number | null;
}

/** Each key that is missing or fails its check, as a path into the document, such as `jobs[2].tokens`. */
export interface MalformedVerdict {
  readonly verdict:     'malformed';
  readonly invalidKeys: readonly string[];
}

export type ForgeDocumentReading =
  | { readonly verdict: 'readable'; readonly reading: ForgeReading }
  | NewerContractVerdict
  | OlderContractVerdict
  | MalformedVerdict;

/** Why a forge document that carries no version key of its own maps to nothing: each key that is missing or fails its check. */
export interface DocumentReadingFailure {
  readonly invalidKeys: readonly string[];
}
