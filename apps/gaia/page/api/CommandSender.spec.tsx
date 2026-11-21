/**
 * The command sender. What matters (W4.3 acceptance; SCREENS B2 acceptance 2 and 3): one command goes as one JSON body at the known
 * `commandVersion`; an answer of `refused` reaches the view with the forge's code and sentence as Gaia answered them, and stays on that forge
 * until dismissed or until its next command succeeds; an update that left a restart pending keeps it on that forge until dismissed or until a
 * restart, stop or update of it succeeds, since a pause leaves the old code running; while a
 * command to a forge is on its way that forge reads it on its way and takes no second one, and another forge is not held up; nothing is
 * sent while the controls may not act. Gaia's server is stood in for by answers authored
 * from PLAN 6.3, since the page's specs run without a server; the HTTP status of a refusal is not part of that contract, so the body alone decides.
 */
import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup }   from 'react-dom/server';

import type { CommandAnswerDocument, CommandBody }               from '../@types/CommandDocument.ts';
import { Refusal }                                               from '../design-system/Refusal.tsx';
import { answerResponse, senderOver, type SentRequest }          from '../testing/CommandServer.ts';
import { FLEET_FIVE_FORGES_TRACKER_IDS }                         from '../testing/fixtures/fleet-five-forges.ts';
import { CommandSender, CommandSenderContext, useCommandSender } from './CommandSender.ts';

const TRACKER_IDS = FLEET_FIVE_FORGES_TRACKER_IDS;

const STOP_EXAMPLE_MOBILE_APP: CommandBody = { kind: 'forge-stop', trackerId: TRACKER_IDS.exampleMobileApp, agents: 'keep' };

const PAUSE_INVOICE_SERVICE: CommandBody = { kind: 'forge-pause', trackerId: TRACKER_IDS.invoiceService };

/** SCREENS B2: the refusal under Example Mobile App's row. */
const STOP_REFUSED: CommandAnswerDocument = {
  answerVersion: 3,
  outcome:       'refused',
  refusal:       'overseer-still-live',
  text:          'The Overseer did not stop within its tries.',
  forges:        [],
};

const DONE: CommandAnswerDocument = {
  answerVersion: 3, outcome: 'done', refusal: null, text: null, forges: []
};

/** An update was done, and the forge's live Overseer did not take the Baton pass. */
const RESTART_PENDING: CommandAnswerDocument = {
  answerVersion: 3, outcome: 'restart-pending', refusal: null, text: null, forges: []
};

const UPDATE_EXAMPLE_MOBILE_APP: CommandBody = { kind: 'forge-update', trackerId: TRACKER_IDS.exampleMobileApp };

const RESTART_EXAMPLE_MOBILE_APP: CommandBody = { kind: 'forge-restart', trackerId: TRACKER_IDS.exampleMobileApp };

const HTTP_CONFLICT = 409;

const HTTP_UNAUTHORIZED = 401;

