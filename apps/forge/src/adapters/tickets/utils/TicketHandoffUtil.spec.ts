/**
 * A crossing ticket's `## Handoff` in parts, one per stage that built (strategy 4.2). What matters: the first part replaces whatever the
 * section held, the filing template's guidance or a handoff from before the crossing; a stage replaces only its own part and leaves every
 * other part and the text after the section as it was; the parts stay in stage order, two packages' builds each keeping their own; the
 * Acceptance evidence belongs to the last home build stage, so a package build keeps it and `adapt` replaces stage 1's; and a `###` heading
 * inside a stage's own text stays in that text.
 */
import { describe, expect, test } from 'bun:test';

import { TicketHandoffUtil }     from './TicketHandoffUtil.ts';
import type { HandoffStagePart } from './TicketHandoffUtil.ts';

const SHOP_BUILD   = { name: 'build', entity: 'shop' } as const;
const UI_KIT_BUILD = { name: 'package-build', entity: 'ui-kit' } as const;
const ICONS_BUILD  = { name: 'package-build', entity: 'icons' } as const;
const SHOP_ADAPT   = { name: 'adapt', entity: 'shop' } as const;
const FILED_BODY   = '## Report\n\nExample basket badge.\n\n## Handoff\n\n_Written by Hephaestus._\n\n## Review\n\nExample review.\n';

const STAGE_ONE_PART: HandoffStagePart = { stage: SHOP_BUILD, text: 'Example shop handoff.', acceptanceEvidence: ['- A1 — BasketBadge.spec.ts'] };
const STAGE_ONE_TEXT = '### Stage 1, build of shop\n\nExample shop handoff.\n\n';

/** A part that writes no Acceptance evidence, as a package build's. */
function packagePartOf(stage: HandoffStagePart['stage'], text: string): HandoffStagePart {
  return { stage, text, acceptanceEvidence: null };
}

/** `body` with its `## Handoff` section replaced by `part`'s, as Hephaestus writes it back. */
function bodyWithPartOf(body: string, part: HandoffStagePart): string {
  const section = TicketHandoffUtil.handoffSectionWithStagePartOf(body, part);
  const [before = '', rest = ''] = body.split('## Handoff\n');
  const after = rest.includes('\n## ') ? rest.slice(rest.indexOf('\n## ') + 1) : '';
  return `${before}${section}${after === '' ? '' : `\n${after}`}`;
}

describe('the Handoff of a crossing ticket', () => {
  test('stage 1 replaces the filing template\'s guidance with its part and its Acceptance evidence', () => {
    expect(TicketHandoffUtil.handoffSectionWithStagePartOf(FILED_BODY, STAGE_ONE_PART))
      .toBe(`## Handoff\n\n${STAGE_ONE_TEXT}### Acceptance evidence\n\n- A1 — BasketBadge.spec.ts\n`);
  });

  test('a package build adds its part after stage 1\'s and keeps the evidence stage 1 wrote', () => {
    const section = TicketHandoffUtil.handoffSectionWithStagePartOf(bodyWithPartOf(FILED_BODY, STAGE_ONE_PART), packagePartOf(UI_KIT_BUILD, 'Example package handoff.'));

    expect(section).toBe(`## Handoff\n\n${STAGE_ONE_TEXT}### Stage 2, package build of ui-kit\n\nExample package handoff.\n\n`
      + '### Acceptance evidence\n\n- A1 — BasketBadge.spec.ts\n');
  });

  test('adapt adds its part last and owns the Acceptance evidence, replacing stage 1\'s', () => {
    const adapt: HandoffStagePart = { stage: SHOP_ADAPT, text: 'Example adapt handoff.', acceptanceEvidence: ['- A1 — BasketBadge.adapted.spec.ts'] };
    const section = TicketHandoffUtil.handoffSectionWithStagePartOf(bodyWithPartOf(FILED_BODY, STAGE_ONE_PART), adapt);

    expect(section).toBe(`## Handoff\n\n${STAGE_ONE_TEXT}### Stage 4, adapt of shop\n\nExample adapt handoff.\n\n`
      + '### Acceptance evidence\n\n- A1 — BasketBadge.adapted.spec.ts\n');
  });

  test('a stage that runs again replaces only its own part, and two packages\' builds keep their own parts in stage order', () => {
    const withAdapt = bodyWithPartOf(bodyWithPartOf(FILED_BODY, STAGE_ONE_PART), { stage: SHOP_ADAPT, text: 'Example adapt handoff.', acceptanceEvidence: [] });
    const withUiKit = bodyWithPartOf(withAdapt, packagePartOf(UI_KIT_BUILD, 'First package handoff.'));
    const withIcons = bodyWithPartOf(withUiKit, packagePartOf(ICONS_BUILD, 'Icons handoff.'));
    const section = TicketHandoffUtil.handoffSectionWithStagePartOf(withIcons, packagePartOf(UI_KIT_BUILD, 'Second package handoff.'));

    expect(section).toBe(`## Handoff\n\n${STAGE_ONE_TEXT}`
      + '### Stage 2, package build of icons\n\nIcons handoff.\n\n### Stage 2, package build of ui-kit\n\nSecond package handoff.\n\n'
      + '### Stage 4, adapt of shop\n\nExample adapt handoff.\n');
  });

  test('keeps a third-level heading in a stage\'s own text, and reads a body with Windows line endings', () => {
    const body = bodyWithPartOf(FILED_BODY, { ...STAGE_ONE_PART, text: 'Example shop handoff.\n\n### Open points\n\nNone.' }).replace(/\n/g, '\r\n');
    const section = TicketHandoffUtil.handoffSectionWithStagePartOf(body, packagePartOf(UI_KIT_BUILD, 'Example package handoff.'));

    expect(section).toContain('### Stage 1, build of shop\n\nExample shop handoff.\n\n### Open points\n\nNone.\n\n### Stage 2, package build of ui-kit');
  });

  test('names a stage\'s part by its number, its words and its entity', () => {
    expect(TicketHandoffUtil.stagePartHeadingOf(UI_KIT_BUILD)).toBe('### Stage 2, package build of ui-kit');
  });
});
