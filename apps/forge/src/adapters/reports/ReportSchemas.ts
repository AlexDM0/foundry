/**
 * The builder, reviewer and Airlock agent report schemas (design section 4.3), each one draft-07 document: handed to the agent's command line as
 * written and checked by `reportVerdictOf`, so the two never disagree. No report carries a round, a rework count, a verdict or a release.
 */
import type { ReviewFinding } from '../../domain/tracker-model/@types/ReviewRecord.ts';
import {
  REVIEW_CLAIM_RESULTS,
  REVIEW_FINDING_CLASSES,
  REVIEW_FINDING_EVIDENCE_KINDS,
  REVIEW_FINDING_SEVERITIES
} from '../../domain/tracker-model/constants/ReviewRecordVocabulary.ts';
import type { JsonSchema } from './ReportValidation.ts';

/** A reviewer report's finding: the stored `ReviewFinding` unchanged when fixed; when filed, the Hatch's ticket id or its request id. */
export type ReportedReviewFinding =
  | Extract<ReviewFinding, { outcome: 'fixed' }>
  | Omit<Extract<ReviewFinding, { outcome: 'filed' }>, 'filedTicketId'> & { filedTicketId: string | null; hatchRequestId: string | null };

const DRAFT_07 = 'http://json-schema.org/draft-07/schema#';

/** A SHA-1 commit id, or a SHA-256 one in a repository made with `--object-format=sha256`. */
const COMMIT_SHA: JsonSchema = { type: 'string', pattern: '^(?:[0-9a-f]{40}|[0-9a-f]{64})$' };

const SHORT_NOTE_CHARACTERS = 300;

const SHORT_NOTE: JsonSchema = { type: 'string', maxLength: SHORT_NOTE_CHARACTERS };

const TEXT: JsonSchema = { type: 'string' };

const NULLABLE_TEXT: JsonSchema = { type: ['string', 'null'] };

/** An Acceptance item's label, `A1`, never its text: verification matches a report's items to the ticket's labels exactly. */
const ACCEPTANCE_LABEL: JsonSchema = { type: 'string', pattern: '^A\\d+$' };

function closedObject(properties: Readonly<Record<string, JsonSchema>>, required: readonly string[] = Object.keys(properties)): JsonSchema {
  return {
    type: 'object', properties, required, additionalProperties: false
  };
}

function listOf(items: JsonSchema): JsonSchema {
  return { type: 'array', items };
}

const BUILDER_REPORT_PROPERTIES: Readonly<Record<string, JsonSchema>> = {
  role:       { const: 'builder' },
  outcome:    { enum: ['built', 'blocked', 'cannot-build', 'wound-down', 'needs-declared'] },
  headCommit: COMMIT_SHA,
  acceptance: listOf(closedObject({
    item:         ACCEPTANCE_LABEL,
    state:        { enum: ['met', 'waiver-proposed'] },
    evidence:     SHORT_NOTE,
    waiverReason: TEXT,
  }, ['item', 'state', 'evidence'])),
  alsoFixed:         listOf(closedObject({ summary: TEXT, files: listOf(TEXT), evidence: TEXT })),
  gates:             listOf(closedObject({ name: TEXT, commit: COMMIT_SHA })),
  handoff:           TEXT,
  blockedReason:     NULLABLE_TEXT,
  cannotBuildReason: NULLABLE_TEXT,
};

const BLOCKED_NEEDS_ITS_REASON: JsonSchema = {
  if:   { properties: { outcome: { const: 'blocked' } } },
  then: { properties: { blockedReason: { type: 'string', minLength: 1 } } },
};

/**
 * `blocked` stays for a session that cannot continue at all, with a reason; a question is asked live, so there is no `blockedOn`. `gates`
 * claims each gate the agent ran green and the commit it passed on: never trusted, only held against HEAD before any gate runs.
 * `needs-declared` ends a stage that declared a need on another entity; its branch and commits stay.
 */
