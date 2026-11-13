/**
 * "Add a repository" over the Forges view. What matters (SCREENS A4 and B4 acceptance 2): it is B4's form in a dialog named for what it
 * does, Cancel closes it; with no forge program "Add and start" is disabled and the dashed status line says why; a refusal of `init` or
 * `start` shows in the dialog. The command states come from the real sender over Gaia's server stood in for by authored answers.
 */
import { describe, expect, test } from 'bun:test';

import type { CommandAnswerDocument }         from '../../@types/CommandDocument.ts';
import type { CommandStates }                 from '../../api/CommandSender.ts';
import { AddRepositoryForm }                  from '../../shared/add-repository/AddRepositoryForm.ts';
import { answerResponse, senderOver }         from '../../testing/CommandServer.ts';
import { type HostElement, ReactElementTree } from '../../testing/ReactElementTree.ts';
import { AddRepositoryDialogLayout }          from './AddRepositoryDialog.tsx';

const tree = ReactElementTree;

const FILLED_FORM = AddRepositoryForm.formAfterFolder(AddRepositoryForm.EMPTY_FORM, '~/development/example-storefront');

const INIT_REFUSED: CommandAnswerDocument = {
  answerVersion: 2,
  outcome:       'refused',
  refusal:       'not-a-git-repository',
  text:          'The folder is not a git repository.',
};

function dialogOf(forgeProgramIsMissing: boolean, commandStates: CommandStates = senderOver([]).states()) {
  const closed: number[] = [];
  const unfolded = tree.unfolded(
    <AddRepositoryDialogLayout
      forgeProgramIsMissing={forgeProgramIsMissing}
      form={FILLED_FORM}
      pathChooser="folder"
      commandStates={commandStates}
      handlers={{
        onFolderTyped:        () => undefined,
        onProjectTyped:       () => undefined,
        onChooseFolder:       () => undefined,
        onAddAndStart:        () => undefined,
        onChooseForgeProgram: () => undefined,
      }}
      onDismissFailure={() => undefined}
      onClose={() => closed.push(1)}
    />,
  );
  return { dialog: tree.onlyHostElementIn(unfolded, (element) => element.props['role'] === 'dialog'), closed };
}

function buttonNamed(dialog: HostElement, label: string): HostElement {
  return tree.onlyHostElementIn([dialog], (element) => element.tag === 'button' && tree.textOf([element]) === label);
}

describe('the dialog', () => {
  test('is B4\'s form under its own name, and Cancel closes it', () => {
    const { dialog, closed } = dialogOf(false);
    expect(dialog.props['aria-label']).toBe('Add a repository');
    const fields = tree.hostElementsIn([dialog], tree.withClass('gaia-text-field'));
    expect(fields.map((field) => tree.textOf([tree.onlyWithClass([field], 'gaia-text-field-label')]))).toEqual(['Repository folder', 'Project name']);
    expect(buttonNamed(dialog, 'Add and start').props['disabled']).toBe(false);
    expect(tree.hostElementsIn([dialog], tree.withClass('gaia-add-repository-program-missing'))).toEqual([]);
    tree.dispatch(buttonNamed(dialog, 'Cancel'), 'onClick');
    expect(closed).toEqual([1]);
  });

  test('with no forge program, "Add and start" is disabled and the dashed status line says why', () => {
    const { dialog } = dialogOf(true);
    expect(buttonNamed(dialog, 'Add and start').props['disabled']).toBe(true);
    const line = tree.onlyWithClass([dialog], 'gaia-add-repository-program-missing');
    expect(line.props['role']).toBe('status');
    expect(tree.textOf([tree.onlyWithClass([line], 'gaia-add-repository-program-missing-text')])).toBe(
      'The forge program was not found. Gaia can show running forges without it, but cannot start one.',
    );
  });

  test('a refusal of init or start shows in the dialog', async () => {
    const sender = senderOver([() => Promise.resolve(answerResponse(INIT_REFUSED))]);
    await sender.send(AddRepositoryForm.addCommandOf(FILLED_FORM));
    const { dialog } = dialogOf(false, sender.states());
    expect(tree.textOf([tree.onlyWithClass([dialog], 'gaia-refusal-text')])).toBe('The forge refused Add and start: not-a-git-repository. The folder is not a git repository.');
  });
});
