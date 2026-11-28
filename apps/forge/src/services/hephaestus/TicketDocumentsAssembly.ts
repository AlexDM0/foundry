/**
 * A ticket's documents as `GET /api/v1/tickets/{ticketId}/documents` serves them, and the summary the board document carries on the
 * ticket, from one reading of the board: the record, the pipeline's review switches and reading rules, the live document agents, the
 * newest effect readings and the constitution numbers, which git counts once per constitution and commit.
 */
import type { BoardTicketDocumentsSummaryDocument } from 'forge-contracts/BoardPageDocuments';
import type { ForgeTicketDocumentsDocument }        from 'forge-contracts/TicketDocumentsDocument';

import { TicketDocumentsMappingUtil, type TicketDocumentFacts } from '../../adapters/board-document/utils/TicketDocumentsMappingUtil.ts';
import type { Job, JobRole }                                    from '../../domain/tracker-model/@types/Job.ts';
import type { Pipeline }                                        from '../../domain/tracker-model/@types/Pipeline.ts';
import type { Ticket, TicketFrontmatter }                       from '../../domain/tracker-model/@types/Ticket.ts';
import type { LoadedTicketDocumentRecord, TicketDocumentKind }  from '../../domain/tracker-model/@types/TicketDocument.ts';
import { TICKET_DOCUMENT_KINDS }                                from '../../domain/tracker-model/@types/TicketDocument.ts';
import { TICKET_STATUSES_NO_AGENT_HAS_PICKED_UP }               from '../../domain/tracker-model/constants/Statuses.ts';
import { PipelineUtil }                                         from '../../domain/tracker-model/utils/PipelineUtil.ts';
import { TicketDocumentReadinessUtil }                          from '../../domain/tracker-model/utils/TicketDocumentReadinessUtil.ts';
import { TicketWritingUtil }                                    from '../../domain/tracker-model/utils/TicketWritingUtil.ts';
import { GitProcess }                                           from '../../lib/git/GitProcess.ts';
import type { EffectReading }                                   from '../../shared/@types/EffectReading.ts';
import { OperationRefusal }                                     from '../../shared/OperationRefusal.ts';
import { InstructionFiles }                                     from './InstructionFiles.ts';

/** How many commits changed a constitution up to a commit, the "constitution v3" a version or an approval was made on. */
export interface ConstitutionNumbers {
  /** `null` when git cannot count them, as for a commit the repository does not hold. */
  numberOf: (constitutionPath: string, commit: string) => number | null;
}

export interface TicketDocumentsSource {
  ticket:              Readonly<Ticket>;
  /** `null` for a ticket with no documents record. */
  loadedRecord:        Readonly<LoadedTicketDocumentRecord> | null;
  pipeline:            Readonly<Pipeline> | null;
  /** The unsettled jobs, the live document agents among them. */
  jobs:                readonly Readonly<Job>[];
  effectReadings:      readonly EffectReading[];
  constitutionNumbers: ConstitutionNumbers;
}

const DOCUMENT_AGENT_ROLE_OF_DOCUMENT: Readonly<Record<TicketDocumentKind, JobRole>> = { spec: 'spec-agent', plan: 'plan-agent' };

/** A number counted once stays true for its commit, so only a count git gave is kept; a failed one is asked again. */
function constitutionNumbersIn(projectDirectory: string): ConstitutionNumbers {
  const numberOfPathAndCommit = new Map<string, number>();
  return {
    numberOf: (constitutionPath, commit) => {
      const key = `${constitutionPath}\n${commit}`;
      const counted = numberOfPathAndCommit.get(key);
      if (counted !== undefined) return counted;
      const { repositoryRoot, repositoryPath } = InstructionFiles.projectFileOf(projectDirectory, constitutionPath);
      const countRun = GitProcess.run(repositoryRoot, ['rev-list', '--count', '--end-of-options', commit, '--', repositoryPath]);
      if (!GitProcess.succeeded(countRun)) return null;
      const count = Number(countRun.standardOutput.trim());
      if (!Number.isSafeInteger(count)) return null;
      numberOfPathAndCommit.set(key, count);
      return count;
    },
  };
}

/** The tracked constitution the ticket's pipeline names; `null` for the installed default, which no commit changes. */
function constitutionPathOf(pipeline: Readonly<Pipeline> | null, ticket: Readonly<Ticket>): string | null {
  if (pipeline === null) return null;
  return PipelineUtil.ticketPipelineOf(pipeline, ticket.frontmatter.entity).constitution?.path ?? null;
}

