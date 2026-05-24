# PROJECT MEMORY — Persistent Context

> This file is the SINGLE SOURCE OF TRUTH. Every session MUST read this first.
> Last Updated: 2026-05-24

---

## PROJECT IDENTITY

- **Name:** AION
- **Type:** Multi-Agent Autonomous Software Development Platform
- **Goal:** Build a prototype where 6 AI agents work together autonomously to build, test, and ship full apps
- **Host Target:** Render (free tier)
- **Budget:** $0
- **Stack:** Next.js 16, z-ai-web-dev-sdk, Prisma, Tailwind, shadcn/ui

---

## THE 6 AGENTS

| # | Role | Seniority | Domain |
|---|------|-----------|--------|
| 1 | Lead CTO | Chief | Orchestrates everything. Plans, delegates, reviews, overrides. |
| 2 | Frontend Lead | Senior | React, Next.js, UI/UX, components, styling, responsiveness |
| 3 | Backend Lead | Senior | API routes, database schema, auth, server logic |
| 4 | QA Engineer | Senior | Testing, validation, bug catching, code review |
| 5 | DevOps Lead | Senior | Build, deploy, GitHub push, URL testing, monitoring |
| 6 | Business Strategist | Senior | PRD, market fit, feature prioritization, user stories |

---

## KEY DECISIONS MADE

1. Lead Agent (CTO) is the orchestrator — it delegates, reviews, and has override authority
2. Agents communicate through a shared Project Board (not direct chat)
3. Anti-hallucination is the #1 priority — every agent must be grounded
4. Autonomous loop: agents work continuously until app is live and URL tested
5. Max 3 retries per task before Lead Agent intervenes
6. QA gate is mandatory — nothing ships without passing tests
7. DevOps tests live URLs after deployment
8. Personal use prototype — simple auth or no auth initially
9. GitHub integration via Personal Access Token (user to provide)
10. Render deployment target (free tier)

---

## USER REQUIREMENTS

- 5 specialist agents + 1 lead agent = 6 total
- All agents are "senior devs" in their field
- Business-oriented agent included
- Must work continuously until full app is built and working
- Must be able to ship to GitHub
- Must test the deployed URL
- Must run on a small personal computer
- Must be autonomous — like an autonomous agent
- NO hallucination — must be "perfect"
- Needs a memory system to prevent context loss

---

## ANTI-HALLUCINATION PRINCIPLES (User's #1 Concern)

1. Every agent must reference the Project Board — never invent facts
2. Code must be validated (build + run) before it's "done"
3. Each agent has strict boundaries — no crossing into other domains
4. Lead Agent cross-checks all outputs against the PRD
5. File locking prevents conflicting writes
6. Shared state prevents agents from contradicting each other
7. Timeout + retry limits prevent infinite loops
8. Agent outputs are structured (not free-form) — parsed and validated

---

## IMPLEMENTATION PROGRESS

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 1: Core Engine + Lead Agent | ✅ COMPLETE | All 6 agents, orchestrator, board manager, chat UI, API routes |
| Phase 2: Real Execution Engine | ✅ COMPLETE | Workspace Manager, Command Runner, File System writing, Dashboard |
| Phase 3: QA Agent | ✅ COMPLETE | Real build execution, code review, QA gate enforcement, validation gates |
| Phase 4: DevOps Agent | ✅ COMPLETE | Real build verification, git operations, URL testing, deployment configs, deployment pipeline |
| Phase 5: Business Agent | NOT STARTED | Agent exists, PRD generation tested |
| Phase 6: Autonomous Loop | PARTIAL | Basic loop works, needs full end-to-end cycle testing |
| Phase 7: UI Polish | NOT STARTED | Basic UI works |

---

## OPEN QUESTIONS

1. ~~Project name?~~ — DECIDED: **AION**
2. GitHub PAT — User to provide when ready
3. Deploy target — Render only? Or also Vercel/Netlify?
4. Auth — Simple password? None? NextAuth?

---

## SESSION LOG

### Session 1 (2026-05-24)
- Discussed cto.new and its multi-agent approach
- User wants something MORE powerful, for $0, hosted on Render
- Defined 6 agents: CTO, Frontend, Backend, QA, DevOps, Business
- User's top concern: NO hallucination, wants "perfect" system
- User requested a comprehensive plan + memory system
- Created Master Plan document (15 sections)
- Created project memory file
- Created 7-layer anti-hallucination architecture
- Created 3-layer memory system
- Defined all agent system prompts

### Session 2 (2026-05-24)
- User named the project: **AION**
- Updated all documentation with project name
- Ready to begin Phase 1: Foundation

### Session 3 (2026-05-24)
- Continued from previous session — user confirmed to proceed
- Built Phase 2: Real Execution Engine
- Created Workspace Manager — writes files to actual filesystem
- Created Command Runner — executes npm install, build, typecheck
- Enhanced Orchestrator with full autonomous loop (runAutonomousCycle)
- Created /api/orchestrate endpoint (step, cycle, build, status)
- Created Project Dashboard page (/project/[id])
- Enhanced Chat UI with Auto and Dashboard buttons
- TypeScript: PASS, Build: PASS
- All 7 routes working including /api/orchestrate and /project/[id]

### Session 4 (2026-05-25)
- Continued from previous session — user said "Next"
- Built Phase 3 QA Agent enhancements (completed in earlier session, memory was stale)
- Built Phase 4: DevOps Agent with Real Execution
- Completely rewrote DevOps Lead Agent with real build execution, git operations, URL testing
- Enhanced Command Runner with git operations (init, add, commit, push, status)
- Added deployment readiness checks to Command Runner
- Enhanced Orchestrator with deployment pipeline (config files, deployment records, URL verification)
- Added DevOps types (DevOpsChecklist, DeploymentResult, GitOperationResult)
- DevOps agent now follows QA agent pattern: real execution → AI analysis → structured result
- DevOps pipeline: verify workspace → install deps → build → git init → git commit → create deployment configs → URL test
- Build: PASS, TypeScript: PASS
