/**
 * A crossing ticket's `## Handoff` in parts (strategy 4.2): one part per stage that built, each under its own `###` heading, and the
 * Acceptance evidence under its own, owned by the last home build stage. A stage replaces only its own part; any other text the section held,
 * such as the filing template's guidance or a handoff written before the ticket crossed, is code's to replace.
 */
import type { TicketStage, TicketStageName } from '../../../domain/tracker-model/@types/Task.ts';
import { TicketStageUtil }                   from '../../../domain/tracker-model/utils/TicketStageUtil.ts';

export interface HandoffStagePart {
  stage:              TicketStage;
  text:               string;
  /** `null` for a stage that does not own the evidence, a package build, which keeps the evidence the section holds. */
  acceptanceEvidence: readonly string[] | null;
}

interface StoredPart {
  heading:     string;
  stageNumber: number;
  lines:       string[];
}

const HANDOFF_HEADING             = /^## Handoff[ \t]*$/;
const SECTION_HEADING             = /^## /;
const STAGE_PART_HEADING          = /^### Stage (\d+), .+ of .+$/;
const ACCEPTANCE_EVIDENCE_HEADING = '### Acceptance evidence';

const STAGE_WORDS: Readonly<Record<TicketStageName, string>> = {
  'build':          'build',
  'package-build':  'package build',
  'package-review': 'package review',
  'adapt':          'adapt',
  'review':         'review',
};

function stagePartHeadingOf(stage: TicketStage): string {
  return `### Stage ${TicketStageUtil.stageNumberOf(stage.name)}, ${STAGE_WORDS[stage.name]} of ${stage.entity}`;
}

/** The lines under `## Handoff` up to the next `##` heading; none when the body has no such section. */
function handoffLinesOf(body: string): string[] {
  const lines = body.split(/\r?\n/);
  const headingIndex = lines.findIndex((line) => HANDOFF_HEADING.test(line));
  if (headingIndex < 0) return [];
  const following = lines.slice(headingIndex + 1);
  const nextSectionOffset = following.findIndex((line) => SECTION_HEADING.test(line));
  return nextSectionOffset < 0 ? following : following.slice(0, nextSectionOffset);
}

/**
 * The parts of the section, each with its heading line. Only a stage's or the evidence's heading starts a part, so a `###` heading in a
 * stage's own text stays in that text; lines before the first part are no part.
 */
function blocksOf(handoffLines: readonly string[]): { heading: string; lines: string[] }[] {
  const blocks: { heading: string; lines: string[] }[] = [];
  for (const line of handoffLines) {
    if (STAGE_PART_HEADING.test(line) || line === ACCEPTANCE_EVIDENCE_HEADING) blocks.push({ heading: line, lines: [] });
    else blocks.at(-1)?.lines.push(line);
  }
  return blocks;
}

function trimmedTextOf(lines: readonly string[]): string {
  return lines.join('\n').trim();
}

/** The whole new `## Handoff` section, LF-ended, with `part` in place of the part its stage held, the parts in stage order. */
function handoffSectionWithStagePartOf(body: string, part: HandoffStagePart): string {
  const blocks = blocksOf(handoffLinesOf(body));
  const heading = stagePartHeadingOf(part.stage);
  const storedParts: StoredPart[] = blocks.flatMap((block) => {
    const stageNumber = STAGE_PART_HEADING.exec(block.heading)?.[1];
    return stageNumber === undefined || block.heading === heading ? [] : [{ heading: block.heading, stageNumber: Number(stageNumber), lines: block.lines }];
  });
  const parts = [...storedParts, { heading, stageNumber: TicketStageUtil.stageNumberOf(part.stage.name), lines: [part.text] }]
    .sort((a, b) => a.stageNumber - b.stageNumber);
  const storedEvidence = blocks.find((block) => block.heading === ACCEPTANCE_EVIDENCE_HEADING)?.lines ?? [];
  const evidence = part.acceptanceEvidence === null ? trimmedTextOf(storedEvidence) : part.acceptanceEvidence.join('\n');
  const partTexts = parts.map((stored) => `${stored.heading}\n\n${trimmedTextOf(stored.lines)}\n`);
  const evidenceText = evidence === '' ? [] : [`${ACCEPTANCE_EVIDENCE_HEADING}\n\n${evidence}\n`];
  return `## Handoff\n\n${[...partTexts, ...evidenceText].join('\n')}`;
}

export const TicketHandoffUtil = { stagePartHeadingOf, handoffSectionWithStagePartOf } as const;
