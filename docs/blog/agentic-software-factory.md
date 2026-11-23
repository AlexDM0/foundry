---
title: The agentic software factory
deck: A concept for orchestrated agentic workflows that keep people in the loop, and foundry, the first working stage of one.
author: Alex de Mulder
date: 21 November 2026
---

An agentic software factory is an orchestrated workflow, integrated in the company landscape, that governs how a team works and keeps humans in the loop. It is more than a ticket-to-code pipeline: a deterministic **Workflow Loop** runs the process, agents do the work inside it, and gates the agents cannot skip decide what moves on. [[1]]

The core of the vision: a factory's boundaries are company-owned systems. A configured factory can be added to or removed from any layer and nothing breaks. Factories integrate and bring together: they guide people in the workflows and they connect services. [[1]]

::: note
**How to read this.** Part I is the concept, written as a paper you can click through: pick a pipeline, walk a ticket through it, break a gate. Part II introduces foundry, the software that runs the first stage of this vision today, with its architecture, its roadmap and the two projects it grew out of. The concept is a working paper, not a finished spec: some of its ideas are named but not yet worked out.
:::

# Part I: The concept

## 1. Why a workflow management system

A company runs on a number of workflows, and AI changes what each of them needs from its tooling. [[1]]

- **Business analysis.** The vision and strategy are researched and translated into implementable products and features.
- **Software development lifecycle.** Building features, monitoring, architecture.
- **Product design.** User research, mockups, visual design, flow design, content.
- **Measure, monitor and analyse.** Decide what to measure in the user-facing parts of the company, how to analyse it, and feed the results back into descriptions of work.

With the advent of AI, a company needs a workflow management system that covers five bases. Select a base to see where the factory picks it up.

::: widget five-bases wide kind=selector
The five bases a workflow management system has to cover, and where this paper picks each one up.

### Empowers employees
@tag: People
Personal dashboards show each person what needs their attention. Specs and plans are co-created by a person and an agent, and a person signs them off (chapters 3 and 4).

### Robust against user error and technical issues
@tag: Robustness
A deterministic Workflow Loop runs the process, and gates the agent cannot skip decide what moves on (chapters 3, 5 and 6). The factory itself is software, so a crash is a bug and should be fixed. The factory also needs monitoring of its own, including burn rates of tokens and credits.

### Agentic AI where it adds value
@tag: Agents
Agents work inside phases, and people sign off (chapter 4). Team members work with phases, sign-offs and a dashboard. They do not manage agents, prompts or models.

### Iterative improvements for the whole company
@tag: Compounding
The factory measures its own finished work and turns what it finds into proposed improvements. A person decides which are applied (chapter 7).

### Governance of AI tooling
@tag: Governance
Governance is configured above the factory: which models and tools are allowed, cost limits, audit trails, contracts with model providers, or hosting local models. The fleet manager has no part in this. It is only a load balancer in the factory.
:::

## 2. What an agentic software factory is

> An agentic software factory is an orchestrated workflow, integrated in the company landscape. It guides people in the workflows and connects services, and its boundaries are systems the company owns.

Three things make it more than a ticket-to-code pipeline: [[1]]

1. It governs the team workflow as a first-class citizen.
2. It abstracts the agentic parts.
3. It defines a process that keeps humans in the loop.

**What "abstracts" means.** Team members work with phases, sign-offs and a dashboard, and never manage agents, prompts or models themselves. The exception is the human-in-the-loop phases. There a person can spar with an agent, and during human review a developer can use agentic coding to get to the result they want. All other agents are run by the factory machine, following the workflow and delivering commits or artifacts.

**One factory per team.** The scope of a software factory can be drawn at any range. The vision in this paper is that each team has its own factory.

**The word "factory".** It does not fit the more business-oriented workflows well. This paper still uses it as the umbrella term for those too. Read "agentic software factory" and "orchestrated agentic workflow" as the same thing. The rest of Part I uses the software development workflow to illustrate the concept.

## 3. The moving parts

A fleet manager in the cloud balances load across a number of factory machines. Each machine runs a Workflow Loop that connects the company's systems, the agents and the team. Select a part to read what it is and what it does. [[1]]

::: widget concept-architecture wide
The Workflow Loop sits between the company's systems and the team. The dashed arrow is optional: the factory could report out to the ticketing system and the wiki, as chapter 6 works out.

### Fleet manager
@id: fleet-manager
**A load balancer.** It balances load across the software factory machines, and nothing more. Governance is not its job.

### Factory machine
@id: factory-machine
**The machine that runs a factory's Workflow Loop.** It governs a workflow and spins up subagents, parallelized to the capacity of the hardware. Machines can run in the cloud, on a developer's laptop, anywhere.

### Workflow Loop
@id: workflow-loop
**Code: a state machine with steps and hooks, configured in a `pipeline.json`.** It runs the process deterministically. Its steps and transitions are code and never a model's decision, while the agents working inside a step stay non-deterministic. The team and the organization define it.