describe('sending one command', () => {
  test('the command goes as one JSON body to /api/v4/commands, at the known commandVersion, with the page\'s own cookie', async () => {
    const sent: SentRequest[] = [];
    await senderOver([() => Promise.resolve(answerResponse(DONE))], sent).send(STOP_EXAMPLE_MOBILE_APP);
    expect(sent).toHaveLength(1);
    const [request] = sent;
    expect(request?.path).toBe('/api/v4/commands');
    expect([request?.requestOptions.method, request?.requestOptions.credentials]).toEqual(['POST', 'same-origin']);
    expect(request?.requestOptions.headers).toEqual({ 'content-type': 'application/json' });
    expect(JSON.parse(String(request?.requestOptions.body))).toEqual({
      commandVersion: 3,
      kind:           'forge-stop',
      trackerId:      TRACKER_IDS.exampleMobileApp,
      agents:         'keep',
    });
  });

  test('every outcome of the answer reaches the caller as Gaia answered it, the chosen path of path-choose in its text', async () => {
    const outcomes: CommandAnswerDocument[] = [
      DONE,
      {
        answerVersion: 3, outcome: 'nothing-to-do', refusal: null, text: null, forges: []
      },
      RESTART_PENDING,
      STOP_REFUSED,
      {
        answerVersion: 3, outcome: 'unreachable', refusal: null, text: null, forges: []
      },
      {
        answerVersion: 3, outcome: 'not-supported', refusal: null, text: null, forges: []
      },
      {
        answerVersion: 3, outcome: 'done', refusal: null, text: '/Users/alexexample/development/example-newsletter', forges: []
      },
    ];
    const sender = senderOver(outcomes.map((answer) => () => Promise.resolve(answerResponse(answer))));
    const results = [];
    for (const answer of outcomes) results.push(await sender.send(answer.text === null ? STOP_EXAMPLE_MOBILE_APP : { kind: 'path-choose', what: 'folder' }));
    expect(results).toEqual(outcomes.map((answer) => ({ verdict: 'answered', answer })));
  });

  test('a server that does not answer is unreachable; an answer of another answerVersion, of no known outcome, or not JSON is not understood', async () => {
    const sender = senderOver([
      () => Promise.reject(new TypeError('Failed to fetch')),
      () => Promise.resolve(answerResponse({ ...DONE, answerVersion: 2 })),
      () => Promise.resolve(answerResponse({ ...DONE, outcome: 'applied' })),
      () => Promise.resolve(answerResponse({ ...DONE, text: 4 })),
      () => Promise.resolve(new Response('Gaia\'s server is starting', { status: 503 })),
    ]);
    const verdicts = [];
    for (let i = 0; i < 5; i += 1) verdicts.push((await sender.send(PAUSE_INVOICE_SERVICE)).verdict);
    expect(verdicts).toEqual(['server-unreachable', 'answer-not-understood', 'answer-not-understood', 'answer-not-understood', 'answer-not-understood']);
  });

  test('an answer of the known answerVersion with a key this page does not know is understood, the key passed over', async () => {
    const withAddedKey = { ...DONE, exampleAddedKey: 'example' };
    const sender = senderOver([() => Promise.resolve(answerResponse(withAddedKey))]);
    expect(await sender.send(PAUSE_INVOICE_SERVICE)).toEqual({ verdict: 'answered', answer: withAddedKey });
  });
});

describe('a refusal reaches the view with the forge\'s sentence', () => {
  test('an answer of refused gives the caller the forge\'s code and sentence unchanged, whatever the HTTP status', async () => {
    const result = await senderOver([() => Promise.resolve(answerResponse(STOP_REFUSED, HTTP_CONFLICT))]).send(STOP_EXAMPLE_MOBILE_APP);
    expect(result).toEqual({ verdict: 'answered', answer: STOP_REFUSED });
  });

  test('a view reading the sender renders the forge\'s sentence beside its control, and no longer once the refusal is dismissed', async () => {
    const sender = senderOver([() => Promise.resolve(answerResponse(STOP_REFUSED, HTTP_CONFLICT))]);
    const subject = { trackerId: TRACKER_IDS.exampleMobileApp };

    function StopRefusalProbe() {
      const { states, dismissFailure } = useCommandSender();
      const { failure } = CommandSender.stateOf(states, subject);
      if (failure?.result.verdict !== 'answered') return null;
      const { refusal, text } = failure.result.answer;
      return <Refusal commandLabel="Stop" refusedBy="forge" code={refusal ?? ''} sentence={text ?? ''} onDismiss={() => dismissFailure(subject)} />;
    }
    const view = <CommandSenderContext value={sender}><StopRefusalProbe /></CommandSenderContext>;
    expect(renderToStaticMarkup(view)).toBe('');
    await sender.send(STOP_EXAMPLE_MOBILE_APP);
    const refused = renderToStaticMarkup(view);
    const refusal = <Refusal commandLabel="Stop" refusedBy="forge" code="overseer-still-live" sentence="The Overseer did not stop within its tries." onDismiss={() => undefined} />;
    expect(refused).toBe(renderToStaticMarkup(refusal));
    sender.dismissFailure(subject);
    expect(renderToStaticMarkup(view)).toBe('');
  });

  test('the refusal stays on its forge through a failed retry and leaves when the next command to that forge succeeds', async () => {
    const sender = senderOver([
      () => Promise.resolve(answerResponse(STOP_REFUSED)),
      () => Promise.reject(new TypeError('Failed to fetch')),
      () => Promise.resolve(answerResponse(DONE)),
    ]);
    const subject = { trackerId: TRACKER_IDS.exampleMobileApp };
    await sender.send(STOP_EXAMPLE_MOBILE_APP);
    expect(CommandSender.stateOf(sender.states(), subject).failure).toEqual({ kind: 'forge-stop', result: { verdict: 'answered', answer: STOP_REFUSED } });
    await sender.send(STOP_EXAMPLE_MOBILE_APP);
    expect(CommandSender.stateOf(sender.states(), subject).failure).toEqual({ kind: 'forge-stop', result: { verdict: 'server-unreachable' } });
    await sender.send(STOP_EXAMPLE_MOBILE_APP);
    expect(CommandSender.stateOf(sender.states(), subject)).toEqual({ onItsWay: null, failure: null, restartPending: false });
    expect(sender.states().forges.size).toBe(0);
  });

  test('outside GaiaApp, which provides the sender, a view asking for it fails loudly', () => {
    function OrphanProbe() {
      useCommandSender();
      return null;
    }
    expect(() => renderToStaticMarkup(<OrphanProbe />)).toThrow('outside GaiaApp');
  });
});

