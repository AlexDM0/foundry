/**
 * The version of a forge's control contract the page judges a forge by, against the `contracts` the fleet document reports: the same
 * number as `CONTRACT_VERSIONS.forgeControl`, written here because the page imports nothing of the forge's contract package and that file does.
 * `KnownForgeContractVersions.spec.ts` holds the two equal.
 */
export const KNOWN_FORGE_CONTRACT_VERSIONS = { control: 2 } as const;
