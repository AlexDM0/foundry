/**
 * The header's model. What matters: the status line reads Live only while serving unpaused with the stream up, and otherwise the state the
 * Bridge knows; Restart is offered only with new code on disk and never during a Baton pass, which also withdraws Pause and Stop; the
 * new-code notice points at `update`; every incident default, a failed Baton pass with its step and error, and an Assistant that cannot
 * come up are warnings, kept apart from the other notices, and any notice also reads as one sentence; the statistics read concurrency and
 * today's work, and say which tab they open; a concurrency limit is sendable only as a changed whole number of at least one.
 */
import { describe, expect, test } from 'bun:test';

import { PRODUCT_NAMES }                  from '../../src/shared/constants/ProductNames.ts';
import { boardStateFixture, FIXTURE_NOW } from '../testing/BoardStateFixture.ts';
import { HeaderModelUtil }                from './HeaderModel.ts';

const { headerModelOf } = HeaderModelUtil;

describe('the Overseer state and its controls', () => {
  test('serving offers Pause and Stop, and no Restart without new code', () => {
    const model = headerModelOf(boardStateFixture(), FIXTURE_NOW, 'live');
    expect([model.statusToken, model.statusLabel, model.pauseControl, model.restartOffered, model.stopOffered, model.newCodeNotice]).toEqual([
      'live', 'Live', 'pause', false, true, null,
    ]);
  });

  test('paused offers Resume', () => {
    const model = headerModelOf(boardStateFixture({ overseer: { state: 'serving', paused: true, codeVersion: 'code-1' } }), FIXTURE_NOW, 'live');
    expect([model.statusLabel, model.pauseControl]).toEqual(['Paused', 'resume']);
  });

  test('new code on disk offers Restart and the notice pointing at update, and is not listed again among the notices', () => {
    const model = headerModelOf(boardStateFixture({ notices: [{ kind: 'new-code' }] }), FIXTURE_NOW, 'live');
    expect(model.restartOffered).toBe(true);
    expect(model.newCodeNotice).toBe(`new code: run \`${PRODUCT_NAMES.PROGRAM} update\``);
    expect(model.notices).toEqual([]);
  });

  test('during a Baton pass the state reads handing over and no control is offered, new code or not', () => {
    const model = headerModelOf(boardStateFixture({
      overseer: { state: 'passing-baton', paused: false, codeVersion: 'code-1' },
      notices:  [{ kind: 'new-code' }],
    }), FIXTURE_NOW, 'live');
    expect([model.statusToken, model.statusLabel, model.pauseControl, model.restartOffered, model.stopOffered]).toEqual([
      'passing-baton', 'Handing over', null, false, false,
    ]);
  });

  test('before the first board the header reads connecting and offers nothing', () => {
    const model = headerModelOf(null, FIXTURE_NOW, 'connecting');
    expect([model.statusLabel, model.pauseControl, model.stopOffered, model.statistics, model.statusDetails]).toEqual(['Connecting', null, false, [], []]);
  });

  test('a held Overseer reads Held, and a stream that is down or lost its session reads Down whatever the last board said', () => {
    const held = boardStateFixture({ overseer: { state: 'held-by-install-change', paused: false, codeVersion: 'code-1' } });
    expect(headerModelOf(held, FIXTURE_NOW, 'live').statusLabel).toBe('Held');
    expect(headerModelOf(boardStateFixture(), FIXTURE_NOW, 'down').statusLabel).toBe('Down');
    expect(headerModelOf(boardStateFixture(), FIXTURE_NOW, 'no-session').statusToken).toBe('down');
    expect(headerModelOf(boardStateFixture(), FIXTURE_NOW, 'connecting').statusLabel).toBe('Connecting');
  });
});

describe('the confinement in force', () => {
  test.each(['confined', 'unavailable', 'unconfined-by-design'] as const)('%s reads as the board states it, after the usage', (confinement) => {
    expect(headerModelOf(boardStateFixture({ confinement }), FIXTURE_NOW, 'live').statusDetails).toEqual(['usage under its limit', `confinement ${confinement}`]);
  });

  test('a board that states none shows none', () => {
    expect(headerModelOf(boardStateFixture(), FIXTURE_NOW, 'live').statusDetails).toEqual(['usage under its limit']);
  });
});

