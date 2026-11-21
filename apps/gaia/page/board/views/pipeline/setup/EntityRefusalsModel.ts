/**
 * The entities step's refusals, pure: the refusals the forge serves for its stored entities draft, each with the forge's own sentence, the
 * entity whose row shows it and, where the forge serves one, the gesture that resolves it. Nothing is checked here: Continue and Apply wait
 * on what the forge serves.
 */
import type { BoardDraftEditDocument, BoardPipelineSetupDocument } from '../../../../@types/board/BoardPipelineDocuments.ts';

export interface EntityRefusalFix {
  readonly label: string;
  readonly edits: readonly BoardDraftEditDocument[];
}

export interface EntityRefusalView {
  /** The forge's sentence, unchanged. */
  readonly text:      string;
  /** The entity whose row shows the refusal: Show opens it. */
  readonly entityKey: string;
  readonly fix:       EntityRefusalFix | null;
}

function refusalsOf(setup: Pick<BoardPipelineSetupDocument, 'entityRefusals'>): EntityRefusalView[] {
  return setup.entityRefusals.map((refusal) => ({ text: refusal.text, entityKey: refusal.shownOn, fix: refusal.fix }));
}

export const EntityRefusalsModel = Object.freeze({ refusalsOf });
