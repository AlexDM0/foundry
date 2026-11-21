/**
 * One vendor-neutral entry of a job's transcript, as the Overseer's job stream sends it: a client never parses a vendor line. `cursor` is
 * `<instance>.<sequence>`, because each child instance numbers its event log from 1; one log line can give several entries, so `entryKey`
 * adds the entry's index within its line.
 */
export type TranscriptRole = 'assistant' | 'tool-call' | 'tool-result' | 'user' | 'overseer' | 'talos' | 'turn-end';

/** What a client line did to the session: a chat line, an answer to its question, an interrupt, its input closed, or a stop. */
export type TranscriptClientAct = 'chat' | 'answer' | 'interrupt' | 'close-input' | 'stop';

export type TranscriptSender = 'user' | 'overseer' | 'assistant';

/**
 * A picture a chat line carried, served at `GET /api/pictures/<pictureId>`: its id is the sha256 of its bytes, its name the one User's
 * record gave it, `null` when no record of the job names it. The entry never carries the bytes.
 */
export interface TranscriptPicture {
  pictureId: string;
  name:      string | null;
  mediaType: string;
  bytes:     number;
}

export interface TranscriptEntry {
  cursor:           string;
  entryKey:         string;
  role:             TranscriptRole;
  text:             string;
  /** The Talos log entry's stamp; `null` on a log written before stamps. */
  at:               string | null;
  toolName?:        string;
  parentToolUseId?: string;
  toolUseId?:       string;
  /** On a tool call only: true for the call that asks User a question. */
  asksUser?:        boolean;
  model?:           string;
  tokens?:          number;
  clientAct?:       TranscriptClientAct;
  sentBy?:          TranscriptSender;
  /** On the Assistant's chats from the Overseer: the chat's number, and the incidents it delivered. */
  chatSequence?:    number;
  incidentIds?:     string[];
  /** On a chat that carried pictures only. */
  pictures?:        TranscriptPicture[];
}
