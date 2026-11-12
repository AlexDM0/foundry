/**
 * Runs the forge program for what no Overseer API can do: one verb in the forge's root, through process-run, answered as a verdict. The
 * program is the registry's `program` for the forge, else the one in Gaia's settings (PLAN 8.2).
 */
import type { ProcessRun } from '../../lib/process-run/ProcessRun.ts';
import type {
  ForgeInitAnswer,
  ForgeLoginItemAction,
  ForgeLoginItemAnswer,
  ForgeMachineLimitAnswer,
  ForgeOpenAnswer,
  ForgeProgramVerdict,
  ForgeStartAnswer,
  ForgeStopAnswer,
  ForgeUpdateAnswer,
  ForgeVersionAnswer,
} from './@types/ForgeProgramAnswer.ts';
import { ForgeAnswerMapUtil, type DoneAnswerMapper } from './utils/ForgeAnswerMapUtil.ts';

/** The forge a verb runs for: its root, and the program the registry names for it (F9), `null` when it names none. */
export interface ForgeProgramTarget {
  readonly root:    string;
  readonly program: string | null;
}

export interface ForgeProgramOptions {
  readonly processRun:          ProcessRun;
  /** Read at each run, so a program chosen in the settings counts from the next verb on. */
  readonly settingsProgramPath: () => string | null;
}

export interface ForgeProgram {
  readonly start:           (forge: ForgeProgramTarget) => Promise<ForgeProgramVerdict<ForgeStartAnswer>>;
  readonly stop:            (forge: ForgeProgramTarget) => Promise<ForgeProgramVerdict<ForgeStopAnswer>>;
  /** Registers the repository at `forge.root` as a forge named `project`. */
  readonly init:            (forge: ForgeProgramTarget, project: string) => Promise<ForgeProgramVerdict<ForgeInitAnswer>>;
  readonly update:          (forge: ForgeProgramTarget) => Promise<ForgeProgramVerdict<ForgeUpdateAnswer>>;
  readonly version:         (forge: ForgeProgramTarget) => Promise<ForgeProgramVerdict<ForgeVersionAnswer>>;
  /** Starts `forge open` detached and does not wait for its end. */
  readonly openInBrowser:   (forge: ForgeProgramTarget) => ForgeProgramVerdict<ForgeOpenAnswer>;
  readonly machineLimitSet: (forge: ForgeProgramTarget, agentLimit: number) => Promise<ForgeProgramVerdict<ForgeMachineLimitAnswer>>;
  readonly loginItem:       (forge: ForgeProgramTarget, action: ForgeLoginItemAction) => Promise<ForgeProgramVerdict<ForgeLoginItemAnswer>>;
}

/** `forge start` returns only when the new Overseer's API answers. */
const FORGE_START_TIMEOUT_MILLISECONDS = 120_000;
/** `forge update` may pass the Baton to the new code before it answers. */
const FORGE_UPDATE_TIMEOUT_MILLISECONDS = 300_000;
const FORGE_VERB_TIMEOUT_MILLISECONDS = 60_000;
const JSON_FLAG = '--json';

export function createForgeProgram(options: ForgeProgramOptions): ForgeProgram {
  function programFor(forge: ForgeProgramTarget): string | null {
    return forge.program ?? options.settingsProgramPath();
  }

  async function run<Answer>(
    forge: ForgeProgramTarget,
    programArguments: readonly string[],
    timeoutMilliseconds: number,
    doneAnswerOf: DoneAnswerMapper<Answer>,
  ): Promise<ForgeProgramVerdict<Answer>> {
    const program = programFor(forge);
    if (program === null) return { verdict: 'program-not-found', program: null };
    const answer = await options.processRun.run({
      program,
      programArguments,
      workingDirectory: forge.root,
      timeoutMilliseconds,
    });
    return ForgeAnswerMapUtil.verdictOfRun(answer, { program, root: forge.root }, doneAnswerOf);
  }

  function openInBrowser(forge: ForgeProgramTarget): ForgeProgramVerdict<ForgeOpenAnswer> {
    const program = programFor(forge);
    if (program === null) return { verdict: 'program-not-found', program: null };
    const start = options.processRun.startDetached({ program, programArguments: ['open'], workingDirectory: forge.root });
    return ForgeAnswerMapUtil.verdictOfDetachedStart(start, { program, root: forge.root });
  }

  return {
    start:           (forge) => run(forge, ['start', JSON_FLAG], FORGE_START_TIMEOUT_MILLISECONDS, ForgeAnswerMapUtil.startAnswerOf),
    stop:            (forge) => run(forge, ['stop', JSON_FLAG], FORGE_VERB_TIMEOUT_MILLISECONDS, ForgeAnswerMapUtil.stopAnswerOf),
    init:            (forge, project) => run(forge, ['init', '--project', project, JSON_FLAG], FORGE_VERB_TIMEOUT_MILLISECONDS, ForgeAnswerMapUtil.initAnswerOf),
    update:          (forge) => run(forge, ['update', JSON_FLAG], FORGE_UPDATE_TIMEOUT_MILLISECONDS, ForgeAnswerMapUtil.updateAnswerOf),
    version:         (forge) => run(forge, ['version', JSON_FLAG], FORGE_VERB_TIMEOUT_MILLISECONDS, ForgeAnswerMapUtil.versionAnswerOf),
    openInBrowser,
    machineLimitSet: (forge, agentLimit) => {
      return run(forge, ['machine', 'limit', String(agentLimit), JSON_FLAG], FORGE_VERB_TIMEOUT_MILLISECONDS, ForgeAnswerMapUtil.machineLimitAnswerOf);
    },
    loginItem: (forge, action) => run(forge, ['login-item', action, JSON_FLAG], FORGE_VERB_TIMEOUT_MILLISECONDS, ForgeAnswerMapUtil.loginItemAnswerOf),
  };
}
