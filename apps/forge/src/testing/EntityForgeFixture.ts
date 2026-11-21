/**
 * The fixture repository of a top-level forge with entities: one tracker at the repository's root over two apps, `apps/shop` and
 * `apps/admin`, a shared package `packages/ui-kit` that both consume, and the root entity, which owns every other path. It names the
 * entities, their pipeline and each place a tracker asks git from, and writes the tracked files; `src/lib/git/EntityForgeFixture.integration.spec.ts`
 * builds its git states.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join }            from 'node:path';

import { PipelineFile }                                      from '../adapters/pipeline/PipelineFile.ts';
import type { Pipeline, PipelineEntity, PipelineEntityKind } from '../lib/tracker-model/@types/Pipeline.ts';
import { PIPELINE_FORMAT_VERSION }                           from '../lib/tracker-model/@types/Pipeline.ts';
import { branchNamesOf }                                     from '../shared/BranchNames.ts';
import { WorktreesFolder }                                   from '../shared/WorktreesFolder.ts';
import { PRODUCT_NAMES }                                     from '../shared/constants/ProductNames.ts';

export const ENTITY_FORGE_MAIN_LINE = 'main';
export const ENTITY_FORGE_HOOKS_FOLDER = '.githooks';

/** Each entity: its key, its kind and its one home folder below the repository; the root entity's home is the repository itself. */
export const ENTITY_FORGE_ENTITIES = {
  SHOP:   { key: 'shop', kind: 'app', homeFolder: 'apps/shop' },
  ADMIN:  { key: 'admin', kind: 'app', homeFolder: 'apps/admin' },
  UI_KIT: { key: 'ui-kit', kind: 'package', homeFolder: 'packages/ui-kit' },
  ROOT:   { key: 'root', kind: 'root', homeFolder: '' },
} as const satisfies Record<string, { key: string; kind: PipelineEntityKind; homeFolder: string }>;

export type EntityForgeEntity = typeof ENTITY_FORGE_ENTITIES[keyof typeof ENTITY_FORGE_ENTITIES];

/** The file each ticket of the fixture changes in an entity's home, and the root file a ticket's `reach` lets it change. */
export const ENTITY_FORGE_SOURCE_FILE = 'src/Example.ts';
export const ENTITY_FORGE_LOCK_FILE = 'bun.lock';

export function sourceFileOf(entity: EntityForgeEntity): string {
  return `${entity.homeFolder}/${ENTITY_FORGE_SOURCE_FILE}`;
}

/** The constitution each entity with a home folder keeps there, which its pipeline names. */
export function constitutionFileOf(entity: EntityForgeEntity): string {
  return `${entity.homeFolder}/CONSTITUTION.md`;
}

/** A repository path as entities name one: leading with `/`. */
export function entityPathOf(pathBelowTheRepository: string): string {
  return `/${pathBelowTheRepository}`;
}

/**
 * The tickets of the fixture: one of the shop that may need a change of the admin app or cross into the package, and the ticket
 * Hephaestus files for the admin app when the shop's ticket declares that need.
 */
export const ENTITY_FORGE_TICKETS = {
  SHOP_TICKET: { id: '001', entity: ENTITY_FORGE_ENTITIES.SHOP },
  NEED_TICKET: { id: '002', entity: ENTITY_FORGE_ENTITIES.ADMIN },
} as const;

export type EntityForgeTicket = typeof ENTITY_FORGE_TICKETS[keyof typeof ENTITY_FORGE_TICKETS];

export function ticketBranchOf(ticket: EntityForgeTicket): string {
  return branchNamesOf(null).ticketBranchOf(ticket.id);
}

/** The ticket's worktree, a checkout of the whole repository in the root tracker's worktrees folder. */
export function ticketWorktreeFolderOf(ticket: EntityForgeTicket): string {
  return WorktreesFolder.ticketWorktreeOf('', ticket.id);
}

/**
 * Whether the shop may cross into the package: `strict-isolation` is step 3's pipeline, with no whitelist; `shop-crosses-into-ui-kit` is
 * step 4's, where the shop whitelists the package.
 */
export type EntityForgeWhitelists = 'strict-isolation' | 'shop-crosses-into-ui-kit';

function noStepsOf(): Pick<PipelineEntity, 'prepare' | 'gates' | 'phases'> {
  return { prepare: [], gates: [], phases: { build: [], review: [], merge: [] } };
}

function appEntityOf(entity: EntityForgeEntity, summary: string): PipelineEntity {
  return {
    kind:         entity.kind,
    home:         [entityPathOf(entity.homeFolder)],
    summary,
    constitution: { path: constitutionFileOf(entity) },
    prepare:      [],
    gates:        [{ name: 'verify', run: `bun run gate:${entity.key}`, in: '/' }],
    phases:       { build: ['verify'], review: [], merge: ['verify'] },
    review:       { name: 'review' },
    reach:        [entityPathOf(ENTITY_FORGE_LOCK_FILE)],
    dependsOn:    [ENTITY_FORGE_ENTITIES.UI_KIT.key],
  };
}

