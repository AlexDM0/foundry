/**
 * The versions of a forge's control and embed contracts the page judges a forge by, against the `contracts` the fleet document reports:
 * the same numbers as `CONTRACT_VERSIONS.forgeControl` and `.forgeEmbedChannel`, written here because the page imports no `forge-contracts`
 * and that file does. `KnownForgeContractVersions.spec.ts` holds the two equal.
 */
export const KNOWN_FORGE_CONTRACT_VERSIONS = {
  control: 1,
  embed:   1,
} as const;
