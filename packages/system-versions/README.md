# system-versions

The version model any server and its clients share, and the logic of the compatibility registry a server keeps beside it. The package
names no server; each server keeps its own versions and its own registry, and uses this logic for both.

| Export | Holds |
| --- | --- |
| `system-versions/VersionsDocument` | `SystemVersion` and `GET /api/versions`, unversioned and never removed: a server's current version and its minimum supported |
| `system-versions/CompatibilityEntry` | an entry of a compatibility registry, endpoint or compatibility path, and the raise-the-minimum report |
| `system-versions/SystemVersionUtil` | comparing, writing and reading `major.minor` |
| `system-versions/CompatibilityRegistryUtil` | the endpoint version a client calls, the entry a versioned path names and a template endpoint's concrete path, what a raise of the minimum makes removable, the dry run's text, and the guard |

## The model

- A server has one **system version**, `major.minor` by interoperability, never its package version: a minor change only adds, a major
  change may break a client built for an older major. It publishes the version and its **minimum supported**, the oldest version of its
  own a client may have been built for and still be served, at `GET /api/versions`. The server alone decides that minimum.
- REST endpoints are versioned by path, `/api/v<n>/<endpoint>`, side by side. Message protocols carry the system version in their
  handshake and every message instead.
- The **compatibility registry** has one entry per thing the server keeps for clients of its older versions: every versioned endpoint,
  and every compatibility path that is no endpoint (an unversioned alias, a payload migration, an older message form). Each entry names
  the version that introduced it and the last version whose clients still need it, or none while the current version needs it.
- A client of version `v` calls, of each endpoint, the one version whose lifetime holds `v` (`endpointVersionAt`).
- An endpoint may be a template, such as `jobs/{jobId}/stream`: a segment `{<name>}` matches one non-empty segment of `[A-Za-z0-9_.-]`
  (`endpointEntryForPath`), and a client fills it with `endpointPathOf`.

## Raising the minimum

A server wires `raiseMinimumAnswerOf` to a script of its own, so a dry run such as `bun run versions:raise-minimum 3.0` lists what
becomes removable at that minimum and what must stay. Raising the minimum is then a one-line change to the server's versions. The guard,
`inconsistenciesOf`, which the server's spec expects to be empty, names every entry last needed below the minimum, so that spec fails
from the raise until each entry, and the code it stands for, is removed or its entry corrected. It names, too, an entry introduced after
the current version, a lifetime that ends before it begins or at the current version, a name used twice, and two versions of one
endpoint that one client version would both call.

## Verify

```bash
bun run verify
```

typechecks, lints and runs the specs: the registry logic on an example registry, and the guard that keeps the package naming no system
that uses it.
