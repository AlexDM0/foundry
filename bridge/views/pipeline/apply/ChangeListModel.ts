/**
 * The change list's model, pure: each row of the facts' change list worded from its field and its kind, with the sentence of the edit
 * that made it and who made it, and the Undo command, which sends that edit's id. A row that no edit made has no Undo.
 */
import { GATE_PHASES, type GatePhase }                         from '../../../../src/lib/tracker-model/@types/GatePhase.ts';
import { PIPELINE_AGENT_ROLES, type PipelineAgentRole }        from '../../../../src/lib/tracker-model/@types/Pipeline.ts';
import type { PipelineChange, PipelineChangeKind }             from '../../../../src/lib/tracker-model/@types/PipelineFacts.ts';
import type { PipelineDraftField, SetupEdit, SetupEditAuthor } from '../../../../src/lib/tracker-model/@types/PipelineSetup.ts';
import type { ControlCommandBody }                             from '../../../api/CommandClient.ts';

export interface ChangeRowView {
  readonly field:      PipelineDraftField;
  readonly change:     PipelineChangeKind;
  readonly title:      string;
  /** What the field is and how it changed, so the row never reads by its colour alone. */
  readonly location:   string;
  /** The edit's own sentence with its author; null when no edit made the change. */
  readonly note:       string | null;
  readonly undoEditId: string | null;
}

/** What a field names: its title and the kind of thing it is. */
export interface FieldWords {
  readonly title: string;
  readonly place: string;
}

const ROLE_TITLES: Readonly<Record<PipelineAgentRole, string>> = Object.freeze({
  productOwner:       'Ticket creation',
  builder:            'Builder',
  reviewer:           'Review',
  reReviewer:         'Re-review',
  conflictReReviewer: 'Re-review after a conflict',
  pipelineAgent:      'Pipeline agent',
  assistant:          'Assistant',
});

const PHASE_TITLES: Readonly<Record<GatePhase, string>> = Object.freeze({ build: 'Build gates', review: 'Review gates', merge: 'Merge gates' });

const CHANGE_WORDS: Readonly<Record<PipelineChangeKind, string>> = Object.freeze({ changed: 'changed', new: 'new', removed: 'removed' });

const AUTHOR_WORDS: Readonly<Record<SetupEditAuthor, string>> = Object.freeze({ agent: 'Pipeline agent', user: 'User' });

const GATE_PREFIX = 'gate:';

const PREPARE_PREFIX = 'prepare:';

function fieldWordsOf(field: PipelineDraftField): FieldWords {
  if (field.startsWith(GATE_PREFIX)) return { title: field.slice(GATE_PREFIX.length), place: 'gate' };
  if (field.startsWith(PREPARE_PREFIX)) return { title: field.slice(PREPARE_PREFIX.length), place: 'prepare step' };
  const orderedPhase = GATE_PHASES.find((phase) => field === `phase-order:${phase}`);
  if (orderedPhase !== undefined) return { title: PHASE_TITLES[orderedPhase], place: 'order' };
  const role = PIPELINE_AGENT_ROLES.find((candidate) => field === `role:${candidate}`);
  if (role !== undefined) return { title: ROLE_TITLES[role], place: 'agent step' };
  switch (field) {
    case 'prepare-order':
      return { title: 'Prepare steps', place: 'order' };
    case 'review':
      return { title: 'Review', place: 'step' };
    case 'airlock':
      return { title: 'Merge train', place: 're-review' };
    case 'approval:tickets':
      return { title: 'Human ticket review', place: 'switch' };
    case 'approval:merge':
      return { title: 'Human code review', place: 'switch' };
    default:
      return { title: 'Constitution', place: 'CONSTITUTION.md' };
  }
}

function noteOf(edit: SetupEdit | undefined): string | null {
  return edit === undefined ? null : `${AUTHOR_WORDS[edit.by]}: ${edit.summary}`;
}

function changeRowsOf(changeList: readonly PipelineChange[], edits: readonly SetupEdit[]): ChangeRowView[] {
  return changeList.map((change) => {
    const words = fieldWordsOf(change.field);
    const edit = change.editId === null ? undefined : edits.find((candidate) => candidate.editId === change.editId);
    return {
      field:      change.field,
      change:     change.changeKind,
      title:      words.title,
      location:   `${words.place} · ${CHANGE_WORDS[change.changeKind]}`,
      note:       noteOf(edit),
      undoEditId: change.editId,
    };
  });
}

function undoCommandOf(setupId: string, editId: string): ControlCommandBody {
  return { kind: 'pipeline-draft-undo', setupId, editId };
}

export const ChangeListModel = Object.freeze({
  fieldWordsOf,
  changeRowsOf,
  undoCommandOf,
});
