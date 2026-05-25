# AION V1 Design

## Summary

AION v1 is a phone-first and desktop-capable CTO command center backed by a trusted execution worker. The hosted control plane handles conversation, project context, approvals, logs, and artifact review. A worker process running on the user's own machine performs repo operations, terminal commands, browser automation, scraping, testing, and code execution inside repo-scoped workspaces.

The product promise for v1 is:

`AION is your mobile-first CTO console for up to 3 active repos, backed by a trusted worker that can inspect, modify, test, browse, and prepare ship-ready changes with approval checkpoints.`

## Product Goals

- Deliver a premium, high-trust experience on both phone and desktop.
- Make AION feel like a sharp senior technical operator, not a noisy swarm of bots.
- Support up to 3 active repos with strong workspace isolation.
- Let the user control real repo, shell, and browser work from a hosted interface.
- Keep risky actions approval-gated while allowing low-risk autonomous execution.

## Non-Goals

- Fully hosted autonomous execution inside Render.
- Complex multi-user collaboration and enterprise permissions.
- Cross-repo coordinated code changes in a single autonomous run.
- Unlimited long-term memory across every project.
- Richly differentiated public personalities for every specialist agent.

## Architecture

### 1. Control Plane

The control plane is the hosted AION web app. It should run on Render for v1 and provide the primary user experience on phone and desktop.

Responsibilities:

- Chat interface with the Lead CTO.
- Repo and workspace overview for up to 3 active repos.
- Approval queue for high-risk actions.
- Live run status, logs, screenshots, diffs, and test results.
- Persistent conversation, task, and artifact history.
- Delegation summaries from the Lead CTO.

The control plane is the authoritative source for user intent, approval state, and run history, but it is not responsible for filesystem-heavy or browser-heavy execution.

### 2. Execution Worker

The execution worker runs on the user's own machine. It connects to the control plane, polls or subscribes for approved work, executes tasks inside a repo-scoped workspace, and streams results back.

Responsibilities:

- Clone, fetch, pull, branch, diff, commit, and push repos.
- Run repo-scoped terminal commands.
- Open browser sessions, visit URLs, scrape public pages, and capture screenshots.
- Run tests, builds, linting, and debugging commands.
- Capture artifacts and execution logs.
- Enforce local execution boundaries before carrying out work.

This worker is the trusted execution engine. The control plane tells it what to do; the worker performs the action and reports back.

### 3. Repo Workspaces

Each repo gets its own isolated workspace. AION v1 supports up to 3 active repos.

Each workspace contains:

- Local clone path
- Repo metadata
- Run history
- Approval history
- Browser/debug session history
- Artifact links for diffs, logs, screenshots, and test output

Every mutating action must be associated with a specific repo workspace.

### 4. Lead CTO Layer

The Lead CTO is the dominant user-facing voice. It interprets user intent, shapes project direction, delegates internally, and reports back with clear, senior-level judgment.

Personality requirements:

- Sharp and concise
- Technically rigorous
- Commercially aware
- Honest when the idea or implementation is weak
- Calm and action-biased
- Non-preachy and low-friction

The Lead CTO should sound like an elite senior operator, not a motivational chatbot.

### 5. Specialist Agents

Specialist agents work mostly behind the scenes. Their role is to produce useful outcomes, not to compete for user attention.

Initial specialist set for v1:

- Backend
- Frontend
- QA
- Research
- Browser
- DevOps

These agents report upward to the Lead CTO. Their detailed output is available via drill-down panels, but their personalities remain mostly invisible by default.

## Interaction Model

### Default Experience

The user talks to the Lead CTO. The CTO provides:

- Judgment on the project or issue
- A clear plan of action
- Delegation summaries
- Progress updates
- Requests for approval at meaningful checkpoints

The user should not be forced to watch every internal agent exchange.

### Drill-Down Experience

When the user wants details, AION exposes internal execution artifacts:

- Terminal output
- Git actions
- Changed files and diffs
- Browser screenshots
- Visited URLs
- Test and build results
- Specialist activity logs

This creates a premium product feel: one strong front-stage operator with transparent backstage machinery.

### Phone and Desktop UX

