/** The setup record's draft edits: each move's edits land at one revision, kept for attribution and Undo, and a discard drops them all. */
import type { PipelineSetupChanged }              from './@types/BoardChanges.ts';
import type { EntityKey, Pipeline, PipelineStep } from './@types/Pipeline.ts';
import type {
  DraftEditRequest,
  EntityDraftEdit,
  PipelineDraftEdit,
  PipelineSetup,
  SetupEdit
} from './@types/PipelineSetup.ts';
import type { BoardRecords }        from './BoardRecords.ts';
import { BoardRefusal }             from './BoardRefusal.ts';
import type { PipelineSetupRecord } from './PipelineSetupRecord.ts';
import { SETUP_EDIT_ID_PREFIX }     from './constants/PipelineSetupVocabulary.ts';
import { PipelineDraftEditUtil }    from './utils/PipelineDraftEditUtil.ts';

/** The entity a draft field names; null for a field of the forge itself. */
function entityKeyOfField(field: string): EntityKey | null {
  return PipelineDraftEditUtil.entityScopeOf(field)?.entityKey ?? null;
}

export class PipelineSetupDraftEdits {
  constructor(
    private readonly records: BoardRecords,
    private readonly setupRecord: PipelineSetupRecord,
  ) {}

  /**
   * The draft the edits would leave, refused as `editDraft` refuses them; nothing is stored, so a caller can check the draft before the
   * move writes anything.
   */
  draftAfterEdits(setupId: string, request: DraftEditRequest): Pipeline {
    return this.editedDraftOf(this.setupRecord.requireMovableSetup(setupId), request);
  }

  /**
   * Every edit of one move lands at once, at the next revision, each kept for attribution and Undo. The edits of a copy also carry their
   * set's `batch`, the first of their edit ids; each one still undoes alone.
   */
  editDraft(setupId: string, request: DraftEditRequest, at: string): PipelineSetupChanged {
    const setup    = this.setupRecord.requireMovableSetup(setupId);
    const draft    = this.editedDraftOf(setup, request);
    const reopened = request.by === 'user' ? this.setupRecord.userEditReopenRecords(setup, 'design', at) : [];
    const batch    = request.isACopy === true ? { batch: `${SETUP_EDIT_ID_PREFIX}${setup.nextNumbers.edit}` } : {};
    const editIds: string[] = [];
    const fields: string[]  = [];
    for (const { edit, summary } of request.edits) {
      const editId = `${SETUP_EDIT_ID_PREFIX}${setup.nextNumbers.edit}`;
      const field  = PipelineDraftEditUtil.fieldOf(edit);
      setup.edits.push({
        editId, by: request.by, field, summary, undone: false, ...batch
      });
      setup.nextNumbers.edit += 1;
      editIds.push(editId);
      fields.push(field);
    }
    setup.draft          = draft;
    setup.draftRevision += 1;
    this.setupRecord.store(setup);
    const loggedFields = {
      by: request.by, revision: setup.draftRevision, editIds, fields
    };
    return { logged: [...reopened, this.records.logger.log({ kind: 'pipeline-draft-edited', setupId, fields: loggedFields }, at)], setup };
  }

  /** The draft the Undo would leave, refused as `undoDraftEdit` refuses it; nothing is stored. */
  draftAfterUndo(setupId: string, editId: string): Pipeline {
    const setup = this.setupRecord.requireMovableSetup(setupId);
    return this.undoneDraftOf(setup, this.requireUndoableEdit(setup, editId));
  }

  /** Writes the base pipeline's value of the edit's field back; the edit stays listed, marked undone. */
  undoDraftEdit(setupId: string, editId: string, at: string): PipelineSetupChanged {
    const setup = this.setupRecord.requireMovableSetup(setupId);
    const edit  = this.requireUndoableEdit(setup, editId);
    setup.draft         = this.undoneDraftOf(setup, edit);
    edit.undone         = true;
    setup.draftRevision += 1;
    this.setupRecord.store(setup);
    const fields = { editId, field: edit.field, revision: setup.draftRevision };
    return { logged: [this.records.logger.log({ kind: 'pipeline-draft-undone', setupId, fields }, at)], setup };
  }

  /** The draft the set's Undo would leave, refused as `undoDraftBatch` refuses it; nothing is stored. */
  draftAfterBatchUndo(setupId: string, editId: string): Pipeline {
    const setup = this.setupRecord.requireMovableSetup(setupId);
    return this.batchUndoneDraftOf(setup, this.requireUndoableBatch(setup, editId));
  }

  /**
   * Undoes at once every edit of the copy the named edit belongs to, at the named edit's level, that is not undone yet, at one revision,
   * each logged as its own Undo; an edit of no copy is a set of one.
   */
  undoDraftBatch(setupId: string, editId: string, at: string): PipelineSetupChanged {
    const setup = this.setupRecord.requireMovableSetup(setupId);
    const edits = this.requireUndoableBatch(setup, editId);
    setup.draft         = this.batchUndoneDraftOf(setup, edits);
    setup.draftRevision += 1;
    for (const edit of edits) edit.undone = true;
    this.setupRecord.store(setup);
    const logged = edits.map((edit) => {
      const fields = { editId: edit.editId, field: edit.field, revision: setup.draftRevision };
      return this.records.logger.log({ kind: 'pipeline-draft-undone', setupId, fields }, at);
    });
    return { logged, setup };
  }

