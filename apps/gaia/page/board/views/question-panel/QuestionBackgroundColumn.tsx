/**
 * The panel's right column: reading tabs over why the question was asked. Background holds why the agent stopped, the first ticket with
 * its Wanted and Brief as text and its Acceptance items, what the asking job did before it asked, and the earlier answers on that ticket;
 * the ticket tab its whole body in a sandboxed frame; the conversation tab the asking job's chat. The transcript is followed while a tab
 * that reads it shows, and the tab starts at Background for every decision, since the column is keyed by it.
 */

import { useState } from 'react';
import {
  Callout,
  KeyedLineList,
  MonoId,
  type TabItem,
  Tabs,
  TextButton,
  TitledBlock
} from '../../../lib/design-system/DesignSystemInterface.ts';

import type { BoardRoute }         from '../../../shared/BoardRouter.ts';
import type { TranscriptFollower } from '../../@types/BoardServices.ts';
import { EpicChips }               from '../../chips/EpicChips.tsx';
import { ChatCard, ChatThread }    from '../../conversation/ChatThread.tsx';
import { ChatThreadModelUtil }     from '../../conversation/ChatThreadModel.ts';
import { useTranscript }           from '../../conversation/TranscriptLog.tsx';
import { SandboxedHtmlFrame }      from '../../sandboxed-html/SandboxedHtmlFrame.tsx';
import { useBoardHrefOf }          from '../../shared/routing/BoardRouteLinks.ts';
import { DetailRoute }             from '../../shared/routing/DetailRoute.ts';
import {
  QUESTION_PANEL_STEPS_SHOWN,
  QuestionPanelModel,
  type QuestionPanelViewModel,
  type ReadingTab,
  type TicketBlock
} from './QuestionPanelModel.ts';

export interface QuestionBackgroundColumnProps {
  readonly model:             QuestionPanelViewModel;
  readonly followTranscript:  TranscriptFollower;
  readonly todayCalendarDate: string;
}

function readingTabItemOf(tab: ReadingTab, model: QuestionPanelViewModel): TabItem<ReadingTab> {
  switch (tab) {
    case 'background':
      return { key: tab, label: 'Background' };
    case 'ticket':
      return { key: tab, label: `Ticket #${model.ticket?.ticketId ?? ''}` };
    case 'conversation':
      return { key: tab, label: `${model.head.askerText} conversation` };
  }
}

function ticketRowRouteOf(ticketId: string): BoardRoute {
  return { tab: 'tickets', item: DetailRoute.itemTextOf({ form: 'ticket-row', ticketId }) };
}

function Excerpt({ label, text }: { readonly label: string; readonly text: string }) {
  return (
    <p className="board-question-panel-excerpt">
      <span className="board-question-panel-excerpt-label">{label}</span>
      {text}
    </p>
  );
}

function TicketCard({ ticket }: { readonly ticket: TicketBlock }) {
  const hrefOf = useBoardHrefOf();
  return (
    <div className="board-question-panel-ticket">
      <div className="board-question-panel-ticket-head">
        <MonoId text={`#${ticket.ticketId}`} />
        <span className="board-question-panel-ticket-title">{ticket.title}</span>
      </div>
      {ticket.epics.length === 0 && ticket.heldCount === 0 && ticket.callsText === null
        ? null
        : (
          <div className="board-question-panel-ticket-head">
            {ticket.epics.length === 0 ? null : <EpicChips epics={ticket.epics} />}
            {ticket.heldCount === 0 ? null : <span className="board-question-panel-held-count" title={ticket.heldTitle}>{`↦ ${ticket.heldCount}`}</span>}
            {ticket.callsText === null ? null : <span className="board-question-panel-calls">{ticket.callsText}</span>}
          </div>
        )}
      {ticket.wantedText === null ? null : <Excerpt label="Wanted" text={ticket.wantedText} />}
      {ticket.briefText === null ? null : <Excerpt label="Brief" text={ticket.briefText} />}
      {ticket.acceptanceItems.length === 0
        ? null
        : (
          <div className="board-question-panel-excerpt">
            <span className="board-question-panel-excerpt-label">Acceptance</span>
            <ol className="board-question-panel-acceptance">
              {ticket.acceptanceItems.map((item) => (
                <li key={item.label} data-waived={item.waived ? '' : undefined}>
                  <span className="board-question-panel-acceptance-id"><MonoId text={item.label} tone="muted" /></span>
                  {item.text}
                </li>
              ))}
            </ol>
          </div>
        )}
      <TextButton label="Read the whole ticket" href={hrefOf(ticketRowRouteOf(ticket.ticketId))} />
    </div>
  );
}