function documentFactsOf(source: Pick<TicketDocumentsSource, 'ticket' | 'pipeline' | 'jobs'>, document: TicketDocumentKind): TicketDocumentFacts {
  const { ticket, pipeline } = source;
  const reviewIsOn = TicketWritingUtil.documentReviewIsOn(pipeline, document);
  const ticketId = ticket.frontmatter.id;
  const agentJob = source.jobs.find((job) => job.kind === 'document-agent' && job.role === DOCUMENT_AGENT_ROLE_OF_DOCUMENT[document] && job.ticketIds.includes(ticketId));
  return {
    reviewer:   reviewIsOn ? 'person' : 'pipeline',
    editable:   reviewIsOn && TICKET_STATUSES_NO_AGENT_HAS_PICKED_UP.includes(ticket.frontmatter.status),
    agentJobId: agentJob?.id ?? null,
  };
}

/** Refuses `ticket-has-no-documents` for a ticket with no documents record. */
function ticketDocumentsOf(source: TicketDocumentsSource): ForgeTicketDocumentsDocument {
  const { loadedRecord, ticket } = source;
  if (loadedRecord === null) {
    throw new OperationRefusal('refused', { kind: 'board-refusal', boardRefusal: { reason: 'ticket-has-no-documents', ticketId: ticket.frontmatter.id } });
  }
  const constitutionPath = constitutionPathOf(source.pipeline, ticket);
  return TicketDocumentsMappingUtil.ticketDocumentsOf({
    loadedRecord,
    factsOf:              (document) => documentFactsOf(source, document),
    effectReadings:       source.effectReadings,
    constitutionNumberOf: (commit) => (constitutionPath === null ? null : source.constitutionNumbers.numberOf(constitutionPath, commit)),
  });
}

/** A committed ticket waits for its build while the readiness rule finds a gap in its documents, the rule Hephaestus holds it by. */
function buildIsHeld(ticket: Readonly<TicketFrontmatter>, loadedRecord: Readonly<LoadedTicketDocumentRecord>, pipeline: Readonly<Pipeline> | null): boolean {
  if (ticket.status !== 'committed') return false;
  const builderReadsThePlan = TicketWritingUtil.documentReadingRuleOf(pipeline, 'builder', 'plan', ticket.entity) !== 'never';
  return TicketDocumentReadinessUtil.documentGapsOf(loadedRecord, builderReadsThePlan).length > 0;
}

/** `null` for a ticket with no documents record, which the board document then carries no summary for. */
function documentsSummaryOf(
  ticket: Readonly<TicketFrontmatter>,
  loadedRecord: Readonly<LoadedTicketDocumentRecord> | null,
  pipeline: Readonly<Pipeline> | null
): BoardTicketDocumentsSummaryDocument | null {
  if (loadedRecord === null) return null;
  return TicketDocumentsMappingUtil.documentsSummaryOf(loadedRecord, buildIsHeld(ticket, loadedRecord, pipeline));
}

/** What a ticket's served documents are built from, but the effect readings, which announce themselves. */
export interface TicketDocumentsFingerprintSource {
  loadedRecords: readonly Readonly<LoadedTicketDocumentRecord>[];
  tickets:       readonly Readonly<Ticket>[];
  pipeline:      Readonly<Pipeline> | null;
  jobs:          readonly Readonly<Job>[];
}

/**
 * Each ticket's documents as a text that changes whenever what the endpoint serves does, keyed by ticket, so a publish can tell which
 * tickets' documents moved: the record, and per document whether it is editable, who reviews it and its live agent, which follow the
 * ticket's status, the pipeline's review switch and the jobs, not the record.
 */
function fingerprintsOf(source: TicketDocumentsFingerprintSource): ReadonlyMap<string, string> {
  return new Map(source.loadedRecords.map((loadedRecord) => {
    const { ticketId } = loadedRecord.record;
    const ticket = source.tickets.find((candidate) => candidate.frontmatter.id === ticketId);
    const servedFacts = ticket === undefined
      ? null
      : TICKET_DOCUMENT_KINDS.map((document) => documentFactsOf({ ticket, pipeline: source.pipeline, jobs: source.jobs }, document));
    return [ticketId, JSON.stringify({ record: loadedRecord.record, status: ticket?.frontmatter.status ?? null, servedFacts })];
  }));
}

export const TicketDocumentsAssembly = Object.freeze({
  constitutionNumbersIn, ticketDocumentsOf, documentsSummaryOf, fingerprintsOf
});