describe('the warnings and notices', () => {
  test('every incident default, a failed Baton pass and an Assistant that cannot come up are warnings', () => {
    const model = headerModelOf(boardStateFixture({
      overseer: {
        state: 'serving', paused: false, codeVersion: 'code-1', batonPassWarning: { successorCodeVersion: 'code-2', step: 'prepared', error: 'the successor exited' }
      },
      notices: [
        {
          kind: 'incident-defaulted', incidentId: 'I3', move: 'merge-abort', cause: 'turn-closed'
        },
        {
          kind: 'incident-defaulted', incidentId: 'I4', move: 'merge-review', cause: 'no-assistant'
        },
      ],
    }), FIXTURE_NOW, 'live');
    expect(model.warnings).toEqual([
      'incident I3 took its default, merge-abort: its delivery turn closed',
      'incident I4 took its default, merge-review: no Assistant was up',
      'the Baton pass to code code-2 failed at prepared: the successor exited',
      'no Assistant can come up: open incidents take their defaults',
    ]);
    expect(model.notices).toEqual([]);
  });

  test('the other notices are listed in their own words', () => {
    const model = headerModelOf(boardStateFixture({
      notices: [{
        kind: 'dirty-main-checkout', target: 'main', branch: 'main', blockingFiles: ['README.md']
      }, { kind: 'rounds-not-converging', ticketId: '42' }, { kind: 'target-file-held', target: 'main', heldFiles: ['README.md'] }],
    }), FIXTURE_NOW, 'live');
    expect(model.notices).toEqual([
      'landings on main wait: the main checkout\'s changes to README.md block the fast-forward',
      'ticket #42\'s review rounds are not converging',
      'landings on main wait: another process holds README.md open, so git cannot replace what is held',
    ]);
    expect(model.warnings).toEqual([]);
  });

  test('a refused agent program names its job and the reason, never only its kind', () => {
    const model = headerModelOf(boardStateFixture({
      notices: [{
        kind: 'agent-program-refused', jobId: 'J7', cause: 'batch-target', reason: 'C:\\npm\\claude.cmd is a batch file'
      }],
    }), FIXTURE_NOW, 'live');
    expect(model.notices).toEqual(['job J7 is not launched: C:\\npm\\claude.cmd is a batch file']);
  });

  test('a Watcher endpoint that does not fit names its job and the endpoint, never only its kind', () => {
    const model = headerModelOf(boardStateFixture({ notices: [{ kind: 'watcher-endpoint-does-not-fit', jobId: 'J7', endpoint: '/long/watchers/a.sock' }], }), FIXTURE_NOW, 'live');
    expect(model.notices).toEqual(['job J7 is not launched: this platform cannot bind the Watcher endpoint /long/watchers/a.sock']);
  });

  test('any notice reads as one sentence: an incident default as its warning, every other kind as its notice line', () => {
    expect([
      {
        kind: 'incident-defaulted', incidentId: 'I3', move: 'merge-abort', cause: 'turn-closed'
      },
      { kind: 'rounds-not-converging', ticketId: '42' },
    ].map(HeaderModelUtil.noticeSentenceOf)).toEqual([
      'incident I3 took its default, merge-abort: its delivery turn closed',
      'ticket #42\'s review rounds are not converging',
    ]);
  });
});

describe('concurrency, usage and the statistics', () => {
  test('agents against the limit, today\'s deliveries and tokens, the queue, and the open questions and incidents', () => {
    const model = headerModelOf(boardStateFixture(), FIXTURE_NOW, 'live');
    expect(model.concurrencyLimit).toBe(4);
    expect(model.statistics.map(({ figure, label, opensTab }) => [figure, label, opensTab])).toEqual([
      ['2 / 4', 'agents working', 'kanban'],
      ['1', 'done today', 'kanban'],
      ['4.5k', 'tokens today', null],
      ['1', 'waiting in queue', 'kanban'],
      ['1', 'open questions', 'questions'],
      ['0', 'open incidents', 'assistant'],
    ]);
  });

  test('a paused ticket adds the paused figure after the agents, in the paused state', () => {
    const state = boardStateFixture();
    const page = state.page ?? null;
    if (page === null) throw new Error('the fixture carries a page');
    const pausedFacts = [...page.payload.boardFacts.tickets, { ticketId: '9', displayState: 'paused' }];
    const boardFacts = { ...page.payload.boardFacts, tickets: pausedFacts };
    const model = headerModelOf({ ...state, page: { ...page, payload: { ...page.payload, boardFacts } } }, FIXTURE_NOW, 'live');
    expect(model.statistics.slice(0, 2).map(({ figure, label, state: figureState }) => [figure, label, figureState])).toEqual([
      ['2 / 4', 'agents working', null],
      ['1', 'paused', 'paused'],
    ]);
  });

  test('a wanted limit is sendable only as a whole number of at least one that differs from the current limit', () => {
    expect(HeaderModelUtil.concurrencyLimitIsSendable(5, 4)).toBe(true);
    expect(HeaderModelUtil.concurrencyLimitIsSendable(4, 4)).toBe(false);
    expect(HeaderModelUtil.concurrencyLimitIsSendable(0, 4)).toBe(false);
    expect(HeaderModelUtil.concurrencyLimitIsSendable(2.5, 4)).toBe(false);
    expect(HeaderModelUtil.concurrencyLimitIsSendable(Number.NaN, 4)).toBe(false);
  });

  test('usage reads under its limit until a limit is hit, then when it resets', () => {
    expect(headerModelOf(boardStateFixture(), FIXTURE_NOW, 'live').statusDetails[0]).toBe('usage under its limit');
    expect(headerModelOf(boardStateFixture({ usage: { resetsAt: '2026-10-29T15:30:00+01:00', window: 'five-hour' } }), FIXTURE_NOW, 'live').statusDetails[0])
      .toBe('five-hour usage limit hit, resets 15:30');
  });
});
