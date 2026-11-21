/**
 * What a forge's conversation streams carry, as Gaia holds it: a job's transcript entries, each vendor-neutral, and a gate profile run's
 * output lines.
 */
export type BoardTranscriptClientAct = 'chat' | 'answer' | 'interrupt' | 'close-input' | 'stop';

export type BoardTranscriptSender = 'user' | 'overseer' | 'assistant';

/** A picture a chat carried; `name` is `null` when no record of the job names it. The entry never carries the bytes. */
export interface BoardTranscriptPicture {
  readonly pictureId: string;
  readonly name:      string | null;
  readonly mediaType: string;
  readonly bytes:     number;
}

/** One entry of a job's transcript; one cursor may give several entries, so an entry is known by its `entryKey`. */
export interface BoardTranscriptEntry {
  readonly cursor:          string;
  readonly entryKey:        string;
  /** The forge's role name, shown by kind; a role this Gaia does not know is still an entry. */
  readonly role:            string;
  readonly text:            string;
  readonly at:              string | null;
  readonly toolName:        string | null;
  readonly parentToolUseId: string | null;
  readonly toolUseId:       string | null;
  readonly asksUser:        boolean;
  readonly model:           string | null;
  readonly tokens:          number | null;
  readonly clientAct:       BoardTranscriptClientAct | null;
  readonly sentBy:          BoardTranscriptSender | null;
  readonly chatSequence:    number | null;
  readonly incidentIds:     readonly string[];
  readonly pictures:        readonly BoardTranscriptPicture[];
}

export interface BoardProfileLine {
  readonly text: string;
}
