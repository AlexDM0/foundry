/**
 * A ticket's spec and plan, a page of their own at `documents/ticket/<id>/<spec|plan>[/line/<n>]`: the head (breadcrumb back to the
 * ticket's Tickets segment, the document tabs, then Build, the state line, the next draft that waits on User, Preview, Code or Split, the
 * comment count and the one primary button, held while the agent's questions are open), the document in the chosen view, on a plan
 * the notice of a spec that moved under it and the effect pane, and the document agent's chat. The documents are read through Gaia's relay
 * when the page opens and again on each `documents` part of the board stream; the agent's turns come from its job's transcript, its open
 * questions from the board's decisions (`docs/design/agent-questions.md`). A route naming a line opens the page there, its question unfolded. A read that
 * fails once the documents were read keeps the page as last read, with the failure over it, so nothing User is doing is lost. The page
 * itself keeps only what User is doing: the view, the comment being written, the effect pane, and the text typed but not saved.
 */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';

import { MarkdownBlocks }                                           from '../../../../src/lib/markdown-render/MarkdownBlocks.ts';
import type { BoardDecisionDocument }                               from '../../../@types/board/BoardDecisionDocuments.ts';
import type { BoardDocument }                                       from '../../../@types/board/BoardDocument.ts';
import type { BoardTicketDocument }                                 from '../../../@types/board/BoardTicketDocuments.ts';
import type { BoardTicketDocumentKind }                             from '../../../@types/board/BoardVocabulary.ts';
import type { BoardTranscriptEntryDocument }                        from '../../../@types/board/ConversationDocument.ts';
import type { BoardLineRangeDocument, GaiaTicketDocumentsDocument } from '../../../@types/board/TicketDocumentsDocument.ts';
import {
  Button,
  EmptyState,
  SegmentedControl,
  Tooltip,
  type SegmentOption
} from '../../../lib/design-system/DesignSystemInterface.ts';
import type { BoardServices }                                 from '../../@types/BoardServices.ts';
import { TicketDocumentsClient, type TicketDocumentsRead }    from '../../api/TicketDocumentsClient.ts';
import { useTranscript }                                      from '../../conversation/TranscriptLog.tsx';
import { useBoardHomeHref, useBoardHrefOf }                   from '../../shell/BoardRouteLinks.ts';
import { BoardRouter, type BoardRoute }                       from '../../shell/BoardRouter.ts';
import type { BoardTabViewProps }                             from '../../shell/BoardTabViews.tsx';
import { useControlCommand }                                  from '../../shell/ControlCommandSender.ts';
import { DetailRoute }                                        from '../../shell/DetailRoute.ts';
import { TimeUtil }                                           from '../../utils/TimeUtil.ts';
import { InDraftModelUtil }                                   from '../tickets/InDraftModel.ts';
import { TICKET_SEGMENT_LABELS, TicketsModel }                from '../tickets/TicketsModel.ts';
import type { CommentDraft }                                  from './CommentPopover.tsx';
import { DocumentAgentStripModelUtil, type DocumentViewMode } from './DocumentAgentStripModel.ts';
import { DocumentChat }                                       from './DocumentChat.tsx';
import { DocumentChatModel }                                  from './DocumentChatModel.ts';
import { DocumentCodeEditor }                                 from './DocumentCodeEditor.tsx';
import { DocumentPreview }                                    from './DocumentPreview.tsx';
import { questionCardIdOf }                                   from './DocumentQuestionCard.tsx';
import { DocumentQuestionsModel }                             from './DocumentQuestionsModel.ts';
import { DocumentSplitView }                                  from './DocumentSplitView.tsx';
import { EffectPane }                                         from './EffectPane.tsx';
import { EffectTreeModel }                                    from './EffectTreeModel.ts';
import { OutOfDateNotice }                                    from './OutOfDateNotice.tsx';
import { ProposalModel }                                      from './ProposalModel.ts';
import type { DocumentPlace }                                 from './TicketDocumentCommands.ts';
import {
  OPEN_QUESTIONS_LOCK_REASON,
  OUT_OF_DATE_SUFFIX,
  TicketDocumentsViewModel,
  type DocumentsHeadModel,
  type PrimaryActionModel
} from './TicketDocumentsViewModel.ts';

/** Reads a ticket's documents for a tracker; a DOM spec hands its own relay. */
export type TicketDocumentsReader = (trackerId: string) => TicketDocumentsClient;

