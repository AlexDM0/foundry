/**
 * The Intake view: the product-owner sessions as a list beside one chat, the session the route names (`#intake/<job>`) or the new chat
 * (`#intake/new`), which opens too while there is no session at all. A session the new chat just started shows as starting until a board
 * names it. Only the selected session's transcript is followed.
 */
import { EmptyState } from 'design-system/EmptyState';
import { Tag }        from 'design-system/Tag';
import { Text }       from 'design-system/Text';
import { useState }   from 'react';

import type { ConversationBoardDocument } from '../../@types/ConversationDocuments.ts';
import type { TranscriptFollower }        from '../../conversation/TranscriptLog.tsx';
import { useBridgeClock }                 from '../../shell/BridgeClock.ts';
import { TimeUtil }                       from '../../utils/TimeUtil.ts';
import { IntakeChatPane }                 from './IntakeChatPane.tsx';
import { IntakeModelUtil }                from './IntakeModel.ts';
import { IntakePane }                     from './IntakePane.tsx';
import { IntakeSessionList }              from './IntakeSessionList.tsx';
import type { CuedDraft }                 from './IntakeSpriteModel.ts';
import { NewChatPane }                    from './NewChatPane.tsx';

export interface IntakeViewProps {
  readonly board:            ConversationBoardDocument;
  readonly followTranscript: TranscriptFollower;
  /** The route's item: a session's job id, `new`, or `null`. */
  readonly selectedItem:     string | null;
}

const NO_FILING_DRAFTS: readonly CuedDraft[] = Object.freeze([]);

export function IntakeView({ board, followTranscript, selectedItem }: IntakeViewProps) {
  const sessions = IntakeModelUtil.intakeSessionsOf(board);
  const [startedJobId, setStartedJobId] = useState<string | null>(null);
  if (startedJobId !== null && sessions.some((session) => session.jobId === startedJobId)) setStartedJobId(null);
  const selection = IntakeModelUtil.selectedOf(sessions, selectedItem, startedJobId);
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
              filingDrafts={board.page?.payload?.boardFacts.drafts ?? NO_FILING_DRAFTS}
            />
          )
          : null}
        {selection.form === 'starting'
          ? (
            <IntakePane
              label={`Chat with ${selection.jobId}`}
              title="Starting"
              titleMark={selection.jobId}
              headEnd={(
                <>
                  <Text typeRole="tab" muted>product-owner</Text>
                  <Tag text="starting" tone="neutral" />
                </>
              )}
            >
              <EmptyState text={`Starting ${selection.jobId}…`} />
            </IntakePane>
          )
          : null}
        {selection.form === 'new-chat' ? <NewChatPane pictureLimits={pictureLimits} onStarted={setStartedJobId} /> : null}
      </div>
    </div>
  );
}
