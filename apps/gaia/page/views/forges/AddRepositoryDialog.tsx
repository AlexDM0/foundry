/**
 * "Add a repository" over the Forges view (`#forges/add`): the no-forge screen's form in a dialog, closing on Cancel, its close button, Escape
 * or a finished add, never on a stray click beside it. Its body and foot take no hooks; `AddRepositoryDialog` keeps the form and sends its commands.
 */
import { type CommandStates, type CommandSubject, useCommandSender } from '../../api/CommandSender.ts';
import { Button, Dialog }                                            from '../../lib/design-system/DesignSystemInterface.ts';

import {
  AddRepositoryFields,
  type AddRepositorySentResults,
  type AddRepositoryHandlers,
  ForgeProgramMissingLine,
  useAddRepositoryForm,
} from '../../shared/add-repository/AddRepositoryFields.tsx';
import type { AddRepositoryForm } from '../../shared/add-repository/AddRepositoryForm.ts';
import { formDialogDismissalOf }  from './FormDialogDismissal.ts';

export interface AddRepositoryDialogLayoutProps {
  readonly forgeProgramIsMissing: boolean;
  readonly form:                  AddRepositoryForm;
  readonly sentResults:           AddRepositorySentResults;
  readonly commandStates:         CommandStates;
  readonly handlers:              AddRepositoryHandlers;
  readonly onDismissFailure:      (subject: CommandSubject) => void;
  readonly onClose:               () => void;
}

/** The form and the line of a missing forge program, without hooks, so a spec unfolds them whole. */
export function AddRepositoryDialogBody({
  forgeProgramIsMissing, form, sentResults, commandStates, handlers, onDismissFailure
}: Omit<AddRepositoryDialogLayoutProps, 'onClose'>) {
  return (
    <div className="gaia-forges-add-dialog-body">
      <AddRepositoryFields
        form={form}
        sentResults={sentResults}
        forgeProgramIsMissing={forgeProgramIsMissing}
        commandStates={commandStates}
        handlers={handlers}
        onDismissFailure={onDismissFailure}
      />
      <ForgeProgramMissingLine
        forgeProgramIsMissing={forgeProgramIsMissing}
        sentResults={sentResults}
        commandStates={commandStates}
        onChooseForgeProgram={handlers.onChooseForgeProgram}
        onDismissFailure={onDismissFailure}
      />
    </div>
  );
}

export function AddRepositoryDialogFoot({ onClose }: Pick<AddRepositoryDialogLayoutProps, 'onClose'>) {
  return <Button label="Cancel" emphasis="ghost" compact onPress={onClose} />;
}

export function AddRepositoryDialogLayout({ onClose, ...bodyProps }: AddRepositoryDialogLayoutProps) {
  return (
    <Dialog
      title="Add a repository"
      isOpen
      onDismiss={formDialogDismissalOf(onClose)}
      closeLabel="Close Add a repository"
      width="widest"
      foot={<AddRepositoryDialogFoot onClose={onClose} />}
    >
      <AddRepositoryDialogBody {...bodyProps} />
    </Dialog>
  );
}

export interface AddRepositoryDialogProps {
  readonly forgeProgramIsMissing: boolean;
  readonly onClose:               () => void;
}

export function AddRepositoryDialog({ forgeProgramIsMissing, onClose }: AddRepositoryDialogProps) {
  const { send, dismissFailure, states } = useCommandSender();
  const { form, sentResults, handlers } = useAddRepositoryForm(send, onClose);
  return (
    <AddRepositoryDialogLayout
      forgeProgramIsMissing={forgeProgramIsMissing}
      form={form}
      sentResults={sentResults}
      commandStates={states}
      handlers={handlers}
      onDismissFailure={dismissFailure}
      onClose={onClose}
    />
  );
}