export const TicketDocumentsReaderContext = createContext<TicketDocumentsReader>((trackerId) => TicketDocumentsClient.create(trackerId));

const VIEW_OPTIONS: readonly SegmentOption<DocumentViewMode>[] = [
  { value: 'preview', label: 'Preview' },
  { value: 'code', label: 'Code' },
  { value: 'split', label: 'Split' },
];

const DOCUMENTS_PART = 'documents';

export interface TicketDocumentsPageProps {
  readonly project:          string;
  readonly ticket:           BoardTicketDocument;
  readonly documents:        GaiaTicketDocumentsDocument;
  readonly shown:            BoardTicketDocumentKind;
  readonly transcript:       readonly BoardTranscriptEntryDocument[];
  /** Why the newest read failed while the page shows the documents as last read; `null` while they are current. */
  readonly readFailure?:     string | null;
  /** What a screen of the visual pass shows mid-use; the page starts in Preview with nothing open. */
  readonly atMount?:         PageStateAtMount;
  /** The board's open decisions: the page shows the ones its document's agent asked on this ticket. */
  readonly decisions?:       readonly BoardDecisionDocument[];
  /** Where "Next waiting on you" goes; `null` while no other draft waits on User. */
  readonly nextWaiting?:     BoardRoute | null;
  /** The line of the head a link opened the page at; `null` for its top. */
  readonly focusLine?:       number | null;
  /** The agent's question a link opened the page on; `null` for the one at the line. */
  readonly focusQuestionId?: string | null;
}

/** A jump to lines User asked for, a new one at each ask, so asking again for the same lines scrolls again. */
interface JumpRequest {
  readonly lines: BoardLineRangeDocument;
}

const READ_FAILURE_SENTENCES = {
  'unreadable':  'Gaia cannot read these documents. Reload the page to read them again.',
  'unreachable': 'Gaia could not be reached. The documents are read again once it answers.',
  'no-session':  'This window\'s session ended. Reload the page to open a new one.',
} as const satisfies Readonly<Record<Exclude<TicketDocumentsRead['verdict'], 'read' | 'refused'>, string>>;

function readFailureOf(read: Exclude<TicketDocumentsRead, { readonly verdict: 'read' }>): string {
  return read.verdict === 'refused' ? read.refusal : READ_FAILURE_SENTENCES[read.verdict];
}

export interface PageStateAtMount {
  readonly view?:         DocumentViewMode;
  readonly draft?:        CommentDraft | null;
  readonly draftText?:    string;
  readonly effectIsOpen?: boolean;
  readonly editedText?:   string | null;
  readonly caretLine?:    number | null;
  /** The lines the page opens scrolled to, as a press on their comment's card leaves it. */
  readonly jumpedTo?:     BoardLineRangeDocument;
}

function PrimaryAction({ action }: { readonly action: PrimaryActionModel }) {
  const sender = useControlCommand(action.kind === 'approve' ? action.command : null);
  if (action.kind === 'approved-by-pipeline') return <span className="board-document-approved-by-pipeline">{action.label}</span>;
  // A held approval names the open questions too, while an unsaved edit is the first reason it gives.
  const heldAlsoByQuestions = action.openQuestionsText !== null && action.lockReason !== OPEN_QUESTIONS_LOCK_REASON ? [OPEN_QUESTIONS_LOCK_REASON] : [];
  const button = (
    <Button
      label={action.label}
      emphasis="primary"
      compact
      disabled={!sender.enabled}
      onPress={() => void sender.send()}
      {...(action.lockReason === null ? {} : { accessibleName: [`${action.label}.`, action.lockReason, ...heldAlsoByQuestions].join(' ') })}
    />
  );
  return (
    <span className="board-document-primary">
      {action.openQuestionsText === null ? null : <span className="board-document-open-count">{action.openQuestionsText}</span>}
      {action.openQuestionsText === null || action.lockReason === null ? button : <Tooltip text={action.lockReason} placement="below">{button}</Tooltip>}
      {sender.refusal === null ? null : <span className="board-refusal" role="status">{sender.refusal}</span>}
    </span>
  );
}

