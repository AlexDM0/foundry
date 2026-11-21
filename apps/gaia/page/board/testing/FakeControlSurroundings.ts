/** Control surroundings over a fake command client that records every board command and answers with the outcome a spec sets. Test-only. */
import type { BoardCommandDocument }                     from '../../@types/board/BoardCommandDocument.ts';
import type { CommandOutcome }                           from '../api/BoardCommandClient.ts';
import type { ControlAvailability, ControlSurroundings } from '../shell/ControlAvailability.ts';

export interface FakeControlSurroundings {
  readonly surroundings: ControlSurroundings;
  readonly sent:         BoardCommandDocument[];
  readonly answerWith:   (outcome: CommandOutcome) => void;
}

export function fakeControlSurroundingsOf(availability: ControlAvailability = 'enabled'): FakeControlSurroundings {
  const sent: BoardCommandDocument[] = [];
  let nextOutcome: CommandOutcome = { verdict: 'applied', outcome: 'done', result: { startedJobId: null } };
  return {
    surroundings: {
      availability,
      commandClient: {
        send: (command) => {
          sent.push(command);
          return Promise.resolve(nextOutcome);
        },
      },
      onInstallHeld: () => undefined,
    },
    sent,
    answerWith: (outcome) => {
      nextOutcome = outcome;
    },
  };
}
