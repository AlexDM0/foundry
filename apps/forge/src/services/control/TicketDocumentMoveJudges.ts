/**
 * What the Board's document moves read through their caller: a body's readiness gaps and the files its Brief names, read from markdown,
 * and the words of the board's message that tells an agent its edit conflicted.
 */
import { readFileSync } from 'node:fs';

import { TicketAcceptanceUtil }    from '../../adapters/tickets/utils/TicketAcceptanceUtil.ts';
import type { DocumentProposal }   from '../../domain/tracker-model/@types/TicketDocument.ts';
import type { TicketDocumentKind } from '../../domain/tracker-model/@types/TicketDocument.ts';
import type { DocumentMoveJudges } from '../../domain/tracker-model/TicketDocuments.ts';
import { filledTemplateOf }        from '../../shared/FilledTemplate.ts';
import { resourceFilePathOf }      from '../../shared/ResourceFilePath.ts';

function conflictNoticeOf(document: TicketDocumentKind, proposal: Readonly<DocumentProposal>): string {
  return filledTemplateOf(readFileSync(resourceFilePathOf('prompts', 'DocumentConflictNotice.md'), 'utf8'), {
    proposalId: proposal.proposalId,
    document,
    baseNumber: proposal.baseNumber === null ? 'none' : String(proposal.baseNumber),
  }).trim();
}

/** The judges of one document's moves: its name goes into the conflict notice. */
export function ticketDocumentMoveJudgesOf(document: TicketDocumentKind): DocumentMoveJudges {
  return {
    bodyGapsOf:       TicketAcceptanceUtil.readinessGapsOf,
    workFilesOf:      TicketAcceptanceUtil.workFilesOf,
    conflictNoticeOf: (proposal) => conflictNoticeOf(document, proposal),
  };
}
