/**
 * The add-a-repository form shared by B4 and A4's dialog. What matters: a folder is chosen through `path-choose` and a cancelled choice is
 * none; a forge program chosen is kept through `settings-set` and a cancelled choice sends nothing more; "Add and start" sends `forge-add`
 * with the trimmed form and reports whether it went through, so a dialog closes only then; a refused choice of the program shows under its
 * line even once a program is known. The command sender is the real one over Gaia's server stood in for by authored answers.
 */
import { describe, expect, test } from 'bun:test';

import type { CommandAnswerDocument }                     from '../../@types/CommandDocument.ts';
import { answerResponse, senderOver, type SentRequest }   from '../../testing/CommandServer.ts';
import { ReactElementTree }                               from '../../testing/ReactElementTree.ts';
import { AddRepositoryCommands, ForgeProgramMissingLine } from './AddRepositoryFields.tsx';
import { AddRepositoryForm }                              from './AddRepositoryForm.ts';

const tree = ReactElementTree;

const ANSWERED_PATH = (path: string): CommandAnswerDocument => ({
  answerVersion: 1, outcome: 'done', refusal: null, text: path
});

const CANCELLED: CommandAnswerDocument = {
  answerVersion: 1, outcome: 'nothing-to-do', refusal: null, text: null
};

const DONE: CommandAnswerDocument = {
  answerVersion: 1, outcome: 'done', refusal: null, text: null
};

const START_REFUSED: CommandAnswerDocument = {
  answerVersion: 1,
  outcome:       'refused',
  refusal:       'overseer-did-not-answer',
  text:          'The Overseer started but its API did not answer.',
};

const SETTINGS_REFUSED: CommandAnswerDocument = {
  answerVersion: 1,
  outcome:       'refused',
  refusal:       'settings-unwritable',
  text:          'Gaia could not write its settings.',
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
      { kind: 'path-choose', what: 'folder', commandVersion: 1 },
      { kind: 'path-choose', what: 'folder', commandVersion: 1 },
    ]);
  });

  test('a chosen forge program is kept in the settings; a cancelled choice sends nothing more', async () => {
    const sent: SentRequest[] = [];
    const sender = senderOver([
      () => Promise.resolve(answerResponse(ANSWERED_PATH('/Users/alexexample/.bun/bin/forge'))),
      () => Promise.resolve(answerResponse(DONE)),
      () => Promise.resolve(answerResponse(CANCELLED)),
    ], sent);
    await AddRepositoryCommands.chooseAndKeepForgeProgram(sender.send);
    await AddRepositoryCommands.chooseAndKeepForgeProgram(sender.send);
    expect(bodiesOf(sent)).toEqual([
      { kind: 'path-choose', what: 'file', commandVersion: 1 },
      {
        kind: 'settings-set', key: 'forgeProgramPath', value: '/Users/alexexample/.bun/bin/forge', commandVersion: 1
      },
      { kind: 'path-choose', what: 'file', commandVersion: 1 },
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
      kind: 'forge-add', root: '~/development/example-storefront/', project: 'example-storefront', commandVersion: 1
    });
  });
});

describe('the line of a missing forge program', () => {
  test('is absent once a program is known, while a refused keeping of the chosen one still shows', async () => {
    const sender = senderOver([() => Promise.resolve(answerResponse(SETTINGS_REFUSED))]);
    await sender.send({ kind: 'settings-set', key: 'forgeProgramPath', value: '/Users/alexexample/.bun/bin/forge' });
    const unfolded = tree.unfolded(
      <ForgeProgramMissingLine
        forgeProgramIsMissing={false}
        pathChooser="forge-program"
        commandStates={sender.states()}
        onChooseForgeProgram={() => undefined}
        onDismissFailure={() => undefined}
      />,
    );
    expect(tree.hostElementsIn(unfolded, tree.withClass('gaia-add-repository-program-missing'))).toEqual([]);
    expect(tree.textOf([tree.onlyWithClass(unfolded, 'gaia-refusal-text')])).toBe(
      'The forge refused Choose the forge program: settings-unwritable. Gaia could not write its settings.',
    );
  });
});
