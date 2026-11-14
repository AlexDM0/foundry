/**
 * The control-command sender, through a probe component in a happy-dom document, against a command client whose answers the spec sets.
 * What matters: an applied command clears the last refusal and hands its result to `onApplied`; a refusal shows verbatim and an unreachable
 * Overseer shows the one sentence for it; only the Overseer's refusal reaches the shell's refusal handler; a 423 goes to the shell's
 * install-held handler and a lost session to its session handler; the sender is disabled while a send is in flight, while the stream is
 * down, while launches are held unless the command is answered then, and while there is no command or nothing to send, and a send past the
 * disabled button, as a key would make, then sends nothing.
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen
} from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import type { CommandOutcome, ControlCommandBody }       from '../api/CommandClient.ts';
import type { ControlAvailability, ControlSurroundings } from './ControlAvailability.ts';
import { ControlSurroundingsContext }                    from './ControlAvailability.ts';
import { UNREACHABLE_WORDING, useControlCommand }        from './ControlCommandSender.ts';

const PAUSE_COMMAND: ControlCommandBody = { kind: 'overseer-pause' };
/** A caller that sends on a key, not through the disabled button: the sender itself must refuse. */
const SEND_PAST_DISABLED_NAME = 'Send past the disabled button';

interface ProbeProps {
  readonly command:                   ControlCommandBody | null;
  readonly answeredWhileInstallHeld?: boolean;
  readonly hasNothingToSend?:         boolean;
  readonly onApplied?:                (result: unknown) => void;
}

function SenderProbe({ command, ...options }: ProbeProps) {
  const sender = useControlCommand(command, options);
  return (
    <>
      <button type="button" disabled={!sender.enabled} onClick={() => void sender.send()}>Send</button>
      <button type="button" onClick={() => void sender.send()}>{SEND_PAST_DISABLED_NAME}</button>
      {sender.refusal === null ? null : <span role="status">{sender.refusal}</span>}
    </>
  );
}

interface ProbeSurroundings {
  readonly availability?: ControlAvailability;
  readonly answers?:      readonly Promise<CommandOutcome>[];
}

interface RenderedProbe {
  readonly sent:            ControlCommandBody[];
  readonly installHeldWith: string[];
  readonly sessionLosses:   number[];
  readonly refusedWith:     string[];
}

function renderedProbe(probe: ProbeProps, { availability = 'enabled', answers = [] }: ProbeSurroundings = {}): RenderedProbe {
  const sent: ControlCommandBody[] = [];
  const installHeldWith: string[] = [];
  const sessionLosses: number[] = [];
  const refusedWith: string[] = [];
  const surroundings: ControlSurroundings = {
    availability,
    commandClient: {
      send: (command) => {
        sent.push(command);
        return answers[sent.length - 1] ?? Promise.resolve({ verdict: 'applied', outcome: 'done', result: null });
      },
    },
    onInstallHeld: (refusal) => installHeldWith.push(refusal),
    onSessionLost: () => sessionLosses.push(sent.length),
    onRefused:     (refusal) => refusedWith.push(refusal),
  };
  render(
    <ControlSurroundingsContext.Provider value={surroundings}>
      <SenderProbe {...probe} />
    </ControlSurroundingsContext.Provider>,
  );
  return {
    sent, installHeldWith, sessionLosses, refusedWith
  };
}

async function sent(buttonName = 'Send'): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: buttonName }));
    await Promise.resolve();
  });
}

function sendButton(): HTMLButtonElement {
  return screen.getByRole<HTMLButtonElement>('button', { name: 'Send' });
}

afterEach(() => {
  cleanup();
});

