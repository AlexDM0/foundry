/**
 * The question panel: one open decision beside the board, over every tab, with what to answer on the left and why it was asked on the
 * right, and the queue of the other open decisions in its foot. It slides in while a decision waits and out once none shows, keeping the
 * last one shown while it slides; it stays mounted but hidden while the detail panel shows, and Esc closes it only when no inner layer took
 * the key, so the detail panel closes first.
 */
import { useEffect, useState } from 'react';

import { TicketLinks }                                                          from '../../conversation/ConversationParts.tsx';
import type { OpenDecision }                                                    from '../../conversation/OpenDecisionsUtil.ts';
import type { TranscriptFollower }                                              from '../../conversation/TranscriptLog.tsx';
import { Button }                                                               from '../../design-system/Button.tsx';
import { MonoId }                                                               from '../../design-system/MonoId.tsx';
import { SidePanel }                                                            from '../../design-system/SidePanel.tsx';
import { Stamp }                                                                from '../../design-system/Stamp.tsx';
import { StateDot }                                                             from '../../design-system/StateDot.tsx';
import { Tag }                                                                  from '../../design-system/Tag.tsx';
import { QuestionAskColumn }                                                    from './QuestionAskColumn.tsx';
import { QuestionBackgroundColumn }                                             from './QuestionBackgroundColumn.tsx';
import type { QuestionPanelBoard, QuestionPanelFormat, QuestionPanelViewModel } from './QuestionPanelModel.ts';
import { QuestionPanelModel }                                                   from './QuestionPanelModel.ts';

export interface QuestionPanelProps {
  readonly board:                QuestionPanelBoard;
  readonly queue:                readonly OpenDecision[];
  /** `null` while the panel is folded or nothing is open: a shown panel then slides out. */
  readonly shownDecision:        OpenDecision | null;
  /** True while the detail panel shows: one right-edge panel shows at a time. */
  readonly isHiddenBehindDetail: boolean;
  readonly format:               QuestionPanelFormat;
  readonly followTranscript:     TranscriptFollower;
  readonly onFold:               () => void;
  readonly onClose:              () => void;
  readonly onNext:               () => void;
  /** Asked once, as the panel first shows: true moves the focus to × so the next Tab walks the panel. */
  readonly focusesCloseOnOpen:   () => boolean;
}

/** What the tab bar's bottom is: the panel docks under it, as the detail panel does. */
const TAB_BAR_SELECTOR = '.bridge-tab-bar';

function tabBarOf(): Element | null {
  return document.querySelector(TAB_BAR_SELECTOR);
}

function PanelHead({ model, onFold }: { readonly model: QuestionPanelViewModel; readonly onFold: () => void }) {
  const { head } = model;
  return (
    <div className="bridge-question-panel-head">
      <StateDot state="paused" />
      <strong className="bridge-question-panel-asker">{`${head.askerText} asks User`}</strong>
      {head.headerMark === null || head.headerMark === '' ? null : <span className="bridge-question-header">{head.headerMark}</span>}
      <MonoId text={model.decisionId} />
      {head.ticketIds.length === 0
        ? null
        : (
          <span className="bridge-question-panel-muted">
            {head.askerRoleText === null ? 'on ' : `${head.askerRoleText} on `}
            <TicketLinks ticketIds={head.ticketIds} />
          </span>
        )}
      {head.openSinceText === null
        ? null
        : (
          <span className="bridge-question-panel-muted">
            {'open since '}
            <Stamp shortText={head.openSinceText} />
          </span>
        )}
      {head.escalated ? <Tag tone="warn" text="escalated by the Assistant" /> : null}
      <span className="bridge-question-panel-head-end">
        <Button label="Fold to the tab" onPress={onFold} />
      </span>
    </div>
  );
}

function PanelFoot({ model, onNext }: { readonly model: QuestionPanelViewModel; readonly onNext: () => void }) {
  const { queueFoot } = model;
  const laterText = queueFoot.laterEntries.map((entry) => `${entry.idText} ${entry.askerText}`).join(' · ');
  return (
    <div className="bridge-question-panel-foot">
      <span className="bridge-question-panel-queue" role="img" aria-label={`Question ${queueFoot.position} of ${queueFoot.count}`}>
        {Array.from({ length: queueFoot.count }, (_unused, index) => (
          <span key={index} className="bridge-question-panel-queue-pip" data-current={index + 1 === queueFoot.position ? '' : undefined} />
        ))}
      </span>
      <span>{queueFoot.laterEntries.length === 0 ? 'No other question waits.' : `${queueFoot.laterEntries.length} more after this: ${laterText}`}</span>
      {queueFoot.laterEntries.length === 0
        ? null
        : (
          <span className="bridge-question-panel-foot-end">
            <Button label="Next question ›" accessibleName="Next question" onPress={onNext} />
          </span>
        )}
    </div>
  );
}

/** The decision to show, kept while the panel slides out so its contents stay put; forgotten once the slide ends. */
function useKeptDecision(shownDecision: OpenDecision | null): [OpenDecision | null, () => void] {
  const [kept, setKept] = useState<OpenDecision | null>(shownDecision);
  if (shownDecision !== null && shownDecision !== kept) setKept(shownDecision);
  return [shownDecision ?? kept, () => setKept(null)];
}

export function QuestionPanel({
  board, queue, shownDecision, isHiddenBehindDetail, format, followTranscript, onFold, onClose, onNext, focusesCloseOnOpen
}: QuestionPanelProps) {
  const [displayed, forget] = useKeptDecision(shownDecision);
  const isActive = shownDecision !== null && !isHiddenBehindDetail;

  useEffect(() => {
    if (!isActive) return undefined;
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      onClose();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [isActive, onClose]);

  if (displayed === null) return null;
  const model = QuestionPanelModel.questionPanelModelOf(board, queue.length === 0 ? [displayed] : queue, displayed, format);
  return (
    <div className="bridge-question-panel" hidden={isHiddenBehindDetail}>
      <SidePanel
        label={`Question ${model.decisionId} from ${model.head.askerText}`}
        width="question"
        dockBelow={tabBarOf}
        isClosing={shownDecision === null}
        onClosed={forget}
        onClose={onClose}
        closeLabel="Close the question panel"
        focusesCloseOnOpen={focusesCloseOnOpen}
        contentKey={model.decisionId}
        head={<PanelHead model={model} onFold={onFold} />}
        foot={<PanelFoot model={model} onNext={onNext} />}
      >
        <div className="bridge-question-panel-columns">
          <QuestionAskColumn key={model.decisionId} decision={displayed.decision} model={model} />
          <QuestionBackgroundColumn key={`${model.decisionId}-background`} model={model} followTranscript={followTranscript} todayCalendarDate={format.todayCalendarDate} />
        </div>
      </SidePanel>
    </div>
  );
}
