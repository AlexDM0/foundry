/**
 * Gaia's wording of a forge sentence that tells User to run a command: a refusal is never reworded; a known notice kind is worded by Gaia
 * whatever the forge's prose, so a reworded sentence cannot slip through; any other sentence naming a command is dropped for a neutral one,
 * one naming none passes unchanged. A registry entry's last command reaches the page only as the name of Gaia's own command for it.
 */
import { describe, expect, test } from 'bun:test';

import { FORGE_NOTICE_KINDS } from '../../shared/constants/ForgeNoticeKinds.ts';
import { ForgeSentenceUtil }  from './ForgeSentenceUtil.ts';

const NEW_CODE_NOTICE = 'new code: run `forge update`';
const INSTALL_CHANGED_NOTICE = 'the install version changed, so launches are held: run `forge update`';

describe('whether a sentence names a command', () => {
  test('names one by a backticked span or by the program\'s name before one of its verbs', () => {
    expect(ForgeSentenceUtil.sentenceNamesACommand(NEW_CODE_NOTICE)).toBe(true);
    expect(ForgeSentenceUtil.sentenceNamesACommand('Run forge open again.')).toBe(true);
    expect(ForgeSentenceUtil.sentenceNamesACommand('Then Forge Restart takes it.')).toBe(true);
    expect(ForgeSentenceUtil.sentenceNamesACommand('See forge merges and forge incidents for what waits.')).toBe(true);
  });

  test('names none for the forge\'s name before a word that is no verb of it, nor for a sentence without either', () => {
    expect(ForgeSentenceUtil.sentenceNamesACommand('The files forge installed are install version 28. Update forge itself first.')).toBe(false);
    expect(ForgeSentenceUtil.sentenceNamesACommand('A machine agent limit of 64 is above the 10 CPUs this machine has, so nothing was written.')).toBe(false);
  });
});

describe('a forge\'s refusal', () => {
  test('is worded by no function here, since it reads as the forge\'s own sentence (decision 45)', () => {
    expect(Object.keys(ForgeSentenceUtil).filter((functionName) => /refusal/i.test(functionName))).toEqual([]);
  });
});

describe('the sentence of a notice and of a warning', () => {
  test('is Gaia\'s for each notice kind the forge words with a command', () => {
    expect(ForgeSentenceUtil.noticeSentenceOf('new-code', NEW_CODE_NOTICE))
      .toBe('New code is on disk. Hephaestus runs the code it started with until it restarts.');
    expect(ForgeSentenceUtil.noticeSentenceOf('install-version-changed', INSTALL_CHANGED_NOTICE))
      .toBe('The install version changed. Nothing launches until this forge is updated.');
  });

  test('is Gaia\'s for an Assistant that cannot come up, which the forge sends as a warning and Gaia shows as a notice', () => {
    expect(ForgeSentenceUtil.noticeSentenceOf(FORGE_NOTICE_KINDS.assistantDown, 'no Assistant can come up: open incidents take their defaults'))
      .toBe('This forge\'s Assistant cannot come up, so its open incidents take their defaults.');
  });

  test('is neutral for a notice of another kind or a warning that names a command', () => {
    expect(ForgeSentenceUtil.noticeSentenceOf('example-kind', 'run `forge restart`')).toBe('This forge raised a notice that Gaia does not word yet.');
    expect(ForgeSentenceUtil.warningSentenceOf('The restart failed: run `forge restart`.')).toBe('This forge reports a warning that Gaia does not word yet.');
  });

  test('is the forge\'s own, unchanged, when it names no command', () => {
    const notice = 'job J1 is not launched: this platform cannot bind the Talos endpoint /Users/example/.forge-monitor/private/example.sock';
    expect(ForgeSentenceUtil.noticeSentenceOf('talos-endpoint-does-not-fit', notice)).toBe(notice);
    expect(ForgeSentenceUtil.noticeSentenceOf('toString', notice)).toBe(notice);
    expect(ForgeSentenceUtil.warningSentenceOf('The Assistant could not come up.')).toBe('The Assistant could not come up.');
  });
});

describe('the sentence of an activity entry', () => {
  test('is neutral for an activity entry that names a command', () => {
    expect(ForgeSentenceUtil.activitySentenceOf('The restart failed: run `forge restart`.')).toBe('This forge logged an entry that Gaia does not word yet.');
  });

  test('is the forge\'s own, unchanged, when it names no command', () => {
    expect(ForgeSentenceUtil.activitySentenceOf('J4 ran 2:00')).toBe('J4 ran 2:00');
  });
});

describe('the last command of a registry entry', () => {
  test('is named by Gaia\'s own command for each forge verb Gaia runs itself', () => {
    expect(ForgeSentenceUtil.lastCommandNameOf('start')).toBe('Start forge');
    expect(ForgeSentenceUtil.lastCommandNameOf('stop')).toBe('Stop forge');
    expect(ForgeSentenceUtil.lastCommandNameOf('update')).toBe('Update forge');
    expect(ForgeSentenceUtil.lastCommandNameOf('init')).toBe('Add a repository');
  });

  test('is none for any other forge verb, for a key of the object prototype, and for an entry that names none', () => {
    expect(ForgeSentenceUtil.lastCommandNameOf('ticket ready')).toBeNull();
    expect(ForgeSentenceUtil.lastCommandNameOf('open')).toBeNull();
    expect(ForgeSentenceUtil.lastCommandNameOf('constructor')).toBeNull();
    expect(ForgeSentenceUtil.lastCommandNameOf(null)).toBeNull();
  });
});
