/**
 * Every prop, in the order the renderer draws the props of one layer, back to front: a new prop joins at the end. The pose type of the
 * props, their names and their hidden states are derived from this list, so a prop's name is written only in its own definition.
 */
import { HELD_BUG_PROP }                  from '../behaviours/chase-bug/HeldBugProp.ts';
import { AIRLOCK_CHAMBER_PROP }           from '../gestures/airlock/AirlockChamberProp.ts';
import { ASK_CARD_PROP }                  from '../gestures/ask/AskCardProp.ts';
import { KNOCK_ARCS_PROP }                from '../gestures/ask/KnockArcsProp.ts';
import { BANKED_EMBER_PROP }              from '../gestures/bank-fire/BankedEmberProp.ts';
import { BATON_PROP }                     from '../gestures/baton-pass/BatonProp.ts';
import { BOUNCER_BARRIER_PROP }           from '../gestures/bouncer/BouncerBarrierProp.ts';
import { BUG_JAR_PROP }                   from '../gestures/bug-jar/BugJarProp.ts';
import { CHAINED_SHEETS_PROP }            from '../gestures/chain/ChainedSheetsProp.ts';
import { CONFLICT_BLOCKS_PROP }           from '../gestures/conflict/ConflictBlocksProp.ts';
import { CRASH_SPARK_PROP }               from '../gestures/crash-resume/CrashSparkProp.ts';
import { CUSTOMS_CRATE_PROP }             from '../gestures/customs/CustomsCrateProp.ts';
import { CUSTOMS_LIST_PROP }              from '../gestures/customs/CustomsListProp.ts';
import { ESCAPED_BUG_PROP }               from '../gestures/escaped-bug/EscapedBugProp.ts';
import { BOLT_PROP }                      from '../gestures/fasten/BoltProp.ts';
import { DYING_SPARK_PROP }               from '../gestures/forced-stop/DyingSparkProp.ts';
import { FORCED_STOP_PLUG_PROP }          from '../gestures/forced-stop/ForcedStopPlugProp.ts';
import { GATE_NOTE_PROP }                 from '../gestures/gate-failed/GateNoteProp.ts';
import { GATE_RAIL_PROP }                 from '../gestures/gate-run/GateRailProp.ts';
import { HATCH_WALL_PROP }                from '../gestures/hatch/HatchWallProp.ts';
import { HELD_TICKET_PROP }               from '../gestures/hold/HeldTicketProp.ts';
import { INCIDENT_FUSE_PROP }             from '../gestures/incident-fuse/IncidentFuseProp.ts';
import { INK_DRAFT_SHEET_PROP }           from '../gestures/ink-draft/InkDraftSheetProp.ts';
import { INTERCEPT_ENVELOPE_PROP }        from '../gestures/intercept/InterceptEnvelopeProp.ts';
import { INTERVIEW_NOTEPAD_PROP }         from '../gestures/interview/InterviewNotepadProp.ts';
import { LAY_BAR_PROP }                   from '../gestures/lay-bar/LayBarProp.ts';
import { LISTEN_BLOCK_PROP }              from '../gestures/listen/ListenBlockProp.ts';
import { TICKET_PROP }                    from '../gestures/make-ticket/TicketProp.ts';
import { MERGE_BLOCKS_PROP }              from '../gestures/merge/MergeBlocksProp.ts';
import { MOLT_HUSK_PROP }                 from '../gestures/molt/MoltHuskProp.ts';
import { SPILLED_PAGES_PROP }             from '../gestures/molt/SpilledPagesProp.ts';
import { FUEL_GAUGE_PROP }                from '../gestures/out-of-fuel/FuelGaugeProp.ts';
import { REFUEL_SPARKS_PROP }             from '../gestures/out-of-fuel/RefuelSparksProp.ts';
import { PLAYBOOK_BOOK_PROP }             from '../gestures/playbook/PlaybookBookProp.ts';
import { REGROUP_SPARKS_PROP }            from '../gestures/regroup/RegroupSparksProp.ts';
import { REORDER_STACK_PROP }             from '../gestures/reorder/ReorderStackProp.ts';
import { BOOK_PROP }                      from '../gestures/research/BookProp.ts';
import { HOLOGRAM_PROP }                  from '../gestures/research/HologramProp.ts';
import { NOTEPAD_PROP }                   from '../gestures/research/NotepadProp.ts';
import { SEARCH_BAR_PROP }                from '../gestures/research/SearchBarProp.ts';
import { RIBBON_BUNDLE_PROP }             from '../gestures/ribbon/RibbonBundleProp.ts';
import { SANDBOX_DOME_PROP }              from '../gestures/sandbox/SandboxDomeProp.ts';
import { SHIP_SHELF_PROP }                from '../gestures/ship/ShipShelfProp.ts';
import { SLOT_RAIL_PROP }                 from '../gestures/slots/SlotRailProp.ts';
import { STRUCK_SPARKS_PROP }             from '../gestures/strike-spark/StruckSparksProp.ts';
import { SURVEY_BLUEPRINT_PROP }          from '../gestures/survey/SurveyBlueprintProp.ts';
import { UNPLUGGED_SOCKET_PROP }          from '../gestures/unplugged/UnpluggedSocketProp.ts';
import { WAIVER_SHEET_PROP }              from '../gestures/waiver/WaiverSheetProp.ts';
import { WIND_DOWN_DIAL_PROP }            from '../gestures/wind-down/WindDownDialProp.ts';
import { WIND_DOWN_TICKET_PROP }          from '../gestures/wind-down/WindDownTicketProp.ts';
import type { PropDefinition, PropState } from './PropDefinition.ts';
import { KEYBOARD_PROP }                  from './keyboard/KeyboardProp.ts';
import { LOOKING_GLASS_PROP }             from './looking-glass/LookingGlassProp.ts';
import { SHEET_PROP }                     from './sheet/SheetProp.ts';

