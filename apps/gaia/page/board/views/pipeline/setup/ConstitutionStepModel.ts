/**
 * The constitution step's model, pure: the agent's state over the page and in the panel head, who reads the constitution, the outline the
 * footer counts, the SOURCES ticks that steer the agent's next draft, and the commands of Continue and of a tick. The same step edits an
 * applied pipeline's constitution at `pipeline/edit/constitution`, with no stepper and the way back to the flow in place of Back and
 * Continue. In monorepo mode each entity has its own document, drafts, SOURCES and readers, and every command names the entity.
 */
import { PAGE_CONTRACT_VERSIONS }    from '../../../../../src/shared/constants/PageContractVersions.ts';
import type { BoardCommandDocument } from '../../../../@types/board/BoardCommandDocument.ts';
import type {
  BoardConstitutionDraftDocument,
  BoardConstitutionOutlineDocument,
  BoardConstitutionSourcesDocument,
  BoardPipelineEntityDocument,
  BoardPipelineFlowDocument,
  BoardPipelineSetupDocument
} from '../../../../@types/board/BoardPipelineDocuments.ts';
import type { BoardEntityAgentRole, BoardPipelineAgentRole, BoardSetupMode } from '../../../../@types/board/BoardVocabulary.ts';
import { ChatTurnWordingUtil }                                               from '../../../conversation/ChatTurnWordingUtil.ts';
import type { PanelStatus }                                                  from '../PipelinePanel.tsx';
import { NOT_LAUNCHED_PANEL_STATUS, type AgentSessionState }                 from '../agent-panel/AgentSessionModel.ts';
import type { ConstitutionState }                                            from '../entities/ConstitutionStateTagModel.ts';

export type ConstitutionStepMode = 'setup' | 'update';

export type ConstitutionAgentState = 'drafting' | 'ready' | 'not-launched' | 'not-running';

/** The roles' words as READ BY names them; both re-reviewers read as one Re-review. */
const READER_LABELS: Readonly<Record<BoardPipelineAgentRole, string>> = {
  productOwner:       'Ticket creation',
  builder:            'Builder',
  reviewer:           'Review',
  reReviewer:         'Re-review',
  conflictReReviewer: 'Re-review',
  pipelineAgent:      'Pipeline agent',
  assistant:          'Assistant',
};

export type SourceChoiceKey = keyof BoardConstitutionSourcesDocument;

export interface SourceChoice {
  readonly key:   SourceChoiceKey;
  readonly label: string;
  readonly note:  string | null;
  /** The source's name in mono, as a file name. */
  readonly mono:  boolean;
}

/** The SOURCES block in the order drawn. */
export const SOURCE_CHOICES: readonly SourceChoice[] = [
  {
    key: 'contributing', label: 'CONTRIBUTING.md', note: 'also listed as is', mono: true,
  },
  {
    key: 'research', label: 'The research findings', note: null, mono: false,
  },
  {
    key: 'installedDefault', label: 'The installed default', note: 'the generic rules', mono: false,
  },
];

/** An entity's readers as its READ BY names them, each role apart. */
const ENTITY_READER_LABELS: Readonly<Record<BoardEntityAgentRole, string>> = {
  builder:            'Builder',
  reviewer:           'Reviewer',
  reReviewer:         'Re-reviewer',
  conflictReReviewer: 'Conflict re-reviewer',
};

const CONSTITUTION_FILE_NAME = 'CONSTITUTION.md';

const CONTRIBUTING_FILE_NAME = 'CONTRIBUTING.md';

const EMPTY_SOURCES: BoardConstitutionSourcesDocument = { contributing: false, research: false, installedDefault: false };

/** An `update` or `advise` record edits an applied pipeline's constitution; only a first setup walks the steps. */
function stepModeOf(recordMode: BoardSetupMode): ConstitutionStepMode {
  return recordMode === 'setup' ? 'setup' : 'update';
}

/**
 * Drafting while the agent runs and has not said the constitution is ready; not launched while forge refused its launch; with no agent job
 * on the board, not running.
 */
function agentStateOf(setup: BoardPipelineSetupDocument, sessionState: AgentSessionState): ConstitutionAgentState {
  if (sessionState === 'not-launched') return 'not-launched';
  if (sessionState === 'stopped') return 'not-running';
  return setup.record.readyToContinue.includes('constitution') ? 'ready' : 'drafting';
}

const STATUS_LINES: Readonly<Record<ConstitutionAgentState, string>> = {
  'drafting':     'Pipeline agent · drafting from the research',
  'ready':        'Pipeline agent · draft ready',
  'not-launched': 'Pipeline agent · not launched',
  'not-running':  'Pipeline agent · not running',
};

function statusLineOf(agentState: ConstitutionAgentState): string {
  return STATUS_LINES[agentState];
}

