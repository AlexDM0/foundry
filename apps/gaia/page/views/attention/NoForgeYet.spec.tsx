/**
 * Attention with no forge registered. What matters (SCREENS B4, acceptance 2): the head says why nothing waits; the form adds a repository
 * and starts it; with no forge program "Add and start" is disabled and the dashed status line says why, with a way to choose the program,
 * and with one the line under the card names it from ~ and says, once, that a forge set up elsewhere appears by itself;
 * a refused add shows in the form, and a refused Look again under its button at the head of the screen. The command sender is the real one over Gaia's
 * server stood in for by authored answers; the commands behind the form's buttons are the shared form's own, proved beside it.
 */
import { describe, expect, test } from 'bun:test';
import { TextField }              from 'design-system-contributions/TextField';

import type { CommandAnswerDocument }         from '../../@types/CommandDocument.ts';
import type { CommandSender, CommandStates }  from '../../api/CommandSender.ts';
import { NOTHING_SENT }                       from '../../shared/add-repository/AddRepositoryFields.tsx';
import { AddRepositoryForm }                  from '../../shared/add-repository/AddRepositoryForm.ts';
import { answerResponse, senderOver }         from '../../testing/CommandServer.ts';
import { FailedActions }                      from '../../testing/FailedActions.ts';
import { PackageButtons }                     from '../../testing/PackageButtons.ts';
import { type HostElement, ReactElementTree } from '../../testing/ReactElementTree.ts';
import { NoForgeYetLayout }                   from './NoForgeYet.tsx';

const tree = ReactElementTree;

const FILLED_FORM = AddRepositoryForm.formAfterFolder(AddRepositoryForm.EMPTY_FORM, '~/development/example-storefront');

const INIT_REFUSED: CommandAnswerDocument = {
  answerVersion: 3,
  outcome:       'refused',
  refusal:       'not-a-git-repository',
  text:          'The folder is not a git repository.',
};

const LOOK_AGAIN_REFUSED: CommandAnswerDocument = {
  answerVersion: 3,
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
      content={{ forgeProgramIsMissing, forgeProgramText: forgeProgramIsMissing ? null : '~/.bun/bin/forge' }}
      form={form}
      sentResults={NOTHING_SENT}
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
  return PackageButtons.onlyLabelled(nodes, label);
}

