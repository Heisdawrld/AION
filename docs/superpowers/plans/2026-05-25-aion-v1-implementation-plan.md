# AION V1 Implementation Plan

## Recommended Approach

Implement AION v1 by evolving the current hosted monolith into a clear split between:

- `Control plane`
- `Trusted execution worker`
- `Repo-scoped workspaces`
- `Approval-gated mutating actions`

The existing codebase already contains useful primitives for projects, workspaces, command execution, orchestration, and agent reporting. The fastest path is to reuse those primitives where possible, then refactor the data model and runtime flow around the approved v1 architecture rather than continuing to deepen the current fully hosted autonomous model.

## Phase 1: Reshape The Domain Model

Goal: move from a single generated-project model to a multi-workspace operator model.

### Changes

- Extend the Prisma schema to represent:
  - `Workspace` or `RepoWorkspace`
  - `Run`
  - `ApprovalRequest`
  - `ExecutionArtifact`
  - optional `BrowserSession`
- Keep `Project` as the top-level conversation and control-plane object.
- Attach up to 3 repo workspaces to a project.
- Move execution history out of generic agent/task logs into run-oriented records.

### Critical files

- [schema.prisma](C:/Users/Dawrld/Documents/Playground/AION/prisma/schema.prisma)
- [db.ts](C:/Users/Dawrld/Documents/Playground/AION/src/lib/db.ts)
- [board-manager.ts](C:/Users/Dawrld/Documents/Playground/AION/src/lib/engine/board-manager.ts)
- [aion.ts](C:/Users/Dawrld/Documents/Playground/AION/src/lib/types/aion.ts)

### Output

- New database model that can represent:
  - one CTO conversation
  - up to 3 repo workspaces
  - per-workspace runs
  - approval queue
  - artifacts and execution history

## Phase 2: Introduce Repo Workspace Management

Goal: stop treating workspaces as generated app folders and start treating them as repo execution targets.

### Changes

- Refactor `workspace-manager` to support:
  - attaching an existing repo
  - cloning a remote repo
  - pulling/fetching updates
  - tracking workspace metadata per repo
- Preserve workspace isolation by using one local directory per workspace.
- Remove the assumption that every workspace is a scaffolded Next.js app.
- Add guards to ensure all mutating actions stay inside the workspace root.

### Critical files

- [workspace-manager.ts](C:/Users/Dawrld/Documents/Playground/AION/src/lib/engine/workspace-manager.ts)
- [command-runner.ts](C:/Users/Dawrld/Documents/Playground/AION/src/lib/engine/command-runner.ts)
- [project route](C:/Users/Dawrld/Documents/Playground/AION/src/app/api/project/route.ts)

### Output

- Workspace layer can manage real repos, not just generated app sandboxes.

## Phase 3: Add Worker Protocol And Execution Queue

Goal: move real command, git, and browser execution out of the hosted app path.

### Changes

- Define a worker-facing API contract:
  - register worker
  - poll/fetch pending jobs
  - claim run
  - stream run events
  - upload artifacts
  - mark run success/failure
- Create run records in the control plane instead of executing actions inline in API routes.
- Add a lightweight worker process inside a new local runtime package or folder.
- Make the current hosted `terminal` route a control-plane endpoint that creates execution requests rather than directly invoking shell commands.

### Critical files

- [terminal route](C:/Users/Dawrld/Documents/Playground/AION/src/app/api/terminal/route.ts)
- [orchestrate route](C:/Users/Dawrld/Documents/Playground/AION/src/app/api/orchestrate/route.ts)
- [chat route](C:/Users/Dawrld/Documents/Playground/AION/src/app/api/chat/route.ts)
- [command-runner.ts](C:/Users/Dawrld/Documents/Playground/AION/src/lib/engine/command-runner.ts)

### New areas likely needed

- `src/app/api/worker/*`
- `worker/` or `mini-services/worker/`
- shared run-event types in `src/lib/types/`

### Output

- Hosted control plane coordinates work
- Worker performs real execution
- Phone-first usage becomes viable because the control plane no longer depends on Render being the executor

## Phase 4: Implement Approval Queue

Goal: require explicit approval for risky actions while keeping low-risk operations autonomous.

### Changes

- Add approval request records and statuses.
- Categorize actions:
  - low-risk
  - approval-required
- Block worker execution on unapproved high-risk jobs.
- Surface approval cards in the UI with:
  - target workspace
  - action summary
  - command or diff summary
  - approve/reject controls
- Ensure approval decisions are permanently logged.

### Critical files

