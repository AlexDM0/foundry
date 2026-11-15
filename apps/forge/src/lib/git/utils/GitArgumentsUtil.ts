/**
 * What a git spawn carries beside its verb: settings as `-c` arguments for a git this tool starts or as `GIT_CONFIG_*` pairs for a git a
 * child starts, and a long path list cut into argvs a Windows command line holds.
 */
type GitSetting = readonly [string, string];

function overrideArgumentsOf(settings: readonly GitSetting[]): string[] {
  return settings.flatMap(([key, value]) => ['-c', `${key}=${value}`]);
}

/** The `GIT_CONFIG_COUNT` environment, which reaches every git the child starts, its own included; it replaces any count already set. */
function environmentOf(settings: readonly GitSetting[]): Record<string, string> {
  return {
    GIT_CONFIG_COUNT: String(settings.length),
    ...Object.fromEntries(settings.flatMap(([key, value], i) => [[`GIT_CONFIG_KEY_${i}`, key], [`GIT_CONFIG_VALUE_${i}`, value]])),
  };
}

/** Paths in runs whose summed length stays under `characterLimit`; a path longer than the limit alone is a run of its own. */
function pathspecChunksOf(paths: readonly string[], characterLimit: number): string[][] {
  const chunks: string[][] = [];
  let current: string[] = [];
  let currentCharacters = 0;
  for (const path of paths) {
    const pathCharacters = path.length + 1;
    if (current.length > 0 && currentCharacters + pathCharacters > characterLimit) {
      chunks.push(current);
      current = [];
      currentCharacters = 0;
    }
    current.push(path);
    currentCharacters += pathCharacters;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

export const GitArgumentsUtil = Object.freeze({
  environmentOf,
  overrideArgumentsOf,
  pathspecChunksOf,
});