  /** Drops every proposed change: the draft is the base again, every edit is undone, and the agent stays. */
  discardDraft(setupId: string, at: string): PipelineSetupChanged {
    const setup = this.setupRecord.requireMovableSetup(setupId);
    setup.draft = setup.mode === 'setup' && setup.draft === null ? null : this.setupRecord.basePipeline();
    for (const edit of setup.edits) edit.undone = true;
    setup.draftRevision += 1;
    this.setupRecord.store(setup);
    return { logged: [this.records.logger.log({ kind: 'pipeline-draft-discarded', setupId, fields: { revision: setup.draftRevision } }, at)], setup };
  }

  /** The record's draft, or the base, with every edit of the request written in order; refuses a stale revision and a mismatched edit. */
  private editedDraftOf(setup: Readonly<PipelineSetup>, request: DraftEditRequest): Pipeline {
    const { setupId } = setup;
    if (request.revision !== null && request.revision !== setup.draftRevision) {
      throw new BoardRefusal({
        reason: 'pipeline-draft-stale', setupId, revision: request.revision, currentRevision: setup.draftRevision
      });
    }
    if (request.edits.length === 0) throw new BoardRefusal({ reason: 'no-draft-edits', setupId });
    let draft = setup.draft ?? this.setupRecord.basePipeline();
    for (const { edit } of request.edits) {
      this.refuseMismatchedEdit(draft, edit);
      draft = PipelineDraftEditUtil.pipelineWithEdit(draft, edit);
    }
    return draft;
  }

  private requireUndoableEdit(setup: PipelineSetup, editId: string): SetupEdit {
    const { setupId } = setup;
    const edit = setup.edits.find((candidate) => candidate.editId === editId);
    if (edit === undefined) throw new BoardRefusal({ reason: 'unknown-setup-edit', setupId, editId });
    if (edit.undone) throw new BoardRefusal({ reason: 'setup-edit-already-undone', setupId, editId });
    return edit;
  }

  /**
   * The edits of the named edit's set at the named edit's level still standing, in the order made, so a copy to several entities is
   * undone one entity at a time; refused as one Undo is when none stands.
   */
  private requireUndoableBatch(setup: PipelineSetup, editId: string): SetupEdit[] {
    const { setupId } = setup;
    const named = setup.edits.find((candidate) => candidate.editId === editId);
    if (named === undefined) throw new BoardRefusal({ reason: 'unknown-setup-edit', setupId, editId });
    const { batch } = named;
    const namedEntityKey = entityKeyOfField(named.field);
    const members = batch === undefined
      ? [named]
      : setup.edits.filter((candidate) => candidate.batch === batch && entityKeyOfField(candidate.field) === namedEntityKey);
    const standing = members.filter((edit) => !edit.undone);
    if (standing.length === 0) throw new BoardRefusal({ reason: 'setup-edit-already-undone', setupId, editId });
    return standing;
  }

  private batchUndoneDraftOf(setup: Readonly<PipelineSetup>, edits: readonly Readonly<SetupEdit>[]): Pipeline {
    const base = this.setupRecord.basePipeline();
    return edits.reduce((draft, edit) => PipelineDraftEditUtil.pipelineWithBaseValueOf(base, draft, edit.field), setup.draft ?? base);
  }

  private undoneDraftOf(setup: Readonly<PipelineSetup>, edit: Readonly<SetupEdit>): Pipeline {
    const base = this.setupRecord.basePipeline();
    return PipelineDraftEditUtil.pipelineWithBaseValueOf(base, setup.draft ?? base, edit.field);
  }

  /** A gate or step names itself as its field does, and a prepare order names each prepare step once, inside an entity as at the top. */
  private refuseMismatchedEdit(draft: Readonly<Pipeline>, edit: PipelineDraftEdit): void {
    if (edit.target !== 'within-entity') {
      this.refuseMismatchedStepsEdit(draft.prepare, edit, PipelineDraftEditUtil.fieldOf(edit));
      return;
    }
    const entity = draft.entities !== undefined && Object.hasOwn(draft.entities, edit.entityKey) ? draft.entities[edit.entityKey] : undefined;
    if (entity !== undefined) this.refuseMismatchedStepsEdit(entity.prepare, edit.edit, PipelineDraftEditUtil.fieldOf(edit));
  }

  private refuseMismatchedStepsEdit(prepare: readonly PipelineStep[], edit: PipelineDraftEdit | EntityDraftEdit, field: string): void {
    if ((edit.target === 'gate' || edit.target === 'prepare') && edit.value !== null && edit.value.name !== edit.name) {
      throw new BoardRefusal({ reason: 'draft-edit-name-mismatch', field, name: edit.value.name });
    }
    if (edit.target !== 'prepare-order') return;
    const prepareNames = prepare.map((step) => step.name);
    const isReorder    = edit.names.length === prepareNames.length && new Set(edit.names).size === edit.names.length
      && edit.names.every((name) => prepareNames.includes(name));
    if (!isReorder) throw new BoardRefusal({ reason: 'prepare-order-not-a-reorder', names: [...edit.names], prepareNames });
  }
}
