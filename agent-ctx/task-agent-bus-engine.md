# Task: Agent Message Bus Implementation

## Agent: Main Agent
## Task ID: task-agent-bus-engine
## Date: 2026-05-24

## Summary

Created `/home/z/my-project/src/lib/engine/agent-bus.ts` — the Agent Message Bus for the AION multi-agent orchestration system.

## What Was Built

### Exported Types
- `MessageType` — 'info' | 'question' | 'request' | 'response' | 'alert'
- `MessagePriority` — 'urgent' | 'normal' | 'low'
- `AgentMessage` — Full message type with id, from, to, type, priority, content, threadId, projectId, metadata, createdAt, readAt, expiresAt
- `AgentConversation` — Thread tracking with threadId, projectId, messages, participants, timestamps
- `BusSubscription` — Subscription with agentRole and callback

### AgentMessageBus Class Methods
1. **`send()`** — Send a message to a specific agent or broadcast; auto-indexes by agent/project/thread; notifies subscribers; resolves pending requests
2. **`broadcast()`** — Convenience wrapper for broadcast messages
3. **`getMessages()`** — Get messages for an agent in a project, sorted by priority then time; optional unread-only filter
4. **`markRead()`** — Mark a message as read
5. **`respond()`** — Respond to a message; auto-threads with original; routes reply back to sender
6. **`getThread()`** — Get all messages in a thread
7. **`subscribe()`** — Subscribe to real-time messages; returns unsubscribe function
8. **`getUnreadCount()`** — Count unread messages for an agent in a project
9. **`request()`** — Async request-response with timeout (Promise-based)
10. **`cleanup()`** — Remove expired messages, project-scoped or global
11. **`getConversations()`** — Get all threads for a project
12. **`getMessage()`** — Get message by ID
13. **`getMessageCount()`** — Total active messages
14. **`getStats()`** — Bus statistics for monitoring
15. **`destroy()`** — Graceful shutdown; rejects pending requests; clears all data

### Design Decisions
- **In-memory storage** using Maps and Sets for O(1) lookups
- **Multi-indexed**: messages indexed by ID, agent role, and project ID
- **Auto-cleanup**: 5-minute interval timer with `unref()` to not block process exit
- **Thread tracking**: Conversations auto-created when messages share a threadId
- **Request-response**: Promise-based with configurable timeout (default 30s)
- **Subscriber pattern**: Real-time callbacks per agent role with proper cleanup
- **Broadcast support**: Messages to all agents except sender, using AGENT_ROLES from aion types
- **Priority sorting**: Urgent > Normal > Low, then newest-first within priority

### Verification
- ESLint: Passes cleanly
- TypeScript: No errors from agent-bus.ts in full project tsc --noEmit
- Imports AgentRole and AGENT_ROLES from `@/lib/types/aion`
- Exports singleton `agentBus`
