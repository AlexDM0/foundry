/**
 * "Add a repository" over the Forges view (`#forges/add`): B4's form in a dialog, with the line of a missing forge program under it. It
 * closes on Cancel, on Escape, and once the add went through; a refusal of `init` or `start` shows in it. `AddRepositoryDialogLayout`
 * takes no hooks; `AddRepositoryDialog` keeps the form and sends its commands.
 */
import { type CommandStates, type CommandSubject, useCommandSender } from '../../api/CommandSender.ts';
import { Button }                                                    from '../../design-system/Button.tsx';
import { Dialog }                                                    from '../../design-system/Dialog.tsx';
import {
  AddRepositoryFields,
  type AddRepositoryHandlers,
  ForgeProgramMissingLine,
  type PathChooser,
  useAddRepositoryForm,
} from '../../shared/add-repository/AddRepositoryFields.tsx';
import type { AddRepositoryForm } from '../../shared/add-repository/AddRepositoryForm.ts';

export interface AddRepositoryDialogLayoutProps {
  readonly forgeProgramIsMissing: boolean;
  readonly form:                  AddRepositoryForm;
  readonly pathChooser:           PathChooser;
  readonly commandStates:         CommandStates;
  readonly handlers:              AddRepositoryHandlers;
  readonly onDismissFailure:      (subject: CommandSubject) => void;
  readonly onClose:               () => void;
}

export function AddRepositoryDialogLayout({
  forgeProgramIsMissing, form, pathChooser, commandStates, handlers, onDismissFailure, onClose
}: AddRepositoryDialogLayoutProps) {
  return (
    <Dialog title="Add a repository" onClose={onClose} actions={<Button label="Cancel" onPress={onClose} />}>
      <AddRepositoryFields
        form={form}
        pathChooser={pathChooser}
        forgeProgramIsMissing={forgeProgramIsMissing}
        commandStates={commandStates}
        handlers={handlers}
        onDismissFailure={onDismissFailure}
      />
      <ForgeProgramMissingLine
        forgeProgramIsMissing={forgeProgramIsMissing}
        pathChooser={pathChooser}
        commandStates={commandStates}
        onChooseForgeProgram={handlers.onChooseForgeProgram}
        onDismissFailure={onDismissFailure}
      />
    </Dialog>
  );
}

export interface AddRepositoryDialogProps {
  readonly forgeProgramIsMissing: boolean;
  readonly onClose:               () => void;
}

export function AddRepositoryDialog({ forgeProgramIsMissing, onClose }: AddRepositoryDialogProps) {
  const { send, dismissFailure, states } = useCommandSender();
  const { form, pathChooser, handlers } = useAddRepositoryForm(send, onClose);
  return (
    <AddRepositoryDialogLayout
      forgeProgramIsMissing={forgeProgramIsMissing}
      form={form}
      pathChooser={pathChooser}
      commandStates={states}
      handlers={handlers}
      onDismissFailure={dismissFailure}
      onClose={onClose}
    />
  );
}
