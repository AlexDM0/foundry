/**
 * The contract's list of every kind a client may send, against the command route that ingests it. What matters: the route takes each
 * listed kind and refuses none as a kind forge takes only by hand; and the ingestion has a mapping for each listed kind, which the
 * typecheck holds: a board kind by its mapper into forge's command, a control kind read as forge's own command of the same kind.
 */
import { describe, expect, test }      from 'bun:test';
import type { ForgeControlCommand }    from 'forge-contracts/ForgeControlCommand';
import { FORGE_CONTROL_COMMAND_KINDS } from 'forge-contracts/ForgeControlCommandKinds';

import { BoardCommandMappingUtil } from '../../../src/adapters/board-commands/utils/BoardCommandMappingUtil.ts';
import type { ControlCommandOf }   from '../../../src/shared/@types/ControlCommand.ts';
import { BY_HAND_COMMAND_KINDS }   from '../../constants/JobVerbs.ts';
import { COMMAND_ROUTE_KINDS }     from './CommandRoute.ts';

type ListedKind = (typeof FORGE_CONTROL_COMMAND_KINDS)[number];

type ControlKindIngestion = {
  readonly [Kind in ForgeControlCommand['kind']]: (command: Extract<ForgeControlCommand, { kind: Kind }>) => ControlCommandOf<Kind>
};

/** The route reads a control kind's body as forge's own command, field for field; a kind whose fields differ fails the typecheck. */
const CONTROL_KIND_INGESTION: ControlKindIngestion = {
  'hephaestus-pause':          (command) => command,
  'hephaestus-unpause':        (command) => command,
  'interrupted-work-resume':   (command) => command,
  'hephaestus-stop':           (command) => command,
  'hephaestus-restart':        (command) => command,
  'talos-restart':             (command) => command,
  'concurrency-set':           (command) => command,
  'job-stop-all':              (command) => command,
  'machine-agent-limit-set':   (command) => command,
  'machine-agent-program-set': (command) => command,
};

const INGESTION_OF_LISTED_KIND = {
  ...CONTROL_KIND_INGESTION,
  ...BoardCommandMappingUtil.mapperOfKind,
} satisfies Record<ListedKind, unknown>;

describe('every kind a client may send, at the command route', () => {
  test('the ingestion maps exactly the listed kinds', () => {
    expect(Object.keys(INGESTION_OF_LISTED_KIND).sort()).toEqual([...FORGE_CONTROL_COMMAND_KINDS].sort());
  });

  test('the route takes each listed kind, and none is a kind forge takes only by hand', () => {
    expect(FORGE_CONTROL_COMMAND_KINDS.filter((kind) => !COMMAND_ROUTE_KINDS.includes(kind))).toEqual([]);
    expect(FORGE_CONTROL_COMMAND_KINDS.filter((kind) => (BY_HAND_COMMAND_KINDS as readonly string[]).includes(kind))).toEqual([]);
  });
});