- [middleware.ts](C:/Users/Dawrld/Documents/Playground/AION/src/middleware.ts)
- [board-manager.ts](C:/Users/Dawrld/Documents/Playground/AION/src/lib/engine/board-manager.ts)
- [dashboard page](C:/Users/Dawrld/Documents/Playground/AION/src/app/dashboard/page.tsx)
- [home page](C:/Users/Dawrld/Documents/Playground/AION/src/app/page.tsx)

### Output

- Approval-first autonomy is real in the product, not just described in the spec.

## Phase 5: Rework The CTO Flow Around Workspaces

Goal: make the Lead CTO the front-stage operator for repo execution, not just project generation.

### Changes

- Update chat/orchestration flow so the CTO can:
  - see attached workspaces
  - target a workspace when delegating
  - summarize specialist work as run-based outcomes
  - issue approval requests for push/deploy/destructive actions
- Keep specialists mostly invisible by default.
- Shift progress reporting from agent chatter to:
  - run summaries
  - artifacts
  - blockers
  - next actions

### Critical files

- [chat route](C:/Users/Dawrld/Documents/Playground/AION/src/app/api/chat/route.ts)
- [lead-cto.ts](C:/Users/Dawrld/Documents/Playground/AION/src/lib/agents/lead-cto.ts)
- [registry.ts](C:/Users/Dawrld/Documents/Playground/AION/src/lib/agents/registry.ts)
- [orchestrator.ts](C:/Users/Dawrld/Documents/Playground/AION/src/lib/engine/orchestrator.ts)

### Output

- AION feels like one elite CTO with backstage machinery, not a visible swarm.

## Phase 6: Add Browser And URL Operator Flows

Goal: support the web inspection and E2E-style workflows that matter to the product vision.

### Changes

- Introduce workspace-targeted browser jobs:
  - visit public URL
  - capture screenshot
  - collect console/network signal
  - record structured browser findings
- Defer credentialed flows behind explicit approval.
- Persist screenshots and browser artifacts in the control plane.

### Critical files

- [headless-browser.ts](C:/Users/Dawrld/Documents/Playground/AION/src/lib/engine/headless-browser.ts)
- `worker/browser-*`
- UI surfaces for artifacts and findings

### Output

- AION can inspect live apps and report back through the CTO in a way that feels real on phone and desktop.

## Phase 7: Premium Mobile/Desktop UX Pass

Goal: make the product feel expensive from the first serious demo.

### Changes

- Rework the current home/dashboard split into a clearer command-center experience.
- Add:
  - workspace switcher
  - active runs rail
  - approval inbox
  - artifact viewer
  - compact mobile navigation
- Keep the CTO conversation as the primary interaction layer.
- Make drill-down views secondary and fast.

### Critical files

- [page.tsx](C:/Users/Dawrld/Documents/Playground/AION/src/app/page.tsx)
- [dashboard page](C:/Users/Dawrld/Documents/Playground/AION/src/app/dashboard/page.tsx)
- [project detail page](C:/Users/Dawrld/Documents/Playground/AION/src/app/project/[id])
- shared UI components in [components](C:/Users/Dawrld/Documents/Playground/AION/src/components)

### Output

- AION looks and behaves like a premium operator console on both phone and desktop.

## First Implementation Slice

Start with the smallest slice that proves the architecture:

1. Add `RepoWorkspace`, `Run`, `ApprovalRequest`, and `ExecutionArtifact` models
2. Refactor workspace management to clone and track real repos
3. Replace direct terminal execution with queued run creation
4. Build a minimal local worker that claims runs and reports output
5. Add approval flow for `git push`
6. Surface run status and approval queue in the UI

This slice gives a credible end-to-end demo:

- attach repo
- run command from phone or desktop
- stream output
- prepare git action
- approve push

## Verification

### Data model verification

- Run Prisma generation and migration successfully
- Confirm a project can hold up to 3 repo workspaces
- Confirm runs, approvals, and artifacts persist and relate correctly

### Worker verification

- Start local worker and confirm it registers or polls successfully
- Queue a low-risk run from the control plane
- Confirm the worker executes it inside the correct workspace
- Confirm logs stream back and persist

### Approval verification

- Queue a `git push` action and confirm it pauses for approval
- Approve it from the UI
- Confirm worker resumes and records the final outcome

### Browser verification

- Queue a public URL visit job
- Confirm screenshot and findings are saved as artifacts
- Confirm CTO summary reflects the artifact results

### UX verification

- Test primary flows on mobile width and desktop width
- Confirm chat, workspace switching, run visibility, and approval handling remain usable on both

## Sequencing Notes

- Do not start with full agent expansion.
- Do not start with autonomous multi-repo coordination.
- Do not deepen server-side direct shell execution.

The first job is to make the control plane and worker split real. Once that exists, the rest of the product vision becomes achievable without fighting the platform.
