/**
 * The forge documents the forge-api specs read, taken through the forge client from the recorded hephaestus answers, and the
 * registry facts of the forges the fleet fixtures show. Test-only.
 */
import type { ForgeDocumentAnswer } from '../../../lib/forge-client/@types/ForgeClientAnswer.ts';
import { forgeClientOf }            from '../../../lib/forge-client/ForgeClient.ts';
import type { ForgeReading }        from '../../../shared/@types/ForgeReading.ts';
import {
  recordedHephaestusAnswersOf,
  recordedHephaestusFetch,
  type HephaestusSituation,
  type RecordedHephaestusAnswer,
} from '../../../testing/RecordedAnswers.ts';
import type { ForgeRegistryFacts } from '../@types/ForgeDocumentReading.ts';

export type ForgeDocumentRoute = 'identity' | 'summary' | 'monitor';

const EXAMPLE_TOKEN = 'example-token-0123456789abcdef';

/** The stamp the specs read every document at, standing in for the injected clock. */
export const EXAMPLE_READ_STAMP = '2026-11-12T13:19:22.000Z';

async function documentAnsweredOf(answers: readonly RecordedHephaestusAnswer[], route: ForgeDocumentRoute, hephaestusUrl: string): Promise<ForgeDocumentAnswer> {
  const client = forgeClientOf({ hephaestusFetch: recordedHephaestusFetch(answers) });
  const address = { hephaestusUrl } as const;
  if (route === 'identity') return client.identityOf(address);
  if (route === 'summary') return client.summaryOf(address);
  return client.monitorOf({ ...address, bearerToken: EXAMPLE_TOKEN });
}

/** The parsed document one route answered in one situation of the forge; a spec fails when the route answered no document. */
export async function recordedDocumentOf(situation: HephaestusSituation, route: ForgeDocumentRoute, hephaestusUrl: string): Promise<unknown> {
  const answer = await documentAnsweredOf(recordedHephaestusAnswersOf(situation), route, hephaestusUrl);
  if (answer.verdict !== 'answered') throw new Error(`The ${situation} answers hold no ${route} document: ${answer.verdict}.`);
  return answer.document;
}

/** What the registry holds of the forge a fixture reading shows, as a live forge's entry gives it. */
export function registryFactsOf(reading: ForgeReading): ForgeRegistryFacts {
  if (reading.url === null || reading.processId === null) throw new Error(`The fixture shows ${reading.project} with no live Hephaestus.`);
  return {
    trackerId:           reading.trackerId,
    project:             reading.project,
    root:                reading.root,
    hephaestusUrl:       reading.url,
    hephaestusProcessId: reading.processId,
    program:             reading.program,
    lastCommand:         reading.lastCommand,
    lastChangedAt:       reading.lastChangedAt,
  };
}
