/**
 * The gate dialog's profile box: what a profile does, the press that starts one (Profile, or Profile again beside the last result) or
 * stops the one running, the running state with its spinner, bar and output, and the last result as a pill, with a red run's last lines.
 * A profile starts only on that press. The output comes only from the profile's own stream route, which the holder follows by its run id;
 * the board's facts and event stream carry none.
 */

import { BusyIndicator }             from 'design-system/BusyIndicator';
import { LogTail, type LogTailLine } from 'design-system/LogTail';
import { Row }                       from 'design-system/Row';
import { Text }                      from 'design-system/Text';
import { View }                      from 'design-system/View';
import { useEffect, useState }       from 'react';

import type { ControlCommandBody } from '../../../api/CommandClient.ts';
import type { ProfileOutputLine }  from '../../../api/ProfileStreamClient.ts';
import { CommandButton }           from '../../../shell/CommandButton.tsx';

import { GateDialogModel, type ProfileBoxView } from './GateDialogModel.ts';

/** Follows one profile run's output, handing on each batch of new lines; the function it returns stops following. */
export type ProfileLogFollower = (profileRunId: string, onLines: (lines: readonly ProfileOutputLine[]) => void) => () => void;

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
      lines: [...before.profileRunId === profileRunId ? before.lines : [], ...GateDialogModel.logTailLinesOf(lines)],
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
      <Row between centerY gap="ten">
        <View>
          <Text typeRole="title">Profile</Text>
          <Text typeRole="tab" muted>{lead}</Text>
        </View>
        {view.state === 'profiling'
          ? <CommandButton label="Stop" command={{ kind: 'gate-profile-stop', profileRunId: view.profileRunId }} />
          : <CommandButton label={view.startLabel} command={startCommand} />}
      </Row>
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
