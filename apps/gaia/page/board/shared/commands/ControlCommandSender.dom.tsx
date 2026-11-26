/**
 * The control-command sender, through a probe component in a happy-dom document, against a command client whose answers the spec sets. What
 * matters: an applied command clears the last refusal and hands its result to `onApplied`; the forge's refusal shows verbatim, even one that
 * names a command, and an unreachable forge shows the one sentence for it; a command whose answer was lost says it may have been applied,
 * never that the forge was unreachable, and calls neither `onApplied` nor the refusal handler; only the forge's refusal reaches the board's
 * refusal handler; an install hold goes to the install-held handler and a lost session to the session handler; the sender is disabled while
 * a send is in flight, while the stream is down, while launches are held unless the command is answered then, and while there is no command
 * or nothing to send, and a send past the disabled button then sends nothing. Several commands go in order, and the first one the forge does
 * not apply ends the send with its refusal; an empty list sends nothing.
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

import type { BoardCommandDocument }                     from '../../../@types/board/BoardCommandDocument.ts';
import type { BoardCommandResult, CommandOutcome }       from '../../api/BoardCommandClient.ts';
import type { ControlAvailability, ControlSurroundings } from './ControlAvailability.ts';
import { ControlSurroundingsContext }                    from './ControlAvailability.ts';
import {
  OUTCOME_UNKNOWN_WORDING,
  UNREACHABLE_WORDING,
  useControlCommand,
  type SentCommands
} from './ControlCommandSender.ts';

const PAUSE_COMMAND: BoardCommandDocument = { boardCommandVersion: 3, kind: 'hephaestus-pause' };
const NOTHING_STARTED: BoardCommandResult = { startedJobId: null, writtenVersionNumber: null };
const APPLIED: CommandOutcome = { verdict: 'applied', outcome: 'done', result: NOTHING_STARTED };
/** A forge's sentence as its command line prints it, naming a command, shown as it is. */
const FORGE_REFUSAL = 'Ticket T9 is committed, so its content is fixed. Run `forge ticket unready T9` first.';
/** A caller that sends on a key, not through the disabled button: the sender itself must refuse. */
const SEND_PAST_DISABLED_NAME = 'Send past the disabled button';

interface ProbeProps {
  readonly command:                   SentCommands | null;
  readonly answeredWhileInstallHeld?: boolean;
  readonly hasNothingToSend?:         boolean;
  readonly onApplied?:                (result: BoardCommandResult) => void;
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
  readonly sent:            BoardCommandDocument[];
  readonly installHeldWith: string[];
  readonly sessionLosses:   number[];
  readonly refusedWith:     string[];
}

function renderedProbe(probe: ProbeProps, { availability = 'enabled', answers = [] }: ProbeSurroundings = {}): RenderedProbe {
  const sent: BoardCommandDocument[] = [];
  const installHeldWith: string[] = [];
  const sessionLosses: number[] = [];
  const refusedWith: string[] = [];
  const surroundings: ControlSurroundings = {
    availability,
    commandClient: {
      send: (command) => {
        sent.push(command);
        return answers[sent.length - 1] ?? Promise.resolve(APPLIED);
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
    const applied: BoardCommandResult[] = [];
    renderedProbe({ command: PAUSE_COMMAND, onApplied: (result) => applied.push(result) }, {
      answers: [
        Promise.resolve({ verdict: 'refused', refusal: FORGE_REFUSAL }),
        Promise.resolve({ verdict: 'applied', outcome: 'done', result: { startedJobId: 'J7', writtenVersionNumber: null } }),
      ],
    });
    await sent();
    expect(screen.getByRole('status').textContent).toBe(FORGE_REFUSAL);
    await sent();
    expect([screen.queryByRole('status'), applied]).toEqual([null, [{ startedJobId: 'J7', writtenVersionNumber: null }]]);
  });

  test('the forge\'s refusal shows verbatim, and an unreachable forge shows the one sentence for it', async () => {
    const refused: CommandOutcome = { verdict: 'refused', refusal: '<b>planted</b> refusal' };
    renderedProbe({ command: PAUSE_COMMAND }, { answers: [Promise.resolve(refused), Promise.resolve({ verdict: 'unreachable' })] });
    await sent();
    expect([screen.getByRole('status').textContent, screen.getByRole('status').querySelector('b')]).toEqual(['<b>planted</b> refusal', null]);
    await sent();
    expect(screen.getByRole('status').textContent).toBe(UNREACHABLE_WORDING);
  });

  test('a command whose answer was lost says it may have been applied, and neither clears the form nor counts as a refusal', async () => {
    const applied: BoardCommandResult[] = [];
    const answers = [Promise.resolve<CommandOutcome>({ verdict: 'outcome-unknown' })];
    const probe = renderedProbe({ command: PAUSE_COMMAND, onApplied: (result) => applied.push(result) }, { answers });
    await sent();
    expect([screen.getByRole('status').textContent, applied, probe.refusedWith]).toEqual([OUTCOME_UNKNOWN_WORDING, [], []]);
  });

  test('only the forge\'s refusal reaches the board\'s refusal handler, verbatim', async () => {
    const refused: CommandOutcome = { verdict: 'refused', refusal: FORGE_REFUSAL };
    const answers = [Promise.resolve(refused), Promise.resolve<CommandOutcome>({ verdict: 'unreachable' }), Promise.resolve(APPLIED)];
    const probe = renderedProbe({ command: PAUSE_COMMAND }, { answers });
    await sent();
    await sent();
    await sent();
    expect(probe.refusedWith).toEqual([FORGE_REFUSAL]);
  });

  test('an install hold goes to the install-held handler and a lost session to the session handler, showing no refusal', async () => {
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
      answerWith(APPLIED);
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
    renderedProbe({ command: { boardCommandVersion: 3, kind: 'hephaestus-restart', now: false }, answeredWhileInstallHeld: true }, { availability: 'install-held' });
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

describe('several commands', () => {
  const firstStop: BoardCommandDocument = {
    boardCommandVersion: 3, kind: 'job-stop', jobId: 'J5', mode: 'stop'
  };
  const secondStop: BoardCommandDocument = {
    boardCommandVersion: 3, kind: 'job-stop', jobId: 'J6', mode: 'stop'
  };

  test('go in order, and the last one\'s result reaches onApplied once every one was applied', async () => {
    const applied: BoardCommandResult[] = [];
    const probe = renderedProbe({ command: [firstStop, secondStop], onApplied: (result) => applied.push(result) });
    await sent();
    expect([probe.sent, applied, screen.queryByRole('status')]).toEqual([[firstStop, secondStop], [NOTHING_STARTED], null]);
  });

  test('the first one the forge refuses ends the send with its refusal, and the rest are not sent', async () => {
    const applied: BoardCommandResult[] = [];
    const refused: CommandOutcome = { verdict: 'refused', refusal: 'Job J5 has ended already.' };
    const probe = renderedProbe({ command: [firstStop, secondStop], onApplied: (result) => applied.push(result) }, { answers: [Promise.resolve(refused)] });
    await sent();
    expect([probe.sent, applied, screen.getByRole('status').textContent]).toEqual([[firstStop], [], 'Job J5 has ended already.']);
  });

  test('an empty list leaves the sender disabled, and its send sends nothing', async () => {
    const probe = renderedProbe({ command: [] });
    expect(sendButton().disabled).toBe(true);
    await sent(SEND_PAST_DISABLED_NAME);
    expect(probe.sent).toEqual([]);
  });
});