const PANEL_STATUSES: Readonly<Record<ConstitutionAgentState, PanelStatus>> = {
  'drafting':     { tone: 'working', text: 'Drafting' },
  'ready':        { tone: 'ready', text: 'Draft ready' },
  'not-launched': NOT_LAUNCHED_PANEL_STATUS,
  'not-running':  { tone: 'idle', text: 'Not running' },
};

/** The panel head's dot and word: "Drafting". */
function panelStatusOf(agentState: ConstitutionAgentState): PanelStatus {
  return PANEL_STATUSES[agentState];
}

/** Builder, Review, Re-review: each word once, in the order the facts list the roles. */
function readerLabelsOf(roles: readonly BoardPipelineAgentRole[]): string[] {
  return [...new Set(roles.map((role) => READER_LABELS[role]))];
}

/** "4 sections · 9 rules"; `null` with no constitution yet. */
function outlineTextOf(outline: BoardConstitutionOutlineDocument | null): string | null {
  if (outline === null) return null;
  const sections = ChatTurnWordingUtil.countTextOf(outline.sectionCount, 'section', 'sections');
  const rules = ChatTurnWordingUtil.countTextOf(outline.ruleCount, 'rule', 'rules');
  return `${sections} · ${rules}`;
}

function footerNoteOf(mode: ConstitutionStepMode): string {
  return mode === 'setup'
    ? 'Builder and reviewers get it from the first build on.'
    : 'Builder and reviewers read it from main once Apply commits it.';
}

/** The text and the revision the editor starts from: an empty document at revision 0 before the agent's first draft. */
function versionOf(constitution: BoardConstitutionDraftDocument | null): { markdown: string; revision: number } {
  return constitution === null ? { markdown: '', revision: 0 } : { markdown: constitution.markdown, revision: constitution.revision };
}

function sourcesOf(constitution: BoardConstitutionDraftDocument | null): BoardConstitutionSourcesDocument {
  return constitution?.draftedFrom ?? EMPTY_SOURCES;
}

/** A tick sends every SOURCES choice with the one flipped, at the facts' revision, with the entity it edits; it never carries the markdown. */
function sourcesCommandOf(setup: BoardPipelineSetupDocument, key: SourceChoiceKey, entityKey: string | null = null): BoardCommandDocument {
  const { constitution } = setup.record;
  const sources = sourcesOf(constitution);
  return {
    boardCommandVersion: PAGE_CONTRACT_VERSIONS.gaiaBoardCommand,
    kind:                'pipeline-constitution-edit',
    setupId:             setup.record.setupId,
    revision:            versionOf(constitution).revision,
    markdown:            null,
    draftedFrom:         { ...sources, [key]: !sources[key] },
    entity:              entityKey,
  };
}

function roleIsAnEntityRole(role: BoardPipelineAgentRole): role is BoardEntityAgentRole {
  return Object.hasOwn(ENTITY_READER_LABELS, role);
}

/** Builder, Reviewer, Re-reviewer, Conflict re-reviewer: the entity's own roles, each named apart; a forge-wide role is not one of them. */
function entityReaderLabelsOf(roles: readonly BoardPipelineAgentRole[]): string[] {
  return roles.filter(roleIsAnEntityRole).map((role) => ENTITY_READER_LABELS[role]);
}

/** "ui or api-client", "a, b or c". */
function alternativesTextOf(words: readonly string[]): string {
  if (words.length <= 1) return words.join('');
  return `${words.slice(0, -1).join(', ')} or ${words.at(-1) ?? ''}`;
}

/** That no other entity's agent reads it, and what a ticket that crosses into a whitelisted package reads there. */
function entityReadersNoteOf(entity: Pick<BoardPipelineEntityDocument, 'whitelist'>): string {
  const whitelist = entity.whitelist ?? [];
  const note = 'No other entity’s agent reads it.';
  if (whitelist.length === 0) return note;
  return `${note} On a ticket that crosses into ${alternativesTextOf(whitelist)}, their agents read their own.`;
}

/** A repository path as a person reads it, without its leading `/`. */
function readablePathOf(path: string): string {
  return path.replace(/^\/+/u, '');
}

/** The file the entity names, else `CONSTITUTION.md` in its first home folder, where Apply commits a new one. */
function entityConstitutionFileOf(entity: Pick<BoardPipelineEntityDocument, 'home' | 'constitutionPath'>): string {
  if (entity.constitutionPath !== null) return readablePathOf(entity.constitutionPath);
  const homeFolder = readablePathOf(entity.home[0] ?? '');
  return homeFolder === '' ? CONSTITUTION_FILE_NAME : `${homeFolder}/${CONSTITUTION_FILE_NAME}`;
}

/** The SOURCES of one entity: the CONTRIBUTING.md in its first home folder and its own research findings. */
function entitySourceChoicesOf(entityKey: string, entity: Pick<BoardPipelineEntityDocument, 'home'>): SourceChoice[] {
  const homeFolder = readablePathOf(entity.home[0] ?? '');
  const labels: Readonly<Record<SourceChoiceKey, string>> = {
    contributing:     homeFolder === '' ? CONTRIBUTING_FILE_NAME : `${homeFolder}/${CONTRIBUTING_FILE_NAME}`,
    research:         `${entityKey}’s research findings`,
    installedDefault: 'The installed default',
  };
  return SOURCE_CHOICES.map((choice) => ({ ...choice, label: labels[choice.key] }));
}

