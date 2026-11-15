/**
 * Every gesture; the mind reaches a gesture only through this catalog. The gesture names and the gesture intents of the fixed intent list
 * are derived from it, in this order, so an intent's name is written only in its gesture's definition.
 */
import type { GestureDefinition } from './GestureDefinition.ts';
import { AIRLOCK_GESTURE }        from './airlock/AirlockGesture.ts';
import { ASK_GESTURE }            from './ask/AskGesture.ts';
import { BANK_FIRE_GESTURE }      from './bank-fire/BankFireGesture.ts';
import { BATON_PASS_GESTURE }     from './baton-pass/BatonPassGesture.ts';
import { BOUNCER_GESTURE }        from './bouncer/BouncerGesture.ts';
import { BUG_JAR_GESTURE }        from './bug-jar/BugJarGesture.ts';
import { CHAIN_GESTURE }          from './chain/ChainGesture.ts';
import { CONFLICT_GESTURE }       from './conflict/ConflictGesture.ts';
import { CRASH_RESUME_GESTURE }   from './crash-resume/CrashResumeGesture.ts';
import { CUSTOMS_GESTURE }        from './customs/CustomsGesture.ts';
import { ESCAPED_BUG_GESTURE }    from './escaped-bug/EscapedBugGesture.ts';
import { FASTEN_GESTURE }         from './fasten/FastenGesture.ts';
import { FORCED_STOP_GESTURE }    from './forced-stop/ForcedStopGesture.ts';
import { GATE_FAILED_GESTURE }    from './gate-failed/GateFailedGesture.ts';
import { GATE_RUN_GESTURE }       from './gate-run/GateRunGesture.ts';
import { GRAB_GESTURE }           from './grab/GrabGesture.ts';
import { HATCH_GESTURE }          from './hatch/HatchGesture.ts';
import { HOLD_GESTURE }           from './hold/HoldGesture.ts';
import { INCIDENT_FUSE_GESTURE }  from './incident-fuse/IncidentFuseGesture.ts';
import { INK_DRAFT_GESTURE }      from './ink-draft/InkDraftGesture.ts';
import { INTERCEPT_GESTURE }      from './intercept/InterceptGesture.ts';
import { INTERVIEW_GESTURE }      from './interview/InterviewGesture.ts';
import { LAY_BAR_GESTURE }        from './lay-bar/LayBarGesture.ts';
import { LISTEN_GESTURE }         from './listen/ListenGesture.ts';
import { MAKE_TICKET_GESTURE }    from './make-ticket/MakeTicketGesture.ts';
import { MERGE_GESTURE }          from './merge/MergeGesture.ts';
import { MOLT_GESTURE }           from './molt/MoltGesture.ts';
import { OUT_OF_FUEL_GESTURE }    from './out-of-fuel/OutOfFuelGesture.ts';
import { PLAYBOOK_GESTURE }       from './playbook/PlaybookGesture.ts';
import { POINT_GESTURE }          from './point/PointGesture.ts';
import { REGROUP_GESTURE }        from './regroup/RegroupGesture.ts';
import { REORDER_GESTURE }        from './reorder/ReorderGesture.ts';
import { RESEARCH_GESTURE }       from './research/ResearchGesture.ts';
import { REVIEW_GESTURE }         from './review/ReviewGesture.ts';
import { RIBBON_GESTURE }         from './ribbon/RibbonGesture.ts';
import { SANDBOX_GESTURE }        from './sandbox/SandboxGesture.ts';
import { SHIP_GESTURE }           from './ship/ShipGesture.ts';
import { SLOTS_GESTURE }          from './slots/SlotsGesture.ts';
import { STRIKE_SPARK_GESTURE }   from './strike-spark/StrikeSparkGesture.ts';
import { SURVEY_GESTURE }         from './survey/SurveyGesture.ts';
import { TYPE_GESTURE }           from './type/TypeGesture.ts';
import { UNPLUGGED_GESTURE }      from './unplugged/UnpluggedGesture.ts';
import { WAIVER_GESTURE }         from './waiver/WaiverGesture.ts';
import { WAVE_GESTURE }           from './wave/WaveGesture.ts';
import { WIND_DOWN_GESTURE }      from './wind-down/WindDownGesture.ts';

export const GESTURE_CATALOG = Object.freeze([
  WAVE_GESTURE,
  POINT_GESTURE,
  TYPE_GESTURE,
  REVIEW_GESTURE,
  RESEARCH_GESTURE,
  MAKE_TICKET_GESTURE,
  MERGE_GESTURE,
  FASTEN_GESTURE,
  GRAB_GESTURE,
  GATE_FAILED_GESTURE,
  ASK_GESTURE,
  HOLD_GESTURE,
  LISTEN_GESTURE,
  STRIKE_SPARK_GESTURE,
  GATE_RUN_GESTURE,
  CUSTOMS_GESTURE,
  AIRLOCK_GESTURE,
  CONFLICT_GESTURE,
  HATCH_GESTURE,
  BOUNCER_GESTURE,
  SANDBOX_GESTURE,
  PLAYBOOK_GESTURE,
  BATON_PASS_GESTURE,
  REGROUP_GESTURE,
  INTERCEPT_GESTURE,
  INCIDENT_FUSE_GESTURE,
  OUT_OF_FUEL_GESTURE,
  MOLT_GESTURE,
  CRASH_RESUME_GESTURE,
  WIND_DOWN_GESTURE,
  FORCED_STOP_GESTURE,
  BANK_FIRE_GESTURE,
  INK_DRAFT_GESTURE,
  INTERVIEW_GESTURE,
  CHAIN_GESTURE,
  REORDER_GESTURE,
  RIBBON_GESTURE,
  BUG_JAR_GESTURE,
  ESCAPED_BUG_GESTURE,
  WAIVER_GESTURE,
  LAY_BAR_GESTURE,
  SHIP_GESTURE,
  SLOTS_GESTURE,
  SURVEY_GESTURE,
  UNPLUGGED_GESTURE,
] as const);

type RegisteredGesture = typeof GESTURE_CATALOG[number];

export type GestureName = RegisteredGesture['name'];

type IntentsOf<Definition> = Definition extends { readonly intents: infer Intents } ? keyof Intents & string : never;

export type GestureIntent = IntentsOf<RegisteredGesture>;

/** A gesture as the mind runs it: any registered gesture, its intents and variants as strings. */
export type CatalogGesture = GestureDefinition<GestureName, string, string>;

/** Every gesture intent, in the catalog's order. */
export const GESTURE_INTENTS: readonly GestureIntent[] = Object.freeze(GESTURE_CATALOG.flatMap((definition) => Object.keys(definition.intents) as GestureIntent[]));