### Subagents
@id: subagents
**The agents that do the work inside a phase.** The Workflow Loop spins them up where needed. They deliver commits or artifacts. The Workflow Loop, not the agents, decides when a phase is done.

### Factory state
@id: factory-state
**A database in the cloud, shared across machines.** It holds the Workflow Loop's own internal state. The team spins up more machines when more developers want to start features. That is why the state is shared: it lives on no single machine.

### Personal dashboard
@id: personal-dashboard
**One view per team member.** It shows each person what needs their attention, like a personal TODO list: a spec to refine, a plan to sign off, a review to do. Slack or Teams notifications are possible too.

### Company systems
@id: company-systems
**Jira, Azure DevOps, the code host, Confluence, or any other source of data.** The Workflow Loop ingests from them through triggers or polling. They are the factory's boundaries.
:::

**Where machines run.** In the cloud they are easier to manage from the company's point of view. One machine, a VPS or an EC2 instance for example, can run two to four agents depending on its CPU cores, with one core reserved for the Workflow Loop. So the team spins up more machines when more developers want to start features. [[1]]

::: widget machine-capacity
Plain arithmetic on the paper's rule of thumb: two to four agents per machine, and one core kept for the Workflow Loop.
:::

**Who defines the workflow.** The organization provides the boundaries, or the workflow itself. Depending on how much control it hands to the teams, a team can modify more or less of the workflow. This is an access control question more than a system question.

## 4. The Workflow Loop, phase by phase

In the example workflow a feature moves through six phases: spec, plan, build, agent review, human review and merge. Each part of the flow is configurable in the `pipeline.json`. Agents do the work, people co-create and sign off, and the Workflow Loop executes every phase and decides when it is done. [[1]]

How much of that a team switches on is configuration. Below are three mock pipelines on the same loop, from hands-off to a plan phase with sign-offs. Pick one and walk a ticket through it. You play the person: the flow stops at you wherever the pipeline needs one.

::: widget pipeline-flows full
Three mock pipelines on the same loop. They are examples, not the configuration of any product.

### Hands-off
@kind: example
@key: hands-off
@done: Merged. After your first sentence, no person was needed.
You say what you want. Agents make the tickets, build and review, and the loop checks every step.

### With approvals
@kind: example
@key: approvals
@done: Merged. You approved the tickets and the code. The loop did the rest.
The same flow with two moments for a person: approve the tickets before the build, and review the code before the merge.

### With a plan
@kind: example
@key: plan
@done: Merged. Three sign-offs are on record: the tickets, the plan and the code.
A plan phase comes between ticket and build: a planning agent drafts the technical design with a developer, who signs it off.

### Describe
@actor: person
@in: hands-off, approvals, plan
@card: you say what you want
@button: Describe the work
@waiting: Tell the system what you want built.
You described the work.

### Tickets
@actor: agent
@in: hands-off, approvals, plan
@card: an agent writes them
An agent turns your description into tickets with acceptance criteria.

### Ticket approval
@actor: person
@in: approvals, plan
@card: you check the tickets
@button: Approve the tickets
@waiting: Are these the right tickets?
You approved the tickets. The loop stores the approval.

### Plan
@actor: person
@in: plan
@card: you and a planning agent
@button: Sign off the plan
@waiting: A planning agent drafted the technical design with you. It needs your sign-off.
You signed off the plan. The loop stores the sign-off.

### Build
@actor: agent
@in: hands-off, approvals, plan
@card: agents write the code
@gate: The loop runs the gates on the build: green.
Agents build what the ticket describes.

### AI review
@actor: agent
@in: hands-off, approvals, plan
@card: a fresh agent
@gate: The loop runs the gates again after the review: green.
A fresh agent reviews the code and addresses what it finds.

### Code review
@actor: person
@in: approvals, plan
@card: you read the code
@button: Approve the code
@waiting: The code passed the gates and the AI review. Now it needs your review.
You approved the code.

### Merge slot
@actor: loop
@in: hands-off, approvals, plan
@card: one ticket at a time
@gate: The loop runs the gates on the merged result: green.
The ticket takes the merge slot. The loop merges main in.

### Merged
@actor: done
@in: hands-off, approvals, plan
@card: the work has landed
:::

### Intake: what arrives from the ticketing system

Tickets contain the business requirements. What the factory does with a ticket depends on what sits upstream.

- **With a business analysis and design workflow upstream,** the ticket is assumed to fit the factory's input requirements. If that workflow delivers specs, business analysis signs them off. An optional intake agent processes the spec to the software team's own standards, such as a format or acceptance criteria.
- **Without one, option 1:** an agentic intake form. An agent goes back and forth with the business on the requirements, analyses edge cases, and delivers a business spec with business sign-off.
- **Without one, option 2:** the Workflow Loop ingests the ticket and the design, and alerts one or more team members to refine it and review the spec.

What a ticket needs before it enters is a definition-of-ready question. A ticket labelled as a backend job does not need a design, for example. Once a ticket is labelled ready, it becomes input for the factory.

