/**
 * What a forge sends that `forge-contracts` declares no type for yet: a job stream's transcript entry, a profile stream's line, and a
 * command's applied and refused answers. Gaia writes them down from the forge's API reference and its recordings, so its shapes are typed
 * against something; once the contract declares them, the shapes are typed against the contract's and these go
 * (`docs/forge-requirements.md`).
 */
import type { JsonValue } from '../../../lib/json-value/JsonValueUtil.ts';

/** One vendor-neutral entry of a job's transcript, as the job stream's `history` and `message` events carry it. */
export interface ForgeTranscriptEntryDocument {
  readonly cursor:           string;
  readonly entryKey:         string;
  readonly role:             string;
  readonly text:             string;
  readonly at:               string | null;
  readonly toolName?:        string;
  readonly parentToolUseId?: string;
  readonly toolUseId?:       string;
  readonly asksUser?:        boolean;
  readonly model?:           string;
  readonly tokens?:          number;
  readonly clientAct?:       'chat' | 'answer' | 'interrupt' | 'close-input' | 'stop';
  readonly sentBy?:          'user' | 'overseer' | 'assistant';
  readonly chatSequence?:    number;
  readonly incidentIds?:     readonly string[];
  readonly pictures?:        readonly ForgeTranscriptPictureDocument[];
}

export interface ForgeTranscriptPictureDocument {
  readonly pictureId: string;
  readonly name:      string | null;
  readonly mediaType: string;
  readonly bytes:     number;
}

/** A profile stream's `line` event. */
export interface ForgeProfileLineDocument {
  readonly text: string;
}

/** A command the forge applied, answered 200. `result` is the forge's own record of what it did, read only for the job it started. */
export interface ForgeCommandAppliedAnswer {
  readonly controlVersion: number;
  readonly outcome:        'done' | 'nothing-to-do';
  readonly result?:        unknown;
}

/** A command the forge refused (409, 400) or held for an install change (423), its sentence the one its command line prints. */
export interface ForgeCommandRefusalAnswer {
  readonly controlVersion: number;
  readonly refusal:        string;
  readonly fields:         Readonly<Record<string, JsonValue>>;
  readonly text:           string;
}

/** A picture the forge stored, answered 200 by `POST /api/v1/pictures`. */
export interface ForgePictureUploadedAnswer {
  readonly pictureId: string;
  readonly bytes:     number;
  readonly mediaType: string;
}

/** A picture the forge refused (413 too large, 415 no picture it takes, 400 an empty body), with no control version. */
export interface ForgePictureRefusalAnswer {
  readonly refusal: string;
  readonly fields:  Readonly<Record<string, JsonValue>>;
  readonly text:    string;
}
