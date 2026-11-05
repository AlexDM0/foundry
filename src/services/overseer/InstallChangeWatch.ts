/**
 * How the Overseer notices an update, design section 7.3: its code and install version in memory against the code on disk, learned by
 * running the on-disk binary's `version --json` at each sweep and after each landing, and against the manifest, read on every look.
 * An install change holds launches until a Baton pass brings matching code; new code alone is only shown. The Overseer never restarts itself.
 * The binary runs beside the event loop, never blocking it: a look answers what the watch last learned, and a changed answer calls
 * `onLearned`, so the next pass reads it. Until the binary answered for landed code, or for the first time, launches are held.
 */
export interface ProgramVersions {
  codeVersion:    string;
  installVersion: number;
}

export interface InstallChangeWatchRequest {
  inMemory:        ProgramVersions;
  /** The on-disk binary's own answer; `null` when it did not give one, which changes nothing the watch last learned. */
  versionsOnDisk:  () => Promise<ProgramVersions | null>;
  manifestMatches: () => boolean;
  /** Moves when a landing moves the main line, such as its tip; the on-disk binary is asked again once it does. */
  landingMark:     () => string | null;
  /** Called when an answer changed what the watch learned or ended a hold, after the look that asked for it returned. */
  onLearned:       () => void;
}

export interface InstallChangeWatch {
  /** The next look asks the on-disk binary again. */
  noteSweep:             () => void;
  /** Asks the on-disk binary now and resolves once it answered, so a first pass decides on its answer. */
  learnVersionsOnDisk:   () => Promise<void>;
  installVersionChanged: () => boolean;
  /** Code on disk differs while its install version does not: shown as "new code", holding nothing. */
  newCodeOnDisk:         () => boolean;
}

const VERSION_ARGUMENTS = ['version', '--json'];

/** Runs `<program> version --json` as a child: the code on disk answers for itself, whatever this process loaded. */
export async function versionsFromTheBinary(programCommand: readonly string[], workingDirectory: string): Promise<ProgramVersions | null> {
  if (programCommand.length === 0) return null;
  try {
    const child = Bun.spawn([...programCommand, ...VERSION_ARGUMENTS], {
      cwd: workingDirectory, stdin: 'ignore', stdout: 'pipe', stderr: 'ignore', windowsHide: true
    });
    const [standardOutput, exitCode] = await Promise.all([new Response(child.stdout).text(), child.exited]);
    if (exitCode !== 0) return null;
    const parsed = JSON.parse(standardOutput) as Partial<Record<keyof ProgramVersions, unknown>>;
    return typeof parsed.codeVersion === 'string' && typeof parsed.installVersion === 'number'
      ? { codeVersion: parsed.codeVersion, installVersion: parsed.installVersion }
      : null;
  } catch {
    return null;
  }
}

function sameVersions(first: ProgramVersions | null, second: ProgramVersions | null): boolean {
  return first?.codeVersion === second?.codeVersion && first?.installVersion === second?.installVersion;
}

export function createInstallChangeWatch(request: InstallChangeWatchRequest): InstallChangeWatch {
  let learned: ProgramVersions | null = null;
  let askAgain = true;
  let lastLandingMark: string | null = null;
  let pendingAnswer: Promise<void> | null = null;
  let askedWhilePending = false;
  let landedCodeUnanswered = false;
  let heldForTheAnswer = false;

  function ask(): Promise<void> {
    if (pendingAnswer !== null) {
      askedWhilePending = true;
      return pendingAnswer;
    }
    const answering = request.versionsOnDisk().then((answer) => {
      const before = learned;
      learned = answer ?? learned;
      pendingAnswer = null;
      // A sweep or landing during the run may postdate the code the child read, so it is asked once more.
      const askingAgain = askedWhilePending;
      askedWhilePending = false;
      const releasesAHold = !askingAgain && heldForTheAnswer;
      if (!askingAgain) {
        landedCodeUnanswered = false;
        heldForTheAnswer     = false;
      }
      const nextAnswer = askingAgain ? ask() : Promise.resolve();
      if (releasesAHold || !sameVersions(before, learned)) request.onLearned();
      return nextAnswer;
    });
    pendingAnswer = answering;
    return answering;
  }

  function onDisk(): ProgramVersions | null {
    const landingMark = request.landingMark();
    if (askAgain || landingMark !== lastLandingMark) {
      // Landed code, or the first ask, may carry another install version: launches wait for its answer.
      if (landingMark !== lastLandingMark || learned === null) landedCodeUnanswered = true;
      askAgain        = false;
      lastLandingMark = landingMark;
      void ask();
    }
    return learned;
  }

  function installVersionChanged(): boolean {
    const versions = onDisk();
    if (!request.manifestMatches()) return true;
    if (landedCodeUnanswered) {
      heldForTheAnswer = true;
      return true;
    }
    return (versions !== null && versions.installVersion !== request.inMemory.installVersion);
  }

  return {
    noteSweep:           () => { askAgain = true; },
    learnVersionsOnDisk: async () => {
      askAgain = true;
      onDisk();
      await pendingAnswer;
    },
    installVersionChanged,
    newCodeOnDisk: () => {
      const versions = onDisk();
      return !installVersionChanged() && versions !== null && versions.codeVersion !== request.inMemory.codeVersion;
    },
  };
}
