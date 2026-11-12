/**
 * What the control service takes from its caller besides the command and the hold: the wording of the messages a User setup move sends to
 * the pipeline agent, since no `src/` layer words a message and the words live in `cli/`.
 */
import type { PipelineDraftField, PipelineSetupStep, SetupQuestionReply } from '../../lib/tracker-model/@types/PipelineSetup.ts';

/** A User move on the setup record that the pipeline agent must hear about, as values. */
export type SetupMessage =
  | { kind: 'question-answered'; setupId: string; questionId: string; reply: SetupQuestionReply }
  | { kind: 'step-continued'; setupId: string; step: PipelineSetupStep; currentStep: PipelineSetupStep }
  | { kind: 'constitution-edited'; setupId: string; revision: number; markdownChanged: boolean; sourcesChanged: boolean }
  | { kind: 'draft-edited'; setupId: string; draftRevision: number; editIds: readonly string[]; fields: readonly PipelineDraftField[] }
  | { kind: 'draft-edit-undone'; setupId: string; draftRevision: number; editId: string; field: PipelineDraftField }
  | { kind: 'draft-discarded'; setupId: string; draftRevision: number };

export interface ControlContext {
  setupMessageWordingOf: (message: SetupMessage) => string;
}
