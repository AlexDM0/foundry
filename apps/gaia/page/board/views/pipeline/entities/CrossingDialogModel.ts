/**
 * How a ticket of an app that crosses into a whitelisted package runs, pure and read-only: the six stages in their order, each naming
 * the entity whose agent, constitution and gates apply, taken from the two entities' own settings and the entities that depend on the
 * package. Nothing here edits: the stages follow from the entities, so User sees the cost and the order before taking a whitelist entry.
 */
import type { BoardDraftEntityFactsDocument, BoardPipelineEntityDocument } from '../../../../@types/board/BoardPipelineDocuments.ts';
import { CountTextUtil }                                                   from '../../../../shared/utils/CountTextUtil.ts';

/** `home`: the app, the ticket's home; `package`: the whitelisted package, whose stages a dashed edge and a neutral tint set apart. */
export type CrossingStageOwner = 'home' | 'package' | 'both';

export interface CrossingStageView {
  readonly number:       number;
  readonly name:         string;
  readonly entityText:   string;
  readonly owner:        CrossingStageOwner;
  readonly what:         string;
  readonly agent:        string;
  readonly constitution: string;
  readonly gates:        string;
  /** Adapt is skipped when what the package exposes did not change. */
  readonly skippable:    boolean;
}

export interface CrossingView {
  readonly title:      string;
  readonly lead:       string;
  readonly stages:     readonly CrossingStageView[];
  readonly costTitle:  string;
  readonly costText:   string;
  /** Whether the package may be whitelisted: a package with a review step. */
  readonly reviewNote: string;
}

function entityOf(entities: Readonly<Record<string, BoardPipelineEntityDocument>>, key: string): Readonly<BoardPipelineEntityDocument> | undefined {
  return Object.hasOwn(entities, key) ? entities[key] : undefined;
}

function homesTextOf(entity: Readonly<BoardPipelineEntityDocument> | undefined, key: string): string {
  const homes = (entity?.home ?? []).map((folder) => folder.replace(/^\/+/u, ''));
  return homes.length === 0 ? `${key}'s folders` : homes.join(', ');
}

function gatesTextOf(entity: Readonly<BoardPipelineEntityDocument> | undefined, key: string): string {
  const names = entity?.phases.build ?? [];
  return names.length === 0 ? `${key} has no build gate yet` : `${key}'s gates: ${names.join(', ')}`;
}

/** The entities whose gates a change of the package also runs: those the forge serves as depending on it, the app aside. */
function dependentsOf(draftEntities: Readonly<Record<string, BoardDraftEntityFactsDocument>>, appKey: string, packageKey: string): string[] {
  const dependentEntityKeys = Object.hasOwn(draftEntities, packageKey) ? draftEntities[packageKey]?.dependentEntityKeys ?? [] : [];
  return dependentEntityKeys.filter((key) => key !== appKey);
}

function possessiveListOf(keys: readonly string[]): string {
  const possessives = keys.map((key) => `${key}'s`);
  if (possessives.length <= 1) return possessives.join('');
  return `${possessives.slice(0, -1).join(', ')} and ${possessives.at(-1) ?? ''}`;
}

function packageBuildGatesOf(entities: Readonly<Record<string, BoardPipelineEntityDocument>>, dependents: readonly string[], packageKey: string): string {
  const own = gatesTextOf(entityOf(entities, packageKey), packageKey);
  if (dependents.length === 0) return own;
  return `${own}; then ${possessiveListOf(dependents)}, which ${CountTextUtil.agreeingPhrase(dependents.length, 'depends', 'depend')} on ${packageKey}`;
}

function landingGatesOf(dependents: readonly string[], appKey: string, packageKey: string): string {
  const keys = [appKey, packageKey, ...dependents];
  const listed = keys.length <= 2 ? keys.join(' and ') : `${keys.slice(0, -1).join(', ')} and ${keys.at(-1) ?? ''}`;
  return `Gates of ${listed} on the merged tree`;
}

/** A stage before it is numbered: its number is its place in the list. */
type UnnumberedStage = Omit<CrossingStageView, 'number' | 'entityText'>;

