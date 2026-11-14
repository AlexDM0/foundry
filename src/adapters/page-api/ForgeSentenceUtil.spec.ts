/**
 * Gaia's wording of a forge sentence that tells User to run a command (D10). What matters: a known refusal code or notice kind is worded
 * by Gaia whatever the forge's prose says, so a reworded forge sentence cannot slip through; an unknown sentence that names a command, by
 * a backticked span or by `forge <verb>`, is dropped for a neutral one; and a sentence that names none passes through unchanged, so Gaia
 * does not reword the forge where D10 does not ask it to. The forge's sentences below are worded as the forge words them.
 */
import { describe, expect, test } from 'bun:test';

import { ForgeSentenceUtil } from './ForgeSentenceUtil.ts';

const NEW_CODE_NOTICE = 'new code: run `forge update`';
const INSTALL_CHANGED_NOTICE = 'the install version changed, so launches are held: run `forge update`';

describe('whether a sentence names a command', () => {
  test('names one by a backticked span or by the program\'s name before one of its verbs', () => {
    expect(ForgeSentenceUtil.sentenceNamesACommand(NEW_CODE_NOTICE)).toBe(true);
    expect(ForgeSentenceUtil.sentenceNamesACommand('Run forge open again.')).toBe(true);
    expect(ForgeSentenceUtil.sentenceNamesACommand('Then Forge Oversee restart takes it.')).toBe(true);
    expect(ForgeSentenceUtil.sentenceNamesACommand('See forge merges and forge incidents for what waits.')).toBe(true);
  });

  test('names none for the forge\'s name before a word that is no verb of it, nor for a sentence without either', () => {
    expect(ForgeSentenceUtil.sentenceNamesACommand('The files forge installed are install version 28. Update forge itself first.')).toBe(false);
    expect(ForgeSentenceUtil.sentenceNamesACommand('A machine agent limit of 64 is above the 10 CPUs this machine has, so nothing was written.')).toBe(false);
  });
});

describe('the sentence of a forge\'s refusal', () => {
  test('is Gaia\'s for each code the forge words with a command, whatever the forge\'s sentence', () => {
    expect(ForgeSentenceUtil.refusalSentenceOf('launches-held-by-install-change', 'The install version changed: run `forge update`.'))
      .toBe('The install version changed. Nothing launches until this forge is updated.');
    expect(ForgeSentenceUtil.refusalSentenceOf('install-version-mismatch', 'A reworded sentence with no command.'))
      .toBe('The install version of the forge files in this repository does not match the forge program Gaia runs, so nothing was done.');
    expect(ForgeSentenceUtil.refusalSentenceOf('no-tracker-at-override', null)).toBe('No forge tracker was found in this repository, so nothing was done.');
    expect(ForgeSentenceUtil.refusalSentenceOf('no-tracker-found', 'Run `forge init` in the repository you want tracked.'))
      .toBe('No forge tracker was found in this repository, so nothing was done.');
    expect(ForgeSentenceUtil.refusalSentenceOf('unauthorized', 'open the board again with `forge open`.'))
      .toBe('The Overseer did not accept Gaia\'s token. It may have restarted.');
    expect(ForgeSentenceUtil.refusalSentenceOf('read-failed', 'Run `forge status` in the repository.')).toBe('The Overseer could not read the board\'s files.');
  });

  test('is none for an unknown code whose sentence names a command, so the page words the refusal from its outcome', () => {
    expect(ForgeSentenceUtil.refusalSentenceOf('arguments-refused', 'It is a bare repository. Run `forge init` in a checkout of it.')).toBeNull();
    expect(ForgeSentenceUtil.refusalSentenceOf(null, 'Run forge start first.')).toBeNull();
  });

  test('is the forge\'s own, unchanged, when it names no command, and none when the forge gave none', () => {
    const sentence = 'The Overseer at http://127.0.0.1:47213/ (process 48107) is still live after being asked to stop; its Baton was left as it is.';
    expect(ForgeSentenceUtil.refusalSentenceOf('overseer-still-live', sentence)).toBe(sentence);
    expect(ForgeSentenceUtil.refusalSentenceOf('overseer-still-live', null)).toBeNull();
    expect(ForgeSentenceUtil.refusalSentenceOf('constructor', null)).toBeNull();
  });
});

describe('the sentence of a notice and of a warning', () => {
  test('is Gaia\'s for each notice kind the forge words with a command', () => {
    expect(ForgeSentenceUtil.noticeSentenceOf('new-code', NEW_CODE_NOTICE))
      .toBe('New code is on disk. The Overseer runs the code it started with until it restarts.');
    expect(ForgeSentenceUtil.noticeSentenceOf('install-version-changed', INSTALL_CHANGED_NOTICE))
      .toBe('The install version changed. Nothing launches until this forge is updated.');
    expect(ForgeSentenceUtil.noticeSentenceOf('claude-md-block-committed', 'launches onto main wait: commit the CLAUDE.md change `update` made'))
      .toBe('Launches wait until the CLAUDE.md change that updating the forge made is committed.');
  });

  test('is Gaia\'s for an Assistant that cannot come up, which the forge sends as a warning and Gaia shows as a notice', () => {
    expect(ForgeSentenceUtil.noticeSentenceOf('assistant-down', 'no Assistant can come up: open incidents take their defaults'))
      .toBe('This forge\'s Assistant cannot come up, so its open incidents take their defaults.');
  });

  test('is neutral for a notice of another kind or a warning that names a command', () => {
    expect(ForgeSentenceUtil.noticeSentenceOf('example-kind', 'run `forge oversee restart`')).toBe('This forge raised a notice that Gaia does not word yet.');
    expect(ForgeSentenceUtil.warningSentenceOf('The Baton pass failed: run `forge oversee restart`.')).toBe('This forge reports a warning that Gaia does not word yet.');
  });

  test('is the forge\'s own, unchanged, when it names no command', () => {
    const notice = 'job J1 is not launched: this platform cannot bind the Watcher endpoint /Users/example/.forge-monitor/watchers/example.sock';
    expect(ForgeSentenceUtil.noticeSentenceOf('watcher-endpoint-does-not-fit', notice)).toBe(notice);
    expect(ForgeSentenceUtil.noticeSentenceOf('toString', notice)).toBe(notice);
    expect(ForgeSentenceUtil.warningSentenceOf('The Assistant could not come up.')).toBe('The Assistant could not come up.');
  });
});
