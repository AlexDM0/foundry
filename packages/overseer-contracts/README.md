# overseer-contracts

The shared contract between a forge's Overseer and the programs that read it: the documents the Overseer serves and reads, as
TypeScript types, and the wire version of each contract. Forge produces these documents; Gaia reads them and sends the commands.

| Export | Holds |
| --- | --- |
| `overseer-contracts/ContractVersion` | `{ major, minor }`, the shape of every wire version |
| `overseer-contracts/IdentityDocument` | `GET /api/identity`, with the `contracts` and `contractMinors` it names |
| `overseer-contracts/BoardSummaryDocument` | `GET /api/summary` |
| `overseer-contracts/MonitorSnapshotDocument` | `GET /api/monitor` and each `monitor` event, at major 3 and the majors 1 and 2 a reader still reads |
| `overseer-contracts/ForgeControlCommand` | the bodies of `POST /api/commands`, at control 2 and control 1 |
| `overseer-contracts/EmbedChannelMessage` | the messages between a framing page and the Bridge in its frame |
| `overseer-contracts/OverseerContractVersions` | each contract's `{ major, minor }`, the older majors the types still describe, and the first control major of Flint's brain |

## What it holds, and what it does not

Types and versions only, and no imports. No ingestion, migration, check or mapping lives here: each program maps the documents into its
own model at its own boundary (Gaia in `apps/gaia/src/adapters/forge-api/`). A type names the keys a reader checks; a key no reader
checks may be left out.

## Two versions, never mixed

- **The wire version** is each contract's major and minor, carried in the protocol itself. The integer key a document has always carried
  (`monitorVersion`, `identityVersion`, the identity's `contracts`) is the major; an optional sibling key (`monitorMinor`,
  `identityMinor`, `contractMinors`) is the minor, and an absent minor reads as 0. A change that only adds fields is a minor bump and
  backwards compatible; anything else is a major bump. A reader reads any minor of a major it knows and passes over the keys it does not.
- **The package version** (`package.json`, 0.1.0) is this package's own semantic version. It says which types and versions a build
  compiles against, never what runs: a running forge and a running Gaia meet only on the wire, whatever package versions they were built
  with. A wire minor bump is a package minor bump; a wire major bump is a package major bump.

Forge and Gaia are released as independent packages, so both depend on this one by a version range (`workspace:^` in the repository,
which becomes `^0.1.0` on release), never `workspace:*`. The package is publishable.

## Recordings stay with the reader

Gaia tests what it does with a forge's answers against answers recorded from released forges (`apps/gaia/src/testing/recordings/`),
stamped with the forge's install and code version, never against the forge source in the same repository. A running Gaia meets forges
of other versions, released before or after it, and only a recording of a real released forge shows what such a forge sends; a test
against the source beside it would only prove that two builds of the same commit agree. The types here say what a forge promises; the
recordings show what one sent.

## Verify

```bash
bun run verify
```

typechecks, lints and runs the one spec, which holds that the versions are consistent: whole majors and minors, and older majors below
the current ones. `FORGE_REQUIREMENTS.md` lists what forge must do for the major.minor rule.
