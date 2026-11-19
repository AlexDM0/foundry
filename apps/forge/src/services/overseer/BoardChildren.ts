/**
 * The Overseer's one way to its board's children, agent sessions and lines alike: launch, read, write to and stop them. An adapter over the
 * Talos answers it; nothing that uses it knows how.
 */
import type { AgentLaunchPlan }                   from '../../lib/agent-launch/AgentLaunchPlan.ts';
import type { ChildInput, FrameRefusalReason }    from '../../lib/talos/@types/TalosFrame.ts';
import type { ChildEnd, ChildRecord, ChildState } from '../../lib/talos/ChildRecord.ts';
import type { RecognisedEnding }                  from '../../lib/talos/EndingPatterns.ts';
import type { EventLogEntry }                     from '../../lib/talos/EventLog.ts';

export type ChildLiveness =
  | { verdict: 'unlaunched' }
  | { verdict: 'live'; state: Exclude<ChildState, 'ended'> }
  | { verdict: 'ended'; end: ChildEnd }
  | { verdict: 'lost' };

export type ChildLaunchOutcome =
  | { verdict: 'launched' }
  | { verdict: 'already-launched' }
  | { verdict: 'refused'; reason: FrameRefusalReason }
  | { verdict: 'talos-unavailable' };

export interface AgentChildRequest {
  childFolder:                    string;
  instance:                       number;
  label:                          string;
  workingDirectory:               string;
  plan:                           AgentLaunchPlan;
  treeStopAtEndGraceMilliseconds: number | null;
}

export interface LineChildRequest {
  childFolder:           string;
  instance:              number;
  label:                 string;
  workingDirectory:      string;
  argv:                  readonly string[];
  verbatimArguments:     boolean;
  environment:           Readonly<Record<string, string>>;
  timeBoundMilliseconds: number | null;
}

export interface BoardChildren {
  readonly beginPass:           () => void;
  readonly jobFolderOf:         (jobId: string) => string;
  readonly livenessOf:          (childFolder: string, instance: number) => ChildLiveness;
  readonly recordOf:            (childFolder: string, instance: number) => ChildRecord | null;
  readonly newestInstanceIn:    (childFolder: string) => number | null;
  readonly eventsAfter:         (childFolder: string, instance: number, afterSequence: number) => readonly EventLogEntry[] | 'malformed';
  readonly recognisedEndingsOf: (childFolder: string, instance: number) => readonly RecognisedEnding[];
  readonly launchAgent:         (request: AgentChildRequest) => Promise<ChildLaunchOutcome>;
  readonly launchLine:          (request: LineChildRequest) => Promise<ChildLaunchOutcome>;
  readonly sendInput:           (childFolder: string, instance: number, input: ChildInput) => Promise<boolean>;
  readonly sendInputOnce:       (markerPath: string, childFolder: string, instance: number, inputs: readonly ChildInput[]) => Promise<boolean>;
  readonly stop:                (childFolder: string, instance: number, graceMilliseconds: number) => Promise<boolean>;
  readonly stopLiveLines:       () => Promise<boolean>;
}
