/**
 * Sends the flow's draft edits as `pipeline-draft-edit` against the open setup record. On a live board, with no record open, an edit
 * gesture first sends `pipeline-update-start` and holds its edits; they go once the facts show the update record the start opened, and
 * never when the start was refused. Both commands go through `useControlCommand`, so either refusal is kept verbatim. A gesture's edits go
 * with the draft revision its rows came from, and no gesture is taken while the one before it is held or on its way, so an edit built on
 * old rows is refused as stale instead of undoing the edit before it.
 */
import { useEffect, useRef, useState } from 'react';

import { useControlCommand } from '../../../shell/ControlCommandSender.ts';

import { PipelineFlowModel, type DraftEditTarget, type FlowDraftEdit } from './PipelineFlowModel.ts';

export const UPDATE_START_COMMAND = Object.freeze({ kind: 'pipeline-update-start' });

export interface PipelineFlowEditSender {
  /** Whether the shell lets a control act now, and no earlier gesture is still held or on its way. */
  readonly enabled:   boolean;
  /** The refusal of the last start or edit, verbatim. */
  readonly refusal:   string | null;
  readonly sendEdits: (edits: readonly FlowDraftEdit[]) => void;
}

/** One gesture's edits; the number tells a gesture from the one before it, so each is sent once. */
interface HeldEdits {
  readonly gestureNumber: number;
  readonly edits:         readonly FlowDraftEdit[];
  /** The record the gesture saw; `null` when the gesture sent `pipeline-update-start`, whose record its edits go to. */
  readonly seenTarget:    DraftEditTarget | null;
}

/**
 * `target` is the open record the edits go to; `null` on a live board, where the first gesture opens one. `onEditsApplied` is called once
 * the Overseer applied a gesture's edits, so a dialog can close.
 */
export function usePipelineFlowEditSender(target: DraftEditTarget | null, onEditsApplied?: () => void): PipelineFlowEditSender {
  const [heldEdits, setHeldEdits] = useState<HeldEdits | null>(null);
  const [settledGestureNumber, setSettledGestureNumber] = useState(0);
  const sentGestureNumber = useRef(0);
  const editTarget = heldEdits?.seenTarget ?? target;
  const editCommand = heldEdits === null || editTarget === null ? null : PipelineFlowModel.draftEditCommandOf(editTarget, heldEdits.edits);
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

  const sendEdits = (edits: readonly FlowDraftEdit[]): void => {
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
