/**
 * The finished readings and facts the board document serves, so a view reads values and recomputes no rule of forge's: what waits on the
 * user and what each entry opens, the worded notices and warnings, today's figures, each ticket's facts and the commands it accepts now, and
 * each job's stop holds and the commands it accepts now.
 */
import type { TicketPriority }    from '../constants/BoardVocabulary.ts';
import type { ForgeBoardCommand } from './BoardCommand.ts';
import type { ForgeJobStopMode }  from './ForgeControlCommand.ts';
import type { ForgeJsonValue }    from './ForgeRefusalDocument.ts';


export type BoardTargetSubject = 'decision' | 'ticket' | 'draft' | 'job' | 'incident';

/** The thing an entry opens: a view routes it to its own place for that subject. */
export interface BoardTarget {
  readonly subject: BoardTargetSubject;
  readonly id:      string;
}

export type BoardAttentionKind = 'escalated-question' | 'question' | 'draft-ticket' | 'filing-draft' | 'review' | 'merge-accept';

/** The word a view puts before the entry's age. */
export type BoardAttentionStampWord = 'opened' | 'filed' | 'ready since' | 'reviewed';

export type BoardAttentionActionLabel = 'Answer' | 'Ready' | 'Review' | 'Accept';

/** One thing that waits on the user, worded by forge, with the thing it opens; escalated entries lead, then the rest oldest first. */
export interface BoardAttentionEntryDocument {
  /** `decision:E3`, `ticket:009`, `draft:D2`, `merge-accept:005`. */
  readonly key:                     string;
  readonly kind:                    BoardAttentionKind;
  /** `E3`, `#009`, `D2`. */
  readonly idText:                  string;
  /** A decision's tickets; empty for a ticket's or a draft's own entry. */
  readonly ticketIds:               readonly string[];
  readonly subject:                 string;
  readonly jobId:                   string | null;
  readonly askedBy:                 string | null;
  /** Set only for a decision forge opened from the facts, whose kind the entry names. */
  readonly decisionKind:            string | null;
  readonly escalatedFromIncidentId: string | null;
  /** The fixed words of a ticket's or a draft's entry. */
  readonly metaText:                string | null;
  /** What the age counts from; empty when the board does not hold it. */
  readonly stamp:                   string;
  readonly stampWord:               BoardAttentionStampWord;
  readonly actionLabel:             BoardAttentionActionLabel;
  readonly target:                  BoardTarget;
}

/** A notice or a warning: its kind, the facts that kind carries, and forge's sentence for it. */
export interface BoardNoticeDocument {
  readonly kind:           string;
  readonly facts:          Readonly<Record<string, ForgeJsonValue>>;
  readonly sentence:       string;
  /** Only on an incident that took its default: why it did. */
  readonly causeSentence?: string;
}

/** Counted on `calendarDate`, the forge's local date when the board was read; a reader shows them only on that date. */
export interface BoardTodayDocument {
  readonly calendarDate:     string;
  readonly deliveredTickets: number;
  readonly tokens:           number;
}

/** What a view would otherwise derive from a ticket's status, priority and own row. */
export interface BoardTicketFactsDocument {
  /** The priority the ticket runs at, `normal` where it names none. */
  readonly resolvedPriority:     TicketPriority;
  /** A ticket that waits on this one may start. */
  readonly settlesADependency:   boolean;
  /** Nothing is built toward it any more, so the tickets it waits on are history. */
  readonly isClosed:             boolean;
  readonly noAgentHasPickedItUp: boolean;
  /** The round of the review pass the ticket is in; `null` while its row counts none and no repeat review runs. */
  readonly reviewRound:          number | null;
  readonly isRepeatReview:       boolean;
}

/** The board command kinds this ticket accepts now, judged on its state, and the priorities it may move to. */
export interface BoardTicketOffersDocument {
  readonly kinds:           readonly ForgeBoardCommand['kind'][];
  readonly priorityChoices: readonly TicketPriority[];
}

/** What a job accepts now: the stop modes, a fresh agent and a message. */
export interface BoardJobOffersDocument {
  readonly stopModes:    readonly ForgeJobStopMode[];
  readonly takesFresh:   boolean;
  readonly takesMessage: boolean;
}

/** The hold each stop mode leaves on the job's tickets, as forge writes it. */
export interface BoardJobStopHoldsDocument {
  readonly stop:     string;
  readonly windDown: string;
}