export const BUILDER_REPORT_SCHEMA: JsonSchema = {
  $schema: DRAFT_07,
  title:   'builder report',
  ...closedObject(BUILDER_REPORT_PROPERTIES),
  ...BLOCKED_NEEDS_ITS_REASON,
};

const PACKAGE_BUILDER_REPORT_PROPERTIES: Readonly<Record<string, JsonSchema>> = {
  ...BUILDER_REPORT_PROPERTIES,
  outcome:               { enum: ['built', 'blocked', 'cannot-build', 'wound-down', 'needs-declared', 'refused'] },
  exposedSurfaceChanged: { type: 'boolean' },
  refusedReason:         NULLABLE_TEXT,
};

const PACKAGE_BUILDER_REQUIRED_PROPERTIES = Object.keys(PACKAGE_BUILDER_REPORT_PROPERTIES).filter((property) => property !== 'refusedReason');

const REFUSED_NEEDS_ITS_REASON: JsonSchema = {
  if:   { properties: { outcome: { const: 'refused' } } },
  then: { properties: { refusedReason: { type: 'string', minLength: 1 } }, required: ['refusedReason'] },
};

/**
 * Stage 2 of a crossing ticket, the package build: a builder report that also states whether what the package exposes changed from the
 * stage 1 proposal. The statement and the package reviewer's confirmation decide whether the adapt stage runs (E40). `refused`, with
 * its reason, ends a package build whose constitution forbids the change (E22); only a package build may report it.
 */
export const PACKAGE_BUILDER_REPORT_SCHEMA: JsonSchema = {
  $schema: DRAFT_07,
  title:   'package builder report',
  ...closedObject(PACKAGE_BUILDER_REPORT_PROPERTIES, PACKAGE_BUILDER_REQUIRED_PROPERTIES),
  ...BLOCKED_NEEDS_ITS_REASON,
  // The subset has no `allOf`: a one-entry `anyOf` holds the second condition beside the first.
  anyOf:   [REFUSED_NEEDS_ITS_REASON],
};

const ADAPT_BUILDER_REPORT_PROPERTIES: Readonly<Record<string, JsonSchema>> = {
  ...BUILDER_REPORT_PROPERTIES,
  outcome:             { enum: ['built', 'blocked', 'cannot-build', 'wound-down', 'needs-declared', 'package-return'] },
  packageReturnReason: NULLABLE_TEXT,
  packageReturnEntity: NULLABLE_TEXT,
};

const ADAPT_BUILDER_REQUIRED_PROPERTIES = Object.keys(BUILDER_REPORT_PROPERTIES);

const PACKAGE_RETURN_NEEDS_ITS_REASON: JsonSchema = {
  if:   { properties: { outcome: { const: 'package-return' } } },
  then: { properties: { packageReturnReason: { type: 'string', minLength: 1 } }, required: ['packageReturnReason'] },
};

/**
 * Stage 4 of a crossing ticket, adapt: a builder report that may send the ticket back to a sealed package's build (E41). `package-return`,
 * with what the package must give in `packageReturnReason`, ends the stage; `packageReturnEntity` names the package when more than one is
 * sealed. Only an adapt build may report it.
 */
export const ADAPT_BUILDER_REPORT_SCHEMA: JsonSchema = {
  $schema: DRAFT_07,
  title:   'adapt builder report',
  ...closedObject(ADAPT_BUILDER_REPORT_PROPERTIES, ADAPT_BUILDER_REQUIRED_PROPERTIES),
  ...BLOCKED_NEEDS_ITS_REASON,
  // The subset has no `allOf`: a one-entry `anyOf` holds the second condition beside the first.
  anyOf:   [PACKAGE_RETURN_NEEDS_ITS_REASON],
};

const FINDING_DESCRIPTION: Readonly<Record<string, JsonSchema>> = {
  class:    { enum: REVIEW_FINDING_CLASSES },
  severity: { enum: REVIEW_FINDING_SEVERITIES },
  file:     TEXT,
  summary:  TEXT,
  evidence: { enum: REVIEW_FINDING_EVIDENCE_KINDS },
};

