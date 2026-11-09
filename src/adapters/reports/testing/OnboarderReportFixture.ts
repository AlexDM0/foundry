/** A valid onboarder report for specs, its head commit given, every array starting from the installed defaults. */

const DEFAULT_ARRAYS = {
  builder:      ['.forge/briefs/defaults/builder.md'],
  reviewer:     ['.forge/briefs/defaults/reviewer.md'],
  productOwner: ['.forge/briefs/defaults/productOwner.md'],
  onboarder:    ['.forge/briefs/defaults/onboarder.md'],
  assistant:    ['.forge/briefs/defaults/assistant.md'],
};

export function onboarderReportOf(headCommit: string, overrides: Readonly<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    role:    'onboarder',
    mode:    'setup',
    headCommit,
    prepare: [{ name: 'install', run: 'bun install' }],
    gates:   [{
      name: 'tests', run: 'bun test', definedBy: ['package.json'], network: [], writes: []
    }],
    review:        { name: 'review', model: null, effort: null },
    constitution:  ['.forge/briefs/defaults/constitution.md', 'CLAUDE.md'],
    agents:        DEFAULT_ARRAYS,
    optimisations: [],
    notes:         'Read package.json and the README.',
    ...overrides,
  };
}
