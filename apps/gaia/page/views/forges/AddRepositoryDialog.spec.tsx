/**
 * "Add a repository" over the Forges view: the no-forge screen's form in the package's modal dialog, Cancel closing it, "Add and start" disabled
 * with its reason while no forge program is known, and a refusal of `init` or `start` shown inside. Command states come from the real sender over
 * authored answers.
 */
import { describe, expect, test } from 'bun:test';

import type { CommandAnswerDocument }                                     from '../../@types/CommandDocument.ts';
import type { CommandStates }                                             from '../../api/CommandSender.ts';
import { Dialog, TextField }                                              from '../../lib/design-system/DesignSystemInterface.ts';
import { NOTHING_SENT }                                                   from '../../shared/add-repository/AddRepositoryFields.tsx';
import { AddRepositoryForm }                                              from '../../shared/add-repository/AddRepositoryForm.ts';
import { answerResponse, senderOver }                                     from '../../testing/CommandServer.ts';
import { FailedActions }                                                  from '../../testing/FailedActions.ts';
import { PackageButtons }                                                 from '../../testing/PackageButtons.ts';
import { type HostElement, ReactElementTree }                             from '../../testing/ReactElementTree.ts';
import { AddRepositoryDialogLayout, type AddRepositoryDialogLayoutProps } from './AddRepositoryDialog.tsx';

const tree = ReactElementTree;

const FILLED_FORM = AddRepositoryForm.formAfterFolder(AddRepositoryForm.EMPTY_FORM, '~/development/example-storefront');

const INIT_REFUSED: CommandAnswerDocument = {
  answerVersion: 3,
  outcome:       'refused',
  refusal:       'not-a-git-repository',
  text:          'The folder is not a git repository.',
  forges:        [],
};

function propsOf(forgeProgramIsMissing: boolean, commandStates: CommandStates, closed: number[]): AddRepositoryDialogLayoutProps {
  return {
    forgeProgramIsMissing,
    form:        FILLED_FORM,
    sentResults: NOTHING_SENT,
    commandStates,
    handlers:    {
      onFolderTyped:        () => undefined,
      onProjectTyped:       () => undefined,
      onChooseFolder:       () => undefined,
      onAddAndStart:        () => undefined,
      onChooseForgeProgram: () => undefined,
    },
    onDismissFailure: () => undefined,
    onClose:          () => closed.push(1),
  };
}

/** The package's dialog, folded, holding the body and the foot the layout hands it. */
function dialogOf(forgeProgramIsMissing: boolean, commandStates: CommandStates = senderOver([]).states()) {
  const closed: number[] = [];
  const dialog = tree.onlyOfComponent(tree.unfolded(<AddRepositoryDialogLayout {...propsOf(forgeProgramIsMissing, commandStates, closed)} />), Dialog);
  return { dialog, closed };
}

function buttonNamed(dialog: HostElement, label: string): HostElement {
  return PackageButtons.onlyLabelled([dialog], label);
}

describe('the dialog', () => {
  test('is B4\'s form under its own name, and Cancel closes it', () => {
    const { dialog, closed } = dialogOf(false);
    expect([dialog.props['title'], dialog.props['isOpen']]).toEqual(['Add a repository', true]);
    const fields = tree.hostElementsIn([dialog], tree.withComponent(TextField));
    expect(fields.map((field) => field.props['label'])).toEqual(['Repository folder', 'Project name']);
    expect(buttonNamed(dialog, 'Add and start').props['disabled']).toBe(false);
    expect(tree.hostElementsIn([dialog], tree.withClass('gaia-add-repository-program-missing'))).toEqual([]);
    PackageButtons.press(buttonNamed(dialog, 'Cancel'));
    expect(closed).toEqual([1]);
  });

  test('is the package\'s widest dialog, as B4 draws it', () => {
    expect(dialogOf(false).dialog.props['width']).toBe('widest');
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
    expect(FailedActions.wordsOf(FailedActions.onlyFailedActionIn([dialog])))
      .toEqual(['The forge refused Add and start: ', 'not-a-git-repository', 'The folder is not a git repository.']);
  });
});
