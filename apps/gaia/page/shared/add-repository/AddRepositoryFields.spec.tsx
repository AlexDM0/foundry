/**
 * The add-a-repository form shared by B4 and A4's dialog. What matters: a folder is chosen through `path-choose` and a cancelled choice is
 * none; a forge program chosen is kept through `settings-set` and a cancelled choice sends nothing more; "Add and start" sends `forge-add`
 * with the trimmed form and reports whether it went through, so a dialog closes only then, and only while it is still open; a refused
 * choice of the program shows under its line even once a program is known. Both choosers share `path-choose` and other screens send
 * `settings-set`, so a failure shows only beside the button whose own send failed. The command sender is the real one over Gaia's server
 * stood in for by authored answers.
 */
import { describe, expect, test } from 'bun:test';

import type { CommandAnswerDocument }                   from '../../@types/CommandDocument.ts';
import type { CommandResult, CommandStates }            from '../../api/CommandSender.ts';
import { answerResponse, senderOver, type SentRequest } from '../../testing/CommandServer.ts';
import { FailedActions }                                from '../../testing/FailedActions.ts';
import { ReactElementTree }                             from '../../testing/ReactElementTree.ts';
import {
  AddRepositoryCommands,
  AddRepositoryFields,
  type AddRepositorySentResults,
  ForgeProgramMissingLine,
  NOTHING_SENT,
} from './AddRepositoryFields.tsx';
import { AddRepositoryForm } from './AddRepositoryForm.ts';

const tree = ReactElementTree;

const ANSWERED_PATH = (path: string): CommandAnswerDocument => ({
  answerVersion: 3, outcome: 'done', refusal: null, text: path, forges: []
});

const CANCELLED: CommandAnswerDocument = {
  answerVersion: 3, outcome: 'nothing-to-do', refusal: null, text: null, forges: []
};

const DONE: CommandAnswerDocument = {
  answerVersion: 3, outcome: 'done', refusal: null, text: null, forges: []
};

const START_REFUSED: CommandAnswerDocument = {
  answerVersion: 3,
  outcome:       'refused',
  refusal:       'hephaestus-did-not-answer',
  text:          'Hephaestus started but its API did not answer.',
  forges:        [],
};

const SETTINGS_REFUSED: CommandAnswerDocument = {
  answerVersion: 3,
  outcome:       'refused',
  refusal:       'settings-unwritable',
  text:          'Gaia could not write its settings.',
  forges:        [],
};

function bodiesOf(sent: readonly SentRequest[]): unknown[] {
  return sent.map((request) => JSON.parse(String(request.requestOptions.body)));
}

describe('the commands behind its buttons', () => {
  test('a chosen folder is the path Gaia answered, and a cancelled choice is none', async () => {
    const sent: SentRequest[] = [];
    const sender = senderOver([
      () => Promise.resolve(answerResponse(ANSWERED_PATH('/Users/alexexample/development/example-storefront'))),
      () => Promise.resolve(answerResponse(CANCELLED)),
    ], sent);
    expect(await AddRepositoryCommands.chosenFolderOf(sender.send)).toBe('/Users/alexexample/development/example-storefront');
    expect(await AddRepositoryCommands.chosenFolderOf(sender.send)).toBeNull();
    expect(bodiesOf(sent)).toEqual([
      { kind: 'path-choose', what: 'folder', commandVersion: 5 },
      { kind: 'path-choose', what: 'folder', commandVersion: 5 },
    ]);
  });

  test('a chosen forge program is kept in the settings; a cancelled choice sends nothing more', async () => {
    const sent: SentRequest[] = [];
    const sender = senderOver([
      () => Promise.resolve(answerResponse(ANSWERED_PATH('/Users/alexexample/.bun/bin/forge'))),
      () => Promise.resolve(answerResponse(DONE)),
      () => Promise.resolve(answerResponse(CANCELLED)),
    ], sent);
    await AddRepositoryCommands.chooseAndKeepForgeProgram(sender.send, sender.send);
    await AddRepositoryCommands.chooseAndKeepForgeProgram(sender.send, sender.send);
    expect(bodiesOf(sent)).toEqual([
      { kind: 'path-choose', what: 'file', commandVersion: 5 },
      {
        kind: 'settings-set', key: 'forgeProgramPath', value: '/Users/alexexample/.bun/bin/forge', commandVersion: 5
      },
      { kind: 'path-choose', what: 'file', commandVersion: 5 },
    ]);
  });

  test('"Add and start" sends the trimmed form and goes through only when Gaia answers done or nothing to do', async () => {
    const sent: SentRequest[] = [];
    const sender = senderOver([
      () => Promise.resolve(answerResponse(DONE)),
      () => Promise.resolve(answerResponse(START_REFUSED)),
      () => Promise.resolve(answerResponse(CANCELLED)),
    ], sent);
    const form = AddRepositoryForm.formAfterFolder(AddRepositoryForm.EMPTY_FORM, ' ~/development/example-storefront/ ');
    expect(await AddRepositoryCommands.addAndStart(sender.send, form)).toBe(true);
    expect(await AddRepositoryCommands.addAndStart(sender.send, form)).toBe(false);
    expect(await AddRepositoryCommands.addAndStart(sender.send, form)).toBe(true);
    expect(bodiesOf(sent)[0]).toEqual({
      kind: 'forge-add', root: '~/development/example-storefront/', project: 'example-storefront', commandVersion: 5
    });
  });

  test('an add that went through runs onAdded only while the form is still open, so a late answer moves User nowhere', async () => {
    const sender = senderOver([() => Promise.resolve(answerResponse(DONE)), () => Promise.resolve(answerResponse(DONE))]);
    const form = AddRepositoryForm.formAfterFolder(AddRepositoryForm.EMPTY_FORM, '~/development/example-storefront');
    const added: string[] = [];
    await AddRepositoryCommands.addAndStartWhileOpen(sender.send, form, () => false, () => added.push('closed form'));
    await AddRepositoryCommands.addAndStartWhileOpen(sender.send, form, () => true, () => added.push('open form'));
    expect(added).toEqual(['open form']);
  });
});

