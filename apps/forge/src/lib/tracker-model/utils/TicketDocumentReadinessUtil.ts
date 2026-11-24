/**
 * What keeps a ticket from being readied or built, judged by its documents once it has a record and by its body before that. The body judge
 * is the caller's, since the model reads no markdown: with a record it reads the spec's head for a numbered Acceptance.
 */
import type { ReadinessGap, Ticket }                         from '../@types/Ticket.ts';
import type { DocumentStanding, LoadedTicketDocumentRecord } from '../@types/TicketDocument.ts';
import { TicketDocumentStandingUtil }                        from './TicketDocumentStandingUtil.ts';
import { TicketDocumentVersionUtil }                         from './TicketDocumentVersionUtil.ts';

export type BodyGapsOf = (body: string) => readonly ReadinessGap[];

function specGapOf(standing: DocumentStanding): ReadinessGap[] {
  return standing === 'approved' ? [] : ['spec-unapproved'];
}

function planGapOf(standing: DocumentStanding): ReadinessGap[] {
  if (standing === 'approved') return [];
  return standing === 'out-of-date' ? ['plan-out-of-date'] : ['plan-unapproved'];
}

/** The spec's head text, or none while the spec has no version. */
function specHeadTextOf(loadedRecord: Readonly<LoadedTicketDocumentRecord>): string | null {
  const spec = loadedRecord.record.documents.find((document) => document.kind === 'spec');
  const head = spec === undefined ? null : TicketDocumentVersionUtil.headOf(spec);
  if (head === null || !Object.hasOwn(loadedRecord.textOfContentHash, head.contentHash)) return null;
  return loadedRecord.textOfContentHash[head.contentHash] ?? null;
}

/** The gaps of the documents alone: the spec, and the plan only when `judgesPlan`, as the hold of a builder that never reads it. */
function documentGapsOf(loadedRecord: Readonly<LoadedTicketDocumentRecord>, judgesPlan: boolean): ReadinessGap[] {
  const standings = TicketDocumentStandingUtil.standingsOf(loadedRecord.record);
  return [...specGapOf(standings.spec), ...(judgesPlan ? planGapOf(standings.plan) : [])];
}

/**
 * A ticket without a record is judged by its body. With one, the spec's head must hold a numbered Acceptance (the Brief is the plan's, so
 * `brief-missing` is not judged), and both documents must be approved, the plan on the spec's approved head.
 */
function readinessGapsOf(ticket: Readonly<Ticket>, loadedRecord: Readonly<LoadedTicketDocumentRecord> | undefined, bodyGapsOf: BodyGapsOf): ReadinessGap[] {
  if (loadedRecord === undefined) return [...bodyGapsOf(ticket.body)];
  const specText    = specHeadTextOf(loadedRecord);
  const specGaps    = specText === null ? ['acceptance-unnumbered' as const] : bodyGapsOf(specText).filter((gap) => gap === 'acceptance-unnumbered');
  return [...specGaps, ...documentGapsOf(loadedRecord, true)];
}

export const TicketDocumentReadinessUtil = Object.freeze({ readinessGapsOf, documentGapsOf, specHeadTextOf });
