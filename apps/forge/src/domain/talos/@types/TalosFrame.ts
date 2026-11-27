import type { RecognisedEnding }     from '../../../lib/line-patterns/EndingPatterns.ts';
import type { ProcessIdentity }      from '../../../lib/process-identity/ProcessIdentity.ts';
import type { ChildLaunch }          from '../ChildLaunch.ts';
import type { ChildEnd, ChildState } from '../ChildRecord.ts';
import type { LeaseStanding }        from '../SupervisionLease.ts';
import type { LeaseRenewer }         from '../TalosRecord.ts';

// Hephaestus to Talos.
/** Frozen. The first line of every connection. */
export interface HelloFrame { kind: 'hello'; requiredProtocolVersion: number; secret: string }

export interface LeaseRenewalFrame { kind: 'lease-renewal'; frameId: number; renewer: LeaseRenewer }
export interface LaunchFrame       { kind: 'launch'; frameId: number; launch: ChildLaunch }
/** What Talos does to an agent's input as it stands. */
export type AppliedInput = { act: 'write-line'; line: string } | { act: 'close' };
/** `quit-at-turn-end` asks Talos to apply the launch's own `quitAtTurnEnd`, so the client never names how an agent is asked to stop. */
export type ChildInput = AppliedInput | { act: 'quit-at-turn-end' };
export interface InputFrame        { kind: 'input'; frameId: number; childId: string; input: ChildInput }
/**
 * The line of an event-log entry of origin `client`: what Talos did to an agent's input or process, appended before it acts. A
 * `quit-at-turn-end` is logged as the act Talos applied for it, never as itself.
 */
export type ClientEntry = AppliedInput | { act: 'stop'; graceMilliseconds: number };
export interface StopFrame         { kind: 'stop'; frameId: number; childId: string; graceMilliseconds: number }
export interface StopLinesFrame    { kind: 'stop-lines'; frameId: number }
export interface QuitFrame         { kind: 'quit'; frameId: number; reason: 'restart' }
export type ClientFrame = LeaseRenewalFrame | LaunchFrame | InputFrame | StopFrame | StopLinesFrame | QuitFrame;

/**
 * A client frame as read off the socket: a launch is checked against the board by `childLaunchOf` afterwards, so a malformed one is still
 * answered `done` with its own `frameId`.
 */
export type ReceivedClientFrame = Exclude<ClientFrame, LaunchFrame> | (Omit<LaunchFrame, 'launch'> & { launch: unknown });

// Talos to Hephaestus.
/** Frozen. Answers a `hello` of another protocol version; Talos then quits cleanly. */
export interface VersionMismatchFrame { kind: 'version-mismatch'; protocolVersion: number }
/** Frozen. Answers a first line that is no `hello`, a wrong secret, or any `hello` while quitting. */
export interface RefusedFrame { kind: 'refused'; reason: 'malformed' | 'secret' | 'quitting' }

export interface WelcomeFrame {
  kind:            'welcome';
  protocolVersion: number;
  codeVersion:     string;
  startNumber:     number;
  talos:           ProcessIdentity | null;
  leaseStanding:   LeaseStanding;
}

export type FrameRefusalReason =
  | 'malformed-launch' | 'folder-outside-board' | 'unknown-child' | 'child-ended' | 'kind-takes-no-input' | 'no-quit-act' | 'quitting';
export type DoneFrame =
  | { kind: 'done'; frameId: number; verdict: 'done' | 'already-done' }
  | { kind: 'done'; frameId: number; verdict: 'refused'; reason: FrameRefusalReason };

export interface StateFrame {
  kind:             'state';
  childId:          string;
  state:            ChildState;
  end:              ChildEnd | null;
  recognisedEnding: RecognisedEnding | null;
}
export type TalosFrame = VersionMismatchFrame | RefusedFrame | WelcomeFrame | DoneFrame | StateFrame;
