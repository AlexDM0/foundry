/**
 * The Pipeline documents section's model, pure: when the builder and the reviewer read each document of a ticket (the spec and the plan),
 * the role's defaults and fixed documents as the forge serves them, the rows with their choices, the rules a Save stores (only those that
 * differ from the default, as an absent rule is the default), and the reviewer's read-only line on what the builder reads.
 */
import type { BoardDocumentReadingRole, BoardLimitsDocument } from '../../../../@types/board/BoardFactDocuments.ts';
import type { BoardAgentStepSettingsDocument }                from '../../../../@types/board/BoardPipelineDocuments.ts';
import {
  BOARD_DOCUMENT_READING_RULES,
  BOARD_TICKET_DOCUMENT_KINDS,
  type BoardDocumentReadingRule,
  type BoardTicketDocumentKind
} from '../../../../@types/board/BoardVocabulary.ts';

/** The roles a pipeline document is given to; the re-reviewers read the reviewer's rules. */
export type DocumentReadingRole = BoardDocumentReadingRole;

/** What a role reads where its pipeline stores no rule, and the documents it reads at that rule whatever is stored, as the forge serves them. */
export type DocumentReadingDefaults = Pick<BoardLimitsDocument, 'defaultDocumentsOfRole' | 'fixedDocumentsOfRole'>;

export type DocumentReadingRules = Readonly<Record<BoardTicketDocumentKind, BoardDocumentReadingRule>>;

export interface DocumentRuleChoiceView {
  readonly value:    BoardDocumentReadingRule;
  readonly label:    string;
  readonly disabled: boolean;
}

export interface DocumentRowView {
  readonly document:  BoardTicketDocumentKind;
  readonly title:     string;
  readonly hint:      string | null;
  readonly groupName: string;
  readonly choices:   readonly DocumentRuleChoiceView[];
  readonly selected:  BoardDocumentReadingRule;
}

const RULE_LABELS: Readonly<Record<BoardDocumentReadingRule, string>> = Object.freeze({
  'always':             'Always',
  'if-person-approved': 'If you approved it',
  'never':              'Never',
});

const DOCUMENT_TITLES: Readonly<Record<BoardTicketDocumentKind, string>> = Object.freeze({ spec: 'Spec', plan: 'Plan' });

const ROLE_WORDS: Readonly<Record<DocumentReadingRole, string>> = Object.freeze({ builder: 'builder', reviewer: 'reviewer' });

const REVIEWER_HINTS: Readonly<Partial<Record<BoardTicketDocumentKind, string>>> = Object.freeze({ plan: 'An agent-only plan is another agent\'s opinion; leave it out.', });

const WORDS = Object.freeze({
  title:            'Pipeline documents',
  /** The pill beside the title: the section is new to these dialogs. */
  newPill:          'New',
  lead:             'Read after the brief, in pipeline order',
  explanationTerm:  'If you approved it',
  explanation:      'gives the last version a person approved. A plan changed since then, or one the pipeline approved, is given at your approved version, or left out.',
  builderTerm:      'Builder',
  runsTerm:         'Runs',
  reviewerRuns:     'Once per build, after the build gates pass.',
  builderEditorEnd: 'Change it in the Builder\'s editor.',
});

function isDocumentReadingRole(role: string): role is DocumentReadingRole {
  return role === 'builder' || role === 'reviewer';
}

function defaultRulesOf(role: DocumentReadingRole, defaults: DocumentReadingDefaults): DocumentReadingRules {
  return defaults.defaultDocumentsOfRole[role];
}

/** The rule a role reads a document at whatever its pipeline stores, `null` for a document whose rule it may choose. */
function fixedRuleOf(role: DocumentReadingRole, document: BoardTicketDocumentKind, defaults: DocumentReadingDefaults): BoardDocumentReadingRule | null {
  return defaults.fixedDocumentsOfRole[role].includes(document) ? defaults.defaultDocumentsOfRole[role][document] : null;
}

/** The stored rules over the role's defaults; a fixed document stays at its rule whatever is stored. */
function rulesOf(role: DocumentReadingRole, stored: BoardAgentStepSettingsDocument['documents'] | undefined, defaults: DocumentReadingDefaults): DocumentReadingRules {
  const ruleOf = (document: BoardTicketDocumentKind): BoardDocumentReadingRule => (
    fixedRuleOf(role, document, defaults) ?? stored?.[document] ?? defaults.defaultDocumentsOfRole[role][document]
  );
  return { spec: ruleOf('spec'), plan: ruleOf('plan') };
}

/** The rules a Save stores: each that differs from the role's default; none at all when every rule is the default. */
function storedRulesOf(
  role: DocumentReadingRole, rules: DocumentReadingRules, defaults: DocumentReadingDefaults
): Partial<Record<BoardTicketDocumentKind, BoardDocumentReadingRule>> | null {
  const defaultRules = defaultRulesOf(role, defaults);
  const differing = BOARD_TICKET_DOCUMENT_KINDS.filter((document) => rules[document] !== defaultRules[document]);
  if (differing.length === 0) return null;
  return Object.fromEntries(differing.map((document) => [document, rules[document]]));
}

function rowsOf(role: DocumentReadingRole, rules: DocumentReadingRules, defaults: DocumentReadingDefaults): DocumentRowView[] {
  return BOARD_TICKET_DOCUMENT_KINDS.map((document) => {
    const fixed = fixedRuleOf(role, document, defaults);
    return {
      document,
      title:     DOCUMENT_TITLES[document],
      hint:      role === 'reviewer' ? REVIEWER_HINTS[document] ?? null : null,
      groupName: `When the ${ROLE_WORDS[role]} reads the ${document}`,
      choices:   BOARD_DOCUMENT_READING_RULES.map((value) => ({ value, label: RULE_LABELS[value], disabled: fixed !== null && value !== fixed })),
      selected:  rules[document],
    };
  });
}

function withRule(rules: DocumentReadingRules, document: BoardTicketDocumentKind, rule: BoardDocumentReadingRule): DocumentReadingRules {
  return { ...rules, [document]: rule };
}

/** "the spec", "the spec and the plan". */
function documentListOf(documents: readonly BoardTicketDocumentKind[]): string {
  return documents.map((document) => `the ${document}`).join(' and ');
}

/** "Reads the spec and the plan, always.", "Reads the spec, always, and the plan if you approved it.", "Never the plan." */
function builderReadingTextOf(rules: DocumentReadingRules): string {
  const documentsWith = (rule: BoardDocumentReadingRule): BoardTicketDocumentKind[] => BOARD_TICKET_DOCUMENT_KINDS.filter((document) => rules[document] === rule);
  const always = documentsWith('always');
  const ifApproved = documentsWith('if-person-approved');
  const never = documentsWith('never');
  const readParts = [
    ...(always.length === 0 ? [] : [`${documentListOf(always)}, always`]),
    ...(ifApproved.length === 0 ? [] : [`${documentListOf(ifApproved)} if you approved it`]),
  ];
  const reads = readParts.length === 0 ? 'Reads no pipeline document.' : `Reads ${readParts.join(', and ')}.`;
  const neverText = never.length === 0 || readParts.length === 0 ? '' : ` Never ${documentListOf(never)}.`;
  return `${reads}${neverText} ${WORDS.builderEditorEnd}`;
}

export const PipelineDocumentsSectionModel = Object.freeze({
  WORDS,
  builderReadingTextOf,
  defaultRulesOf,
  isDocumentReadingRole,
  rowsOf,
  rulesOf,
  storedRulesOf,
  withRule,
});
