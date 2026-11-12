/**
 * The gate dialog's profile box: what a profile does, the press that starts one (Profile, or Profile again beside the last result) or
 * stops the one running, the running state with its spinner, bar and output, and the last result as a pill, with a red run's last lines.
 * A profile starts only on that press. The output comes only from the profile's own log, which the holder follows by its run id; the
 * board's facts carry none.
 */
import { useEffect, useState } from 'react';

import type { ControlCommandBody }   from '../../../api/CommandClient.ts';
import { BusyIndicator }             from '../../../design-system/BusyIndicator.tsx';
import { LogTail, type LogTailLine } from '../../../design-system/LogTail.tsx';
import { CommandButton }             from '../../../shell/CommandButton.tsx';

import { GateDialogModel, type ProfileBoxView } from './GateDialogModel.ts';

/** Follows one profile run's output, handing on each batch of new lines; the function it returns stops following. */
export type ProfileLogFollower = (profileRunId: string, onLines: (lines: readonly LogTailLine[]) => void) => () => void;

export interface ProfileBoxProps {
  readonly view:         ProfileBoxView;
  readonly lead:         string;
  readonly startCommand: ControlCommandBody;
  readonly followLog?:   ProfileLogFollower;
}

/** The lines of the run shown now; following another run starts from none. */
function useProfileLog(profileRunId: string | null, followLog: ProfileLogFollower | undefined): readonly LogTailLine[] {
  const [log, setLog] = useState<{ profileRunId: string | null; lines: readonly LogTailLine[] }>({ profileRunId: null, lines: [] });
  useEffect(() => {
    if (profileRunId === null || followLog === undefined) return undefined;
    return followLog(profileRunId, (lines) => setLog((before) => ({
      profileRunId,
      lines: before.profileRunId === profileRunId ? [...before.lines, ...lines] : [...lines],
    })));
  }, [profileRunId, followLog]);
  return log.profileRunId === profileRunId ? log.lines : [];
}

export function ProfileBox({
  view, lead, startCommand, followLog
}: ProfileBoxProps) {
  const followedRunId = view.state === 'profiling' || (view.state === 'result' && view.showsOutput) ? view.profileRunId : null;
  const lines = useProfileLog(followedRunId, followLog);
  return (
    <section className="bridge-pipeline-profile" aria-label="Profile" data-state={view.state}>
      <div className="bridge-pipeline-profile-head">
        <strong>Profile</strong>
        <span className="bridge-pipeline-dialog-hint">{lead}</span>
        <span className="bridge-pipeline-dialog-foot-gap" />
        {view.state === 'profiling'
          ? <CommandButton label="Stop" command={{ kind: 'gate-profile-stop', profileRunId: view.profileRunId }} />
          : <CommandButton label={view.startLabel} command={startCommand} />}
      </div>
      {view.state === 'profiling'
        ? (
          <>
            <span className="bridge-pipeline-profile-status" aria-live="polite">
              <BusyIndicator shape="spinner" accessibleName="Profiling" />
              {GateDialogModel.PROFILING_TEXT}
            </span>
            <BusyIndicator shape="bar" accessibleName="Profile progress" />
          </>
        )
        : null}
      {view.state === 'result'
        ? (
          <span className="bridge-pipeline-profile-result" data-tone={view.tone}>
            <span className="bridge-pipeline-profile-result-dot" />
            {view.text}
          </span>
        )
        : null}
      {followedRunId === null ? null : <LogTail label="Profile output" lines={lines} live={view.state === 'profiling'} />}
    </section>
  );
}
