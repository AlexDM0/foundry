/**
 * A pending Apply inside the apply dialogs (A4, A6b): the commit of `CONSTITUTION.md` under way with a busy ring, or the reason it holds
 * or was refused with what User can do next. After a signing failure, "View CONSTITUTION.md" opens the exact text User may commit by hand.
 * The foot under it is the dialogs' shared one: Cancel (or Back) on the start side and Apply on the end with no pending request, Cancel
 * apply while one is pending, and Apply again beside it once the request was refused; each command's refusal shows verbatim beside its
 * button.
 */

import { BusyIndicator } from 'design-system/BusyIndicator';
import { Button }        from 'design-system/Button';
import { Dialog }        from 'design-system/Dialog';
import { useState }      from 'react';

import type { ApplyStateFacts }    from '../../../../src/lib/tracker-model/@types/PipelineFacts.ts';
import type { ControlCommandBody } from '../../../api/CommandClient.ts';
import { CommandButton }           from '../../../shell/CommandButton.tsx';
import { ApplyPendingStateModel }  from './ApplyPendingStateModel.ts';

export interface ApplyPendingStateProps {
  readonly applyState:           ApplyStateFacts;
  /** The draft's text of `CONSTITUTION.md`, byte for byte; null when the draft has none. */
  readonly constitutionMarkdown: string | null;
}

export function ApplyPendingState({ applyState, constitutionMarkdown }: ApplyPendingStateProps) {
  const [constitutionIsShown, setConstitutionIsShown] = useState(false);
  const view = ApplyPendingStateModel.pendingViewOf(applyState);
  return (
    <div className="bridge-pipeline-apply-pending" data-state={view.state} role="status">
      <p className="bridge-pipeline-apply-pending-line">
        {view.state === 'committing' ? <BusyIndicator shape="spinner" accessibleName={view.text} /> : null}
        <span className="bridge-pipeline-apply-pending-text">{view.text}</span>
      </p>
      {view.nextStep === null ? null : <p className="bridge-pipeline-apply-pending-next">{view.nextStep}</p>}
      {view.offersConstitutionText && constitutionMarkdown !== null
        ? (
          <span className="bridge-pipeline-apply-pending-actions">
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
            <pre className="bridge-pipeline-dialog-file-text">{constitutionMarkdown}</pre>
          </Dialog>
        )
        : null}
    </div>
  );
}

export interface ApplyFootProps {
  readonly setupId:      string;
  readonly applyState:   ApplyStateFacts | null;
  /** "Cancel" in A4, "Back" in A6b: it only closes the dialog. */
  readonly closeLabel:   string;
  readonly onClose:      () => void;
  readonly applyLabel:   string;
  readonly applyCommand: ControlCommandBody;
  /** Called once the Overseer took the Apply: it may still commit `CONSTITUTION.md` before the pipeline lands. */
  readonly onApplySent?: () => void;
}

export function ApplyFoot({
  setupId, applyState, closeLabel, onClose, applyLabel, applyCommand, onApplySent
}: ApplyFootProps) {
  const offersApply = applyState === null || ApplyPendingStateModel.pendingViewOf(applyState).offersApplyAgain;
  return (
    <div className="bridge-pipeline-dialog-foot-row">
      {applyState === null
        ? <Button label={closeLabel} onPress={onClose} />
        : <CommandButton label="Cancel apply" command={ApplyPendingStateModel.cancelCommandOf(setupId)} />}
      <span className="bridge-pipeline-dialog-foot-gap" />
      {offersApply
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
