/**
 * How a pipeline has its tickets written: the route, whether the user reviews each ticket document, and which version of each document a
 * builder or a reviewer reads. A re-reviewer and a conflict re-reviewer read the reviewer's rule, and the reviewer always reads the spec.
 */
import type {
  DocumentReadingRule,
  EntityAgentRole,
  EntityKey,
  Pipeline,
  TicketWritingRoute
} from '../@types/Pipeline.ts';
import type { TicketDocumentKind }   from '../@types/TicketDocument.ts';
import { DEFAULT_DOCUMENTS_OF_ROLE } from '../constants/PipelineDefaults.ts';
import type { DocumentReadingRole }  from '../constants/PipelineDefaults.ts';
import { PipelineUtil }              from './PipelineUtil.ts';

/** Absent, and with no pipeline, is today's one ticket. */
function routeOf(pipeline: Readonly<Pipeline> | null): TicketWritingRoute {
  return pipeline?.ticketWriting ?? 'one-ticket';
}

/** Absent is on: the user approves the document; off, its agent's ready approves it for the pipeline. */
function documentReviewIsOn(pipeline: Readonly<Pipeline> | null, document: TicketDocumentKind): boolean {
  return pipeline?.approvals?.[document] !== false;
}

function documentReadingRoleOf(role: EntityAgentRole): DocumentReadingRole {
  return role === 'builder' ? 'builder' : 'reviewer';
}

/** The rule of the role's own settings, its entity's on a forge with entities, else the role's default. */
function documentReadingRuleOf(
  pipeline: Readonly<Pipeline> | null,
  role: EntityAgentRole,
  document: TicketDocumentKind,
  entityKey?: EntityKey
): DocumentReadingRule {
  const readingRole = documentReadingRoleOf(role);
  if (readingRole === 'reviewer' && document === 'spec') return DEFAULT_DOCUMENTS_OF_ROLE.reviewer.spec;
  const ticketPipeline = pipeline === null ? null : PipelineUtil.ticketPipelineOf(pipeline, entityKey);
  return ticketPipeline?.agents?.[readingRole]?.documents?.[document] ?? DEFAULT_DOCUMENTS_OF_ROLE[readingRole][document];
}

export const TicketWritingUtil = Object.freeze({ routeOf, documentReviewIsOn, documentReadingRuleOf });
