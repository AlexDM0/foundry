/** The setup record's closed vocabularies, its id prefixes and its bounds, shared by the Board's moves and the stored file's read. */
import type { PipelineBilling } from '../@types/Pipeline.ts';
import type {
  ApplyRequestReason,
  ApplyRequestState,
  CheckedGateVerdict,
  ConstitutionSources,
  EntityChangeRefusalReason,
  GateCandidacy,
  PipelineCheckState,
  PipelineSetupMode,
  PipelineSetupStep,
  PipelineSetupStepState,
  ResearchFindingTopic,
  SetupEditAuthor,
  SetupQuestionStep,
  SetupQuestionSubjectKind,
  SourceAnnotationKind
} from '../@types/PipelineSetup.ts';

/** The steps in the order the setup walks them; a record walks `entities` only while its step states hold it. */
export const PIPELINE_SETUP_STEPS = ['billing', 'research', 'entities', 'constitution', 'design', 'apply'] as const satisfies readonly PipelineSetupStep[];

export const PIPELINE_SETUP_STEP_STATES = ['not-started', 'in-progress', 'done', 'needs-recheck'] as const satisfies readonly PipelineSetupStepState[];

export const PIPELINE_BILLING_MODES = ['subscription', 'api'] as const satisfies readonly PipelineBilling['mode'][];

export const PIPELINE_SETUP_MODES = ['setup', 'update', 'advise'] as const satisfies readonly PipelineSetupMode[];

export const RESEARCH_FINDING_TOPICS = ['stack', 'scripts', 'conventions', 'continuous-integration', 'note', 'layout'] as const satisfies readonly ResearchFindingTopic[];

export const GATE_CANDIDACIES = ['gate', 'not-a-gate', 'unsure'] as const satisfies readonly GateCandidacy[];

export const SETUP_QUESTION_STEPS = ['research', 'entities', 'constitution', 'design'] as const satisfies readonly SetupQuestionStep[];

/** A first setup walks the `entities` step once research found this many stand-alone codebases: several, so monorepo mode can pay off. */
export const LAYOUT_FINDINGS_PROPOSING_ENTITIES = 2;

export const SETUP_QUESTION_SUBJECT_KINDS = ['node', 'gate', 'rule', 'finding'] as const satisfies readonly SetupQuestionSubjectKind[];

export const SOURCE_ANNOTATION_KINDS = ['contributing', 'research', 'installed-default'] as const satisfies readonly SourceAnnotationKind[];

export const SETUP_EDIT_AUTHORS = ['agent', 'user'] as const satisfies readonly SetupEditAuthor[];

export const APPLY_REQUEST_STATES = ['committing', 'held', 'refused'] as const satisfies readonly ApplyRequestState[];

export const APPLY_REQUEST_REASONS = [
  'interrupted',
  'not-on-target-branch',
  'dirty-checkout',
  'target-file-held',
  'git-failed',
  'constitution-commit-unsigned',
  'constitution-commit-unexpected-paths',
  'constitution-moved',
  'pipeline-moved',
  'entity-named-by-tickets',
  'entities-while-tickets-in-flight',
] as const satisfies readonly ApplyRequestReason[];

export const ENTITY_CHANGE_REFUSAL_REASONS = ['entity-named-by-tickets', 'entities-while-tickets-in-flight'] as const satisfies readonly EntityChangeRefusalReason[];

/** A request held for this reason waits for User's `resume --all`; no sweep commits it again by itself. */
export const INTERRUPTED_APPLY_REASON = 'interrupted' satisfies ApplyRequestReason;

/** While a request is in these states, the revision being committed must not change, so every other move refuses. */
export const PENDING_APPLY_REQUEST_STATES = ['committing', 'held'] as const satisfies readonly ApplyRequestState[];

export const PIPELINE_CHECK_STATES = ['queued', 'running', 'checked', 'cannot-run', 'stopped'] as const satisfies readonly PipelineCheckState[];

/** While a check is in these states, a second request refuses `pipeline-check-running`. */
export const UNFINISHED_PIPELINE_CHECK_STATES = ['queued', 'running'] as const satisfies readonly PipelineCheckState[];

export const CHECKED_GATE_VERDICTS = ['green', 'red', 'cannot-run', 'disagreeing'] as const satisfies readonly CheckedGateVerdict[];

/** The stored reason of a check whose run found no gate the draft touches any more. */
export const NO_TOUCHED_GATE_REASON = 'no-touched-gate';

/** The most of a gate's or the prepare steps' output a check stores, in characters, kept from the end. */
export const CHECK_OUTPUT_LIMIT_CHARACTERS = 4_000;

/** The number the first setup a tracker opens takes, `S1`: the lowest `nextSetupId` a progress file may store. */
export const FIRST_SETUP_NUMBER = 1;

/** The number a record's first finding, question and edit take: `F1`, `Q1`, `E1`. */
export const FIRST_SETUP_ITEM_NUMBER = 1;

export const SETUP_ID_PREFIX = 'S';

export const FINDING_ID_PREFIX = 'F';

export const SETUP_QUESTION_ID_PREFIX = 'Q';

export const SETUP_EDIT_ID_PREFIX = 'E';

/** A setup question's options are lettered in the order given: two to four of them, and no Other option. */
export const SETUP_QUESTION_OPTION_LETTERS = ['a', 'b', 'c', 'd'] as const;

export const MINIMUM_SETUP_QUESTION_OPTIONS = 2;

/** The longest constitution the pipeline agent or User may store, in characters. */
export const CONSTITUTION_LIMIT_CHARACTERS = 20_000;

/** What A3b ticks before User changes it: CONTRIBUTING.md and the research, not the installed default. */
export const DEFAULT_CONSTITUTION_SOURCES: Readonly<ConstitutionSources> = Object.freeze({ contributing: true, research: true, installedDefault: false });