/** "Forge › Tickets › In draft › #004 Account pages dark mode": back to the segment the ticket stands in, and to its detail. */
function Breadcrumb({ project, ticket }: { readonly project: string; readonly ticket: BoardTicketDocument }) {
  const hrefOf = useBoardHrefOf();
  const boardHref = useBoardHomeHref();
  const segment = TicketsModel.segmentOfStatus(ticket.status);
  return (
    <nav className="board-document-breadcrumb" aria-label="Breadcrumb">
      <a className="board-document-link" href={boardHref}>{project}</a>
      <span aria-hidden="true">›</span>
      <a className="board-document-link" href={hrefOf({ tab: 'tickets', item: null })}>Tickets</a>
      <span aria-hidden="true">›</span>
      <a className="board-document-link" href={hrefOf({ tab: 'tickets', item: segment })}>{TICKET_SEGMENT_LABELS[segment]}</a>
      <span aria-hidden="true">›</span>
      <a className="board-document-link board-document-current" href={hrefOf({ tab: 'tickets', item: DetailRoute.itemTextOf({ form: 'ticket', ticketId: ticket.id }) })}>
        <span className="board-document-mono">{`#${ticket.id}`}</span>
        {` ${ticket.title}`}
      </a>
    </nav>
  );
}

function DocumentsHead({
  project, ticket, head, view, onView, onShowComments, nextWaiting
}: {
  readonly project:        string;
  readonly ticket:         BoardTicketDocument;
  readonly head:           DocumentsHeadModel;
  readonly view:           DocumentViewMode;
  readonly onView:         (view: DocumentViewMode) => void;
  readonly onShowComments: () => void;
  readonly nextWaiting:    BoardRoute | null;
}) {
  const hrefOf = useBoardHrefOf();
  return (
    <header className="board-document-head">
      <Breadcrumb project={project} ticket={ticket} />
      <div className="board-document-tabs" role="tablist" aria-label="Ticket documents">
        {head.tabs.map((tab) => (
          <a
            key={tab.document}
            role="tab"
            className="board-document-tab"
            aria-selected={tab.selected}
            data-muted={tab.muted ? '' : undefined}
            href={hrefOf(BoardRouter.documentsRouteOf(ticket.id, tab.document))}
          >
            {tab.label}
            {/* A flex row drops the spaces between its items, which still part the tab's name. */}
            {tab.version === null ? null : <>{' '}<span className="board-document-mono">{tab.version}</span></>}
            {tab.suffix === null ? null : <>{' '}<span className="board-document-tab-suffix" data-warns={tab.suffix === OUT_OF_DATE_SUFFIX ? '' : undefined}>{tab.suffix}</span></>}
          </a>
        ))}
      </div>
      <span className="board-document-build">{head.buildText}</span>
      {head.isDraft ? <span className="board-document-draft-pill">Draft</span> : null}
      <span className="board-document-mono board-document-note">{head.stateLine}</span>
      <span className="board-document-head-gap" />
      {nextWaiting === null ? null : <a className="board-document-next" href={hrefOf(nextWaiting)}>Next waiting on you ›</a>}
      <SegmentedControl accessibleName="View" options={VIEW_OPTIONS} selected={view} onSelect={onView} size="standard" />
      {head.commentCount === 0 ? null : <Button label={`Comments ${head.commentCount}`} compact onPress={onShowComments} />}
      <PrimaryAction action={head.primaryAction} />
    </header>
  );
}

/**
 * "On spec v5, approved 13:40 · constitution v3": the spec approval the plan stands on, the one its own approval names once it has one,
 * else the spec's newest.
 */
function planContextLineOf(documents: GaiaTicketDocumentsDocument): string | null {
  const spec = TicketDocumentsViewModel.documentOf(documents, 'spec');
  const plan = TicketDocumentsViewModel.documentOf(documents, 'plan');
  const onSpecNumber = TicketDocumentsViewModel.newestApprovalOf(plan)?.onSpecNumber ?? null;
  const specApproval = spec?.approvals.findLast((approval) => onSpecNumber === null || approval.number === onSpecNumber) ?? null;
  if (specApproval === null) return null;
  const approvedAt = TimeUtil.epochMillisecondsOf(specApproval.at);
  const constitution = plan?.head?.constitutionNumber ?? null;
  return [
    `On spec v${specApproval.number}${approvedAt === null ? '' : `, approved ${TimeUtil.clockOf(new Date(approvedAt))}`}`,
    constitution === null ? null : `constitution v${constitution}`,
  ].filter((part) => part !== null).join(' · ');
}

