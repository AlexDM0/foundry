/**
 * A pending Apply inside the apply dialogs (A4, A6b): the commit of `CONSTITUTION.md` under way with a busy ring, or the reason it holds
 * or was refused with what User can do next. After a signing failure, "View CONSTITUTION.md" opens the exact text User may commit by hand.
 * The foot under it is the dialogs' shared one: Cancel (or Back) on the start side and Apply on the end with no pending request, Cancel
 * apply while one is pending, and Apply again beside it once the request was refused; each command's refusal shows verbatim beside its
 * button. Over entities the pending state counts the constitutions in the commit, and a first Apply that the board would refuse keeps
 * Apply disabled with the reason on hover.
 */

import { useState }                                             from 'react';
import type { BoardCommandDocument }                            from '../../../../@types/board/BoardCommandDocument.ts';
import type { BoardApplyStateDocument }                         from '../../../../@types/board/BoardPipelineDocuments.ts';
import { BusyIndicator, Button, Dialog }                        from '../../../../lib/design-system/DesignSystemInterface.ts';
import { CommandButton }                                        from '../../../shell/CommandButton.tsx';
import { ApplyPendingStateModel, type EntityConstitutionCount } from './ApplyPendingStateModel.ts';

export interface ApplyPendingStateProps {
  readonly applyState:               BoardApplyStateDocument;
  /** The draft's text of `CONSTITUTION.md`, byte for byte; null when the draft has none. */
  readonly constitutionMarkdown:     string | null;
  /** Over entities, how many drafted constitutions the commit holds; absent on a forge without entities. */
  readonly entityConstitutionCount?: EntityConstitutionCount;
}

export function ApplyPendingState({ applyState, constitutionMarkdown, entityConstitutionCount = null }: ApplyPendingStateProps) {
  const [constitutionIsShown, setConstitutionIsShown] = useState(false);
  const view = ApplyPendingStateModel.pendingViewOf(applyState, entityConstitutionCount);
  return (
    <div className="board-pipeline-apply-pending" data-state={view.state} role="status">
      <p className="board-pipeline-apply-pending-line">
        {view.state === 'committing' ? <BusyIndicator shape="spinner" accessibleName={view.text} /> : null}
        <span className="board-pipeline-apply-pending-text">{view.text}</span>
      </p>
      {view.nextStep === null ? null : <p className="board-pipeline-apply-pending-next">{view.nextStep}</p>}
      {view.offersConstitutionText && constitutionMarkdown !== null
        ? (
          <span className="board-pipeline-apply-pending-actions">
            <Button label="View CONSTITUTION.md" expanded={constitutionIsShown} onPress={() => setConstitutionIsShown(true)} />
          </span>
        )
        : null}
      {constitutionIsShown && constitutionMarkdown !== null
        ? (
          <Dialog
            title="CONSTITUTION.md"
            kicker="The text to commit"
            description="Commit this text on main by hand, byte for byte, then press Apply again."
            isOpen
            onDismiss={() => setConstitutionIsShown(false)}
            closeLabel="Close"
            width="wide"
          >
            <pre className="board-pipeline-dialog-file-text">{constitutionMarkdown}</pre>
          </Dialog>
        )
        : null}
    </div>
  );
}

export interface ApplyFootProps {
  readonly setupId:        string;
  readonly applyState:     BoardApplyStateDocument | null;
  /** "Cancel" in A4, "Back" in A6b: it only closes the dialog. */
  readonly closeLabel:     string;
  readonly onClose:        () => void;
  readonly applyLabel:     string;
  readonly applyCommand:   BoardCommandDocument;
  /** Called once the Overseer took the Apply: it may still commit `CONSTITUTION.md` before the pipeline lands. */
  readonly onApplySent?:   () => void;
  /** Why Apply cannot be sent yet, shown on hover over the disabled Apply; absent while it can. */
  readonly applyWaitsFor?: string;
}

export function ApplyFoot({
  setupId, applyState, closeLabel, onClose, applyLabel, applyCommand, onApplySent, applyWaitsFor
}: ApplyFootProps) {
  const offersApply = applyState === null || ApplyPendingStateModel.pendingViewOf(applyState).offersApplyAgain;
  return (
    <div className="board-pipeline-dialog-foot-row">
      {applyState === null
        ? <Button label={closeLabel} onPress={onClose} />
        : <CommandButton label="Cancel apply" command={ApplyPendingStateModel.cancelCommandOf(setupId)} />}
      <span className="board-pipeline-dialog-foot-gap" />
      {offersApply && applyWaitsFor !== undefined
        ? (
          <span title={applyWaitsFor}>
            <Button label={applyLabel} emphasis="primary" disabled />
          </span>
        )
        : null}
      {offersApply && applyWaitsFor === undefined
        ? (
          <CommandButton
            label={applyLabel}
            command={applyCommand}
            primary
            attention={applyState === null}
            {...(onApplySent === undefined ? {} : { onApplied: onApplySent })}
          />
        )
        : null}
    </div>
  );
}
