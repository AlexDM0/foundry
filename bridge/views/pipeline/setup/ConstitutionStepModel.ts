/**
 * The constitution step's model, pure: the agent's state over the page and in the panel head, who reads the constitution, the outline the
 * footer counts, the SOURCES ticks that steer the agent's next draft, and the commands of Continue and of a tick. The same step edits an
 * applied pipeline's constitution at `#pipeline/edit/constitution`, with no stepper and the way back to the flow in place of Back and
 * Continue.
 */
import type { PipelineAgentRole }                                         from '../../../../src/lib/tracker-model/@types/Pipeline.ts';
import type { ConstitutionOutline, PipelineSetupFacts }                   from '../../../../src/lib/tracker-model/@types/PipelineFacts.ts';
import type { ConstitutionDraft, ConstitutionSources, PipelineSetupMode } from '../../../../src/lib/tracker-model/@types/PipelineSetup.ts';
import type { ControlCommandBody }                                        from '../../../api/CommandClient.ts';
import { ChatTurnWordingUtil }                                            from '../../../conversation/ChatTurnWordingUtil.ts';
import type { PanelStatus }                                               from '../PipelinePanel.tsx';

export type ConstitutionStepMode = 'setup' | 'update';

export type ConstitutionAgentState = 'drafting' | 'ready' | 'not-running';

/** The roles' words as READ BY names them; both re-reviewers read as one Re-review. */
const READER_LABELS: Readonly<Record<PipelineAgentRole, string>> = {
  productOwner:       'Ticket creation',
  builder:            'Builder',
  reviewer:           'Review',
  reReviewer:         'Re-review',
  conflictReReviewer: 'Re-review',
  pipelineAgent:      'Pipeline agent',
  assistant:          'Assistant',
};

export type SourceChoiceKey = keyof ConstitutionSources;

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

const EMPTY_SOURCES: ConstitutionSources = { contributing: false, research: false, installedDefault: false };

/** An `update` or `advise` record edits an applied pipeline's constitution; only a first setup walks the steps. */
function stepModeOf(recordMode: PipelineSetupMode): ConstitutionStepMode {
  return recordMode === 'setup' ? 'setup' : 'update';
}

/** Drafting while the agent runs and has not said the constitution is ready; with no agent job on the board, not running. */
function agentStateOf(setup: PipelineSetupFacts): ConstitutionAgentState {
  if (setup.agentJobState === null) return 'not-running';
  return setup.record.readyToContinue.includes('constitution') ? 'ready' : 'drafting';
}

const STATUS_LINES: Readonly<Record<ConstitutionAgentState, string>> = {
  'drafting':    'Pipeline agent · drafting from the research',
  'ready':       'Pipeline agent · draft ready',
  'not-running': 'Pipeline agent · not running',
};

function statusLineOf(setup: PipelineSetupFacts): string {
  return STATUS_LINES[agentStateOf(setup)];
}

const PANEL_STATUSES: Readonly<Record<ConstitutionAgentState, PanelStatus>> = {
  'drafting':    { tone: 'working', text: 'Drafting' },
  'ready':       { tone: 'ready', text: 'Draft ready' },
  'not-running': { tone: 'idle', text: 'Not running' },
};

/** The panel head's dot and word: "Drafting". */
function panelStatusOf(setup: PipelineSetupFacts): PanelStatus {
  return PANEL_STATUSES[agentStateOf(setup)];
}

/** Builder, Review, Re-review: each word once, in the order the facts list the roles. */
function readerLabelsOf(roles: readonly PipelineAgentRole[]): string[] {
  return [...new Set(roles.map((role) => READER_LABELS[role]))];
}

/** "4 sections · 9 rules"; `null` with no constitution yet. */
function outlineTextOf(outline: ConstitutionOutline | null): string | null {
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
function versionOf(constitution: ConstitutionDraft | null): { markdown: string; revision: number } {
  return constitution === null ? { markdown: '', revision: 0 } : { markdown: constitution.markdown, revision: constitution.revision };
}

function sourcesOf(constitution: ConstitutionDraft | null): ConstitutionSources {
  return constitution?.draftedFrom ?? EMPTY_SOURCES;
}

/** A tick sends every SOURCES choice with the one flipped, at the facts' revision; it never carries the markdown. */
function sourcesCommandOf(setup: PipelineSetupFacts, key: SourceChoiceKey): ControlCommandBody {
  const { constitution } = setup.record;
  const sources = sourcesOf(constitution);
  return {
    kind:        'pipeline-constitution-edit',
    setupId:     setup.record.setupId,
    revision:    versionOf(constitution).revision,
    draftedFrom: { ...sources, [key]: !sources[key] },
  };
}

function continueCommandOf(setup: PipelineSetupFacts): ControlCommandBody {
  return {
    kind: 'pipeline-setup-step', setupId: setup.record.setupId, step: 'constitution', move: 'continue'
  };
}

function continueHasAttention(setup: PipelineSetupFacts): boolean {
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
  continueCommandOf,
  continueHasAttention,
});