/** Scrolls the innermost block that holds the lines' first to the middle of the container. */
export function scrollToLines(container: HTMLElement | null, lines: BoardLineRangeDocument): void {
  if (container === null) return;
  const holding = [...container.querySelectorAll<HTMLElement>('[data-from-line]')].filter((element) => (
    Number(element.dataset['fromLine']) <= lines.from && lines.from <= Number(element.dataset['toLine'])
  ));
  holding.at(-1)?.scrollIntoView?.({ block: 'center' });
}

const NO_DECISIONS: readonly BoardDecisionDocument[] = [];

export function TicketDocumentsPage({
  project, ticket, documents, shown, transcript, readFailure = null, atMount = {}, decisions = NO_DECISIONS, nextWaiting = null, focusLine = null,
  focusQuestionId = null
}: TicketDocumentsPageProps) {
  const [view, setView] = useState<DocumentViewMode>(atMount.view ?? 'preview');
  const [draft, setDraft] = useState<CommentDraft | null>(atMount.draft ?? null);
  const [effectIsOpen, setEffectIsOpen] = useState(atMount.effectIsOpen ?? false);
  const [editedText, setEditedText] = useState<string | null>(atMount.editedText ?? null);
  const linesAtMount = atMount.jumpedTo ?? (focusLine === null ? undefined : { from: focusLine, to: focusLine });
  const [jump, setJump] = useState<JumpRequest | null>(linesAtMount === undefined ? null : { lines: linesAtMount });
  const [chosenQuestionId, setChosenQuestionId] = useState<string | null>(focusQuestionId);
  const [caretLine, setCaretLine] = useState<number | null>(atMount.caretLine ?? null);
  const main = useRef<HTMLElement>(null);
  const hrefOf = useBoardHrefOf();
  const document = TicketDocumentsViewModel.documentOf(documents, shown);
  const spec = TicketDocumentsViewModel.documentOf(documents, 'spec');
  // Only an editor that is open holds text; Preview edits nothing.
  const editing = view !== 'preview' && document !== null && editedText !== null && editedText !== document.markdown;
  const blocks = useMemo(() => MarkdownBlocks.blocksOf(document?.markdown ?? ''), [document?.markdown]);
  const agentTurns = useMemo(() => DocumentChatModel.agentTurnProgressOf(transcript), [transcript]);
  const questions = useMemo(() => DocumentQuestionsModel.documentQuestionsOf({
    decisions, messages: document?.messages ?? [], proposals: document?.proposals ?? [], agentTurns, ticketId: ticket.id, document: shown, blocks
  }), [decisions, document?.messages, document?.proposals, agentTurns, ticket.id, shown, blocks]);
  const head = TicketDocumentsViewModel.headOf({
    documents, ticket, shown, editing, openQuestionCount: questions.open.length
  });
  const effectReading = documents.effectReadings.findLast((reading) => reading.document === shown) ?? null;
  const chat = useMemo(() => (
    document === null ? null : DocumentChatModel.documentChatOf(document, transcript, effectReading, questions)
  ), [document, transcript, effectReading, questions]);
  const expandedQuestionId = questions.open.some((question) => question.decisionId === chosenQuestionId)
    ? chosenQuestionId
    : DocumentQuestionsModel.questionAtLineOf(questions.open, focusLine)?.decisionId ?? null;

  // A link to another line of the page, such as a question's in the Questions tab, scrolls there without opening the page again.
  const [focusLineJumpedTo, setFocusLineJumpedTo] = useState(focusLine);
  if (focusLine !== focusLineJumpedTo) {
    setFocusLineJumpedTo(focusLine);
    if (focusLine !== null) setJump({ lines: { from: focusLine, to: focusLine } });
  }
  const [focusQuestionFollowed, setFocusQuestionFollowed] = useState(focusQuestionId);
  if (focusQuestionId !== focusQuestionFollowed) {
    setFocusQuestionFollowed(focusQuestionId);
    if (focusQuestionId !== null) setChosenQuestionId(focusQuestionId);
  }

  // Each ask is a new request, so the same lines scroll again, and a change of view alone scrolls nowhere.
  useEffect(() => {
    if (jump !== null) scrollToLines(main.current, jump.lines);
  }, [jump]);

  if (document === null || chat === null) return <EmptyState text={`Ticket ${ticket.id} has no ${shown}.`} />;
  const place: DocumentPlace = { ticketId: ticket.id, document: shown };
  const strip = DocumentAgentStripModelUtil.stripOf({
    document, spec: shown === 'plan' ? spec : null, chat, effectReading, view, openQuestionCount: questions.open.length
  });
  const showQuestion = (decisionId: string): void => {
    setChosenQuestionId(decisionId);
    globalThis.document.getElementById(questionCardIdOf(decisionId))?.scrollIntoView?.({ block: 'nearest' });
  };
  const proposals = ProposalModel.openProposalsOf(shown, document.proposals);
  const notice = shown === 'plan' ? TicketDocumentsViewModel.outOfDateNoticeOf(document) : null;
  const shownUpdateLines = proposals[0]?.headLines ?? null;
  const settled = !document.editable;
  const versionNumber = document.head?.number ?? null;
  const contextLine = shown === 'plan' ? planContextLineOf(documents) : null;
  const userEditNotice = DocumentChatModel.userEditNoticeOf({
    document, chat, editing, caretLine: editing ? caretLine : null
  });
  const changeView = (next: DocumentViewMode): void => {
    setView(next);
    setDraft(null);
    setEditedText(null);
    setCaretLine(null);
  };
  const jumpTo = (lines: BoardLineRangeDocument): void => {
    if (view !== 'preview') changeView('preview');
    setJump({ lines });
  };

  const documentView = (() => {
    switch (view) {
      case 'preview':
        return (
          <DocumentPreview
            place={place}
            markdown={document.markdown}
            versionNumber={versionNumber}
            messages={document.messages}
            proposals={proposals}
            referenceMarks={shown === 'plan' && effectReading?.versionNumber === versionNumber ? EffectTreeModel.referenceMarksOf(effectReading) : []}
            draft={draft?.anchor.view === 'preview' ? draft : null}
            onDraft={setDraft}
            settled={settled}
            lead={contextLine === null ? undefined : <p className="board-document-context">{contextLine}</p>}
            questions={questions}
            onShowQuestion={showQuestion}
            {...(atMount.draftText === undefined ? {} : { draftText: atMount.draftText })}
          />
        );
      case 'code':
        return (
          <DocumentCodeEditor
            place={place}
            markdown={document.markdown}
            versionNumber={versionNumber}
            messages={document.messages}
            readOnly={head.readOnly}
            draft={draft}
            onDraft={setDraft}
            onTextChange={setEditedText}
            onCaretLine={setCaretLine}
            {...(atMount.draftText === undefined ? {} : { draftText: atMount.draftText })}
          />
        );
      case 'split':
        return (
          <DocumentSplitView
            place={place}
            markdown={document.markdown}
            versionNumber={versionNumber}
            messages={document.messages}
            readOnly={head.readOnly}
            draft={draft}
            onDraft={setDraft}
            onTextChange={setEditedText}
            caretLineAtMount={atMount.caretLine ?? null}
            onCaretLine={setCaretLine}
          />
        );
    }
  })();

  return (
    <div className="board-document-page" data-view={view} data-document={shown} data-effect-open={shown === 'plan' && effectIsOpen ? '' : undefined}>
      <DocumentsHead
        project={project}
        ticket={ticket}
        head={head}
        view={view}
        onView={changeView}
        onShowComments={() => globalThis.document.querySelector<HTMLElement>('.board-document-chat')?.scrollIntoView?.({ block: 'start' })}
        nextWaiting={nextWaiting}
      />
      <div className="board-document-body">
        <main ref={main} className="board-document-main" aria-label={`The ${shown} of ticket ${ticket.id}`}>
          {readFailure === null ? null : <p className="board-refusal" role="status">{readFailure}</p>}
          {notice === null
            ? null
            : (
              <OutOfDateNotice
                notice={notice}
                specHref={hrefOf(BoardRouter.documentsRouteOf(ticket.id, 'spec'))}
                onShowUpdate={proposals.length === 0 ? null : () => {
                  if (shownUpdateLines !== null) jumpTo(shownUpdateLines);
                }}
              />
            )}
          {documentView}
        </main>
        {shown === 'plan' && effectIsOpen
          ? <EffectPane place={place} reading={effectReading} headNumber={versionNumber} onClose={() => setEffectIsOpen(false)} />
          : null}
        <DocumentChat
          place={place}
          chat={chat}
          strip={strip}
          view={view}
          draftIsOpen={draft !== null}
          proposalMode={document.proposalMode}
          headNumber={versionNumber}
          settled={settled}
          onJumpToAnchor={jumpTo}
          onOpenEffect={shown === 'plan' ? () => setEffectIsOpen(true) : null}
          userEditNotice={userEditNotice}
          expandedQuestionId={expandedQuestionId}
          onExpandQuestion={setChosenQuestionId}
        />
      </div>
    </div>
  );
}

