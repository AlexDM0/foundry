/**
 * The Asks User strip under a job that waits on User's answer, drawn as the orange "Your decision" card: the decision's id, its first
 * question, the job it blocks, how long it has been open, and Answer, a link to the Questions tab, which holds the answer form. The
 * selected job's controls keep the text answer.
 */
import type { BoardDisplayState } from '../../../@types/board/BoardVocabulary.ts';
import { Button }                 from '../../../lib/design-system/DesignSystemInterface.ts';

import { AskItem }         from '../../conversation/AskItem.tsx';
import { useBoardHrefOf }  from '../../shell/BoardRouteLinks.ts';
import { ElapsedTimeUtil } from '../../utils/ElapsedTimeUtil.ts';
import { StateToneUtil }   from '../../utils/StateToneUtil.ts';
import type { JobAsk }     from './AgentsModel.ts';

/** The lane colours of a job that waits on User, on its row, its strip and the Sessions tally. */
export const ASKING_STATE: BoardDisplayState = 'in-review';

export interface AskUserRowProps {
  readonly jobId:       string;
  readonly ask:         JobAsk;
  readonly columnCount: number;
  readonly now:         Date;
}

export function AskUserRow({
  jobId, ask, columnCount, now
}: AskUserRowProps) {
  const hrefOf = useBoardHrefOf();
  const elapsed = ask.openedAt === null ? null : ElapsedTimeUtil.elapsedSinceText(ask.openedAt, now);
  return (
    <tr className="agents-ask-row" data-state={ASKING_STATE} data-state-tone={StateToneUtil.toneOf(ASKING_STATE)}>
      <td colSpan={columnCount}>
        <AskItem
          layout="strip"
          kind={{ text: 'Your decision', tone: 'state', state: ASKING_STATE }}
          decisionId={ask.decisionId}
          questionText={ask.questionText}
          meta={[`blocks ${jobId}`]}
          age={elapsed === null || ask.openedAt === null ? null : { shortText: elapsed, fullText: `opened ${ask.openedAtText ?? ask.openedAt}` }}
          action={<Button label="Answer" emphasis="primary" href={hrefOf({ tab: 'questions', item: ask.decisionId })} />}
          escalated={false}
        />
      </td>
    </tr>
  );
}