describe('the answers', () => {
  test('an applied command clears the last refusal and hands its result to onApplied', async () => {
    const applied: unknown[] = [];
    renderedProbe({ command: PAUSE_COMMAND, onApplied: (result) => applied.push(result) }, {
      answers: [
        Promise.resolve({ verdict: 'refused', refusal: 'The Overseer refused the example command.' }),
        Promise.resolve({ verdict: 'applied', outcome: 'done', result: { jobId: 'J7' } }),
      ],
    });
    await sent();
    expect(screen.getByRole('status').textContent).toBe('The Overseer refused the example command.');
    await sent();
    expect([screen.queryByRole('status'), applied]).toEqual([null, [{ jobId: 'J7' }]]);
  });

  test('a refusal shows verbatim, and an unreachable Overseer shows the one sentence for it', async () => {
    const refused: CommandOutcome = { verdict: 'refused', refusal: '<b>planted</b> refusal' };
    renderedProbe({ command: PAUSE_COMMAND }, { answers: [Promise.resolve(refused), Promise.resolve({ verdict: 'unreachable' })] });
    await sent();
    expect([screen.getByRole('status').textContent, screen.getByRole('status').querySelector('b')]).toEqual(['<b>planted</b> refusal', null]);
    await sent();
    expect(screen.getByRole('status').textContent).toBe(UNREACHABLE_WORDING);
  });

  test('only the Overseer\'s refusal reaches the shell\'s refusal handler, verbatim, so Flint can answer it', async () => {
    const refused: CommandOutcome = { verdict: 'refused', refusal: 'The Overseer refused the example command.' };
    const applied: CommandOutcome = { verdict: 'applied', outcome: 'done', result: null };
    const answers = [Promise.resolve(refused), Promise.resolve<CommandOutcome>({ verdict: 'unreachable' }), Promise.resolve(applied)];
    const probe = renderedProbe({ command: PAUSE_COMMAND }, { answers });
    await sent();
    await sent();
    await sent();
    expect(probe.refusedWith).toEqual(['The Overseer refused the example command.']);
  });

  test('a 423 goes to the shell\'s install-held handler and a lost session to its session handler, showing no refusal', async () => {
    const installHeld: CommandOutcome = { verdict: 'install-held', refusal: 'Launches are held for an install change.' };
    const probe = renderedProbe({ command: PAUSE_COMMAND }, { answers: [Promise.resolve(installHeld), Promise.resolve({ verdict: 'no-session' })] });
    await sent();
    await sent();
    expect([probe.installHeldWith, probe.sessionLosses, screen.queryByRole('status')]).toEqual([['Launches are held for an install change.'], [2], null]);
  });
});

describe('when the sender is enabled', () => {
  test('it is disabled while a send is in flight, and enabled again once the answer came', async () => {
    const { promise: answer, resolve: answerWith } = Promise.withResolvers<CommandOutcome>();
    const probe = renderedProbe({ command: PAUSE_COMMAND }, { answers: [answer] });
    await sent();
    expect([sendButton().disabled, probe.sent]).toEqual([true, [PAUSE_COMMAND]]);
    await act(async () => {
      answerWith({ verdict: 'applied', outcome: 'done', result: null });
      await answer;
    });
    expect(sendButton().disabled).toBe(false);
  });

  test('it is disabled while the stream is down, and while launches are held unless the command is answered then', () => {
    renderedProbe({ command: PAUSE_COMMAND }, { availability: 'stream-down' });
    expect(sendButton().disabled).toBe(true);
    cleanup();
    renderedProbe({ command: PAUSE_COMMAND }, { availability: 'install-held' });
    expect(sendButton().disabled).toBe(true);
    cleanup();
    renderedProbe({ command: { kind: 'overseer-restart', now: false }, answeredWhileInstallHeld: true }, { availability: 'install-held' });
    expect(sendButton().disabled).toBe(false);
  });

  test('it is disabled while there is no command or nothing to send, and its send then sends nothing', async () => {
    const withoutCommand = renderedProbe({ command: null });
    expect(sendButton().disabled).toBe(true);
    await sent(SEND_PAST_DISABLED_NAME);
    cleanup();
    const withNothingToSend = renderedProbe({ command: PAUSE_COMMAND, hasNothingToSend: true });
    expect(sendButton().disabled).toBe(true);
    await sent(SEND_PAST_DISABLED_NAME);
    cleanup();
    const whileStreamDown = renderedProbe({ command: PAUSE_COMMAND }, { availability: 'stream-down' });
    await sent(SEND_PAST_DISABLED_NAME);
    expect([withoutCommand.sent, withNothingToSend.sent, whileStreamDown.sent]).toEqual([[], [], []]);
  });
});
