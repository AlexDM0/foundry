/**
 * The ticket documents, the answer to the spec's save, the board in the spec-then-plan route and the board events up to the `documents` event
 * that the ingestion and route specs read, taken through the forge client from the `hephaestus-fetch-ticket-documents` recording of a scratch forge at the
 * supported forge version. Test-only.
 */
import type { ForgeStreamEvent, HephaestusAccess }                                                  from '../../../lib/forge-client/@types/ForgeClientAnswer.ts';
import { forgeClientOf, type ForgeClient }                                                          from '../../../lib/forge-client/ForgeClient.ts';
import { recordedHephaestusFetch, recordedTicketDocumentsAnswersOf, type TicketDocumentsSituation } from '../../../testing/RecordedAnswers.ts';

/** The tracker id the recording's scratch forge was drawn with, as the registry names it. */
export const RECORDED_BOOKSHOP_TRACKER_ID = 'example-bookshop-3e9a';

/** The draft whose spec was saved, and so has documents; the draft that has none; and a reference that names no ticket. */
export const RECORDED_TICKET_IDS = {
  withDocuments:    '001',
  withoutDocuments: '002',
  unknown:          '999',
} as const;

const RECORDED_TICKET_ID_OF_SITUATION: Readonly<Record<TicketDocumentsSituation, string>> = {
  'ticket-documents-saved':          RECORDED_TICKET_IDS.withDocuments,
  'ticket-documents-absent':         RECORDED_TICKET_IDS.withoutDocuments,
  'ticket-documents-unknown-ticket': RECORDED_TICKET_IDS.unknown,
};

const EXAMPLE_ACCESS: HephaestusAccess = { hephaestusUrl: 'http://127.0.0.1:47100', bearerToken: 'example-token-0123456789abcdef' };

/** The handshake, the board, the `documents` event of the save, and the board after it. */
const RECORDED_EVENTS_OF_THE_SAVE = 4;

export function recordedTicketDocumentsClientOf(situation: TicketDocumentsSituation): ForgeClient {
  return forgeClientOf({ hephaestusFetch: recordedHephaestusFetch(recordedTicketDocumentsAnswersOf(situation)) });
}

/** The ticket's documents as the forge answered them in one situation: its status and its parsed body. */
export async function recordedTicketDocumentsAnswerOf(situation: TicketDocumentsSituation): Promise<{ readonly status: number; readonly body: unknown }> {
  const answer = await recordedTicketDocumentsClientOf(situation).ticketDocumentsOf(EXAMPLE_ACCESS, RECORDED_TICKET_ID_OF_SITUATION[situation]);
  if (answer.verdict !== 'answered') throw new Error(`The ${situation} answers hold no documents answer: ${answer.verdict}.`);
  return { status: answer.status, body: answer.body };
}

/** The answer to the spec's save that opened the ticket's documents: its status and its parsed body. */
export async function recordedDocumentSaveAnswerOf(): Promise<{ readonly status: number; readonly body: unknown }> {
  const answer = await recordedTicketDocumentsClientOf('ticket-documents-saved').sendBoardCommand(EXAMPLE_ACCESS, { kind: 'ticket-document-save' });
  if (answer.verdict !== 'answered') throw new Error(`The saved documents' answers hold no command answer: ${answer.verdict}.`);
  return { status: answer.status, body: answer.body };
}

/** The board read after the save: a pipeline in the spec-then-plan route and a ticket with its documents' summary. */
export async function recordedSpecThenPlanBoardDocument(): Promise<unknown> {
  const answer = await recordedTicketDocumentsClientOf('ticket-documents-saved').boardOf(EXAMPLE_ACCESS);
  if (answer.verdict !== 'answered') throw new Error(`The saved documents' answers hold no board document: ${answer.verdict}.`);
  return answer.document;
}

export async function recordedDocumentsStreamEventsOf(): Promise<readonly ForgeStreamEvent[]> {
  const events: ForgeStreamEvent[] = [];
  const following = recordedTicketDocumentsClientOf('ticket-documents-saved').followEvents(EXAMPLE_ACCESS, null, (event) => {
    events.push(event);
    if (events.length === RECORDED_EVENTS_OF_THE_SAVE) following.stop();
  });
  await following.ended;
  return events;
}