describe('a command on its way', () => {
  test('a forge reads its command on its way until the answer, takes no second command meanwhile, and another forge is not held up', async () => {
    const stopAnswer = Promise.withResolvers<Response>();
    const sent: SentRequest[] = [];
    const sender = senderOver([() => stopAnswer.promise, () => Promise.resolve(answerResponse(DONE))], sent);
    const heard: number[] = [];
    sender.subscribe(() => heard.push(sender.states().forges.size));

    const stopping = sender.send(STOP_EXAMPLE_MOBILE_APP);
    expect(CommandSender.stateOf(sender.states(), { trackerId: TRACKER_IDS.exampleMobileApp }).onItsWay).toBe('forge-stop');
    expect(await sender.send({ kind: 'forge-unpause', trackerId: TRACKER_IDS.exampleMobileApp })).toEqual({ verdict: 'not-sent', reason: 'already-on-its-way' });
    expect(await sender.send(PAUSE_INVOICE_SERVICE)).toEqual({ verdict: 'answered', answer: DONE });
    expect(CommandSender.stateOf(sender.states(), { trackerId: TRACKER_IDS.invoiceService }).onItsWay).toBeNull();

    stopAnswer.resolve(answerResponse(DONE));
    expect(await stopping).toEqual({ verdict: 'answered', answer: DONE });
    expect(CommandSender.stateOf(sender.states(), { trackerId: TRACKER_IDS.exampleMobileApp }).onItsWay).toBeNull();
    expect(sent.map((request) => JSON.parse(String(request.requestOptions.body)).kind)).toEqual(['forge-stop', 'forge-pause']);
    expect(heard).toEqual([1, 2, 1, 0]);
  });

  test('a command that names no forge is on its way under its own kind, and holds up no forge', async () => {
    const limitAnswer = Promise.withResolvers<Response>();
    const sender = senderOver([() => limitAnswer.promise]);
    const lowering = sender.send({ kind: 'machine-agent-limit-set', limit: 8 });
    expect(CommandSender.stateOf(sender.states(), { fleetCommand: 'machine-agent-limit-set' }).onItsWay).toBe('machine-agent-limit-set');
    expect(sender.states().forges.size).toBe(0);
    expect(await sender.send({ kind: 'machine-agent-limit-set', limit: 6 })).toEqual({ verdict: 'not-sent', reason: 'already-on-its-way' });
    limitAnswer.resolve(answerResponse(DONE));
    await lowering;
    expect(sender.states().fleet.size).toBe(0);
  });

  test('the subject of a command is its forge, or its own kind when it names none', () => {
    expect(CommandSender.subjectOf(STOP_EXAMPLE_MOBILE_APP)).toEqual({ trackerId: TRACKER_IDS.exampleMobileApp });
    expect(CommandSender.subjectOf({ kind: 'forge-add', root: '/Users/alexexample/development/example-newsletter', project: 'Example Newsletter' }))
      .toEqual({ fleetCommand: 'forge-add' });
    expect(CommandSender.subjectOf({ kind: 'settings-set', key: 'theme', value: 'light' })).toEqual({ fleetCommand: 'settings-set' });
  });
});

