import type { BoardRoute } from './board/BoardRoute.ts';

/** One entry of what waits on User in one forge, as that forge orders and words it. */
export type AttentionKind = 'escalated-question' | 'question' | 'draft-ticket' | 'filing-draft' | 'review' | 'merge-accept';

export type AttentionStampWord = 'opened' | 'filed' | 'ready since' | 'reviewed';

export type AttentionActionLabel = 'Answer' | 'Ready' | 'Review' | 'Accept';

export interface AttentionItem {
  /** Unique within its forge, such as `decision:E3`; the notification key is built from it. */
  key:                     string;
  kind:                    AttentionKind;
  idText:                  string;
  ticketIds:               string[];
  subject:                 string;
  jobId:                   string | null;
  askedBy:                 string | null;
  decisionKind:            string | null;
  escalatedFromIncidentId: string | null;
  metaText:                string | null;
  stamp:                   string;
  stampWord:               AttentionStampWord;
  actionLabel:             AttentionActionLabel;
  /** Where on the forge's board the entry opens; `null` for a route the forge names that Gaia's board does not know. */
  boardRoute:              BoardRoute | null;
}
