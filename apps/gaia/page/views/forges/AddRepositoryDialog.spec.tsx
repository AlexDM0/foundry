/**
 * "Add a repository" over the Forges view. What matters (SCREENS A4 and B4 acceptance 2): it is B4's form in a dialog named for what it
 * does (the package's modal dialog, titled by its heading), Cancel closes it; with no forge program "Add and start" is disabled and the
 * dashed status line says why; a refusal of `init` or `start` shows in the dialog. The command states come from the real sender over
 * Gaia's server stood in for by authored answers. The dialog's hook-free body and foot are unfolded; the package's dialog around them is
 * rendered with `react-dom/server`.
 */
import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup }   from 'react-dom/server';

import type { CommandAnswerDocument }         from '../../@types/CommandDocument.ts';
import type { CommandStates }                 from '../../api/CommandSender.ts';
import { NOTHING_SENT }                       from '../../shared/add-repository/AddRepositoryFields.tsx';
import { AddRepositoryForm }                  from '../../shared/add-repository/AddRepositoryForm.ts';
import { answerResponse, senderOver }         from '../../testing/CommandServer.ts';
import { type HostElement, ReactElementTree } from '../../testing/ReactElementTree.ts';
import {
  AddRepositoryDialogBody,
  AddRepositoryDialogFoot,
  AddRepositoryDialogLayout,
  type AddRepositoryDialogLayoutProps
} from './AddRepositoryDialog.tsx';

const tree = ReactElementTree;

const FILLED_FORM = AddRepositoryForm.formAfterFolder(AddRepositoryForm.EMPTY_FORM, '~/development/example-storefront');

const INIT_REFUSED: CommandAnswerDocument = {
  answerVersion: 3,
  outcome:       'refused',
  refusal:       'not-a-git-repository',
  text:          'The folder is not a git repository.',
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

/** The dialog's body and foot, unfolded inside a stand-in holder so a spec can search them as one. */
function dialogOf(forgeProgramIsMissing: boolean, commandStates: CommandStates = senderOver([]).states()) {
  const closed: number[] = [];
  const props = propsOf(forgeProgramIsMissing, commandStates, closed);
  const [holder] = tree.unfolded(<div><AddRepositoryDialogBody {...props} /><AddRepositoryDialogFoot onClose={props.onClose} /></div>);
  if (holder === undefined || typeof holder === 'string') throw new Error('The dialog holds nothing.');
  return { dialog: holder, closed };
}

function buttonNamed(dialog: HostElement, label: string): HostElement {
  return tree.onlyHostElementIn([dialog], (element) => element.tag === 'button' && tree.textOf([element]) === label);
}

describe('the dialog', () => {
  test('is B4\'s form under its own name, and Cancel closes it', () => {
    const { dialog, closed } = dialogOf(false);
    const markup = renderToStaticMarkup(<AddRepositoryDialogLayout {...propsOf(false, senderOver([]).states(), [])} />);
    const titleId = /<h2 id="([^"]+)" class="design-system-dialog-title">Add a repository<\/h2>/.exec(markup)?.[1];
    expect(markup).toContain(`<dialog class="design-system-dialog" aria-modal="true" aria-labelledby="${titleId ?? 'no title'}"`);
    expect(markup).toContain('class="design-system-text-field"');
    const fields = tree.hostElementsIn([dialog], tree.withClass('design-system-text-field'));
    expect(fields.map((field) => tree.textOf([tree.onlyWithClass([field], 'design-system-text-field-label')]))).toEqual(['Repository folder', 'Project name']);
    expect(buttonNamed(dialog, 'Add and start').props['disabled']).toBe(false);
    expect(tree.hostElementsIn([dialog], tree.withClass('gaia-add-repository-program-missing'))).toEqual([]);
    tree.dispatch(buttonNamed(dialog, 'Cancel'), 'onClick');
    expect(closed).toEqual([1]);
  });

  test('is the package\'s widest dialog, as B4 draws it', () => {
    const markup = renderToStaticMarkup(<AddRepositoryDialogLayout {...propsOf(false, senderOver([]).states(), [])} />);
    expect(markup).toContain('data-width="widest"');
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
    expect(tree.textOf([tree.onlyWithClass([dialog], 'design-system-failed-action-text')]))
      .toBe('The forge refused Add and start: not-a-git-repository. The folder is not a git repository.');
  });
});
