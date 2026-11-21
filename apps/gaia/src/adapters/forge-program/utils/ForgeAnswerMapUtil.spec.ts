/**
 * The mapping from one run of the forge program to a verdict, against its own contract: a run that found nothing to run or ran out of time,
 * a document at another answer version or no document at all, a refusal at any exit but 0 with its words unchanged, and a done document
 * that lacks what its answer needs. Each verb's mapper is pinned on the keys F8 states and on the ones it may leave out.
 */
import { describe, expect, test } from 'bun:test';

import type { ProgramRunAnswer } from '../../../lib/process-run/ProcessRun.ts';
import type { ForgeBatonPass }   from '../@types/ForgeProgramAnswer.ts';

import { ForgeAnswerMapUtil } from './ForgeAnswerMapUtil.ts';

const PLACE = { program: '/Users/example/.bun/bin/forge', root: '/Users/example/development/example-project' };

function finishedRun(exitCode: number, document: unknown): ProgramRunAnswer {
  return {
    verdict: 'finished', exitCode, standardOutput: `${JSON.stringify(document, null, 2)}\n`, standardError: ''
  };
}

function stopVerdictOf(run: ProgramRunAnswer) {
  return ForgeAnswerMapUtil.verdictOfRun(run, PLACE, ForgeAnswerMapUtil.stopAnswerOf);
}

describe('a run that answered nothing', () => {
  test('answers program-not-found with the program it tried when the program is not there', () => {
    expect(stopVerdictOf({ verdict: 'not-found', missing: 'program' })).toEqual({ verdict: 'program-not-found', program: PLACE.program });
  });

  test('answers root-missing with the root when the forge root is gone', () => {
    expect(stopVerdictOf({ verdict: 'not-found', missing: 'working-directory' })).toEqual({ verdict: 'root-missing', root: PLACE.root });
  });

  test('answers timed-out when the program outlived its bound', () => {
    expect(stopVerdictOf({ verdict: 'timed-out' })).toEqual({ verdict: 'timed-out' });
  });
});

describe('an answer Gaia does not understand', () => {
  test('is no-json when standard output is not one JSON object', () => {
    expect(stopVerdictOf({
      verdict: 'finished', exitCode: 0, standardOutput: 'stopped\n', standardError: ''
    })).toEqual({ verdict: 'answer-not-understood', reason: 'no-json', exitCode: 0 });
    expect(stopVerdictOf(finishedRun(0, [{ answerVersion: 2, outcome: 'done' }]))).toEqual({ verdict: 'answer-not-understood', reason: 'no-json', exitCode: 0 });
  });

  test('is other-answer-version for a document at another answerVersion or without one, done or refused, and maps nothing', () => {
    expect(stopVerdictOf(finishedRun(0, { answerVersion: 1, outcome: 'done' }))).toEqual({ verdict: 'answer-not-understood', reason: 'other-answer-version', exitCode: 0 });
    expect(stopVerdictOf(finishedRun(0, { outcome: 'done' }))).toEqual({ verdict: 'answer-not-understood', reason: 'other-answer-version', exitCode: 0 });
    expect(stopVerdictOf(finishedRun(1, { answerVersion: 3, refusal: 'example-refusal', text: 'Refused by the example.' })))
      .toEqual({ verdict: 'answer-not-understood', reason: 'other-answer-version', exitCode: 1 });
  });

  test('reads an answer of the known answerVersion passing over a key this Gaia does not know', () => {
    expect(stopVerdictOf(finishedRun(0, { answerVersion: 2, outcome: 'done', exampleAddedKey: 'example' }))).toEqual({ verdict: 'done', answer: { outcome: 'done' } });
  });

  test('is malformed for a done document without a key its answer needs, and for a refusal without its code or sentence', () => {
    expect(stopVerdictOf(finishedRun(0, { answerVersion: 2, outcome: 'stopped' }))).toEqual({ verdict: 'answer-not-understood', reason: 'malformed', exitCode: 0 });
    expect(stopVerdictOf(finishedRun(1, { answerVersion: 2, refusal: 'example-refusal' }))).toEqual({ verdict: 'answer-not-understood', reason: 'malformed', exitCode: 1 });
  });
});

describe('a refusal', () => {
  test('at exit 1 answers refused with the forge\'s code and sentence unchanged', () => {
    const text = '  Hephaestus at http://127.0.0.1:47213 is still live; nothing more was done.  ';
    expect(stopVerdictOf(finishedRun(1, { answerVersion: 2, refusal: 'hephaestus-still-live', text }))).toEqual({ verdict: 'refused', refusal: 'hephaestus-still-live', text });
  });

  test('at another exit but 0 answers refused too', () => {
    expect(stopVerdictOf(finishedRun(2, { answerVersion: 2, refusal: 'unreadable-tracker', text: 'The board cannot be read.' })))
      .toEqual({ verdict: 'refused', refusal: 'unreadable-tracker', text: 'The board cannot be read.' });
  });
});

