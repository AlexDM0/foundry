/**
 * A pending Apply inside the apply dialogs: the commit of `CONSTITUTION.md` under way, or why it holds or was refused and what User can
 * do next, and the dialogs' shared foot, whose commands' refusals show verbatim beside their buttons.
 */

import { useState }                                             from 'react';
import type { BoardCommandDocument }                            from '../../../../@types/board/BoardCommandDocument.ts';
import type { BoardApplyStateDocument }                         from '../../../../@types/board/BoardPipelineDocuments.ts';
import { BusyIndicator, Button, Dialog }                        from '../../../../lib/design-system/DesignSystemInterface.ts';
import { CommandButton }                                        from '../../../shared/commands/CommandButton.tsx';
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
  /** "Cancel" in the first Apply, "Back" in Apply changes: it only closes the dialog. */
  readonly closeLabel:     string;
  readonly onClose:        () => void;
  readonly applyLabel:     string;
  readonly applyCommand:   BoardCommandDocument;
  /** Called once Hephaestus took the Apply: it may still commit `CONSTITUTION.md` before the pipeline lands. */
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