### Spec and plan

A spec is a co-creation between a human and an agent. MCP servers can expose relevant company resources, such as product databases, and a knowledge graph or RAG can let agents search the company documentation. The spec is reviewed and signed off, and the sign-off is stored for traceability.

The Workflow Loop then notifies a developer that a plan is needed. Developer and planning agent work out a technical design from the signed-off spec, the constitution and the architecture guardrails. The developer who co-created the plan signs it off.

**The constitution.** Similar to Spec Kit, the constitution holds the ground rules of the repository: the stack, the way of working, the definition of done. It is an input to planning and building, and one of the things compounding can improve.

### Build and agent review

The agents build what the plan describes, from the spec, the plan, the constitution, the architecture guidelines and the repository.

Then an agent merges main into its own branch, and an adversarial reviewer does a first pass over the code and addresses the findings. If the reviewer itself changed more than a configurable number of lines, 500 for example, that can trigger a re-review.

### Human review and merge

If the workflow asks for a human review, there are two ways to do it. With a **pull request**, the factory opens it, the team reviews there, and CI runs in the pull request environment. With **IDE and dashboard**, the developer reviews in their IDE and approves in the dashboard. Which way it works must be configurable, so it fits the team.

Merging is either left to the version control system or orchestrated by the Workflow Loop. Either way it is guarded by the loop's gates and the repository's CI. Hooks keep agents from modifying CI to get through it.

## 5. Gates: the checks the agent cannot skip

At fixed points in the process the work has to pass the gates, and the agent is not trusted to run them itself. Gates are part of the agent's harness, but the Workflow Loop runs them, and only when they pass does the task move to the next phase. [[1]]

Gates are things like the compiler and typechecker, the linter, unit, integration and end-to-end tests, architecture tests, security scanning and SonarQube.

::: widget gate-bench
What happens when a gate fails. Press the buttons to play the outcomes of one gate run.
:::

**Where gates run.** In the build workspace when the agents finish, again after the latest main is merged in before review, after the review changes, and on the merged result right before it lands. Spec and plan have no gates of their own beyond the definition of ready and the sign-offs.

**Gates and CI.** Where the gates run depends on where the work goes. When a pull request is made, CI runs on the pull request, and when a merge is done, CI runs on the merge. When the work stays local, or the Workflow Loop is in control of merges, the loop runs the gates itself. When the pull request merges the work, the loop is only notified of the merge, through triggers from GitLab or GitHub.

## 6. Fitting into the company's systems

The factory lives next to the ticketing system, the wiki and the codebase. Under every integration option sits one question: is Jira a report-out of the factory's state, or is it the actual state of the system? Letting Jira dictate the workflow has a downside: moving a ticket that is not done into the review lane could lead to user error. [[1]]

The paper's answer: **the ticketing board is an event source for input.** A ticket is selected by a filter, by a swimlane, or by whatever works for the team, and the selected ticket triggers the intake flow. From then on the factory holds the actual state, as a shadow of the ticket, and feeds updates back one way only: from the factory to the board.

### Hooks: the Workflow Loop moves the ticket

The Workflow Loop has hooks at fixed points in the workflow. At each one it can change the state of the ticket, so the board shows where the work is without anyone moving it by hand.

| Hook | Fires when |
| --- | --- |
| In development | The plan is signed off and the agents start building |
| In agent review | The build is done and the adversarial reviewer takes its pass |
| Ready for user review | The gates are green and the pull request waits for a team member |
| Ready for merge | The team member has approved and the final gates run |
| Done | The work is merged |

Which hooks are active, and which state each one sets, is part of the configuration, so the hooks can follow each team's own board. The hooks only write. A lane moved by hand is not read back as an instruction.

### Add or remove at any layer

A layer is any part of how the factory is set up. A developer can run the factory locally or it can run remotely. The ticketing system can be only the intake, or it can hold much of the loop's state. Adding or removing a factory in any of these places should not break any existing structure or require changes to it. The factory is a process, and the process works with the tools that are available.

::: widget boundary-explorer wide
Switch each company system off and on. The factory in the middle stays the same: it is a process, and it works with the tools that are available.

### Ticketing
@id: ticketing
@on: Jira or Azure DevOps is the event source. The factory keeps a shadow of the ticket and writes its state back one way, through the hooks.
@off: No ticketing system. The paper leaves this case open, beyond saying that the process works with the tools that are available. Foundry, in Part II, runs this way.

### Code host
@id: code-host
@on: The factory opens a pull request, CI runs there, and a trigger from GitHub or GitLab tells the loop about the merge.
@off: The work stays local, and the Workflow Loop runs the gates itself.

### Documentation
@id: documentation
@on: The factory writes documentation that follows the company's guidelines to Confluence or a published wiki.
@off: The factory writes no documentation.

### Chat
@id: chat
@on: Notifications also go to Slack or Teams.
@off: Notifications and the personal TODO list land in the personal dashboard.

