/**
 * Sends the flow's draft edits as `pipeline-draft-edit` against the open setup record. On a live board, with no record open, an edit
 * gesture first sends `pipeline-update-start` and holds its edits; they go once the facts show the update record the start opened, and
 * never when the start was refused. Both commands go through `useControlCommand`, so either refusal is kept verbatim.
 */
import { useEffect, useRef, useState } from 'react';

import { useControlCommand } from '../../../shell/ControlCommandSender.ts';

import { PipelineFlowModel, type DraftEditTarget, type FlowDraftEdit } from './PipelineFlowModel.ts';

export const UPDATE_START_COMMAND = Object.freeze({ kind: 'pipeline-update-start' });

export interface PipelineFlowEditSender {
  /** Whether the shell lets a control act now. */
  readonly enabled:   boolean;
  /** The refusal of the last start or edit, verbatim. */
  readonly refusal:   string | null;
  readonly sendEdits: (edits: readonly FlowDraftEdit[]) => void;
}

/** One gesture's edits; the number tells a gesture from the one before it, so each is sent once. */
interface HeldEdits {
  readonly gestureNumber: number;
  readonly edits:         readonly FlowDraftEdit[];
  /** The gesture sent `pipeline-update-start`, so its edits go only if that start was not refused. */
  readonly awaitsStart:   boolean;
}

/** `target` is the open record the edits go to; `null` on a live board, where the first gesture opens one. */
export function usePipelineFlowEditSender(target: DraftEditTarget | null): PipelineFlowEditSender {
  const [heldEdits, setHeldEdits] = useState<HeldEdits | null>(null);
  const sentGestureNumber = useRef(0);
  const editCommand = heldEdits === null || target === null ? null : PipelineFlowModel.draftEditCommandOf(target, heldEdits.edits);
  const editSender = useControlCommand(editCommand);
  const updateStartSender = useControlCommand(UPDATE_START_COMMAND);
  const startWasRefused = updateStartSender.refusal !== null && heldEdits?.awaitsStart === true;

  useEffect(() => {
    if (heldEdits === null || editCommand === null || startWasRefused || heldEdits.gestureNumber === sentGestureNumber.current) return;
    if (!editSender.enabled) return;
    sentGestureNumber.current = heldEdits.gestureNumber;
    void editSender.send();
  }, [heldEdits, editCommand, editSender, startWasRefused]);

  const sendEdits = (edits: readonly FlowDraftEdit[]): void => {
    if (!updateStartSender.enabled) return;
    setHeldEdits({ gestureNumber: (heldEdits?.gestureNumber ?? sentGestureNumber.current) + 1, edits, awaitsStart: target === null });
    if (target === null) void updateStartSender.send();
  };

  return {
    enabled: updateStartSender.enabled,
    refusal: editSender.refusal ?? updateStartSender.refusal,
    sendEdits,
  };
}