describe('a window whose session the server no longer knows', () => {
  test('a 401 is no answer to read: the sender says the session is lost, and the command fails as session-lost, not as an answer not understood', async () => {
    const heardLost: string[] = [];
    const sender = senderOver([() => Promise.resolve(new Response('{"refusal":"no-session"}', { status: HTTP_UNAUTHORIZED }))], [], () => heardLost.push('lost'));
    expect(await sender.send(STOP_EXAMPLE_MOBILE_APP)).toEqual({ verdict: 'session-lost' });
    expect(heardLost).toEqual(['lost']);
    expect(CommandSender.stateOf(sender.states(), { trackerId: TRACKER_IDS.exampleMobileApp }).failure)
      .toEqual({ kind: 'forge-stop', result: { verdict: 'session-lost' } });
  });
});

describe('while the controls may not act', () => {
  test('nothing is sent, nothing is marked on its way, and the caller hears why', async () => {
    const sender = CommandSender.create({
      sendRequest:    () => Promise.reject(new Error('Nothing may be sent while the event stream is lost.')),
      controlsMayAct: () => false,
      sessionWasLost: () => undefined,
    });
    const heard: string[] = [];
    sender.subscribe(() => heard.push('changed'));
    expect(await sender.send(STOP_EXAMPLE_MOBILE_APP)).toEqual({ verdict: 'not-sent', reason: 'controls-may-not-act' });
    expect([heard, sender.states().forges.size]).toEqual([[], 0]);
  });
});

describe('an update that left a restart pending', () => {
  test('is a success that keeps the restart pending on its forge, through a send that did not succeed, until the next success', async () => {
    const sender = senderOver([
      () => Promise.resolve(answerResponse(RESTART_PENDING)),
      () => Promise.resolve(answerResponse(STOP_REFUSED, HTTP_CONFLICT)),
      () => Promise.resolve(answerResponse(DONE)),
    ]);
    const subject = { trackerId: TRACKER_IDS.exampleMobileApp };
    expect(await sender.send(UPDATE_EXAMPLE_MOBILE_APP)).toEqual({ verdict: 'answered', answer: RESTART_PENDING });
    expect(CommandSender.stateOf(sender.states(), subject)).toEqual({ onItsWay: null, failure: null, restartPending: true });
    await sender.send(RESTART_EXAMPLE_MOBILE_APP);
    expect(CommandSender.stateOf(sender.states(), subject)).toMatchObject({ failure: { kind: 'forge-restart' }, restartPending: true });
    await sender.send(RESTART_EXAMPLE_MOBILE_APP);
    expect(CommandSender.stateOf(sender.states(), subject)).toEqual({ onItsWay: null, failure: null, restartPending: false });
    expect(sender.states().forges.size).toBe(0);
  });

  test('keeps the restart pending through a success that leaves the old code running', async () => {
    const sender = senderOver([
      () => Promise.resolve(answerResponse(RESTART_PENDING)),
      () => Promise.resolve(answerResponse(DONE)),
    ]);
    const subject = { trackerId: TRACKER_IDS.exampleMobileApp };
    await sender.send(UPDATE_EXAMPLE_MOBILE_APP);
    await sender.send({ kind: 'forge-pause', trackerId: TRACKER_IDS.exampleMobileApp });
    expect(CommandSender.stateOf(sender.states(), subject)).toEqual({ onItsWay: null, failure: null, restartPending: true });
  });

  test('keeps the restart pending while the restart is on its way, and drops it when dismissed, leaving a refusal as it was', async () => {
    let answerRestart: (response: Response) => void = () => undefined;
    const sender = senderOver([
      () => Promise.resolve(answerResponse(RESTART_PENDING)),
      () => new Promise<Response>((resolve) => {
        answerRestart = resolve;
      }),
    ]);
    const subject = { trackerId: TRACKER_IDS.exampleMobileApp };
    await sender.send(UPDATE_EXAMPLE_MOBILE_APP);
    const restarting = sender.send(RESTART_EXAMPLE_MOBILE_APP);
    expect(CommandSender.stateOf(sender.states(), subject)).toEqual({ onItsWay: 'forge-restart', failure: null, restartPending: true });
    answerRestart(answerResponse(STOP_REFUSED, HTTP_CONFLICT));
    await restarting;
    sender.dismissRestartPending(subject);
    expect(CommandSender.stateOf(sender.states(), subject)).toMatchObject({ failure: { kind: 'forge-restart' }, restartPending: false });
    sender.dismissFailure(subject);
    expect(sender.states().forges.size).toBe(0);
  });
});