### Cloud machines
@id: cloud-machines
@on: Factory machines run in the cloud behind the fleet manager, on a factory state shared across machines.
@off: One machine: a developer runs the factory on their own laptop.
:::

### Boundaries between teams

The boundaries of a team's factory are defined in the company's own systems. Factories of different teams should not communicate with each other. This isolates them and keeps them maintainable, and it is what lets a configured factory be added or removed without anything breaking.

::: widget team-boundaries wide
Factories never talk to each other. Work that crosses teams flows as it does today: each team gets its own tickets, and each team's factory picks up its own.
:::

A different tool could provide data model contracts and put them in both teams' tickets, but that tool lives outside the factory.

## 7. Compounding: how the factory improves

Compounding is the factory learning from its own past work. It measures finished features and sessions, and turns what it finds into proposed improvements. A person decides which of them are applied. [[1]]

::: widget compounding-loop wide
Compounding proposes, a human decides. The loop closes when the next features run on the improved factory and become case studies in turn. The order of steps 3 to 5 is one reading. An experiment is optional, and compounding can also work from the data alone.

### 1. Finished work
@id: finished-work
Finished features and sessions are measured, and past features serve as case studies.

### 2. Measure
@id: measure
Deterministic checks on past sessions and build statistics, plus agentic analysis of each feature. The lists below name the metrics.

### 3. Propose improvements
@id: propose
To the constitution, the agent briefs, the gates, the skills, model selection and more. The levers are listed below.

### 4. Experiment (optional)
@id: experiment
Re-run a past feature in isolation under a changed configuration, old against new. An experiment is a tool to use when wanted, not a required step.

### 5. A human decides
@id: decide
Nothing is applied automatically. Automatic application can lead to recursive overfitting on bad practice.

### 6. Improved factory
@id: improved
The next features run on the new configuration. The elements the team controls are versioned, and every compounded modification leaves an audit trail.
:::

### What to measure

Compounding runs on custom metrics. They can be part of the harness, but they do not have to be. There are two kinds.

