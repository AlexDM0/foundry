/**
 * One vendor-neutral entry of a job's transcript, as the Overseer's job stream sends it: the Bridge never parses a vendor line. `cursor` is
 * `<instance>.<sequence>`, because each Watcher instance numbers its event log from 1; one log line can give several entries, so `entryKey`
 * adds the entry's index within its line.
 */
export type TranscriptRole = 'assistant' | 'tool-call' | 'tool-result' | 'user' | 'overseer' | 'watcher' | 'turn-end';

/** What a client line did to the session: a chat line, an answer to its question, an interrupt, its input closed, or a stop. */
export type TranscriptClientAct = 'chat' | 'answer' | 'interrupt' | 'close-input' | 'stop';

export type TranscriptSender = 'user' | 'overseer' | 'assistant';

export interface TranscriptEntry {
  cursor:           string;
  entryKey:         string;
  role:             TranscriptRole;
  text:             string;
  /** The Watcher log entry's stamp; `null` on a log written before stamps. */
  at:               string | null;
  toolName?:        string;
  parentToolUseId?: string;
  toolUseId?:       string;
  model?:           string;
  tokens?:          number;
  clientAct?:       TranscriptClientAct;
  sentBy?:          TranscriptSender;
  /** On the Assistant's chats from the Overseer: the chat's number, and the incidents it delivered. */
  chatSequence?:    number;
  incidentIds?:     string[];
}