describe('no forge yet', () => {
  test('offers Look again, says why nothing waits and offers the form, its fields named and "Add and start" the one primary button', () => {
    const { unfolded } = layoutOf(false);
    expect(tree.textOf([tree.onlyWithClass(unfolded, 'gaia-attention-no-forge-title')])).toBe('Nothing waits on you, because no forge is registered.');
    const fields = tree.hostElementsIn(unfolded, tree.withComponent(TextField));
    expect(fields.map((field) => field.props['label'])).toEqual(['Repository folder', 'Project name']);
    expect(fields.map((field) => field.props['value'])).toEqual(['~/development/example-storefront', 'example-storefront']);
    const buttons = PackageButtons.buttonsIn(unfolded);
    expect(buttons.map((button) => [PackageButtons.labelOf(button), PackageButtons.emphasisOf(button)])).toEqual([
      ['Look again', 'quiet'],
      ['Choose a folder', 'quiet'],
      ['Add and start', 'primary'],
    ]);
  });

  test('with a forge program, a filled form can be added and started, and the buttons call their handlers', () => {
    const { unfolded, pressed } = layoutOf(false);
    expect(tree.hostElementsIn(unfolded, tree.withClass('gaia-add-repository-program-missing'))).toEqual([]);
    PackageButtons.press(buttonNamed(unfolded, 'Add and start'));
    PackageButtons.press(buttonNamed(unfolded, 'Choose a folder'));
    PackageButtons.press(buttonNamed(unfolded, 'Look again'));
    expect(pressed).toEqual({
      chooseFolder: 1, addAndStart: 1, chooseForgeProgram: 0, lookAgain: 1
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
    PackageButtons.press(buttonNamed([line], 'Choose the forge program'));
    expect(pressed.chooseForgeProgram).toBe(1);
  });

  test('only with a forge program does the line under the card name it from ~ and say a forge set up elsewhere appears by itself', () => {
    const foundLines = (forgeProgramIsMissing: boolean) => tree.hostElementsIn(layoutOf(forgeProgramIsMissing).unfolded, tree.withClass('gaia-attention-no-forge-found'));
    const [foundLine] = foundLines(false);
    if (foundLine === undefined) throw new Error('Expected the found line.');
    expect(tree.textOf([tree.onlyWithClass([foundLine], 'gaia-attention-no-forge-program')])).toBe('~/.bun/bin/forge');
    expect(tree.textOf([tree.onlyWithClass([foundLine], 'gaia-attention-no-forge-elsewhere')])).toBe('A forge set up elsewhere appears here by itself.');
    expect(foundLines(false)).toHaveLength(1);
    expect(foundLines(true)).toEqual([]);
  });

  test('says a forge set up elsewhere appears by itself once, under the card, and the form above it never does', () => {
    const { unfolded } = layoutOf(false);
    expect(tree.textOf(unfolded).split('A forge set up elsewhere appears here by itself.')).toHaveLength(2);
    const card = tree.onlyWithClass(unfolded, 'gaia-attention-add');
    expect(tree.textOf([card])).not.toContain('appears here by itself');
  });

  test('a refused add shows in the form with the forge\'s code and sentence', async () => {
    const sender = senderOver([() => Promise.resolve(answerResponse(INIT_REFUSED))]);
    await sender.send(AddRepositoryForm.addCommandOf(FILLED_FORM));
    const add = tree.onlyWithClass(layoutOf(false, FILLED_FORM, sender.states()).unfolded, 'gaia-attention-add');
    expect(FailedActions.wordsOf(FailedActions.onlyFailedActionIn([add])))
      .toEqual(['The forge refused Add and start: ', 'not-a-git-repository', 'The folder is not a git repository.']);
  });

  test('a refused Look again shows under its button, and Try again sends it once more', async () => {
    const sender = senderOver([() => Promise.resolve(answerResponse(LOOK_AGAIN_REFUSED))]);
    await sender.send({ kind: 'fleet-look-again' });
    const { unfolded, pressed } = layoutOf(false, FILLED_FORM, sender.states());
    const refusal = FailedActions.onlyFailedActionIn(unfolded);
    expect(FailedActions.wordsOf(refusal)).toEqual(['Gaia could not Look again: ', 'registry-unreadable', 'The registry could not be read.']);
    const [welcome, refusalPlace] = tree.onlyWithClass(unfolded, 'gaia-attention-no-forge-intro').children;
    expect([typeof welcome === 'object' && tree.hasClass(welcome, 'gaia-attention-no-forge-welcome'), refusalPlace]).toEqual([true, refusal]);
    expect(refusal.props['retryLabel']).toBe('Try again');
    tree.dispatch(refusal, 'onRetry');
    expect(pressed.lookAgain).toBe(1);
  });

  test('Look again is disabled while it is on its way', () => {
    const sender: CommandSender = senderOver([() => new Promise<Response>(() => undefined)]);
    void sender.send({ kind: 'fleet-look-again' });
    expect(buttonNamed(layoutOf(false, FILLED_FORM, sender.states()).unfolded, 'Look again').props['disabled']).toBe(true);
  });

  test('"Choose a folder" is disabled while a path is being chosen', () => {
    const sender: CommandSender = senderOver([() => new Promise<Response>(() => undefined)]);
    void sender.send({ kind: 'path-choose', what: 'folder' });
    expect(buttonNamed(layoutOf(false, FILLED_FORM, sender.states()).unfolded, 'Choose a folder').props['disabled']).toBe(true);
  });
});