/** The forge's pipeline: the forge's own steps empty, each entity with its own; the root entity has no gates, so it is a person's. */
export function entityForgePipelineOf(whitelists: EntityForgeWhitelists): Pipeline {
  const {
    SHOP, ADMIN, UI_KIT, ROOT
  } = ENTITY_FORGE_ENTITIES;
  const shop = appEntityOf(SHOP, 'The example storefront.\nCustomers browse and buy here.');
  return {
    version:  PIPELINE_FORMAT_VERSION,
    ...noStepsOf(),
    review:   { name: 'review' },
    agents:   { productOwner: { model: 'opus', effort: 'high' } },
    entities: {
      [SHOP.key]:   whitelists === 'shop-crosses-into-ui-kit' ? { ...shop, whitelist: [UI_KIT.key] } : shop,
      [ADMIN.key]:  appEntityOf(ADMIN, 'The example back office.\nStaff manage the catalogue here.'),
      [UI_KIT.key]: {
        kind:         UI_KIT.kind,
        home:         [entityPathOf(UI_KIT.homeFolder)],
        summary:      'The example shared parts.\nBoth apps import them.',
        constitution: { path: constitutionFileOf(UI_KIT) },
        prepare:      [],
        gates:        [{ name: 'verify', run: 'bun run check' }],
        phases:       { build: ['verify'], review: [], merge: ['verify'] },
        review:       { name: 'review' },
      },
      [ROOT.key]: { kind: ROOT.kind, home: [entityPathOf(ROOT.homeFolder)], ...noStepsOf() },
    },
  };
}

/** The pipeline as `pipeline.json` stores it, which a spec writes in the data folder once the reader accepts entities. */
export function entityForgePipelineTextOf(whitelists: EntityForgeWhitelists): string {
  return PipelineFile.contentsOf(entityForgePipelineOf(whitelists));
}

/** What a place is: a toplevel (the main checkout, a ticket worktree), or an entity's home folder below one. */
export type EntityForgePlaceKind = 'main checkout' | 'ticket worktree' | 'entity home';

/** Each folder below the repository git is asked from, and the ticket whose worktree holds it, if any. */
export interface EntityForgePlace {
  readonly folder: string;
  readonly kind:   EntityForgePlaceKind;
  readonly ticket: EntityForgeTicket | null;
}

const HOME_ENTITIES: readonly EntityForgeEntity[] = [ENTITY_FORGE_ENTITIES.SHOP, ENTITY_FORGE_ENTITIES.ADMIN, ENTITY_FORGE_ENTITIES.UI_KIT];

export function placeIsAToplevel(place: EntityForgePlace): boolean {
  return place.kind !== 'entity home';
}

/** Every place of the fixture: the main checkout and each ticket's worktree, each with the home folders of the entities below it. */
export function entityForgePlaces(): readonly EntityForgePlace[] {
  const placesBelow = (toplevelFolder: string, kind: EntityForgePlaceKind, ticket: EntityForgeTicket | null): EntityForgePlace[] => [
    { folder: toplevelFolder, kind, ticket },
    ...HOME_ENTITIES.map((entity): EntityForgePlace => ({ folder: join(toplevelFolder, entity.homeFolder), kind: 'entity home', ticket })),
  ];
  return [
    ...placesBelow('', 'main checkout', null),
    ...Object.values(ENTITY_FORGE_TICKETS).flatMap((ticket) => placesBelow(ticketWorktreeFolderOf(ticket), 'ticket worktree', ticket)),
  ];
}

const IGNORED_BY_THE_TRACKER = `${PRODUCT_NAMES.DATA_FOLDER}/\n${PRODUCT_NAMES.WORKTREES_FOLDER}/\nnode_modules/\n.turbo/\n`;
const PASSING_HOOK = '#!/bin/sh\nexit 0\n';
const EXECUTABLE_FILE_MODE = 0o755;

function homeFilesOf(entity: EntityForgeEntity): Record<string, string> {
  return {
    [`${entity.homeFolder}/package.json`]: `{ "name": "example-${entity.key}", "private": true }\n`,
    [constitutionFileOf(entity)]:          `# Example ${entity.key} rules\n`,
    [sourceFileOf(entity)]:                `export const ${entity.key.replaceAll('-', '')}Example = 1;\n`,
  };
}

/** The tracked files of the main line at its start, by path below the repository. */
export const ENTITY_FORGE_TRACKED_FILES: Readonly<Record<string, string>> = {
  'package.json':                              '{ "name": "example-workspace", "private": true, "workspaces": ["apps/*", "packages/*"] }\n',
  [ENTITY_FORGE_LOCK_FILE]:                    '{ "lockfileVersion": 1, "workspaces": {} }\n',
  'turbo.json':                                '{ "tasks": { "verify": {} } }\n',
  '.gitignore':                                IGNORED_BY_THE_TRACKER,
  'CLAUDE.md':                                 '# Example workspace instructions\n',
  [`${ENTITY_FORGE_HOOKS_FOLDER}/pre-commit`]: PASSING_HOOK,
  ...homeFilesOf(ENTITY_FORGE_ENTITIES.SHOP),
  ...homeFilesOf(ENTITY_FORGE_ENTITIES.ADMIN),
  ...homeFilesOf(ENTITY_FORGE_ENTITIES.UI_KIT),
};

/** Writes the tracked files into `repositoryDirectory`, and the tracker's data folder, which the `.gitignore` keeps out of git. */
export function writeEntityForgeFiles(repositoryDirectory: string): void {
  for (const [path, text] of Object.entries(ENTITY_FORGE_TRACKED_FILES)) {
    const filePath = join(repositoryDirectory, path);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, text, path.startsWith(`${ENTITY_FORGE_HOOKS_FOLDER}/`) ? { mode: EXECUTABLE_FILE_MODE } : {});
  }
  mkdirSync(join(repositoryDirectory, PRODUCT_NAMES.DATA_FOLDER), { recursive: true });
}