const FIXED_FINDING = closedObject({ ...FINDING_DESCRIPTION, outcome: { const: 'fixed' }, commit: COMMIT_SHA });

/** A filed finding names the ticket the Hatch answered with, or the request id `queued` printed: at least one of the two. */
const FILED_FINDING: JsonSchema = {
  ...closedObject({
    ...FINDING_DESCRIPTION, outcome: { const: 'filed' }, filedTicketId: NULLABLE_TEXT, hatchRequestId: NULLABLE_TEXT
  }),
  anyOf: [
    { properties: { filedTicketId: TEXT }, required: ['filedTicketId'] },
    { properties: { hatchRequestId: TEXT }, required: ['hatchRequestId'] },
  ],
};

const REVIEWER_REPORT_PROPERTIES: Readonly<Record<string, JsonSchema>> = {
  role:       { const: 'reviewer' },
  headCommit: COMMIT_SHA,
  claims:     listOf(closedObject({
    item: ACCEPTANCE_LABEL, result: { enum: REVIEW_CLAIM_RESULTS }, handoffContradicted: { type: 'boolean' }, note: SHORT_NOTE
  })),
  findings:   listOf({ oneOf: [FIXED_FINDING, FILED_FINDING] }),
  reviewText: TEXT,
};

/** There is no `file-ticket` outcome: a reviewer files its own out-of-scope findings through the Hatch. */
export const REVIEWER_REPORT_SCHEMA: JsonSchema = {
  $schema: DRAFT_07,
  title:   'reviewer report',
  ...closedObject(REVIEWER_REPORT_PROPERTIES),
};

/** Stage 3 of a crossing ticket, the package review: a reviewer report that confirms or corrects the package builder's statement (E40). */
export const PACKAGE_REVIEWER_REPORT_SCHEMA: JsonSchema = {
  $schema: DRAFT_07,
  title:   'package reviewer report',
  ...closedObject({ ...REVIEWER_REPORT_PROPERTIES, exposedSurfaceConfirmed: { type: 'boolean' } }),
};

/** A builder's or reviewer's report from the Airlock, on a conflict or a red merged tree: `reportKind` is non-null only with `cannot-resolve`. */
export const AIRLOCK_AGENT_REPORT_SCHEMA: JsonSchema = {
  $schema: DRAFT_07,
  title:   'airlock agent report',
  ...closedObject({
    role:          { enum: ['builder', 'reviewer'] },
    outcome:       { enum: ['resolved', 'cannot-resolve'] },
    headCommit:    COMMIT_SHA,
    resolvedFiles: listOf(TEXT),
    notes:         TEXT,
    reportKind:    { enum: ['malformed-ticket', 'system-blocker', null] },
  }),
  if:   { properties: { outcome: { const: 'resolved' } } },
  then: { properties: { reportKind: { const: null } } },
};

/** A line or reference number; that it is at least 1 is Hephaestus's check, which the schema type has no keyword for. */
const LINE_NUMBER: JsonSchema = { type: 'integer' };

/**
 * An effect reader's report: each sentence of the document it resolved, numbered as its marks read, and each place in the tree such a
 * sentence names. A path it cannot place is `unresolved`, with the candidates it found; Hephaestus checks every path against the tree.
 */
export const EFFECT_READING_REPORT_SCHEMA: JsonSchema = {
  $schema: DRAFT_07,
  title:   'effect reading report',
  ...closedObject({
    references: listOf(closedObject({ reference: LINE_NUMBER, lines: closedObject({ from: LINE_NUMBER, to: LINE_NUMBER }), quote: TEXT })),
    entries:    listOf(closedObject({
      reference: LINE_NUMBER, path: TEXT, change: { enum: ['adds', 'changes', 'removes', 'unresolved'] }, detail: TEXT, candidates: listOf(TEXT)
    })),
  }),
};
