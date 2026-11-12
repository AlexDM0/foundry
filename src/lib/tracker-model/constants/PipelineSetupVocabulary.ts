/** The setup record's closed vocabularies, its id prefixes and its bounds, shared by the Board's moves and the stored file's read. */
import type { PipelineBilling } from '../@types/Pipeline.ts';
import type {
  ApplyRequestReason,
  ApplyRequestState,
  ConstitutionSources,
  GateCandidacy,
  PipelineSetupMode,
  PipelineSetupStep,
  PipelineSetupStepState,
  ResearchFindingTopic,
  SetupEditAuthor,
  SetupQuestionStep,
  SetupQuestionSubjectKind,
  SourceAnnotationKind
} from '../@types/PipelineSetup.ts';

/** The steps in the order the setup walks them. */
export const PIPELINE_SETUP_STEPS = ['billing', 'research', 'constitution', 'design', 'apply'] as const satisfies readonly PipelineSetupStep[];

export const PIPELINE_SETUP_STEP_STATES = ['not-started', 'in-progress', 'done', 'needs-recheck'] as const satisfies readonly PipelineSetupStepState[];

export const PIPELINE_BILLING_MODES = ['subscription', 'api'] as const satisfies readonly PipelineBilling['mode'][];

export const PIPELINE_SETUP_MODES = ['setup', 'update', 'advise'] as const satisfies readonly PipelineSetupMode[];

export const RESEARCH_FINDING_TOPICS = ['stack', 'scripts', 'conventions', 'continuous-integration', 'note'] as const satisfies readonly ResearchFindingTopic[];

export const GATE_CANDIDACIES = ['gate', 'not-a-gate', 'unsure'] as const satisfies readonly GateCandidacy[];

export const SETUP_QUESTION_STEPS = ['research', 'constitution', 'design'] as const satisfies readonly SetupQuestionStep[];

export const SETUP_QUESTION_SUBJECT_KINDS = ['node', 'gate', 'rule', 'finding'] as const satisfies readonly SetupQuestionSubjectKind[];

export const SOURCE_ANNOTATION_KINDS = ['contributing', 'research', 'installed-default'] as const satisfies readonly SourceAnnotationKind[];

export const SETUP_EDIT_AUTHORS = ['agent', 'user'] as const satisfies readonly SetupEditAuthor[];

export const APPLY_REQUEST_STATES = ['committing', 'held', 'refused'] as const satisfies readonly ApplyRequestState[];

export const APPLY_REQUEST_REASONS = [
  'not-on-target-branch',
  'dirty-checkout',
  'target-file-held',
  'git-failed',
  'constitution-commit-unsigned',
  'constitution-commit-unexpected-paths',
  'constitution-moved',
] as const satisfies readonly ApplyRequestReason[];

/** While a request is in these states, the revision being committed must not change, so every other move refuses. */
export const PENDING_APPLY_REQUEST_STATES = ['committing', 'held'] as const satisfies readonly ApplyRequestState[];

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
