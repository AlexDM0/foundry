/**
 * Whether the board's controls may act. While the board's event stream is down every control is disabled, since what it shows may be stale;
 * while launches are held for an install change every control is disabled but the ones the forge still answers, Restart and Stop.
 */
import { createContext } from 'react';

import type { BoardCommandClient }  from '../../api/BoardCommandClient.ts';
import type { PictureUploadClient } from '../../api/PictureUploadClient.ts';

export type ControlAvailability = 'enabled' | 'stream-down' | 'install-held';

export interface ControlSurroundings {
  readonly availability:         ControlAvailability;
  readonly commandClient:        BoardCommandClient;
  /** Uploads a picture before the command that sends it; absent where no picture can be uploaded, so none is offered. */
  readonly pictureUploadClient?: PictureUploadClient;
  /** A command was answered install-held: launches are held for an install change. */
  readonly onInstallHeld:        (refusal: string) => void;
  /** A command found Gaia's server no longer knows this window's session; absent where nothing shows the session banner. */
  readonly onSessionLost?:       () => void;
  /** The forge refused a command, with the refusal the control shows; absent where nothing follows refusals. */
  readonly onRefused?:           (refusal: string) => void;
}

function availabilityOf(streamIsDown: boolean, installIsHeld: boolean): ControlAvailability {
  if (streamIsDown) return 'stream-down';
  return installIsHeld ? 'install-held' : 'enabled';
}

function controlIsEnabled(availability: ControlAvailability, answeredWhileInstallHeld: boolean): boolean {
  return availability === 'enabled' || (availability === 'install-held' && answeredWhileInstallHeld);
}

const UNAVAILABLE_COMMAND_CLIENT: BoardCommandClient = { send: () => Promise.resolve({ verdict: 'unreachable' }) };

export const ControlSurroundingsContext = createContext<ControlSurroundings>({
  availability:  'stream-down',
  commandClient: UNAVAILABLE_COMMAND_CLIENT,
  onInstallHeld: () => undefined,
});

export const ControlAvailabilityUtil = Object.freeze({ availabilityOf, controlIsEnabled });
