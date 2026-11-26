/** Where the setup of a forge with no readable pipeline stands, as its board says: no setup record yet, or the record's step among its steps. */
export type SetupProgress =
  | { readonly stage: 'not-started' }
  | { readonly stage: 'setting-up'; readonly stepNumber: number; readonly stepCount: number };