export const PROP_CATALOG = Object.freeze([
  KEYBOARD_PROP,
  BOLT_PROP,
  SHEET_PROP,
  MERGE_BLOCKS_PROP,
  BOOK_PROP,
  NOTEPAD_PROP,
  SEARCH_BAR_PROP,
  HOLOGRAM_PROP,
  TICKET_PROP,
  LOOKING_GLASS_PROP,
  GATE_NOTE_PROP,
  ASK_CARD_PROP,
  KNOCK_ARCS_PROP,
  HELD_TICKET_PROP,
  LISTEN_BLOCK_PROP,
  STRUCK_SPARKS_PROP,
  GATE_RAIL_PROP,
  CUSTOMS_CRATE_PROP,
  CUSTOMS_LIST_PROP,
  AIRLOCK_CHAMBER_PROP,
  CONFLICT_BLOCKS_PROP,
  HATCH_WALL_PROP,
  BOUNCER_BARRIER_PROP,
  SANDBOX_DOME_PROP,
  PLAYBOOK_BOOK_PROP,
  BATON_PROP,
  REGROUP_SPARKS_PROP,
  INTERCEPT_ENVELOPE_PROP,
  INCIDENT_FUSE_PROP,
  FUEL_GAUGE_PROP,
  REFUEL_SPARKS_PROP,
  MOLT_HUSK_PROP,
  SPILLED_PAGES_PROP,
  CRASH_SPARK_PROP,
  WIND_DOWN_DIAL_PROP,
  WIND_DOWN_TICKET_PROP,
  DYING_SPARK_PROP,
  FORCED_STOP_PLUG_PROP,
  BANKED_EMBER_PROP,
  INK_DRAFT_SHEET_PROP,
  INTERVIEW_NOTEPAD_PROP,
  CHAINED_SHEETS_PROP,
  REORDER_STACK_PROP,
  RIBBON_BUNDLE_PROP,
  BUG_JAR_PROP,
  ESCAPED_BUG_PROP,
  WAIVER_SHEET_PROP,
  LAY_BAR_PROP,
  SHIP_SHELF_PROP,
  SLOT_RAIL_PROP,
  SURVEY_BLUEPRINT_PROP,
  UNPLUGGED_SOCKET_PROP,
  HELD_BUG_PROP,
] as const);

type RegisteredProp = typeof PROP_CATALOG[number];

export type PropName = RegisteredProp['name'];

type StateOf<Definition> = Definition extends PropDefinition<string, infer State> ? State : never;

/** Each prop's state by its name: the props part of the pose. */
export type PropsPose = { readonly [Definition in RegisteredProp as Definition['name']]: StateOf<Definition> };

type PropDefinitionsByName = { readonly [Name in PropName]: PropDefinition<Name, PropsPose[Name] & PropState> };

export const PROP_NAMES: readonly PropName[] = Object.freeze(PROP_CATALOG.map((definition) => definition.name));

const PROP_DEFINITIONS_BY_NAME = Object.freeze(Object.fromEntries(PROP_CATALOG.map((definition) => [definition.name, definition]))) as unknown as PropDefinitionsByName;

export function propDefinitionOf<Name extends PropName>(name: Name): PropDefinitionsByName[Name] {
  return PROP_DEFINITIONS_BY_NAME[name];
}

/** Builds the props part of a pose one prop at a time, in the catalog's order. */
export function propsPoseFrom(stateOf: <Name extends PropName>(name: Name) => PropsPose[Name]): PropsPose {
  return Object.freeze(Object.fromEntries(PROP_NAMES.map((name) => [name, stateOf(name)]))) as unknown as PropsPose;
}

/** Every prop hidden, each with the parameters it starts from when it fades in. */
export const HIDDEN_PROPS: PropsPose = propsPoseFrom((name) => propDefinitionOf(name).hidden);
