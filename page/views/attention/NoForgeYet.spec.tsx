/**
 * Attention with no forge registered. What matters (SCREENS B4, acceptance 2): the head says why nothing waits; the form adds a repository
 * and starts it; with no forge program "Add and start" is disabled and the dashed status line says why, with a way to choose the program;
 * a refused add shows in the form, and a refused Look again from the top bar on the screen. The command sender is the real one over Gaia's
 * server stood in for by authored answers; the commands behind the form's buttons are the shared form's own, proved beside it.
 */
import { describe, expect, test } from 'bun:test';

import type { CommandAnswerDocument }         from '../../@types/CommandDocument.ts';
import type { CommandSender, CommandStates }  from '../../api/CommandSender.ts';
import { AddRepositoryForm }                  from '../../shared/add-repository/AddRepositoryForm.ts';
import { answerResponse, senderOver }         from '../../testing/CommandServer.ts';
import { type HostElement, ReactElementTree } from '../../testing/ReactElementTree.ts';
import { NoForgeYetLayout }                   from './NoForgeYet.tsx';

const tree = ReactElementTree;

const FILLED_FORM = AddRepositoryForm.formAfterFolder(AddRepositoryForm.EMPTY_FORM, '~/development/example-storefront');

const INIT_REFUSED: CommandAnswerDocument = {
  answerVersion: 1,
  outcome:       'refused',
  refusal:       'not-a-git-repository',
  text:          'The folder is not a git repository.',
};

const LOOK_AGAIN_REFUSED: CommandAnswerDocument = {
  answerVersion: 1,
  outcome:       'refused',
  refusal:       'registry-unreadable',
  text:          'The registry could not be read.',
};

interface Pressed {
  readonly chooseFolder:       number;
  readonly addAndStart:        number;
  readonly chooseForgeProgram: number;
  readonly lookAgain:          number;
}

function layoutOf(forgeProgramIsMissing: boolean, form = FILLED_FORM, commandStates: CommandStates = senderOver([]).states()) {
  const pressed = {
    chooseFolder: 0, addAndStart: 0, chooseForgeProgram: 0, lookAgain: 0
  };
  const unfolded = tree.unfolded(
    <NoForgeYetLayout
      content={{ status: { condition: null, text: 'no forge on this machine yet' }, forgeProgramIsMissing }}
      form={form}
      pathChooser="folder"
      commandStates={commandStates}
      handlers={{
        onFolderTyped:  () => undefined,
        onProjectTyped: () => undefined,
        onChooseFolder: () => {
          pressed.chooseFolder += 1;
        },
        onAddAndStart: () => {
          pressed.addAndStart += 1;
        },
        onChooseForgeProgram: () => {
          pressed.chooseForgeProgram += 1;
        },
      }}
      onLookAgain={() => {
        pressed.lookAgain += 1;
      }}
      onDismissFailure={() => undefined}
    />,
  );
  return { unfolded, pressed: pressed as Pressed };
}

function buttonNamed(nodes: ReturnType<typeof tree.unfolded>, label: string): HostElement {
  return tree.onlyHostElementIn(nodes, (element) => element.tag === 'button' && tree.textOf([element]) === label);
}

describe('no forge yet', () => {
  test('says why nothing waits and offers the form, its fields named and "Add and start" the one primary button', () => {
    const { unfolded } = layoutOf(false);
    expect(tree.textOf([tree.onlyWithClass(unfolded, 'gaia-attention-no-forge-title')])).toBe('Nothing waits on you, because no forge is registered.');
    const fields = tree.hostElementsIn(unfolded, tree.withClass('gaia-text-field'));
    expect(fields.map((field) => tree.textOf([tree.onlyWithClass([field], 'gaia-text-field-label')]))).toEqual(['Repository folder', 'Project name']);
    expect(fields.map((field) => tree.onlyWithTag([field], 'input').props['value'])).toEqual(['~/development/example-storefront', 'example-storefront']);
    const buttons = tree.hostElementsIn(unfolded, tree.withClass('gaia-button'));
    expect(buttons.map((button) => [tree.textOf([button]), button.props['data-emphasis']])).toEqual([
      ['Choose a folder', 'plain'],
      ['Add and start', 'primary'],
    ]);
  });

  test('with a forge program, a filled form can be added and started, and the buttons call their handlers', () => {
    const { unfolded, pressed } = layoutOf(false);
    expect(tree.hostElementsIn(unfolded, tree.withClass('gaia-add-repository-program-missing'))).toEqual([]);
    tree.dispatch(buttonNamed(unfolded, 'Add and start'), 'onClick');
    tree.dispatch(buttonNamed(unfolded, 'Choose a folder'), 'onClick');
    expect(pressed).toEqual({
      chooseFolder: 1, addAndStart: 1, chooseForgeProgram: 0, lookAgain: 0
    });
    expect(buttonNamed(layoutOf(false, AddRepositoryForm.EMPTY_FORM).unfolded, 'Add and start').props['disabled']).toBe(true);
  });

  test('with no forge program, "Add and start" is disabled and the dashed status line says why', () => {
    const { unfolded, pressed } = layoutOf(true);
    expect(buttonNamed(unfolded, 'Add and start').props['disabled']).toBe(true);
    const line = tree.onlyWithClass(unfolded, 'gaia-add-repository-program-missing');
    expect(line.props['role']).toBe('status');
    expect(tree.textOf([tree.onlyWithClass([line], 'gaia-add-repository-program-missing-text')])).toBe(
      'The forge program was not found. Gaia can show running forges without it, but cannot start one.',
    );
    tree.dispatch(buttonNamed([line], 'Choose the forge program'), 'onClick');
    expect(pressed.chooseForgeProgram).toBe(1);
  });

  test('a refused add shows in the form with the forge\'s code and sentence', async () => {
    const sender = senderOver([() => Promise.resolve(answerResponse(INIT_REFUSED))]);
    await sender.send(AddRepositoryForm.addCommandOf(FILLED_FORM));
    const add = tree.onlyWithClass(layoutOf(false, FILLED_FORM, sender.states()).unfolded, 'gaia-attention-add');
    expect(tree.textOf([tree.onlyWithClass([add], 'gaia-refusal-text')])).toBe('The forge refused Add and start: not-a-git-repository. The folder is not a git repository.');
  });

  test('a refused Look again from the top bar shows on the screen, and Try again sends it once more', async () => {
    const sender = senderOver([() => Promise.resolve(answerResponse(LOOK_AGAIN_REFUSED))]);
    await sender.send({ kind: 'fleet-look-again' });
    const { unfolded, pressed } = layoutOf(false, FILLED_FORM, sender.states());
    const refusal = tree.onlyWithClass(unfolded, 'gaia-refusal');
    expect(tree.textOf([tree.onlyWithClass([refusal], 'gaia-refusal-text')])).toBe('The forge refused Look again: registry-unreadable. The registry could not be read.');
    tree.dispatch(buttonNamed([refusal], 'Try again'), 'onClick');
    expect(pressed.lookAgain).toBe(1);
  });

  test('"Choose a folder" is disabled while a path is being chosen', () => {
    const sender: CommandSender = senderOver([() => new Promise<Response>(() => undefined)]);
    void sender.send({ kind: 'path-choose', what: 'folder' });
    expect(buttonNamed(layoutOf(false, FILLED_FORM, sender.states()).unfolded, 'Choose a folder').props['disabled']).toBe(true);
  });
});
