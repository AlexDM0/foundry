/**
 * The question panel: one open decision beside the board, over every tab, with what to answer on the left and why it was asked on the
 * right, and the queue of the other open decisions in its foot. It slides in while a decision waits and out once none shows, keeping the
 * last one shown while it slides, handing the focus it held back to what held it as it appeared; it stays mounted but hidden while the
 * detail panel shows, and Esc closes it only when no inner layer took the key, so the detail panel closes first.
 */

import { Button } from 'design-system/Button';
import { MonoId } from 'design-system/MonoId';
import {
  SidePanel,
  SidePanelBody,
  SidePanelFoot,
  SidePanelHead
} from 'design-system/SidePanel';
import { Stamp }    from 'design-system/Stamp';
import { StateDot } from 'design-system/StateDot';
import { Tag }      from 'design-system/Tag';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState
} from 'react';

import { TicketLinks }                                                          from '../../conversation/ConversationParts.tsx';
import type { OpenDecision }                                                    from '../../conversation/OpenDecisionsUtil.ts';
import type { TranscriptFollower }                                              from '../../conversation/TranscriptLog.tsx';
import { StateToneUtil }                                                        from '../../utils/StateToneUtil.ts';
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
      <StateDot {...StateToneUtil.dotOf('paused')} />
      <strong className="bridge-question-panel-asker">{`${head.askerText} asks User`}</strong>
      {head.headerMark === null || head.headerMark === '' ? null : <Tag tone="neutral" text={head.headerMark} />}
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
  const queueLineText = queueFoot.laterEntries.length === 0 ? 'No other question waits.' : `${queueFoot.laterEntries.length} more after this: ${laterText}`;
  return (
    <div className="bridge-question-panel-foot">
      <span className="bridge-question-panel-queue" role="img" aria-label={`Question ${queueFoot.position} of ${queueFoot.count}`}>
        {Array.from({ length: queueFoot.count }, (_unused, index) => (
          <span key={index} className="bridge-question-panel-queue-pip" data-current={index + 1 === queueFoot.position ? '' : undefined} />
        ))}
      </span>
      <span className="bridge-question-panel-queue-line" title={queueLineText}>{queueLineText}</span>
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

const PANEL_SELECTOR = '.bridge-question-panel';

function focusedOpenerOf(): HTMLElement | null {
  const focused = document.activeElement;
  return focused instanceof HTMLElement && focused !== document.body && focused.closest(PANEL_SELECTOR) === null ? focused : null;
}

/**
 * What held the focus as the panel appeared, read before the panel moves it to ×; once the panel slid out holding the focus, the focus goes
 * back there rather than to the page's body.
 */
function useOpenerFocusReturn(panelIsMounted: boolean): () => void {
  const opener = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    opener.current = panelIsMounted ? focusedOpenerOf() : null;
  }, [panelIsMounted]);
  return () => {
    const panelHeldFocus = (document.activeElement?.closest(PANEL_SELECTOR) ?? null) !== null;
    if (panelHeldFocus && opener.current?.isConnected === true) opener.current.focus({ preventScroll: true });
  };
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
  const returnFocusToOpener = useOpenerFocusReturn(displayed !== null);
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
        onClosed={() => {
          returnFocusToOpener();
          forget();
        }}
        focusesCloseOnOpen={focusesCloseOnOpen}
      >
        <SidePanelHead closeLabel="Close the question panel" onClose={onClose}>
          <PanelHead model={model} onFold={onFold} />
        </SidePanelHead>
        <SidePanelBody contentKey={model.decisionId}>
          <div className="bridge-question-panel-columns">
            <QuestionAskColumn key={model.decisionId} decision={displayed.decision} model={model} />
            <QuestionBackgroundColumn key={`${model.decisionId}-background`} model={model} followTranscript={followTranscript} todayCalendarDate={format.todayCalendarDate} />
          </div>
        </SidePanelBody>
        <SidePanelFoot>
          <PanelFoot model={model} onNext={onNext} />
        </SidePanelFoot>
      </SidePanel>
    </div>
  );
}