The experience should work equally well on phone and desktop, with mobile treated as first-class.

Core interface regions:

- Chat pane with the Lead CTO
- Live run rail showing active tasks and statuses
- Approval queue for risky actions
- Workspace tabs for up to 3 repos
- Drill-down panels for logs, diffs, screenshots, browser activity, and test reports

On phone, the design must prioritize thumb-friendly layouts, condensed status cards, and fast transitions between the chat layer and execution detail views.

## Approval Model

The safety posture for v1 is approval-first autonomy.

### Low-Risk Actions

These can run autonomously inside a repo workspace:

- Inspecting repos and reading files
- Researching documentation
- Running non-destructive commands
- Running tests, builds, and linting
- Visiting public URLs
- Scraping public pages
- Preparing code changes
- Preparing commits and push plans

### High-Risk Actions

These require explicit approval:

- `git push`
- Production deploys
- Credentialed browser actions
- Writing or changing secrets or environment configuration
- Destructive shell commands
- Destructive database migrations
- Large-scale deletion or mutation of files

### Approval UX

Every approval request must show:

- Target repo/workspace
- Plain-English explanation of the action
- Expected outcome
- Command preview, diff summary, or deploy target when relevant

Every approval decision must be logged permanently.

Trust is scoped per repo/workspace, not globally.

## Execution Capabilities

AION v1 should support the following capabilities reliably:

- Clone, pull, inspect, and manage up to 3 repos
- Run repo-scoped terminal commands
- Edit files and prepare code changes
- Run build, lint, and test flows
- Visit URLs and scrape public pages
- Run browser debugging and E2E-style checks
- Capture screenshots and execution artifacts
- Prepare commits
- Request approval for push or deploy

## Runtime Boundaries

The product must not pretend the hosted app can perform local execution directly. The hosted app coordinates; the worker executes.

Rules:

- No mutating action runs without a workspace target.
- No risky action runs without approval.
- No global repo mutation occurs across multiple repos in one step in v1.
- Read-only research can run outside a repo workspace.

## Information Flow

1. User sends an instruction to the Lead CTO.
2. Lead CTO interprets it and decides whether to answer directly, delegate internally, or schedule execution.
3. Control plane creates run items tied to a repo workspace.
4. Execution worker picks up approved work and performs the action.
5. Worker streams progress, logs, and artifacts back to the control plane.
6. Specialist outputs roll up to the Lead CTO.
7. Lead CTO reports status, decisions, blockers, and approval requests to the user.

## V1 Success Criteria

- A user can operate AION comfortably from a phone.
- A user can manage up to 3 repos with clean workspace separation.
- AION can pull repos, run commands, inspect code, visit URLs, and produce useful artifacts.
- AION can prepare code changes and pause for approval before `git push`.
- The Lead CTO experience feels premium, senior, and focused.
- The product feels like a serious operating system for software work, not a toy multi-agent demo.

## Risks And Mitigations

### Risk: Hosted app and execution runtime get blurred

Mitigation:

- Keep control plane and worker responsibilities strictly separate.
- Make the worker the only source of truth for local execution results.

### Risk: Too much noisy agent output

Mitigation:

- Keep the Lead CTO as the only dominant voice.
- Surface specialist activity as structured detail, not default conversation.

### Risk: Mobile UX becomes overloaded

Mitigation:

- Prioritize chat, approvals, and condensed run summaries on mobile.
- Make drill-down views optional and layered.

### Risk: Unsafe automation damages repos or accounts

Mitigation:

- Require approval for high-risk actions.
- Keep trust and permissions repo-scoped.
- Maintain a durable audit trail for actions and approvals.

## Implementation Decomposition

This design should be implemented in the following order:

1. Control plane support for multi-workspace execution and approval queue
2. Trusted worker protocol and repo-scoped execution model
3. Git and shell execution flows
4. Browser and URL inspection flows
5. CTO-first mobile and desktop interaction polish

## Final Position

The correct v1 is not a fully hosted autonomous company. It is a premium command center with a trusted worker. That is the shortest path to making AION feel powerful, credible, and genuinely useful on a zero-dollar budget.