export function QuestionBackgroundColumn({ model, followTranscript, todayCalendarDate }: QuestionBackgroundColumnProps) {
  const [chosenReadingTab, setReadingTab] = useState<ReadingTab>('background');
  // A tab a later board dropped, such as a ticket that left the page, falls back to the background.
  const readingTab = model.readingTabs.includes(chosenReadingTab) ? chosenReadingTab : 'background';
  const jobId = model.stepsJobId;
  const { entries, historyKey } = useTranscript(readingTab === 'ticket' ? null : jobId, followTranscript);
  const steps = QuestionPanelModel.lastStepsOf(entries, QUESTION_PANEL_STEPS_SHOWN);
  const { ticket } = model;
  return (
    <section className="board-question-panel-background" aria-label="Background">
      <div className="board-question-panel-reading">
        <Tabs
          label="Read further"
          items={model.readingTabs.map((tab) => readingTabItemOf(tab, model))}
          selectedKey={readingTab}
          mode="switch"
          size="section"
          onSelect={setReadingTab}
        />
      </div>
      <div className="board-question-panel-reading-body" role="tabpanel" aria-label={readingTabItemOf(readingTab, model).label}>
        {readingTab === 'background'
          ? (
            <>
              {model.stoppedReason === null
                ? null
                : (
                  <TitledBlock look="label" title={`Why ${model.head.askerText} stopped`}>
                    <Callout tone="warn"><p>{model.stoppedReason}</p></Callout>
                  </TitledBlock>
                )}
              {ticket === null ? null : <TitledBlock look="label" title="The ticket"><TicketCard ticket={ticket} /></TitledBlock>}
              {jobId === null || steps.length === 0
                ? null
                : (
                  <TitledBlock look="label" title={`What ${jobId} did before it asked`}>
                    <KeyedLineList
                      label={`The last tool calls of ${jobId}`}
                      keyColumn="tool"
                      lines={steps.map((step) => ({
                        key:  step.toolName,
                        text: <span className="board-question-panel-step-text" title={step.text}>{step.isCurrent ? `${model.decisionId}, waiting on User` : step.text}</span>,
                        ...(step.isCurrent ? { mark: 'current' as const } : {}),
                      }))}
                    />
                    <TextButton
                      label={model.callCount === null ? `All calls in the ${jobId} conversation` : `All ${model.callCount} calls in the ${jobId} conversation`}
                      onPress={() => setReadingTab('conversation')}
                    />
                  </TitledBlock>
                )}
              {ticket === null || model.earlierAnswers.length === 0
                ? null
                : (
                  <TitledBlock look="label" title={`Answered earlier on #${ticket.ticketId}`}>
                    <KeyedLineList
                      label={`Earlier answers on #${ticket.ticketId}`}
                      keyColumn="tool"
                      lines={model.earlierAnswers.map((earlier) => ({
                        key:      `${earlier.decisionId} ${earlier.answeredClockText}`,
                        keyTitle: earlier.answeredAt,
                        text:     earlier.answerText,
                      }))}
                    />
                  </TitledBlock>
                )}
            </>
          )
          : null}
        {readingTab === 'ticket' && ticket !== null && ticket.bodyHtml !== null
          ? <SandboxedHtmlFrame title={`Description of ${ticket.title}`} html={ticket.bodyHtml} placement="ticket-body" />
          : null}
        {readingTab === 'conversation' && jobId !== null
          ? (
            <ChatCard label={`Chat of ${jobId}`}>
              <ChatThread
                label={`Conversation of ${jobId}`}
                turns={QuestionPanelModel.conversationTurnsOf(ChatThreadModelUtil.threadItemsOf(entries, []), jobId, todayCalendarDate)}
                renderDecision={() => null}
                historyKey={historyKey}
              />
            </ChatCard>
          )
          : null}
      </div>
    </section>
  );
}