**Deterministic checks on past sessions, and build statistics:** [anti-slop](https://github.com/dmmulroy/anti-slop) checks, lines of comments added, the number of times the gates failed, the amount of rework in agentic reviews, the amount of rework by humans, tokens used per phase, the duration of the gates, and code coverage by feature.

**Agentic analysis of each feature the loop processes:** test quality per criteria, adherence to the coding conventions, and code complexity. The criteria depend on the brief of the analysing agent, designed by the team or provided by the company.

It should be possible to create compounding metrics and experiment with them using AI assistance. Writing architecture tests is one example.

### What can be improved

::: widget improvement-levers wide kind=selector
Six areas compounding can propose changes to.

### The agents themselves
@tag: Briefs
Agent briefs for spec, plan, build and review. A brief is in effect the agent: the instructions the builders get, for instance.

### Guidance for agents
@tag: Guidance
The constitution, `agents.md` or `claude.md`, skills, the readme and the docs.

### Architecture
@tag: Architecture
Architecture descriptions, perhaps not editable by the team but injected by the Workflow Loop.

### Models
@tag: Models
Model selection and model effort.

### Checks
@tag: Checks
Gates, CI, and adding deterministic tooling.

### Codebase and platform
@tag: Platform
Technical debt in the codebase, and infrastructure.
:::

### Two rules

1. **It should run periodically.** Compounding either runs by itself periodically, or the factory reminds the team to run it, or users trigger it.
2. **Its outcomes are never applied automatically.**

Who approves an improvement depends on the team's way of working and on company policy. The company can whitelist the elements of the factory that the team controls, and the team can compound those. A proposal that affects the workflow is discussed with the team. Otherwise the developer can apply it.

**Improvements for the whole company.** Factories do not talk to each other, so the company connects them. Company policy sets how often teams compound, and the company monitors at its own level: burn rate per ticket and per story point, compounding metrics, compounding frequency. Each agent for a specific task is versioned, and the company could set up an "agent store" where teams share their agent configurations.

### Experiments on past features

Past features serve as case studies, and the scientific method applies.

::: widget experiment-steps kind=selector layout=rail
An experiment re-runs a delivered feature, so it is based on data.

### Take a past feature
@tag: 1
Take a past feature as the case study.

### Change a parameter
@tag: 2
Any of the levers above, changed manually or with AI assistance.

### Re-run in isolation
@tag: 3
The feature is built again in isolation, under the changed configuration.

### Compare old and new
@tag: 4
This can lead to an A/B test of the new configuration against the old one. It is judged both on the metrics and by a person. A team can create a dedicated quality agent, but ideally the change is scored against a suite of compounding metrics. The person can also fill in a small eval, which gives a score to calculate with and log.
:::

# Part II: Foundry

## 8. Meet foundry

[foundry](https://github.com/AlexDM0/foundry) is the repository where the first stage of this vision runs. It holds two apps. **forge** runs agents through a ticket board in one repository and lands their work on main once code has checked it. **Gaia** shows every forge on the machine in one window: what waits on you, every agent at work, every forge's controls. [[8]]

Since the release of 21 November 2026 the two are cleanly apart. The forge is headless: a loop of code runs the pipeline, a process supervisor commands every agent and gate process, and the CLI is the command surface. Gaia is the one interface, reached through a versioned API, and no forge needs it to do its job. [[3]]

::: screenshot gaia-attention
**Gaia, the attention list.** What waits on the owner across every forge on the machine.
:::

::: screenshot gaia-forges
**Gaia, the inventory.** Every local forge, running or not, with its controls.
:::

::: screenshot board-kanban
**A forge's board, Kanban.** Every ticket by where it stands: ready, building, in review, merge queue, done.
:::

::: screenshot board-intake
**Intake.** Describe a request and a product owner session starts: the agent questions the owner and drafts the ticket.
:::

::: screenshot board-pipeline
**The Pipeline tab.** One board's pipeline as phases, with the steps and gates of each and the tickets at them now.
:::

::: screenshot board-agents
**Agents.** Every job at work on the board, with its ticket, its budget, its subagents and the question that blocks it.
:::

### One ticket, from draft to merged

In foundry an agent's report is a claim, and code decides. From the moment the owner readies a ticket, code moves it on the normal path. [[4]]

::: widget foundry-ticket-path wide kind=selector layout=rail
A ticket's path in foundry. Select a step to see who moves it.

### Draft
@tag: You and an agent
You describe the work. A product owner agent questions you and files a draft ticket with numbered acceptance items.

### Ready
@tag: You
By default a finished draft waits until you ready it. From here on, on the normal path, code moves the ticket.

### Building
@tag: The loop
The loop starts a builder in a worktree of its own. The builder commits, then reports. Code checks the report against git, and the gates run on the final commit. A red gate resumes the same session, at most twice, and then the ticket is parked for you.

### In review
@tag: The loop
If the pipeline sets a review, a fresh reviewer judges each acceptance item and fixes the defects it finds. An unmet item sends the ticket back to its builder. An optional re-review runs when the fixes change more lines than a configured threshold.

### Merge slot
@tag: The loop
One ticket at a time. The loop merges the target into the ticket's branch, runs the gates on the merged tree, and fast-forwards the target only if it has not moved since.

### Merged
@tag: Done
Done means merged.
:::

## 9. Where foundry lives in the vision

Foundry is the concept's local case: one trustworthy factory, for one owner, on one machine, without a ticketing system. It runs the core loop in depth and leaves the company around it for later stages. [[2]]

::: widget vision-map wide kind=status-table
Each part of the vision, and what foundry has for it today.

### Deterministic Workflow Loop
@status: built
@foundry: A loop of code
The loop runs one pass at a time. Its policy is a pure function that decides what runs next: which jobs launch or resume, which tickets park, which decisions open. An agent's report counts for nothing until code has checked it.

### Agents inside phases
@status: built
@foundry: A process supervisor
One supervisor per board runs every agent, gate and install process, with a lease, event logs and a clean quit. Parallelism is capped per board and per machine.

### Gates the agent cannot skip
@status: built
@foundry: Gates run by the loop
Sandboxed on macOS and Linux, after build, after the target is merged in, after review and on the merged tree. A red gate resumes the session twice, then parks the ticket for the owner. The concept took this rule over from foundry.

### Spec, co-created and signed off
@status: built
@foundry: Intake and the ticket
A product owner agent questions the owner and drafts the ticket. By default only the owner marks it ready. The spec is the ticket body, with acceptance criteria and a brief.

### Constitution
@status: built
@foundry: `CONSTITUTION.md`
At the repository root, drafted with the pipeline agent.

### Agent review and re-review
@status: built
@foundry: A separate reviewer
It judges each acceptance item and fixes the defects it finds. An unmet item goes back to the builder. An optional re-review runs when the fixes change more than a configured number of lines.

### Guarded merge
@status: built
@foundry: A merge slot
It gates the merged tree and fast-forwards only if the target has not moved.

### Traceability
@status: built
@foundry: The log and the crash records
A log of decisions, gate manifests and instruction hashes. Crash logs, reconciliation at every start, and a checked handover between instances of the loop.

### Personal dashboard
@status: built
@foundry: Gaia
Gaia shows every forge on the machine, with an attention list: the personal dashboard, for one owner.

### A workflow defined in `pipeline.json`
@status: partly
@foundry: A pipeline file that tunes fixed stages
The file tunes models, effort, gates, review, approvals and budgets, but the stages themselves are code.

### Human review
@status: partly
@foundry: An accept in Gaia or the CLI
An optional approval before the merge, without pull requests.

### Shared factory state
@status: partly
@foundry: A store port
Board state goes through one store port, with a local-files adapter. The seam for a remote store exists. The remote store does not.

### Factory monitoring and notifications
@status: partly
@foundry: Per forge, on macOS
Cost and token monitoring stop at one forge, and notifications are macOS only.

### Plan phase with sign-off
@status: not-yet
@foundry: Roadmap stage 3
There is no separate plan phase. The ticket carries the spec and a brief.

### Compounding
@status: not-yet
@foundry: Roadmap stage 2
A design, not built.

### Company systems and hooks
@status: not-yet
@foundry: Roadmap stage 4
No ticketing system, wiki or chat. Git never leaves the machine: there is no fetch, pull or push.

### Fleet manager and many machines
@status: not-yet
@foundry: Roadmap stage 5
One machine. Limits across boards on that machine are shared files.

### Teams, governance, agent store
@status: not-yet
@foundry: Roadmap stage 6
Single owner by design. Identity and permissions are left out on purpose.
:::

### What foundry's pipeline file tunes

In the concept each part of the flow is configurable. In foundry the stage list is code and a pipeline file tunes it. [[5]]

| Setting | What it tunes |
| --- | --- |
| Install steps | What runs before a job |
| Gates | The gate lines, and which of them run after build, after review and at the merge |
| Review | Whether a reviewer runs, and the re-review threshold in changed lines |
| Merge conflicts | Whether a conflict resolution gets a re-review, and its threshold in changed lines |
| Agents | Per role: the model tier, the effort and the ordered list of instructions the agent reads |
| Approvals | Whether the owner approves tickets and merges |
| Billing | Subscription, or API with an optional budget |
| Constitution | Where the constitution lives |
| Reach | Repository paths outside the project that a ticket may change |
| Codebases | Several codebases in one factory, each with its own gates, review and agents |

## 10. The architecture

This is the shape of foundry today, in the concept's own words. Select a part to read what it does. [[3]]

::: widget foundry-architecture full
One Gaia per machine, one forge per board. A single narrow path joins them: the API the forge serves, with versioned reads and one command endpoint.

### Gaia's page
@id: gaia-page
**One interface for every forge of the machine, in one design.** A browser window shows every forge side by side, and a forge can open maximized in a tab of its own. Its parts: the inventory of local forges, the board views, the conversations with hosted agents, and warnings when a forge is down. The board has ten tabs: Kanban, Waves, Progress, Epics, Tickets, Agents, Questions, Assistant, Intake and Pipeline.

### Gaia's server
@id: gaia-server
**The only client of a forge.** It serves the interface and relays between the page and each forge. It has three ways out: a forge client that speaks one forge version, a registry reader that knows which forges exist, and a CLI runner for start, stop and set up. Gaia holds no pipeline state: with Gaia closed, every forge still does its full job.

### API
@id: api
**Versioned reads, streams and one command endpoint, on loopback.** There is no page, no browser session and no rendered HTML in the forge. Everything that serves a client lives in Gaia.

### Agent requests
@id: agent-requests
**How agents ask for things.** An agent relays its commands to the loop, and each request is judged by the role of the job that sent it.

### Command handling
@id: command-handling
**One service applies every command,** whether it arrives from the CLI, from an agent's request or from the API.

### The loop
@id: loop
**One pass at a time, following a pure policy.** A pass observes, changes the board in one lock hold, then acts. The policy is a pure function: facts in, next steps out. Launching a job, stopping one and landing on a target all happen inside the pass, and nowhere else.

### Verification and gates
@id: verification
**Nothing an agent says counts until code has checked it.** Every ticket is built in a worktree of its own. Code checks what a session left against git, the ticket and the report. It refuses, among other things, rewritten history, a dirty worktree, changes outside the ticket's home and reach, and changes to gate definitions or agent configuration. Then the gates run.

### Merge slot
@id: merge-slot
**Merge, gate, land.** The loop merges the target into the ticket's branch, gates the merged tree, and lands it only if the target has not moved.

### Recovery
@id: recovery
**One loop per board, and a truthful record after a crash.** A starting loop first reconciles the record with what it finds. It starts no work: resuming waits for the owner.

### Process supervisor
@id: supervisor
**One per board, the commander of every child process.** It starts agents, gate lines and install lines, keeps their event logs and reports back. It outlives a restart of the loop, so a code update kills no agent, and it stops its agents after one minute without contact from the loop.

### Child processes
@id: child-processes
**Builder sessions, reviewer sessions and gate lines.** A gate line is a confined command. On macOS and Linux no gate and no session runs unconfined.

### The CLI
@id: command-line
**Every state change.** A verb writes a command to the store and nudges the loop. It launches nothing itself, which is why the terminal keeps working when the loop is down. Agents change state through the same CLI.

### The store
@id: store
**Records behind a store port, on local files first.** The CLI writes commands to it, the loop watches it and writes state. Only one adapter names a record's path, so a remote store stays possible.

### Ports and adapters
@id: ports
**The core names no platform, no vendor and no record path.** An operating system port (new work is proven on macOS first; the Linux and Windows adapters are kept), an agent port (Claude Code is the one adapter today) and the store port (local files first).

### Registry file
@id: registry
**Forges register themselves.** Gaia reads the registry to know which forges exist on the machine.
:::

## 11. The road ahead

Stage 1 is foundry today. The stages after it take foundry toward the factory one layer at a time. The order is a proposal, not a settled plan. It is set by what each stage needs from the ones before it. Two of the stages hold a decision, marked with a diamond. [[2]]

::: widget roadmap wide
Seven stages and two decisions. Select a stage.

### One trustworthy factory
@stage: 1
@chapters: Chapters 3 to 5
@starts: this is where it stands
The core loop in depth, for one owner on one machine: a deterministic loop, supervised agents, intake and spec, a constitution, gates run by the loop, agent review, a guarded merge, traceability and recovery, one window, and a store port.

### Compounding
@stage: 2
@chapters: Chapter 7
@starts: A design of 16 November, not built
Measure finished work, propose improvements, optional replay experiments, and a human decides. Compounding needs nothing outside the machine, which is why it comes first. Foundry already logs what compounding measures. Building it gives every later stage a way to measure itself.

### A configurable workflow
@stage: 3
@decision: Do the stages move into configuration, or does the vision settle for a fixed backbone with configurable steps?
@chapters: Chapters 3 and 4
@starts: The `pipeline.json` tunes fixed stages
Stages as configuration, a plan phase with sign-off, and hooks at each phase change. The plan phase adds a planning agent, the developer's sign-off, and tickets or tasks made from spec and plan. Stage 4 needs the hooks to set a ticket's state.

### Company systems at the boundary
@stage: 4
@chapters: Chapter 6
@starts: Nothing; git never leaves the machine
Here the boundary moves from the git repository to company-owned systems. A ticketing adapter reads Jira or Azure DevOps as an event source, keeps the factory's shadow state and writes the ticket's state back one way through the hooks. Pull requests and remote CI come in, so foundry's git code starts to fetch and push. Docs go to Confluence and notifications to Slack or Teams. Every adapter stays optional, so the local factory of stage 1 keeps working.

### Shared state, many machines
@stage: 5
@decision: The loop's pass cannot work over a remote store without a redesign.
@chapters: Chapter 3
@starts: A store port
The store port is the seam. A remote adapter puts the factory state in a database shared across machines, so machines can run anywhere and a fleet manager can balance agents over them.

### Teams and the company
@stage: 6
@chapters: Chapters 1, 6 and 7
@starts: Single owner by design
Identity, team members and a personal dashboard per member. Spec reviewers by label. The company whitelisting what a team controls. Governance above the factory, company-level monitoring, and an agent store where teams share versioned agents. This stage is mostly new work.

### Other workflows
@stage: 7
@chapters: Chapter 1
@starts: Software only
Business analysis and design become factories of their own and feed the software factory through the company's systems. Once stages 3 and 4 make the workflow configurable and the boundary company-owned, another workflow should be largely a new configuration.
:::

### What foundry brings that the vision should keep

Foundry spends most of its design on making one factory trustworthy, which the concept covers in a sentence or two. These should survive every stage: [[2]]

- **Verification.** Every agent claim is checked against git before it counts, and commits that touch gate definitions, agent configuration or hooks are refused. [[9]]
- **Confinement.** On macOS and Linux, sessions and gates run sandboxed, with home and reach limits on what a ticket may change.
- **Process supervision.** One supervisor for every agent and gate process, with a lease, event logs and a clean quit.
- **Crash recovery.** Reconciliation at every start, and a checked handover between instances of the loop.
- **Several codebases.** One factory can hold several codebases, each with its own gates and review.
- **Waivers.** Only the owner can waive an acceptance item.

## 12. How it got here

Foundry was not designed top-down from the concept. It grew out of two earlier projects, and each step answered a question the one before it raised.

::: widget history wide
Three repositories between 19 September and 21 November 2026. The dashed line marks where forge's history leaves agent-progress's. Select a milestone.

### agent-progress
@kind: lane
@start: 2026-09-19
@end: 2026-11-06
@shared-until: 2026-10-28
@link: https://github.com/AlexDM0/agent-progress

### agent-dashboard
@kind: lane
@start: 2026-10-21
@end: 2026-10-25
@link: https://github.com/AlexDM0/agent-dashboard

### forge
@kind: lane
@start: 2026-10-27
@end: 2026-11-21
@link: https://github.com/AlexDM0/foundry

### Gaia
@kind: lane
@start: 2026-11-12
@end: 2026-11-21
@link: https://github.com/AlexDM0/foundry

### A progress tracker with tickets
@kind: event
@lane: agent-progress
@date: 2026-09-19
@commit: 973eeb51
The first commit: a Bun CLI that tracks an AI orchestrator's work per repository, with tasks as rows on a Gantt chart, markdown tickets, a log and a dashboard page that reloads itself.

### One worktree per ticket
@kind: event
@lane: agent-progress
@date: 2026-09-21
@commit: 29dc8f3d
Every ticket has to be picked up on a worktree of its own.

### Reviewers that fix what they find
@kind: event
@lane: agent-progress
@date: 2026-09-22
@commit: 2104cf16
Reviewers fix their own findings, and a second review is gated on 750 reworked lines of code. The concept's re-review threshold starts here.

### A dispatcher
@kind: event
@lane: agent-progress
@date: 2026-09-23
@commit: 425d9c6a
A concurrency limit and an atomic ticket claim: the tracker starts to hand out work.

### The Kanban tab
@kind: event
@lane: agent-progress
@date: 2026-09-25
@commit: 96547203
The board becomes the place to watch tickets move.

### Every board on one page
@kind: event
@lane: agent-dashboard
@date: 2026-10-21
@commit: cf04949
The first version of agent-dashboard: a live overview of every agent-progress project, with each board in an iframe. It was built on an agent-progress board of its own.

### A side-by-side second version
@kind: event
@lane: forge
@date: 2026-10-27
@commit: 5374f849
The product names are routed through one constant and the build becomes `agent-progress-v2`, installed beside the first version. The two run side by side: agent-progress's own main line continues into November.

### Code verifies, code drives
@kind: event
@lane: forge
@date: 2026-10-28
@commit: faf27468
The idea that defines the second version arrives in code: code starts to check what an agent left before it counts, and a runner drives each ticket's lifecycle. A live page and a guarded merge follow the next day.

### Renamed to forge
@kind: event
@lane: forge
@date: 2026-11-09
@commit: a1be0b4a
The side-by-side build is renamed from `agent-progress-v2` to forge.

### Gaia starts
@kind: event
@lane: Gaia
@date: 2026-11-12
@commit: 51654f2
A fresh repository for one window over every forge. It does not descend from agent-dashboard's code.

### One monorepo
@kind: event
@lane: forge
@date: 2026-11-15
@commit: e50aaacb
forge moves into `apps/forge` and Gaia's repository is imported with its history into `apps/gaia`. The next day the repository is renamed foundry.

### The core apart from its interface
@kind: event
@lane: forge
@date: 2026-11-17
@commit: 5285da34
The design that takes the interface out of the forge core. The branch that builds it starts the day after and lands on main on 21 November.
:::

**agent-progress: see the work happen.** [agent-progress](https://github.com/AlexDM0/agent-progress) began on 19 September 2026 as a tracker. An orchestrator session registered a row before it spawned each subagent, and, in the words of its first README, "the person watching keeps one browser tab open and sees the work happen". Within a week it had worktrees per ticket, reviewers, a dispatcher and a Kanban board. It had become the thing that hands out the work. [[6]]

**agent-dashboard: every board on one page.** One board per repository raised the next question: what about all of them? [agent-dashboard](https://github.com/AlexDM0/agent-dashboard) answered it in five days in October, with a page that shows every agent-progress board on the machine, each in an iframe. [[7]]

**forge and Gaia: do not take the agent's word for it.** In agent-progress an orchestrator session drove the work. That is an agent deciding what happens next. The second version turned that around: "Agents report, code decides." Code owns each ticket's path from ready to merged, and a report is a claim that is checked against git. That version became forge, which is agent-progress's history carried on under a new name: the foundry repository still holds every commit back to the first. Gaia took agent-dashboard's place. It first embedded each forge's page, as agent-dashboard did. Since the release of 21 November every view is Gaia's own. On 16 November the repository that holds both was renamed [foundry](https://github.com/AlexDM0/foundry). [[4]] [[8]]

**A second driver: agents that start their own subagents.** In agent-progress the workers were subagents of one orchestrator session. In forge every builder and reviewer is a full session of its own, started by code. That lets an agent fire up subagents of its own for the work inside its ticket.

The written concept came last. It takes what foundry does for one owner on one machine and asks what a team and a company would need around it. Part II's roadmap is the way back from that answer to the code.

## Sources

1. *Agentic Software Factory*, the concept document by Alex de Mulder, 20 November 2026. [claude.ai/artifact/AjfAP5hJDYQrZT8dcAcbKc](https://claude.ai/artifact/AjfAP5hJDYQrZT8dcAcbKc)
2. *Foundry on the road to the factory*, the second tab of the same document, 20 November 2026.
3. `docs/monorepo/hephaestus-talos.md` and its figures, in [github.com/AlexDM0/foundry](https://github.com/AlexDM0/foundry).
4. `apps/forge/docs/concepts/overview.md` and `ticket-lifecycle.md`, same repository.
5. `apps/forge/src/lib/tracker-model/@types/Pipeline.ts`, same repository.
6. Git history and README of [github.com/AlexDM0/agent-progress](https://github.com/AlexDM0/agent-progress).
7. Git history and README of [github.com/AlexDM0/agent-dashboard](https://github.com/AlexDM0/agent-dashboard).
8. Git history and README of [github.com/AlexDM0/foundry](https://github.com/AlexDM0/foundry).
9. `apps/forge/src/services/lifecycle/Customs.ts`, same repository.
