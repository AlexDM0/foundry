/**
 * An entity's cap in the Playbook (strategy 5.8, E72; owner's answer A3): the most jobs of one entity that hold a slot at once, under the
 * board's limit, which keeps its default. What matters: the cap counts every running build or review job whose `entity` is that entity,
 * whatever ticket it serves, a package stage's job of another entity's ticket included, and the launches this pass keeps; a candidate past
 * its cap gives its place to the next candidate of another entity, so the cap never wastes a board slot; the board's limit still bounds the
 * launches the caps let through; a job that holds no slot does not count; an entity without a cap has the board's limit alone; and a forge
 * without entities launches exactly as before, whatever cap a fact names.
 */
import { describe, expect, test } from 'bun:test';

import { ENTITY_FORGE_ENTITIES } from '../../testing/EntityForgeFixture.ts';
import type { PlaybookStep }     from './@types/PlaybookStep.ts';
import type { TicketStage }      from './@types/Task.ts';
import { Playbook }              from './Playbook.ts';
import {
  FIXTURE_LIMITS,
  LIVE_ASSISTANT,
  factsWith,
  jobFixture,
  ticketOf
}                                from './testing/LifecycleFixtures.ts';

const { SHOP, ADMIN, UI_KIT } = ENTITY_FORGE_ENTITIES;

const PACKAGE_BUILD: TicketStage = { name: 'package-build', entity: UI_KIT.key };

function launchesOf(facts: Parameters<typeof Playbook.nextStepsOf>[0]): PlaybookStep[] {
  return Playbook.nextStepsOf(facts, FIXTURE_LIMITS).filter((step) => step.kind === 'launch-build' || step.kind === 'launch-review');
}

function launchedTicketIdsOf(facts: Parameters<typeof Playbook.nextStepsOf>[0]): string[] {
  return launchesOf(facts).flatMap((step) => ('ticketId' in step ? [step.ticketId] : []));
}

function buildOf(ticketId: string, entity: string, stage: number): PlaybookStep {
  return {
    kind: 'launch-build', ticketId, attempt: 1, base: 'main', entity, stage
  };
}

/** A forge with entities whose board's limit is 3, the default of the fixture. */
function entityFacts(overrides: Parameters<typeof factsWith>[0] = {}): ReturnType<typeof factsWith> {
  return factsWith({ pipelineHasEntities: true, ...overrides });
}

const SHOP_BUILD_RUNNING = jobFixture({
  id: 'J1', kind: 'build', ticketIds: ['009'], entity: SHOP.key, stage: 1
});

describe('Playbook: an entity\'s cap', () => {
  test('a ticket of an entity at its cap launches nothing, and a ticket of another entity takes the slot', () => {
    expect(launchesOf(entityFacts({
      concurrencyByEntity:         { [SHOP.key]: 1 },
      jobs:                        [LIVE_ASSISTANT, SHOP_BUILD_RUNNING],
      tickets:                     [ticketOf('001', 'pending', { entity: SHOP.key }), ticketOf('002', 'pending', { entity: ADMIN.key })],
      readinessPositionByTicketId: new Map([['001', 1], ['002', 2]]),
    }))).toEqual([buildOf('002', ADMIN.key, 1)]);
  });

  test('the launches of one pass count against the cap: two ready tickets of an entity capped at one launch one', () => {
    expect(launchedTicketIdsOf(entityFacts({
      concurrencyByEntity:         { [SHOP.key]: 1 },
      tickets:                     [ticketOf('001', 'pending', { entity: SHOP.key }), ticketOf('002', 'pending', { entity: SHOP.key })],
      readinessPositionByTicketId: new Map([['001', 1], ['002', 2]]),
    }))).toEqual(['001']);
  });

  test('the cap counts a job of the entity whatever ticket it serves: a package build of a shop ticket holds the package\'s cap', () => {
    expect(launchedTicketIdsOf(entityFacts({
      concurrencyByEntity: { [UI_KIT.key]: 1 },
      jobs:                [LIVE_ASSISTANT, jobFixture({
        id: 'J5', kind: 'build', ticketIds: ['003'], entity: UI_KIT.key, stage: 2
      })],
      tickets: [
        ticketOf('003', 'in-progress', { entity: SHOP.key, stage: PACKAGE_BUILD }),
        ticketOf('004', 'pending', { entity: UI_KIT.key }),
        ticketOf('005', 'in-progress', { entity: SHOP.key, stage: PACKAGE_BUILD }),
      ],
    }))).toEqual([]);
  });

  test('a cap above the board\'s limit leaves the board\'s limit to bound the launches', () => {
    expect(launchedTicketIdsOf(entityFacts({
      concurrencyLimit:            1,
      concurrencyByEntity:         { [SHOP.key]: 5 },
      tickets:                     [ticketOf('001', 'pending', { entity: SHOP.key }), ticketOf('002', 'pending', { entity: SHOP.key })],
      readinessPositionByTicketId: new Map([['001', 1], ['002', 2]]),
    }))).toEqual(['001']);
  });

  test('a job that holds no slot does not count against its entity\'s cap', () => {
    expect(launchedTicketIdsOf(entityFacts({
      concurrencyByEntity: { [SHOP.key]: 1 },
      jobs:                [LIVE_ASSISTANT, jobFixture({
        id: 'J7', kind: 'merge', role: null, ticketIds: ['009'], entity: SHOP.key
      })],
      tickets: [ticketOf('001', 'pending', { entity: SHOP.key })],
    }))).toEqual(['001']);
  });

  test('an entity without a cap has the board\'s limit alone', () => {
    expect(launchedTicketIdsOf(entityFacts({
      concurrencyByEntity:         { [ADMIN.key]: 1 },
      jobs:                        [LIVE_ASSISTANT, SHOP_BUILD_RUNNING],
      tickets:                     [ticketOf('001', 'pending', { entity: SHOP.key }), ticketOf('002', 'pending', { entity: SHOP.key })],
      readinessPositionByTicketId: new Map([['001', 1], ['002', 2]]),
    }))).toEqual(['001', '002']);
  });

  test('a forge without entities launches as before, whatever cap a fact names', () => {
    const tickets = [ticketOf('001', 'pending'), ticketOf('002', 'pending')];
    const withoutCaps = factsWith({ tickets });
    expect(launchesOf(factsWith({ tickets, concurrencyByEntity: { [SHOP.key]: 1 } }))).toEqual(launchesOf(withoutCaps));
    expect(launchesOf(withoutCaps)).toHaveLength(2);
  });
});