function missingLineOf(commandStates: CommandStates, sentResults: AddRepositorySentResults) {
  return tree.unfolded(
    <ForgeProgramMissingLine
      forgeProgramIsMissing
      sentResults={sentResults}
      commandStates={commandStates}
      onChooseForgeProgram={() => undefined}
      onDismissFailure={() => undefined}
    />,
  );
}

function fieldsOf(commandStates: CommandStates, sentResults: AddRepositorySentResults) {
  return tree.unfolded(
    <AddRepositoryFields
      form={AddRepositoryForm.EMPTY_FORM}
      sentResults={sentResults}
      forgeProgramIsMissing={false}
      commandStates={commandStates}
      handlers={{
        onFolderTyped:        () => undefined,
        onProjectTyped:       () => undefined,
        onChooseFolder:       () => undefined,
        onAddAndStart:        () => undefined,
        onChooseForgeProgram: () => undefined,
      }}
      onDismissFailure={() => undefined}
    />,
  );
}

const PATH_CHOICE_REFUSED: CommandAnswerDocument = {
  answerVersion: 3,
  outcome:       'refused',
  refusal:       'chooser-unavailable',
  text:          'The system\'s file chooser did not open.',
  forges:        [],
};

describe('the line of a missing forge program', () => {
  test('is absent once a program is known, while a refused keeping of the chosen one still shows', async () => {
    const sender = senderOver([() => Promise.resolve(answerResponse(SETTINGS_REFUSED))]);
    const keeping = await sender.send({ kind: 'settings-set', key: 'forgeProgramPath', value: '/Users/alexexample/.bun/bin/forge' });
    const unfolded = tree.unfolded(
      <ForgeProgramMissingLine
        forgeProgramIsMissing={false}
        sentResults={{ ...NOTHING_SENT, forgeProgramKeeping: keeping }}
        commandStates={sender.states()}
        onChooseForgeProgram={() => undefined}
        onDismissFailure={() => undefined}
      />,
    );
    expect(tree.hostElementsIn(unfolded, tree.withClass('gaia-add-repository-program-missing'))).toEqual([]);
    expect(FailedActions.wordsOf(FailedActions.onlyFailedActionIn(unfolded))).toEqual([
      'Gaia could not Choose the forge program: ', 'settings-unwritable', 'Gaia could not write its settings.',
    ]);
  });
});

describe('a failure shows only beside the button whose send it was', () => {
  test('a settings-set another screen sent, as the Gaia panel\'s checkboxes do, shows no refusal under the forge program\'s line', async () => {
    const sender = senderOver([() => Promise.resolve(answerResponse(SETTINGS_REFUSED))]);
    await sender.send({ kind: 'settings-set', key: 'startForgesAtLogin', value: true });
    expect(FailedActions.failedActionsIn(missingLineOf(sender.states(), NOTHING_SENT))).toEqual([]);
  });

  test('a refused choice of the forge program shows under its line and not under "Choose a folder"', async () => {
    const sender = senderOver([() => Promise.resolve(answerResponse(PATH_CHOICE_REFUSED))]);
    let forgeProgramChoice: CommandResult | null = null;
    await AddRepositoryCommands.chooseAndKeepForgeProgram(async (command) => {
      forgeProgramChoice = await sender.send(command);
      return forgeProgramChoice;
    }, sender.send);
    const sentResults = { ...NOTHING_SENT, forgeProgramChoice };
    expect(FailedActions.failedActionsIn(fieldsOf(sender.states(), sentResults))).toEqual([]);
    expect(FailedActions.onlyFailedActionIn(missingLineOf(sender.states(), sentResults)).props['code']).toBe('chooser-unavailable');
  });

  test('a refused choice of a folder shows under "Choose a folder" and not under the forge program\'s line', async () => {
    const sender = senderOver([() => Promise.resolve(answerResponse(PATH_CHOICE_REFUSED))]);
    const folderChoice = await sender.send({ kind: 'path-choose', what: 'folder' });
    const sentResults = { ...NOTHING_SENT, folderChoice };
    expect(FailedActions.onlyFailedActionIn(fieldsOf(sender.states(), sentResults)).props['code']).toBe('chooser-unavailable');
    expect(FailedActions.failedActionsIn(missingLineOf(sender.states(), sentResults))).toEqual([]);
  });
});
