/**
 * Where a ticket being written stands. In the spec-then-plan route a draft is at its spec until the spec is approved, then at its plan, and
 * in review while that document waits for User's approval; a ticket in `ready-for-review`, on either route, waits for its review.
 */
import type { Decision }                                                 from '../@types/Decision.ts';
import type { DraftProgress, DraftStage, DraftWait }                     from '../@types/DraftProgress.ts';
import type { Job }                                                      from '../@types/Job.ts';
import type { TicketWritingRoute }                                       from '../@types/Pipeline.ts';
import type { TicketStatus }                                             from '../@types/Ticket.ts';
import type { TicketDocument, TicketDocumentKind, TicketDocumentRecord } from '../@types/TicketDocument.ts';
import { DocumentAgentJobUtil }                                          from './DocumentAgentJobUtil.ts';
import { TicketDocumentStandingUtil }                                    from './TicketDocumentStandingUtil.ts';
import { TicketDocumentVersionUtil }                                     from './TicketDocumentVersionUtil.ts';

export interface DraftFacts {
  ticketId:  string;
  status:    TicketStatus;
  /** The ticket's `updated`, stamped by its move to `ready-for-review`. */
  updated:   string;
  route:     TicketWritingRoute;
  /** `null` while the ticket has no documents record. */
  documents: Readonly<TicketDocumentRecord> | null;
  decisions: readonly Readonly<Decision>[];
  jobs:      readonly Readonly<Job>[];
}

interface Wait {
  waitsOnUser:  DraftWait;
  waitingSince: string;
}

/** The document the draft is writing now: the plan once the spec is approved, else the spec. */
function stageDocumentOf(documents: Readonly<TicketDocumentRecord> | null): TicketDocumentKind {
  if (documents === null) return 'spec';
  return TicketDocumentStandingUtil.standingsOf(documents).spec === 'approved' ? 'plan' : 'spec';
}

function stageOf(documents: Readonly<TicketDocumentRecord> | null, document: TicketDocumentKind): DraftStage {
  const standing = documents === null ? 'unwritten' : TicketDocumentStandingUtil.standingsOf(documents)[document];
  if (standing !== 'awaiting-review') return document;
  return document === 'spec' ? 'spec-review' : 'plan-review';
}

/** An open question of the agent comes first, since it holds the approval; then an edit that waits for Apply; then the approval itself. */
function waitOf(facts: DraftFacts, document: TicketDocumentKind, stage: DraftStage): Wait | null {
  const question = facts.decisions.find((decision) => decision.document === document && decision.ticketIds.includes(facts.ticketId));
  if (question !== undefined) return { waitsOnUser: 'answer', waitingSince: question.openedAt };
  const held: Readonly<TicketDocument> | undefined = facts.documents?.documents.find((candidate) => candidate.kind === document);
  const proposal = held?.proposals.find((candidate) => candidate.state === 'proposed');
  if (proposal !== undefined) return { waitsOnUser: 'proposal', waitingSince: proposal.at };
  const head = held === undefined ? null : TicketDocumentVersionUtil.headOf(held);
  if (stage !== document && head !== null) return { waitsOnUser: 'approval', waitingSince: head.at };
  return null;
}

/** `null` for a ticket that is not being written: one past `ready-for-review`, or a draft of the one-ticket route, whose intake shapes it. */
function progressOf(facts: DraftFacts): DraftProgress | null {
  if (facts.status === 'ready-for-review') return {
    stage: 'ticket-review', waitsOnUser: 'approval', agentJobId: null, waitingSince: facts.updated
  };
  if (facts.status !== 'draft' || facts.route !== 'spec-then-plan') return null;
  const document = stageDocumentOf(facts.documents);
  const stage    = stageOf(facts.documents, document);
  const wait     = waitOf(facts, document, stage);
  return {
    stage,
    waitsOnUser:  wait?.waitsOnUser ?? null,
    agentJobId:   DocumentAgentJobUtil.liveAgentOf(facts.jobs, facts.ticketId, document)?.id ?? null,
    waitingSince: wait?.waitingSince ?? null,
  };
}

export const DraftProgressUtil = Object.freeze({ stageDocumentOf, progressOf });