/** The newest read, and the documents of the last read that succeeded, which a failed read after it leaves standing. */
interface DocumentsReading {
  readonly ticketId:      string;
  readonly read:          TicketDocumentsRead | null;
  readonly lastDocuments: GaiaTicketDocumentsDocument | null;
}

/** The ticket's documents, read when the page opens, on each `documents` part of the board stream and when the stream comes back. */
function useTicketDocuments(services: BoardServices, ticketId: string): Omit<DocumentsReading, 'ticketId'> {
  const reader = useContext(TicketDocumentsReaderContext);
  const client = useMemo(() => reader(services.trackerId), [reader, services.trackerId]);
  const [reading, setReading] = useState<DocumentsReading>({ ticketId, read: null, lastDocuments: null });
  useEffect(() => {
    let isMounted = true;
    let readNumber = 0;
    const readAgain = (): void => {
      readNumber += 1;
      const thisRead = readNumber;
      void client.read(ticketId).then((read) => {
        if (!isMounted || thisRead !== readNumber) return;
        setReading((before) => {
          const documentsBefore = before.ticketId === ticketId ? before.lastDocuments : null;
          return { ticketId, read, lastDocuments: read.verdict === 'read' ? read.documents : documentsBefore };
        });
      });
    };
    readAgain();
    const stream = services.openEventStream({
      onEvent: (event) => {
        if (event.kind === 'part-changed' && event.part === DOCUMENTS_PART) readAgain();
      },
      onConnection: (state) => {
        if (state === 'live') readAgain();
      },
    });
    return () => {
      isMounted = false;
      stream.close();
    };
  }, [client, services, ticketId]);
  return reading.ticketId === ticketId ? reading : { read: null, lastDocuments: null };
}

