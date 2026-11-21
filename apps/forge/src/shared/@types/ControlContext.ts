/**
 * What the control service takes from its caller besides the command and the hold: the wording of the messages a User setup move sends to
 * the pipeline agent, since no `src/` layer words a message and the words live in `cli/`, the reading of main's `CONSTITUTION.md`,
 * which Hephaestus's instruction files own, and the live Hephaestus of a board, which only the caller's process can judge.
 */
import type {
  ConstitutionSources,
  MainConstitutionReading,
  PipelineCheck,
  PipelineDraftField,
  PipelineSetupMode,
  PipelineSetupStep,
  SetupQuestionReply
} from '../../lib/tracker-model/@types/PipelineSetup.ts';
import type { PipelineFieldValue } from '../../lib/tracker-model/utils/PipelineChangeUtil.ts';

/** One field a draft move changed, with the value the draft holds now; `null` when the draft holds none there. */
export interface DraftFieldValue {
  field: PipelineDraftField;
  value: PipelineFieldValue | null;
}

/**
 * A User move on the setup record that the pipeline agent must hear about, or the end of User's check, as values. The agent has no read of
 * the record, so a move carries what it changed: the constitution's new text or ticks (`null` when unchanged), and each draft field the
 * move changed with its value now.
 */
export type SetupMessage =
  | { kind: 'question-answered'; setupId: string; questionId: string; reply: SetupQuestionReply }
  | { kind: 'step-continued'; setupId: string; mode: PipelineSetupMode; step: PipelineSetupStep; currentStep: PipelineSetupStep }
  | { kind: 'constitution-edited'; setupId: string; revision: number; markdown: string | null; draftedFrom: ConstitutionSources | null }
  | {
    kind:                   'draft-edited';
    setupId:                string;
    draftRevision:          number;
    editIds:                readonly string[];
    fields:                 readonly PipelineDraftField[];
    changes:                readonly DraftFieldValue[];
    /** Why the entity validator refuses the draft's entities after the edit, each as the refusal's reason; empty when none stands. */
    standingEntityRefusals: readonly string[];
  }
  | {
    kind: 'draft-edit-undone'; setupId: string; draftRevision: number; editId: string; field: PipelineDraftField; changes: readonly DraftFieldValue[]
  }
  | {
    kind:          'draft-batch-undone';
    setupId:       string;
    draftRevision: number;
    editIds:       readonly string[];
    fields:        readonly PipelineDraftField[];
    changes:       readonly DraftFieldValue[];
  }
  | { kind: 'draft-discarded'; setupId: string; draftRevision: number; changes: readonly DraftFieldValue[] }
  | { kind: 'setup-resumed'; setupId: string; mainMovedByCommits: number; changedPaths: readonly string[] }
  | { kind: 'check-requested'; setupId: string; draftRevision: number; gateNames: readonly string[] }
  /** Hephaestus's, once the check ended `checked` or `cannot-run`. */
  | { kind: 'check-ended'; setupId: string; check: Readonly<PipelineCheck> };

/** The live Hephaestus a by-hand delivery is refused for: where it serves, and the Hephaestus lock that names it. */
export interface LiveHephaestus {
  url:                    string;
  hephaestusLockFilePath: string;
}

export interface ControlContext {
  setupMessageWordingOf: (message: SetupMessage) => string;
  /**
   * Main's `CONSTITUTION.md` in the repository at `rootDirectory`, as git answers for it on the main line; with a project path, that file
   * instead, an entity's constitution.
   */
  mainConstitutionOf:    (rootDirectory: string, constitutionPath?: string) => MainConstitutionReading;
  /**
   * The live Hephaestus that owns the lifecycle of the board in this data folder; `null` where the applier runs inside it, which applies its
   * own commands in its own hold.
   */
  liveHephaestusOf:      (dataFolder: string) => LiveHephaestus | null;
}
