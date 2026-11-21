# The documentation map

> **Question:** Given what I need right now, which page do I open?  
> **Time:** 1 minute to find a page.  
> **Read first:** nothing; the [README](../README.md) says what the project is.  
> **Next:** [Overview](concepts/overview.md), [Getting started](operations/getting-started.md),
> [Runbook](operations/runbook.md).

## In one screen

If something is wrong right now, start here.

| What is happening | Open |
| --- | --- |
| A [ticket](glossary.md#ticket) is not moving | [One ticket will not start](operations/runbook.md#one-ticket-will-not-start), with [Not moving](operations/runbook.md#not-moving) for a whole [board](glossary.md#board) |
| An [agent](glossary.md#agent) looks stuck | [An agent looks stuck](operations/runbook.md#an-agent-looks-stuck) |
| Something crashed | [Something died](operations/runbook.md#something-died) |
| I am updating | [Updating](operations/runbook.md#updating) |
| A [decision](glossary.md#decision) is waiting | [Decisions](operations/runbook.md#decisions) |
| A command printed a [refusal](glossary.md#refusal) | [Refusals](reference/refusals.md), searched for the printed words |

## Every document

### Concepts

| Document | Its question |
| --- | --- |
| [The system in twenty minutes](concepts/overview.md) | What are the moving parts, who decides what, and what ideas does everything else rest on? |
| [One ticket, from draft to merged](concepts/ticket-lifecycle.md) | What happens to a ticket at each step, who moves it, and what can send it back? |
| [Glossary](glossary.md) | What does this word mean here, and which of its meanings is this? |

### Operating a board

| Document | Its question |
| --- | --- |
| [Getting started](operations/getting-started.md) | What exactly do I run, in what order, and what should I see at each step? |
| [Running a board](operations/running-a-board.md) | What am I looking at, and what do I do here day to day? |
| [Runbook](operations/runbook.md) | Something needs me: what do I check and what do I do? |

### Reference

| Document | Its question |
| --- | --- |
| [Command and file-format reference](cli.md) | What exactly does this command accept, and what exactly is in this file? |
| [The Hephaestus API](reference/hephaestus-api.md) | What does Hephaestus serve, to whom, and how does a client stay in step? |
| [Refusals](reference/refusals.md) | This was refused: what does it mean, was anything written, and what do I do? |
| [Backlog](backlog.md) | What is agreed and not started, and why does it wait? |

### Changing the code

| Document | Its question |
| --- | --- |
| [Changing the code](development/contributing.md) | How do I get this running, try a change safely and get it past every check? |
| [Guards and testing](development/guards-and-testing.md) | Which spec holds which rule, and how is this codebase tested without ever touching live data? |
| [The Claude Code contract](development/hephaestus-claude-probe.md) | What does this system depend on from Claude Code, and what was observed to justify each choice? |
| [Platform status](development/platform-status.md) | Which behaviour has never run on which OS, per port? |

### Research

| Document | Its question |
| --- | --- |
| [Remote state, login and cloud workers](research/remote-state/findings.md) | What would it take to keep state in a remote database, log a user in at `init`, and run jobs on cloud sessions? ([page with diagrams](research/remote-state/findings.html)) |
| [Compounding: the data to gather and what it would improve](research/compounding/data-and-improvements.md) | What must forge record to say where a period's tokens and time went, grade a delivered feature, replay it under another configuration, and name what to improve? |
| [Entities: one forge for a monorepo](../../../docs/monorepo/research/monorepo-entities/strategy.md) | How does one forge at the root of a monorepo give every app and package its own constitution, pipeline and agents? ([page](../../../docs/monorepo/research/monorepo-entities/strategy.html), [the pipeline builder's monorepo mode](../../../docs/monorepo/research/monorepo-entities/pipeline-builder-monorepo-mode.md)) |

## Names

The program is `forge`, and it runs beside the released `agent-progress` under folders and environment
variables of its own. Documents write those folders as `<data>`, `<worktrees>` and `<monitor>`.
[Reading names](glossary.md#reading-names) gives the names documents use and the three
reasons a released spelling still appears.

## What is not here

- **Rules** are in [CLAUDE.md](../CLAUDE.md), the rule book these pages link and never restate.
- **Plans** are in [the backlog](backlog.md).
- **How a mechanism works in detail** is in the code; [CLAUDE.md](../CLAUDE.md) names where each rule is held.

## In the code

| Concept | Path | Symbol | Spec |
| --- | --- | --- | --- |
| Names | `src/shared/constants/ProductNames.ts` | `PRODUCT_NAMES` | `src/ProductNames.spec.ts` |
| Component names | `src/ComponentNames.spec.ts` | `RETIRED_NAMES` | `src/ComponentNames.spec.ts` |
