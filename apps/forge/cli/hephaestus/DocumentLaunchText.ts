/**
 * What a spec or plan agent and an effect reader are told at launch: the document agent's prompt with its ticket, its documents numbered
 * by line and its task now, and the effect reader's prompt with the version and the main line's paths. Its role's instruction files are
 * the agent's role brief; the effect reader has none.
 */
import { readFileSync } from 'node:fs';

import type { Job }                           from '../../src/domain/tracker-model/@types/Job.ts';
import type { JobLaunchFacts, JobLaunchText } from '../../src/services/hephaestus/@types/JobLaunchFacts.ts';
import type { DocumentAgentFacts }            from '../../src/services/hephaestus/DocumentAgentSessions.ts';
import { DocumentAgentWording }               from '../../src/services/hephaestus/DocumentAgentWording.ts';
import type { EffectReadingFacts }            from '../../src/services/hephaestus/EffectReadings.ts';
import { filledTemplateOf }                   from '../../src/shared/FilledTemplate.ts';
import { resourceFilePathOf }                 from '../../src/shared/ResourceFilePath.ts';
import { PRODUCT_NAMES }                      from '../../src/shared/constants/ProductNames.ts';

const DOCUMENT_AGENT_LIMITS = {
  'confined':             'You may write only your Hatch folder, and you have no network.',
  'unconfined-by-design': 'Write only to your Hatch folder, and do not use the network. No sandbox runs on this machine: nothing stops a command that breaks this rule.',
} as const satisfies Record<JobLaunchFacts['confinement'], string>;

function promptOf(fileName: string): string {
  return readFileSync(resourceFilePathOf('prompts', fileName), 'utf8');
}

function requestTextOf(facts: DocumentAgentFacts): string {
  if (facts.request === 'write') return `Write the first version of the ${facts.document}. Send it with baseVersion null, then send document ready.`;
  if (facts.request === 'update') {
    return `The spec changed after the plan was approved. Change the plan for spec version ${facts.approvedSpec?.versionNumber ?? 0}, then send document ready.`;
  }
  return `Read the ${facts.document}. Then wait: the messages of User come as the next turns.`;
}

function headSectionOf(facts: DocumentAgentFacts): string {
  if (facts.head === null) return 'There is no version yet.';
  return `Version ${facts.head.versionNumber}, with line numbers:\n\n${DocumentAgentWording.numberedTextOf(facts.head.text)}`;
}

/** A plan is written for the approved spec, which the plan agent reads and never changes. */
function specSectionOf(facts: DocumentAgentFacts): string {
  if (facts.document !== 'plan' || facts.approvedSpec === null) return '';
  return `## The approved spec, version ${facts.approvedSpec.versionNumber}\n\n${DocumentAgentWording.numberedTextOf(facts.approvedSpec.text)}\n\n`;
}

function documentAgentTextOf(job: Readonly<Job>, facts: DocumentAgentFacts, instructions: string, confinement: JobLaunchFacts['confinement']): JobLaunchText {
  const fills = { jobId: job.id, ticketId: facts.ticket.id, program: PRODUCT_NAMES.PROGRAM };
  const firstMessage = filledTemplateOf(promptOf('DocumentAgentPrompt.md'), {
    ...fills,
    document:            facts.document,
    documentAgentLimits: DOCUMENT_AGENT_LIMITS[confinement],
    ticketTitle:         facts.ticket.title,
    ticketBody:          facts.ticket.body.trim(),
    specSection:         specSectionOf(facts),
    headSection:         headSectionOf(facts),
    requestText:         requestTextOf(facts),
  });
  return { firstMessage, roleBrief: filledTemplateOf(instructions, fills) };
}

function effectReaderTextOf(job: Readonly<Job>, facts: EffectReadingFacts): JobLaunchText {
  const firstMessage = filledTemplateOf(promptOf('EffectReadingPrompt.md'), {
    jobId:         job.id,
    ticketId:      facts.ticketId,
    document:      facts.document,
    versionNumber: String(facts.versionNumber),
    versionText:   DocumentAgentWording.numberedTextOf(facts.versionText),
    pathsNote:     facts.pathsCut ? `The list holds the first ${facts.paths.length} paths of the tree.` : `The list holds all ${facts.paths.length} paths of the tree.`,
    paths:         facts.paths.join('\n'),
  });
  return { firstMessage, roleBrief: `You are the effect reader of job ${job.id}.` };
}

/** `null` for a job that is neither, which the other launch texts word. */
export function documentLaunchTextOf(job: Readonly<Job>, facts: JobLaunchFacts): JobLaunchText | null {
  if (facts.documentAgent !== undefined && facts.documentAgent !== null) return documentAgentTextOf(job, facts.documentAgent, facts.instructions, facts.confinement);
  if (facts.effectReading !== undefined && facts.effectReading !== null) return effectReaderTextOf(job, facts.effectReading);
  return null;
}
