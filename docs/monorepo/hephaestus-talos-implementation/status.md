# Run status: Hephaestus, Talos and Gaia

The orchestrator's memory of the run (see `orchestrator.md`). Integration branch: `hephaestus-talos`, cut from `main` at
`e9b5d057` on 2026-11-18. States: `waiting`, `running`, `landed`, `blocked`, `owner`.

## Gates

| Gate | State | Note |
| --- | --- | --- |
| G0 | passed | Owner said go on 2026-11-18; branch `hephaestus-talos` |
| G1 | owner | WP0.3: the owner records a session that ends on a network outage |
| G2 | waiting | Owner decisions before WP0.5 |
| G3 | waiting | WP1.2 |
| G4 | waiting | End of WP2.13 |
| G5 | waiting | Before WP6.4 |
| G6 | waiting | Before and after stage 9 |
| G7 | waiting | End of the run |

## Packages

| Group | Package | State | Commit | Note |
| --- | --- | --- | --- | --- |
| 0-A | WP0.1 | waiting | | |
| 0-A | WP0.2 | waiting | | |
| 0-A | WP0.3 | owner | | Gate G1: the owner records it |
| 0-B | WP0.4 | waiting | | |
| 0-C | WP0.5 | waiting | | |
| 0-D | WP1.1 | waiting | | |
| 0-E | WP1.2 | waiting | | |
| 0-F | Refresh the plan | running | | Owner moved it before 0-A: `entities/integration` had already landed on `main` (93 commits since `3e6cb660`) |
| 0-G | WP1.3 | waiting | | |
| 2-A | WP2.1 | waiting | | |
| 2-A | WP2.2 | waiting | | |
| 2-A | WP2.3 | waiting | | |
| 2-B | WP2.4 | waiting | | |
| 2-C | WP2.5 | waiting | | |
| 2-C | WP2.6 | waiting | | |
| 2-C | WP2.11 | waiting | | |
| 2-D | WP2.7 | waiting | | |
| 2-E | WP2.8 | waiting | | |
| 2-F | WP2.9 | waiting | | |
| 2-F | WP2.10 | waiting | | |
| 2-G | WP2.12 | waiting | | |
| 2-H | WP2.13 | waiting | | |
| 2-I | WP2.14 | waiting | | |
| 2-J | WP2.15 | waiting | | |
| 2-K | WP2.16 | waiting | | |
| 2-L | WP2.17 | waiting | | |
| 2-M | WP2.18 | waiting | | |
| 3-A | WP3.1 | waiting | | |
| 3-A | WP3.4 | waiting | | |
| 3-A | WP3.5 | waiting | | |
| 3-B | WP3.2 | waiting | | |
| 3-B | WP3.6 | waiting | | |
| 3-C | WP3.3 | waiting | | |
| 3-C | WP3.7 | waiting | | |
| 3-D | WP3.8 | waiting | | |
| 3-E | WP3.9 | waiting | | |
| 3-F | WP3.10 | waiting | | |
| 3-G | WP3.11 | waiting | | |
| 3-G | WP3.13 | waiting | | |
| 3-H | WP3.12 | waiting | | |
| 3-I | WP3.14 | waiting | | |
| 4-A | WP4.1 | waiting | | |
| 4-B | WP4.2 | waiting | | |
| 4-C | WP4.3 | waiting | | |
| 4-D | WP4.4 | waiting | | |
| 4-E | WP4.5 | waiting | | |
| 4-E | WP4.6 | waiting | | |
| 4-E | WP4.7 | waiting | | |
| 4-F | WP4.8 | waiting | | |
| 4-F | WP4.9 | waiting | | |
| 5-A | WP5.1 | waiting | | |
| 5-B | WP5.2 | waiting | | |
| 5-C | WP5.3 | waiting | | |
| 5-D | WP5.4 | waiting | | |
| 5-D | WP5.5 | waiting | | |
| 5-D | WP5.6 | waiting | | |
| 5-E | WP5.7 | waiting | | |
| 5-F | WP5.8 | waiting | | |
| 5-G | WP5.9 | waiting | | |
| 5-G | WP5.10 | waiting | | |
| 5-H | WP5.11 | waiting | | |
| 5-H | WP5.12 | waiting | | |
| 6-A | WP6.1 | waiting | | |
| 6-B | WP6.2 | waiting | | |
| 6-B | WP7.2 | waiting | | |
| 6-C | WP6.3 | waiting | | |
| 6-C | WP6.4 | waiting | | |
| 6-D | WP6.5 | waiting | | |
| 6-E | WP6.6 | waiting | | |
| 6-F | WP6.7 | waiting | | |
| 6-G | WP6.8 | waiting | | |
| 6-H | WP6.9 | waiting | | |
| 6-I | WP6.10 | waiting | | |
| 6-I | WP6.11 | waiting | | |
| 6-I | WP6.12 | waiting | | |
| 6-I | WP6.18 | waiting | | |
| 6-I | WP6.19 | waiting | | |
| 6-I | WP7.1 | waiting | | |
| 6-J | WP6.13 | waiting | | |
| 6-J | WP6.14 | waiting | | |
| 6-J | WP6.15 | waiting | | |
| 6-J | WP6.16 | waiting | | |
| 6-J | WP6.17 | waiting | | |
| 6-J | WP6.20 | waiting | | |
| 6-K | WP6.21 | waiting | | |
| 6-L | WP6.22 | waiting | | |
| 6-M | WP6.23 | waiting | | |
| 8-A | WP8.1 | waiting | | |
| 8-A | WP8.3 | waiting | | |
| 8-B | WP8.2 | waiting | | |
| 8-C | WP8.4 | waiting | | |
| 8-C | WP8.5 | waiting | | |
| 8-D | WP8.6 | waiting | | |
| 8-E | WP8.7 | waiting | | |
| 8-F | WP8.8 | waiting | | |
| 8-G | WP8.9 | waiting | | |
| 8-H | WP8.10 | waiting | | |
| 8-I | WP8.11 | waiting | | |
| 8-I | WP8.12 | waiting | | |
| 9-A | WP9.1 | waiting | | |
| 9-A | WP9.2 | waiting | | |
| 9-A | WP9.3 | waiting | | |
| 9-A | WP9.4 | waiting | | |
| 9-A | WP9.5 | waiting | | |

## Where the code differed from a stage file

Nothing recorded yet.
