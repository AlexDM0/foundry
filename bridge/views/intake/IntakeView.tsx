/**
 * The Intake view: the product-owner sessions as a list beside one chat, the session the route names (`#intake/<job>`) or the new chat
 * (`#intake/new`), which opens too while there is no session at all. Only the selected session's transcript is followed.
 */
import type { ConversationBoardDocument } from '../../@types/ConversationDocuments.ts';
import type { TranscriptFollower }        from '../../conversation/TranscriptLog.tsx';
import { useBridgeClock }                 from '../../shell/BridgeClock.ts';
import { TimeUtil }                       from '../../utils/TimeUtil.ts';
import { IntakeChatPane }                 from './IntakeChatPane.tsx';
import { IntakeModelUtil }                from './IntakeModel.ts';
import { IntakeSessionList }              from './IntakeSessionList.tsx';
import { NewChatPane }                    from './NewChatPane.tsx';

export interface IntakeViewProps {
  readonly board:            ConversationBoardDocument;
  readonly followTranscript: TranscriptFollower;
  /** The route's item: a session's job id, `new`, or `null`. */
  readonly selectedItem:     string | null;
}

export function IntakeView({ board, followTranscript, selectedItem }: IntakeViewProps) {
  const sessions = IntakeModelUtil.intakeSessionsOf(board);
  const selection = IntakeModelUtil.selectedOf(sessions, selectedItem);
  // The viewer's day only picks the form a stamp is shown in.
  const todayCalendarDate = TimeUtil.calendarDateOf(useBridgeClock().now().getTime());
  const pictureLimits = board.pictureLimits ?? null;
  return (
    <div className="bridge-view">
      <div className="bridge-intake-split">
        <IntakeSessionList
          sessions={sessions}
          selectedJobId={selection.form === 'session' ? selection.session.jobId : null}
          newChatIsOpen={selection.form === 'new-chat'}
        />
        {selection.form === 'session'
          ? (
            <IntakeChatPane
              key={selection.session.jobId}
              session={selection.session}
              followTranscript={followTranscript}
              pictureLimits={pictureLimits}
              todayCalendarDate={todayCalendarDate}
            />
          )
          : <NewChatPane pictureLimits={pictureLimits} />}
      </div>
    </div>
  );
}