function stagesOf(entities: Readonly<Record<string, BoardPipelineEntityDocument>>, dependents: readonly string[], appKey: string, packageKey: string): CrossingStageView[] {
  const app = entityOf(entities, appKey);
  const appHomes = homesTextOf(app, appKey);
  const packageHomes = homesTextOf(entityOf(entities, packageKey), packageKey);
  const appGates = gatesTextOf(app, appKey);
  const entityTextOf = (owner: CrossingStageOwner): string => {
    if (owner === 'home') return appKey;
    return owner === 'package' ? packageKey : `${appKey} + ${packageKey}`;
  };
  const stages: UnnumberedStage[] = [
    {
      name:         'Build',
      owner:        'home',
      what:         `Changes ${appHomes} and proposes the change it needs in ${packageHomes}.`,
      agent:        `${appKey}'s builder`,
      constitution: `${appKey}'s`,
      gates:        appGates,
      skippable:    false,
    },
    {
      name:         'Package build',
      owner:        'package',
      what:         `Makes the ${packageKey} change final, in ${packageHomes} only.`,
      agent:        `${packageKey}'s builder`,
      constitution: `${packageKey}'s`,
      gates:        packageBuildGatesOf(entities, dependents, packageKey),
      skippable:    false,
    },
    {
      name:         'Package review',
      owner:        'package',
      what:         `Reviews the ${packageKey} change and seals it.`,
      agent:        `${packageKey}'s reviewer`,
      constitution: `${packageKey}'s`,
      gates:        `The seal: later stages cannot change ${packageKey}`,
      skippable:    false,
    },
    {
      name:         'Adapt',
      owner:        'home',
      what:         `Fits ${appHomes} to the sealed ${packageKey} change.`,
      agent:        `${appKey}'s builder`,
      constitution: `${appKey}'s`,
      gates:        appGates,
      skippable:    true,
    },
    {
      name:         'Review',
      owner:        'home',
      what:         app?.review === undefined ? `${appKey} has no review step, so no agent reviews the ticket.` : 'Reviews the whole ticket, last.',
      agent:        `${appKey}'s reviewer`,
      constitution: `${appKey}'s`,
      gates:        'Marks the ticket reviewed',
      skippable:    false,
    },
    {
      name:         'Landing',
      owner:        'both',
      what:         'One landing for both entities, through the Airlock.',
      agent:        'the Airlock',
      constitution: 'none',
      gates:        landingGatesOf(dependents, appKey, packageKey),
      skippable:    false,
    },
  ];
  return stages.map((stage, i) => ({ ...stage, number: i + 1, entityText: entityTextOf(stage.owner) }));
}

function crossingOf(
  entities: Readonly<Record<string, BoardPipelineEntityDocument>>,
  draftEntities: Readonly<Record<string, BoardDraftEntityFactsDocument>>,
  appKey: string,
  packageKey: string,
): CrossingView {
  const app = entityOf(entities, appKey);
  const packageEntity = entityOf(entities, packageKey);
  return {
    title:     `How a ${appKey} ticket that crosses into ${packageKey} runs`,
    lead:      `On one branch, one job at a time. It follows from ${appKey}'s and ${packageKey}'s own settings, so there is nothing to edit here.`,
    stages:    stagesOf(entities, dependentsOf(draftEntities, appKey, packageKey), appKey, packageKey),
    costTitle: 'Adds 3 stages and one package review to each crossing ticket',
    costText:  `A ${appKey} ticket that stays in ${homesTextOf(app, appKey)} runs Build, Review and Landing only. A need in ${packageKey} outside a `
      + `crossing becomes a ticket of ${packageKey}, and the ${appKey} ticket waits on it.`,
    reviewNote: (packageEntity?.review ?? null) === null
      ? `${packageKey} has no review step yet. It needs one before it may be whitelisted.`
      : `${packageKey} has a review step, so it may be whitelisted.`,
  };
}

/** The packages of the app's whitelist that a crossing can go into: those the draft holds as packages. */
function crossablePackagesOf(entities: Readonly<Record<string, BoardPipelineEntityDocument>>, appKey: string): string[] {
  return (entityOf(entities, appKey)?.whitelist ?? []).filter((key) => entityOf(entities, key)?.kind === 'package');
}

export const CrossingDialogModel = Object.freeze({
  crossingOf,
  crossablePackagesOf,
});