/** The route of the draft after this ticket among those that wait on User, oldest wait first, round to the first; `null` with no other. */
function nextWaitingRouteOf(board: BoardDocument, ticketId: string): BoardRoute | null {
  const waiting = InDraftModelUtil.waitingRowsOf(board);
  const position = waiting.findIndex((row) => row.ticketId === ticketId);
  const next = waiting[(position + 1) % Math.max(waiting.length, 1)];
  return next === undefined || next.ticketId === ticketId ? null : next.actionRoute;
}

function DocumentsOfTicket({
  board, services, ticketId, shown, focusLine, focusQuestionId
}: {
  readonly board:           BoardDocument;
  readonly services:        BoardServices;
  readonly ticketId:        string;
  readonly shown:           BoardTicketDocumentKind;
  readonly focusLine:       number | null;
  readonly focusQuestionId: string | null;
}) {
  const { read, lastDocuments } = useTicketDocuments(services, ticketId);
  const agentJobId = lastDocuments === null ? null : TicketDocumentsViewModel.documentOf(lastDocuments, shown)?.agentJobId ?? null;
  const { entries } = useTranscript(agentJobId, services.followTranscript);
  const ticket = board.page.tickets.find((candidate) => candidate.id === ticketId) ?? null;
  if (ticket === null) return <EmptyState text={`The board has no ticket ${ticketId}.`} />;
  if (read === null) return <EmptyState text={`Reading the documents of ticket ${ticketId}.`} />;
  if (lastDocuments !== null) {
    return (
      <TicketDocumentsPage
        project={board.project}
        ticket={ticket}
        documents={lastDocuments}
        shown={shown}
        transcript={entries}
        readFailure={read.verdict === 'read' ? null : readFailureOf(read)}
        decisions={board.decisions}
        nextWaiting={nextWaitingRouteOf(board, ticketId)}
        focusLine={focusLine}
        focusQuestionId={focusQuestionId}
      />
    );
  }
  if (read.verdict === 'read') return null;
  return read.verdict === 'refused' ? <p className="board-refusal" role="status">{read.refusal}</p> : <EmptyState text={readFailureOf(read)} />;
}

export function TicketDocumentsView({ board, route, services }: BoardTabViewProps) {
  const target = BoardRouter.documentOfRoute(route);
  if (target === null) return <EmptyState text="No ticket document is at this address." />;
  return (
    <DocumentsOfTicket
      key={`${target.ticketId}/${target.document}`}
      board={board}
      services={services}
      ticketId={target.ticketId}
      shown={target.document}
      focusLine={target.line}
      focusQuestionId={target.questionId}
    />
  );
}