describe('the done answers of each verb', () => {
  test('start reads a contract the forge does not serve as null, and refuses a contract that is no whole number', () => {
    const startDocument = {
      answerVersion:  2,
      started:        false,
      url:            'http://127.0.0.1:47213',
      generation:     3,
      trackerId:      'example-tracker',
      codeVersion:    '3a6e9e6043da',
      installVersion: 27,
      contracts:      { summary: 2, monitor: 1 },
    };
    expect(ForgeAnswerMapUtil.startAnswerOf(startDocument)).toEqual({
      started:        false,
      url:            'http://127.0.0.1:47213',
      generation:     3,
      trackerId:      'example-tracker',
      codeVersion:    '3a6e9e6043da',
      installVersion: 27,
      contracts:      { summary: 2, monitor: 1, control: null },
    });
    expect(ForgeAnswerMapUtil.startAnswerOf({ ...startDocument, contracts: { summary: 2, monitor: '1' } })).toBeNull();
    expect(ForgeAnswerMapUtil.startAnswerOf({ ...startDocument, contracts: undefined })).toBeNull();
  });

  test('update reads a failed Baton pass with the step that failed, and refuses a failed one without it', () => {
    const updateDocument = {
      answerVersion: 2, outcome: 'done', installVersion: 27, batonPass: 'failed', batonPassStep: 'restart-not-taken'
    };
    const failedBatonPass: ForgeBatonPass = { outcome: 'failed', failedStep: 'restart-not-taken' };
    expect(ForgeAnswerMapUtil.updateAnswerOf(updateDocument)).toEqual({ outcome: 'done', installVersion: 27, batonPass: failedBatonPass });
    const notNeededBatonPass: ForgeBatonPass = { outcome: 'not-needed' };
    const notNeededDocument = { ...updateDocument, batonPass: 'not-needed', batonPassStep: null };
    expect(ForgeAnswerMapUtil.updateAnswerOf(notNeededDocument)).toEqual({ outcome: 'done', installVersion: 27, batonPass: notNeededBatonPass });
    expect(ForgeAnswerMapUtil.updateAnswerOf({ ...updateDocument, batonPassStep: null })).toBeNull();
  });

  test('init reads whether it created the tracker or refreshed one that was there', () => {
    const initDocument = {
      answerVersion: 2, outcome: 'created', trackerId: 'example-tracker', project: 'Example Project', root: '/Users/example/development/example-project'
    };
    expect(ForgeAnswerMapUtil.initAnswerOf(initDocument)).toEqual({
      outcome: 'created', trackerId: 'example-tracker', project: 'Example Project', root: '/Users/example/development/example-project'
    });
    expect(ForgeAnswerMapUtil.initAnswerOf({ ...initDocument, outcome: 'refreshed' })?.outcome).toBe('refreshed');
    expect(ForgeAnswerMapUtil.initAnswerOf({ ...initDocument, outcome: 'done' })).toBeNull();
  });

  test('version reads the installed code, install and contract versions, the Talos protocol version it starts and the monitor folder', () => {
    const versionDocument = {
      answerVersion:        2,
      codeVersion:          '3a6e9e6043da',
      installVersion:       43,
      contracts:            { summary: 2, monitor: 5, control: 3 },
      talosProtocolVersion: 2,
      monitorFolder:        '/Users/example/.forge-monitor',
    };
    expect(ForgeAnswerMapUtil.versionAnswerOf(versionDocument)).toEqual({
      codeVersion:          '3a6e9e6043da',
      installVersion:       43,
      contracts:            { summary: 2, monitor: 5, control: 3 },
      talosProtocolVersion: 2,
      monitorFolder:        '/Users/example/.forge-monitor',
    });
    expect(ForgeAnswerMapUtil.versionAnswerOf({ ...versionDocument, talosProtocolVersion: 'two' })).toBeNull();
  });

  test('the machine limit reads the limit it stored', () => {
    expect(ForgeAnswerMapUtil.machineLimitAnswerOf({
      answerVersion: 2, outcome: 'nothing-to-do', limit: 4, ceiling: 10
    })).toEqual({ outcome: 'nothing-to-do', agentLimit: 4 });
  });

  test('init, version and the machine limit each refuse a document without a key they need', () => {
    expect(ForgeAnswerMapUtil.initAnswerOf({
      answerVersion: 2, outcome: 'created', trackerId: 'example-tracker', project: 'Example Project'
    })).toBeNull();
    expect(ForgeAnswerMapUtil.versionAnswerOf({
      answerVersion: 2, codeVersion: '3a6e9e6043da', installVersion: 27, contracts: {}
    })).toBeNull();
    expect(ForgeAnswerMapUtil.machineLimitAnswerOf({ answerVersion: 2, outcome: 'done', limit: -1 })).toBeNull();
  });

  test('reads a key only as the document\'s own, never through its prototype', () => {
    const inheritedOutcome = Object.create({ outcome: 'done' }) as Record<string, unknown>;
    expect(ForgeAnswerMapUtil.stopAnswerOf(inheritedOutcome)).toBeNull();
  });
});
