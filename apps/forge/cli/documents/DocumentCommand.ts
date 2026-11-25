/**
 * `document propose`, `document ready`, `document effect` and `document ask`: a spec or plan agent's moves on the ticket document its job
 * writes. Each runs only under that job, where it is relayed through the Hatch and Hephaestus stamps the job; outside a job it is refused.
 */
import type { CommandHandler } from '../CommandHandler.ts';
import { refuseUsage }         from '../RecordedIncidentMove.ts';
import { askDocumentQuestion } from './DocumentAsk.ts';
import { readDocumentEffect }  from './DocumentEffect.ts';
import { proposeDocumentEdit } from './DocumentPropose.ts';
import { markDocumentReady }   from './DocumentReady.ts';
import { DOCUMENT_USAGE }      from './constants/DocumentUsage.ts';

const DOCUMENT_SUBCOMMANDS = {
  propose: proposeDocumentEdit,
  ready:   markDocumentReady,
  effect:  readDocumentEffect,
  ask:     askDocumentQuestion,
} as const;

export const DOCUMENT_SUBCOMMAND_NAMES: readonly string[] = Object.freeze(Object.keys(DOCUMENT_SUBCOMMANDS));

export const documentCommand: CommandHandler = async (commandArguments, context) => {
  const subcommand = commandArguments.positionals()[0];
  if (subcommand === undefined || !Object.hasOwn(DOCUMENT_SUBCOMMANDS, subcommand)) {
    refuseUsage(`Name the subcommand: document ${DOCUMENT_SUBCOMMAND_NAMES.join(', ')}.`, Object.values(DOCUMENT_USAGE).join('\n'));
  }
  await DOCUMENT_SUBCOMMANDS[subcommand as keyof typeof DOCUMENT_SUBCOMMANDS](commandArguments, context);
};
