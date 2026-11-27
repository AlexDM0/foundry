/**
 * Sends the flow's draft edits as `pipeline-draft-edit`; on a live board a gesture first sends `pipeline-update-start` and holds its edits
 * until the update record shows, never when the start was refused. A gesture's edits carry the draft revision of their rows, and no gesture
 * is taken while the one before it is held or on its way, so an edit built on old rows is refused as stale instead of undoing the one before.
 */
import { useEffect, useRef, useState } from 'react';

import { PAGE_CONTRACT_VERSIONS }                  from '../../../../../src/shared/constants/PageContractVersions.ts';
import type { BoardCommandDocument }               from '../../../../@types/board/BoardCommandDocument.ts';
import type { BoardDraftEditDocument }             from '../../../../@types/board/BoardPipelineDocuments.ts';
import { useControlCommand }                       from '../../../shared/commands/ControlCommandSender.ts';
import { EntityLevelFactsModel }                   from '../entities/EntityLevelFactsModel.ts';
import { entityKeyOfScope, useMonorepoLevelScope } from '../entities/MonorepoLevelContext.ts';

import { PipelineFlowModel, type DraftEditTarget } from './PipelineFlowModel.ts';

const { gaiaBoardCommand } = PAGE_CONTRACT_VERSIONS;

export const UPDATE_START_COMMAND: BoardCommandDocument = Object.freeze({ boardCommandVersion: gaiaBoardCommand, kind: 'pipeline-update-start', entity: null });

export interface PipelineFlowEditSender {
  /** Whether the shell lets a control act now, and no earlier gesture is still held or on its way. */
  readonly enabled:   boolean;
  /** The refusal of the last start or edit, verbatim. */
  readonly refusal:   string | null;
  readonly sendEdits: (edits: readonly BoardDraftEditDocument[]) => void;
}

/** One gesture's edits; the number tells a gesture from the one before it, so each is sent once. */
interface HeldEdits {
  readonly gestureNumber: number;
  readonly edits:         readonly BoardDraftEditDocument[];
  /** The record the gesture saw; `null` when the gesture sent `pipeline-update-start`, whose record its edits go to. */
  readonly seenTarget:    DraftEditTarget | null;
}

/**
 * `target` is the open record the edits go to; `null` on a live board, where the first gesture opens one. `onEditsApplied` is called once
 * Hephaestus applied a gesture's edits, so a dialog can close.
 */
export function usePipelineFlowEditSender(target: DraftEditTarget | null, onEditsApplied?: () => void): PipelineFlowEditSender {
  const [heldEdits, setHeldEdits] = useState<HeldEdits | null>(null);
  const [settledGestureNumber, setSettledGestureNumber] = useState(0);
  const sentGestureNumber = useRef(0);
  const entityKey = entityKeyOfScope(useMonorepoLevelScope());
  const editTarget = heldEdits?.seenTarget ?? target;
  const scopedEdits = heldEdits === null || entityKey === null ? heldEdits?.edits ?? [] : EntityLevelFactsModel.editsScopedTo(heldEdits.edits, entityKey);
  const editCommand = heldEdits === null || editTarget === null ? null : PipelineFlowModel.draftEditCommandOf(editTarget, scopedEdits);
  const editSender = useControlCommand(editCommand, onEditsApplied === undefined ? {} : { onApplied: onEditsApplied });
  const updateStartSender = useControlCommand(UPDATE_START_COMMAND);
  const startWasRefused = updateStartSender.refusal !== null && heldEdits?.seenTarget === null;
  const gestureIsUnsettled = heldEdits !== null && heldEdits.gestureNumber !== settledGestureNumber && !startWasRefused;
  const enabled = updateStartSender.enabled && !gestureIsUnsettled;

  useEffect(() => {
    if (heldEdits === null || editCommand === null || startWasRefused || heldEdits.gestureNumber === sentGestureNumber.current) return;
    if (!editSender.enabled) return;
    sentGestureNumber.current = heldEdits.gestureNumber;
    void editSender.send().then(() => setSettledGestureNumber(heldEdits.gestureNumber));
  }, [heldEdits, editCommand, editSender, startWasRefused]);

  const sendEdits = (edits: readonly BoardDraftEditDocument[]): void => {
    if (!enabled) return;
    setHeldEdits({ gestureNumber: (heldEdits?.gestureNumber ?? settledGestureNumber) + 1, edits, seenTarget: target });
    if (target === null) void updateStartSender.send();
  };

  return {
    enabled,
    refusal: editSender.refusal ?? updateStartSender.refusal,
    sendEdits,
  };
}
