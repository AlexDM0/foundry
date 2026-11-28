/**
 * A session's closing report: its fields read without trusting its shape, and the Handoff code writes from a verified build into the
 * ticket body.
 */
import { TicketHandoffUtil } from '../../adapters/tickets/utils/TicketHandoffUtil.ts';
import type { Job }          from '../../domain/tracker-model/@types/Job.ts';
import { TicketStageUtil }   from '../../domain/tracker-model/utils/TicketStageUtil.ts';

const HANDOFF_HEADING = /^## Handoff[ \t]*\r?$/;
const SECTION_HEADING = /^## /;

function reportFieldOf(report: unknown, field: string): unknown {
  return typeof report === 'object' && report !== null && Object.hasOwn(report, field) ? (report as Record<string, unknown>)[field] : undefined;
}

function acceptanceEvidenceLinesOf(report: unknown): string[] {
  const acceptance = reportFieldOf(report, 'acceptance');
  return (Array.isArray(acceptance) ? acceptance : []).map((entry) => {
    const state = reportFieldOf(entry, 'state') === 'waiver-proposed' ? ' waiver proposed' : '';
    return `- ${String(reportFieldOf(entry, 'item'))}${state} — ${String(reportFieldOf(entry, 'evidence'))}`;
  });
}

/** The Handoff code writes from a verified report: the builder's own handoff, then each Acceptance item's evidence. */
function handoffSectionOf(report: unknown): string {
  const evidenceLines = acceptanceEvidenceLinesOf(report);
  return `## Handoff\n\n${String(reportFieldOf(report, 'handoff') ?? '').trim()}\n${evidenceLines.length === 0 ? '' : `\n${evidenceLines.join('\n')}\n`}`;
}

/**
 * The ticket body with the Handoff of a verified build. A build of a crossing ticket replaces only its own stage's part, and only a home
 * build stage writes the Acceptance evidence, so the last one owns it; a ticket that stays in one entity gets the whole section, as always.
 */
function bodyWithBuildHandoffOf(ticketBody: string, job: Readonly<Job>, report: unknown, ticketCrosses: boolean): string {
  const jobStage = TicketStageUtil.stageOfJob(job);
  if (!ticketCrosses || jobStage === null) return bodyWithHandoffOf(ticketBody, handoffSectionOf(report));
  return bodyWithHandoffOf(ticketBody, TicketHandoffUtil.handoffSectionWithStagePartOf(ticketBody, {
    stage:              jobStage,
    text:               String(reportFieldOf(report, 'handoff') ?? ''),
    acceptanceEvidence: jobStage.name === 'package-build' ? null : acceptanceEvidenceLinesOf(report),
  }));
}

/** The body with its `## Handoff` section, the filing template's guidance included, replaced by code's; appended when it has none. */
function bodyWithHandoffOf(body: string, handoffSection: string): string {
  const lineEnding = body.includes('\r\n') ? '\r\n' : '\n';
  const handoffInBodyLineEnding = handoffSection.replace(/\r?\n/g, lineEnding);
  const lines = body.split(lineEnding);
  const headingIndex = lines.findIndex((line) => HANDOFF_HEADING.test(line));
  if (headingIndex < 0) return `${body.replace(/(?:\r?\n)*$/, '')}${lineEnding}${lineEnding}${handoffInBodyLineEnding}`;
  const nextHeadingOffset = lines.slice(headingIndex + 1).findIndex((line) => SECTION_HEADING.test(line));
  const following = nextHeadingOffset < 0 ? [] : lines.slice(headingIndex + 1 + nextHeadingOffset);
  return [...lines.slice(0, headingIndex), ...handoffInBodyLineEnding.split(lineEnding), ...following].join(lineEnding);
}

export const BuildReport = Object.freeze({
  reportFieldOf,
  bodyWithBuildHandoffOf,
  bodyWithHandoffOf,
});
