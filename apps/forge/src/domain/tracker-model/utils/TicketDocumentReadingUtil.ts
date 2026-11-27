/**
 * Which version of a ticket's spec and plan each agent role reads, by the pipeline's reading rule, and the plan read where a one-ticket
 * body's Brief was: the plan takes the place of the Brief.
 */
import type {
  DocumentReadingRule,
  EntityAgentRole,
  EntityKey,
  Pipeline
} from '../@types/Pipeline.ts';
import type {
  DocumentApprover,
  LoadedTicketDocumentRecord,
  TicketDocument,
  TicketDocumentKind
} from '../@types/TicketDocument.ts';
import { TICKET_DOCUMENT_KINDS }     from '../@types/TicketDocument.ts';
import { TicketDocumentVersionUtil } from './TicketDocumentVersionUtil.ts';
import { TicketWritingUtil }         from './TicketWritingUtil.ts';

/** One document as a role reads it: the version given, who approved it, and its text. */
export interface DocumentReading {
  document:      TicketDocumentKind;
  versionNumber: number;
  contentHash:   string;
  approvedBy:    DocumentApprover;
  text:          string;
}

/** A `#` or `##` heading, which would end a `## Brief` section; read as a plain line inside the plan's Brief. */
const SECTION_HEADING_MARKER = /^#{1,2}[ \t]+/u;

function documentOfKind(loadedRecord: Readonly<LoadedTicketDocumentRecord>, kind: TicketDocumentKind): Readonly<TicketDocument> | null {
  return loadedRecord.record.documents.find((document) => document.kind === kind) ?? null;
}

function readingOfVersion(
  loadedRecord: Readonly<LoadedTicketDocumentRecord>,
  document: Readonly<TicketDocument>,
  contentHash: string,
  approvedBy: DocumentApprover
): DocumentReading | null {
  const version = document.versions.findLast((candidate) => candidate.contentHash === contentHash);
  const text    = Object.hasOwn(loadedRecord.textOfContentHash, contentHash) ? loadedRecord.textOfContentHash[contentHash] : undefined;
  if (version === undefined || text === undefined) return null;
  return {
    document: document.kind, versionNumber: version.number, contentHash, approvedBy, text
  };
}

/** The head while an approval stands there; `null` otherwise. */
function approvedHeadOf(loadedRecord: Readonly<LoadedTicketDocumentRecord>, kind: TicketDocumentKind): DocumentReading | null {
  const document = documentOfKind(loadedRecord, kind);
  const approval = document === null ? null : TicketDocumentVersionUtil.approvalAtHeadOf(document);
  return document === null || approval === null ? null : readingOfVersion(loadedRecord, document, approval.contentHash, approval.by);
}

/**
 * The version a rule gives. `if-person-approved` gives the version of the newest approval a person made, and of a plan only while that
 * approval was made on `specContentHash`, so a plan approved on an older spec never overrides the spec given.
 */
function readingByRuleOf(
  loadedRecord: Readonly<LoadedTicketDocumentRecord>,
  kind: TicketDocumentKind,
  rule: DocumentReadingRule,
  specContentHash: string | null
): DocumentReading | null {
  if (rule === 'never') return null;
  if (rule === 'always') return approvedHeadOf(loadedRecord, kind);
  const document       = documentOfKind(loadedRecord, kind);
  const personApproval = document?.approvals.findLast((approval) => approval.by === 'person');
  if (document === null || personApproval === undefined) return null;
  if (kind === 'plan' && personApproval.onSpecContentHash !== specContentHash) return null;
  return readingOfVersion(loadedRecord, document, personApproval.contentHash, 'person');
}

/**
 * The documents a builder or a reviewer reads, in pipeline order. A plan is judged against the spec the role reads, or the spec's approved
 * head when the role reads no spec.
 */
function readingsForRoleOf(
  loadedRecord: Readonly<LoadedTicketDocumentRecord>,
  pipeline: Readonly<Pipeline> | null,
  role: EntityAgentRole,
  entityKey?: EntityKey
): DocumentReading[] {
  const ruleOf     = (kind: TicketDocumentKind): DocumentReadingRule => TicketWritingUtil.documentReadingRuleOf(pipeline, role, kind, entityKey);
  const spec       = readingByRuleOf(loadedRecord, 'spec', ruleOf('spec'), null);
  const specOnHand = spec ?? approvedHeadOf(loadedRecord, 'spec');
  const plan       = readingByRuleOf(loadedRecord, 'plan', ruleOf('plan'), specOnHand?.contentHash ?? null);
  return TICKET_DOCUMENT_KINDS.flatMap((kind) => {
    const reading = kind === 'spec' ? spec : plan;
    return reading === null ? [] : [reading];
  });
}

/** The plan's approved head, which takes the place of a one-ticket body's Brief; `null` while the plan has no approved head. */
function briefTextOf(loadedRecord: Readonly<LoadedTicketDocumentRecord>): string | null {
  return approvedHeadOf(loadedRecord, 'plan')?.text ?? null;
}

/** The plan as a body whose one `## Brief` holds every plan line, its own headings read as plain lines, for a reader of the Brief. */
function bodyWithPlanAsBriefOf(planText: string): string {
  const planLines = planText.split('\n').map((line) => line.replace(SECTION_HEADING_MARKER, ''));
  return ['## Brief', '', ...planLines].join('\n');
}

export const TicketDocumentReadingUtil = Object.freeze({
  approvedHeadOf, readingByRuleOf, readingsForRoleOf, briefTextOf, bodyWithPlanAsBriefOf
});