/**
 * The entity's setup facts as the step reads a single pipeline's: its own session, questions and findings from the level's facts, and
 * its own draft, document, tags and readers in place of the forge's.
 */
function entitySetupOf(levelSetup: BoardPipelineSetupDocument, entityKey: string): BoardPipelineSetupDocument {
  const parts = levelSetup.record.entities ?? {};
  const part = Object.hasOwn(parts, entityKey) ? parts[entityKey] : undefined;
  const entityFacts = levelSetup.entities ?? {};
  const facts = Object.hasOwn(entityFacts, entityKey) ? entityFacts[entityKey] : undefined;
  return {
    ...levelSetup,
    record:              { ...levelSetup.record, constitution: part?.constitution ?? null },
    constitutionHtml:    facts?.constitutionHtml ?? null,
    constitutionOutline: facts?.constitutionOutline ?? null,
    annotations:         facts?.annotations ?? [],
    readByRoles:         facts?.readByRoles ?? [],
  };
}

/**
 * The text an adopted constitution holds on main, as the entity's flow resolved its instruction entry; `null` when the flow carries none
 * or cut it short, so the step never offers to edit a part of the file.
 */
function adoptedTextOf(flow: Pick<BoardPipelineFlowDocument, 'nodes'> | null): string | null {
  const entries = (flow?.nodes ?? []).flatMap((node) => node.instructionEntries);
  const constitution = entries.find((resolved) => resolved.entry.kind === 'constitution' && resolved.text !== null && !resolved.textIsCut);
  return constitution?.text ?? null;
}

/**
 * The text and revision the entity's editor starts from: the file on main for an adopted one, else its draft; `null`, and no editor, for a
 * root kept for a person or an adopted file the flow does not hold whole.
 */
function entityEditorVersionOf(
  state: ConstitutionState,
  flow: Pick<BoardPipelineFlowDocument, 'nodes'> | null,
  draft: BoardConstitutionDraftDocument | null,
): { markdown: string; revision: number } | null {
  if (state === 'kept-for-a-person') return null;
  if (state !== 'adopted') return versionOf(draft);
  const adoptedText = adoptedTextOf(flow);
  return adoptedText === null ? null : { markdown: adoptedText, revision: 0 };
}

const KEPT_FOR_A_PERSON_NOTE = 'It is kept for a person: it has no constitution, and agents change its files only through an app’s reach.';

/** What shows in place of the editor when the entity has none. */
function entityEditNoteOf(state: ConstitutionState, fileName: string): string {
  return state === 'kept-for-a-person' ? KEPT_FOR_A_PERSON_NOTE : `The pipeline keeps ${fileName} as it is. Ask the pipeline agent to draft a new one.`;
}

/** What Preview shows while there is no rendered document. */
function entityPreviewNoteOf(state: ConstitutionState, fileName: string, entityKey: string): string {
  return state === 'adopted' ? `${fileName} stays as it is, byte for byte.` : `The agent has not drafted ${entityKey}’s constitution yet.`;
}

const ENTITY_STATUS_LINES: Readonly<Record<ConstitutionAgentState, (entityKey: string) => string>> = {
  'drafting':     (entityKey) => `Pipeline agent · drafting ${entityKey}’s constitution`,
  'ready':        () => STATUS_LINES.ready,
  'not-launched': () => STATUS_LINES['not-launched'],
  'not-running':  () => STATUS_LINES['not-running'],
};

function entityStatusLineOf(agentState: ConstitutionAgentState, entityKey: string): string {
  return ENTITY_STATUS_LINES[agentState](entityKey);
}

function continueCommandOf(setup: BoardPipelineSetupDocument): BoardCommandDocument {
  return {
    boardCommandVersion: PAGE_CONTRACT_VERSIONS.gaiaBoardCommand, kind: 'pipeline-setup-step', setupId: setup.record.setupId, step: 'constitution', move: 'continue'
  };
}

function continueHasAttention(setup: BoardPipelineSetupDocument): boolean {
  return setup.record.readyToContinue.includes('constitution');
}

export const ConstitutionStepModel = Object.freeze({
  stepModeOf,
  agentStateOf,
  statusLineOf,
  panelStatusOf,
  readerLabelsOf,
  outlineTextOf,
  footerNoteOf,
  versionOf,
  sourcesOf,
  sourcesCommandOf,
  entityReaderLabelsOf,
  entityReadersNoteOf,
  entityConstitutionFileOf,
  entitySourceChoicesOf,
  entitySetupOf,
  adoptedTextOf,
  entityEditorVersionOf,
  entityEditNoteOf,
  entityPreviewNoteOf,
  entityStatusLineOf,
  continueCommandOf,
  continueHasAttention,
});
