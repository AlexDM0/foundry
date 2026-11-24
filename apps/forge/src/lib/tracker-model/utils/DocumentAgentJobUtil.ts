/**
 * Which ticket document a document agent job writes, read from its role, and which job is the live agent of a ticket document: the one
 * document-agent job on the board for that ticket and document.
 */
import type { Job, JobRole }       from '../@types/Job.ts';
import type { TicketDocumentKind } from '../@types/TicketDocument.ts';

const DOCUMENT_AGENT_KIND = 'document-agent';

const DOCUMENT_OF_ROLE: Readonly<Partial<Record<JobRole, TicketDocumentKind>>> = Object.freeze({ 'spec-agent': 'spec', 'plan-agent': 'plan' });

const ROLE_OF_DOCUMENT: Readonly<Record<TicketDocumentKind, JobRole>> = Object.freeze({ spec: 'spec-agent', plan: 'plan-agent' });

/** `null` for a job that is no document agent. */
function documentOf(job: Readonly<Pick<Job, 'kind' | 'role'>>): TicketDocumentKind | null {
  if (job.kind !== DOCUMENT_AGENT_KIND || job.role === null) return null;
  return DOCUMENT_OF_ROLE[job.role] ?? null;
}

function roleOf(document: TicketDocumentKind): JobRole {
  return ROLE_OF_DOCUMENT[document];
}

/** The document agent job on the board for the ticket's document; `null` while none is. */
function liveAgentOf(jobs: readonly Readonly<Job>[], ticketId: string, document: TicketDocumentKind): Readonly<Job> | null {
  return jobs.find((job) => documentOf(job) === document && job.ticketIds[0] === ticketId) ?? null;
}

export const DocumentAgentJobUtil = Object.freeze({ documentOf, roleOf, liveAgentOf });