describe('the answer of a fleet command', () => {
  const OUTAGE_RESUME: CommandBody = { kind: 'fleet-outage-resume' };
  const RESUMED: CommandAnswerDocument = {
    answerVersion: 3,
    outcome:       'done',
    refusal:       null,
    text:          null,
    forges:        [{
      trackerId: TRACKER_IDS.exampleStorefront, outcome: 'resumed', resumedCount: 2, refusalText: null
    }],
  };

  test('is kept after it succeeded, until dismissed', async () => {
    const sender = senderOver([() => Promise.resolve(answerResponse(RESUMED))]);
    await sender.send(OUTAGE_RESUME);
    expect(sender.states().fleetAnswers.get('fleet-outage-resume')).toEqual(RESUMED);
    sender.dismissAnswer('fleet-outage-resume');
    expect(sender.states().fleetAnswers.has('fleet-outage-resume')).toBe(false);
  });

  test('leaves while the command is sent again, and is the new answer once it comes', async () => {
    const nothing: CommandAnswerDocument = {
      answerVersion: 3, outcome: 'nothing-to-do', refusal: null, text: null, forges: []
    };
    let answerTheSecond: (response: Response) => void = () => undefined;
    const sender = senderOver([() => Promise.resolve(answerResponse(RESUMED)), () => new Promise<Response>((resolve) => {
      answerTheSecond = resolve;
    })]);
    await sender.send(OUTAGE_RESUME);
    const second = sender.send(OUTAGE_RESUME);
    expect(sender.states().fleetAnswers.has('fleet-outage-resume')).toBe(false);
    answerTheSecond(answerResponse(nothing));
    await second;
    expect(sender.states().fleetAnswers.get('fleet-outage-resume')).toEqual(nothing);
  });

  test('is not kept for a refusal, nor for a command about one forge', async () => {
    const refused: CommandAnswerDocument = {
      answerVersion: 3, outcome: 'refused', refusal: 'registry-unreadable', text: null, forges: []
    };
    const sender = senderOver([() => Promise.resolve(answerResponse(refused, HTTP_CONFLICT)), () => Promise.resolve(answerResponse(DONE))]);
    await sender.send(OUTAGE_RESUME);
    await sender.send(PAUSE_INVOICE_SERVICE);
    expect(sender.states().fleetAnswers.size).toBe(0);
  });

  test('an answer without its forges is not understood', async () => {
    const { forges: _forges, ...withoutForges } = RESUMED;
    const sender = senderOver([() => Promise.resolve(answerResponse(withoutForges))]);
    expect(await sender.send(OUTAGE_RESUME)).toEqual({ verdict: 'answer-not-understood' });
  });
});
