/**
 * Test-only: Gaia's server as the command sender meets it, standing in with authored answers in the shape `CommandsRoute` sends
 * (`docs/architecture.md`, "A command, from button to forge"), since the page's specs run without a server. Each request takes the next
 * answer in order, and a request beyond them fails the spec.
 */
import { CommandSender, type CommandRequestSender } from '../api/CommandSender.ts';

export interface SentRequest {
  readonly path:           string;
  readonly requestOptions: RequestInit;
}

const HTTP_OK = 200;

export function answerResponse(answer: unknown, status = HTTP_OK): Response {
  return new Response(JSON.stringify(answer), { status, headers: { 'content-type': 'application/json' } });
}

export function serverAnswering(responses: readonly (() => Promise<Response>)[], sent: SentRequest[] = []): CommandRequestSender {
  return (path, requestOptions) => {
    const answer = responses[sent.length];
    sent.push({ path, requestOptions });
    if (answer === undefined) throw new Error(`The spec has no answer for request ${sent.length}.`);
    return answer();
  };
}

/** A command sender whose controls may act, over a server that answers these responses in order. */
export function senderOver(responses: readonly (() => Promise<Response>)[], sent: SentRequest[] = [], sessionWasLost: () => void = () => undefined): CommandSender {
  return CommandSender.create({ sendRequest: serverAnswering(responses, sent), controlsMayAct: () => true, sessionWasLost });
}
