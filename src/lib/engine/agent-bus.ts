// AION — Agent Message Bus
// Enables agents to communicate directly with each other, not just through the orchestrator.
// Supports: direct messaging, broadcast, request-response patterns, priority queues,
// message expiration, thread tracking, and real-time subscriptions.

import type { AgentRole } from '@/lib/types/aion';
import { AGENT_ROLES } from '@/lib/types/aion';

// ============================================================
// TYPES
// ============================================================

export type MessageType = 'info' | 'question' | 'request' | 'response' | 'alert';
export type MessagePriority = 'urgent' | 'normal' | 'low';

export interface AgentMessage {
  id: string;
  from: AgentRole;
  to: AgentRole | 'broadcast';
  type: MessageType;
  priority: MessagePriority;
  content: string;
  threadId?: string;
  projectId: string;
  metadata?: Record<string, any>;
  createdAt: string;
  readAt?: string;
  expiresAt?: string;
}

export interface AgentConversation {
  threadId: string;
  projectId: string;
  messages: AgentMessage[];
  participants: AgentRole[];
  startedAt: string;
  lastActivityAt: string;
}

export interface BusSubscription {
  agentRole: AgentRole;
  callback: (message: AgentMessage) => void;
}

// ============================================================
// INTERNAL HELPERS
// ============================================================

/** Generate a unique message ID */
function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/** Generate a unique thread ID */
function generateThreadId(): string {
  return `thread_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/** Priority weight for sorting — higher number = higher priority */
const PRIORITY_WEIGHT: Record<MessagePriority, number> = {
  urgent: 3,
  normal: 2,
  low: 1,
};

/** Default message expiration: 24 hours from now */
const DEFAULT_EXPIRATION_MS = 24 * 60 * 60 * 1000;

/** Default request timeout: 30 seconds */
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

// ============================================================
// AGENT MESSAGE BUS
// ============================================================

export class AgentMessageBus {
  /** All messages stored by ID for fast lookup */
  private messagesById = new Map<string, AgentMessage>();

  /** Messages indexed by recipient agent role for fast retrieval */
  private messagesByAgent = new Map<AgentRole, Set<string>>();

  /** Messages indexed by project ID for project-scoped cleanup */
  private messagesByProject = new Map<string, Set<string>>();

  /** Threads indexed by thread ID */
  private threadsById = new Map<string, AgentConversation>();

  /** Threads indexed by project ID for project-scoped retrieval */
  private threadsByProject = new Map<string, Set<string>>();

  /** Active subscription IDs by agent role */
  private subscriptionsByAgent = new Map<AgentRole, Set<string>>();

  /** Internal subscription lookup by ID */
  private subscriptionById = new Map<string, BusSubscription>();

  /** Pending request-response promises — keyed by the original request message ID */
  private pendingRequests = new Map<
    string,
    {
      resolve: (message: AgentMessage) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
      fromAgent: AgentRole;
    }
  >();

  /** Interval handle for automatic cleanup */
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Run cleanup every 5 minutes to auto-expire old messages
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000);

    // Don't prevent the process from exiting
    if (this.cleanupTimer && typeof this.cleanupTimer === 'object' && 'unref' in this.cleanupTimer) {
      this.cleanupTimer.unref();
    }
  }

  // ============================================================
  // CORE METHODS
  // ============================================================

  /**
   * Send a message from one agent to another (or broadcast to all).
   * Returns the created message with its generated ID and timestamp.
   */
  send(message: Omit<AgentMessage, 'id' | 'createdAt'>): AgentMessage {
    const now = new Date().toISOString();
    const fullMessage: AgentMessage = {
      ...message,
      id: generateMessageId(),
      createdAt: now,
    };

    // Store the message
    this.messagesById.set(fullMessage.id, fullMessage);

    // Index by recipient
    if (fullMessage.to === 'broadcast') {
      // Broadcast: index for every agent except the sender
      for (const role of AGENT_ROLES) {
        if (role !== fullMessage.from) {
          this.getAgentMessageSet(role).add(fullMessage.id);
        }
      }
    } else {
      this.getAgentMessageSet(fullMessage.to).add(fullMessage.id);
    }

    // Index by project
    this.getProjectMessageSet(fullMessage.projectId).add(fullMessage.id);

    // Track thread
    if (fullMessage.threadId) {
      this.addMessageToThread(fullMessage);
    }

    // Notify subscribers in real time
    this.notifySubscribers(fullMessage);

    // If this is a response to a pending request, resolve the promise
    if (fullMessage.type === 'response' && fullMessage.metadata?.inResponseTo) {
      this.resolvePendingRequest(fullMessage.metadata.inResponseTo, fullMessage);
    }

    return fullMessage;
  }

  /**
   * Broadcast a message from an agent to all other agents in the project.
   * Convenience wrapper around `send()` with to='broadcast'.
   */
  broadcast(
    from: AgentRole,
    projectId: string,
    content: string,
    type: MessageType = 'info',
    priority: MessagePriority = 'normal'
  ): AgentMessage {
    return this.send({
      from,
      to: 'broadcast',
      type,
      priority,
      content,
      projectId,
    });
  }

  /**
   * Get messages addressed to a specific agent in a project.
   * Returns messages sorted by priority (urgent first) then by creation time.
   * Optionally filter to only unread messages.
   */
  getMessages(agentRole: AgentRole, projectId: string, unreadOnly: boolean = false): AgentMessage[] {
    const agentMessageIds = this.messagesByAgent.get(agentRole);
    if (!agentMessageIds) return [];

    const messages: AgentMessage[] = [];
    agentMessageIds.forEach(id => {
      const msg = this.messagesById.get(id);
      if (!msg) return;
      if (msg.projectId !== projectId) return;
      if (unreadOnly && msg.readAt) return;
      // Skip expired messages
      if (msg.expiresAt && new Date(msg.expiresAt) < new Date()) return;
      messages.push(msg);
    });

    // Sort: highest priority first, then newest first within same priority
    messages.sort((a, b) => {
      const priorityDiff = PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return messages;
  }

  /**
   * Mark a message as read by setting its readAt timestamp.
   * Returns true if the message was found and updated, false otherwise.
   */
  markRead(messageId: string): boolean {
    const msg = this.messagesById.get(messageId);
    if (!msg) return false;
    if (msg.readAt) return true; // Already read
    msg.readAt = new Date().toISOString();
    return true;
  }

  /**
   * Respond to an existing message. The response is automatically threaded
   * with the original message and sent back to the original sender.
   */
  respond(originalMessageId: string, from: AgentRole, content: string): AgentMessage | null {
    const original = this.messagesById.get(originalMessageId);
    if (!original) return null;

    const threadId = original.threadId ?? generateThreadId();

    // If the original didn't have a threadId, retroactively assign one
    if (!original.threadId) {
      original.threadId = threadId;
      this.addMessageToThread(original);
    }

    const response = this.send({
      from,
      to: original.from, // Reply goes back to the sender
      type: 'response',
      priority: original.priority,
      content,
      threadId,
      projectId: original.projectId,
      metadata: {
        inResponseTo: originalMessageId,
      },
    });

    return response;
  }

  /**
   * Get all messages in a thread, sorted chronologically.
   */
  getThread(threadId: string): AgentConversation | null {
    return this.threadsById.get(threadId) ?? null;
  }

  /**
   * Subscribe an agent to real-time message notifications.
   * The callback is invoked whenever a message is sent to that agent.
   * Returns an unsubscribe function.
   */
  subscribe(agentRole: AgentRole, callback: (message: AgentMessage) => void): () => void {
    const subId = `sub_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const subscription: BusSubscription = { agentRole, callback };

    // Store in both maps for efficient lookup
    this.subscriptionById.set(subId, subscription);
    this.getAgentSubscriptionSet(agentRole).add(subId);

    // Return unsubscribe function
    return () => {
      this.subscriptionById.delete(subId);
      const agentSubs = this.subscriptionsByAgent.get(agentRole);
      if (agentSubs) {
        agentSubs.delete(subId);
        if (agentSubs.size === 0) {
          this.subscriptionsByAgent.delete(agentRole);
        }
      }
    };
  }

  /**
   * Get the count of unread messages for an agent in a project.
   */
  getUnreadCount(agentRole: AgentRole, projectId: string): number {
    const agentMessageIds = this.messagesByAgent.get(agentRole);
    if (!agentMessageIds) return 0;

    let count = 0;
    agentMessageIds.forEach(id => {
      const msg = this.messagesById.get(id);
      if (!msg) return;
      if (msg.projectId !== projectId) return;
      if (msg.readAt) return;
      if (msg.expiresAt && new Date(msg.expiresAt) < new Date()) return;
      count++;
    });
    return count;
  }

  /**
   * Send a request from one agent to another and wait for a response.
   * This implements the request-response pattern with a configurable timeout.
   * If the target agent responds within the timeout, the response message is returned.
   * If the timeout elapses, an error is thrown.
   *
   * Usage:
   *   const response = await agentBus.request('frontend', 'backend', projectId, 'What is the auth API?', 10000);
   */
  request(
    from: AgentRole,
    to: AgentRole,
    projectId: string,
    question: string,
    timeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS
  ): Promise<AgentMessage> {
    const requestMessage = this.send({
      from,
      to,
      type: 'request',
      priority: 'urgent',
      content: question,
      projectId,
      metadata: {
        isRequest: true,
      },
    });

    return new Promise<AgentMessage>((resolve, reject) => {
      const timer = setTimeout(() => {
        // Clean up the pending request on timeout
        this.pendingRequests.delete(requestMessage.id);
        reject(new Error(
          `Request from ${from} to ${to} timed out after ${timeoutMs}ms: "${question.substring(0, 80)}"`
        ));
      }, timeoutMs);

      this.pendingRequests.set(requestMessage.id, {
        resolve,
        reject,
        timer,
        fromAgent: from,
      });
    });
  }

  /**
   * Remove expired messages from the bus.
   * If projectId is provided, only clean up messages for that project.
   * If not, clean up all expired messages across all projects.
   * Returns the number of messages removed.
   */
  cleanup(projectId?: string): number {
    const now = new Date();
    let removedCount = 0;

    if (projectId) {
      // Clean up only for the specified project
      const projectMsgIds = this.messagesByProject.get(projectId);
      if (!projectMsgIds) return 0;

      const expiredIds: string[] = [];
      projectMsgIds.forEach(id => {
        const msg = this.messagesById.get(id);
        if (msg && msg.expiresAt && new Date(msg.expiresAt) < now) {
          expiredIds.push(id);
        }
      });

      expiredIds.forEach(id => {
        this.removeMessage(id);
        removedCount++;
      });
    } else {
      // Clean up all expired messages
      const expiredIds: string[] = [];
      this.messagesById.forEach((msg, id) => {
        if (msg.expiresAt && new Date(msg.expiresAt) < now) {
          expiredIds.push(id);
        }
      });

      expiredIds.forEach(id => {
        this.removeMessage(id);
        removedCount++;
      });
    }

    return removedCount;
  }

  // ============================================================
  // ADDITIONAL UTILITY METHODS
  // ============================================================

  /**
   * Get all conversations (threads) for a project.
   */
  getConversations(projectId: string): AgentConversation[] {
    const threadIds = this.threadsByProject.get(projectId);
    if (!threadIds) return [];

    const conversations: AgentConversation[] = [];
    threadIds.forEach(threadId => {
      const thread = this.threadsById.get(threadId);
      if (thread) conversations.push(thread);
    });

    // Sort by most recent activity
    conversations.sort(
      (a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime()
    );

    return conversations;
  }

  /**
   * Get a specific message by its ID.
   */
  getMessage(messageId: string): AgentMessage | null {
    return this.messagesById.get(messageId) ?? null;
  }

  /**
   * Get the total number of active (non-expired) messages in the bus.
   */
  getMessageCount(): number {
    return this.messagesById.size;
  }

  /**
   * Get statistics about the message bus for monitoring.
   */
  getStats(): {
    totalMessages: number;
    totalThreads: number;
    pendingRequests: number;
    subscriptionsByAgent: Record<string, number>;
  } {
    const subCounts: Record<string, number> = {};
    this.subscriptionsByAgent.forEach((subIds, role) => {
      subCounts[role] = subIds.size;
    });

    return {
      totalMessages: this.messagesById.size,
      totalThreads: this.threadsById.size,
      pendingRequests: this.pendingRequests.size,
      subscriptionsByAgent: subCounts,
    };
  }

  /**
   * Destroy the bus: clear all data and stop the cleanup timer.
   * Useful for testing or graceful shutdown.
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    // Reject all pending requests
    this.pendingRequests.forEach(pending => {
      clearTimeout(pending.timer);
      pending.reject(new Error('AgentMessageBus is being destroyed'));
    });
    this.pendingRequests.clear();

    // Clear all data structures
    this.messagesById.clear();
    this.messagesByAgent.clear();
    this.messagesByProject.clear();
    this.threadsById.clear();
    this.threadsByProject.clear();
    this.subscriptionsByAgent.clear();
    this.subscriptionById.clear();
  }

  // ============================================================
  // PRIVATE HELPERS
  // ============================================================

  /** Get or create the message ID set for an agent */
  private getAgentMessageSet(role: AgentRole): Set<string> {
    let set = this.messagesByAgent.get(role);
    if (!set) {
      set = new Set();
      this.messagesByAgent.set(role, set);
    }
    return set;
  }

  /** Get or create the message ID set for a project */
  private getProjectMessageSet(projectId: string): Set<string> {
    let set = this.messagesByProject.get(projectId);
    if (!set) {
      set = new Set();
      this.messagesByProject.set(projectId, set);
    }
    return set;
  }

  /** Get or create the subscription ID set for an agent */
  private getAgentSubscriptionSet(role: AgentRole): Set<string> {
    let set = this.subscriptionsByAgent.get(role);
    if (!set) {
      set = new Set();
      this.subscriptionsByAgent.set(role, set);
    }
    return set;
  }

  /** Add a message to its thread, creating the thread if necessary */
  private addMessageToThread(message: AgentMessage): void {
    const threadId = message.threadId;
    if (!threadId) return;

    let thread = this.threadsById.get(threadId);
    if (!thread) {
      // Create a new thread
      thread = {
        threadId,
        projectId: message.projectId,
        messages: [],
        participants: [],
        startedAt: message.createdAt,
        lastActivityAt: message.createdAt,
      };
      this.threadsById.set(threadId, thread);

      // Index thread by project
      let projectThreads = this.threadsByProject.get(message.projectId);
      if (!projectThreads) {
        projectThreads = new Set();
        this.threadsByProject.set(message.projectId, projectThreads);
      }
      projectThreads.add(threadId);
    }

    // Add the message to the thread if not already present
    if (!thread.messages.some(m => m.id === message.id)) {
      thread.messages.push(message);
    }

    // Update participants
    const fromRole = message.from as AgentRole;
    if (!thread.participants.includes(fromRole)) {
      thread.participants.push(fromRole);
    }
    if (message.to !== 'broadcast') {
      const toRole = message.to as AgentRole;
      if (!thread.participants.includes(toRole)) {
        thread.participants.push(toRole);
      }
    }

    // Update last activity timestamp
    thread.lastActivityAt = message.createdAt;
  }

  /** Notify all relevant subscribers about a new message */
  private notifySubscribers(message: AgentMessage): void {
    const targetRoles: AgentRole[] = [];

    if (message.to === 'broadcast') {
      // Notify all agents except the sender
      for (const role of AGENT_ROLES) {
        if (role !== message.from) {
          targetRoles.push(role);
        }
      }
    } else {
      targetRoles.push(message.to as AgentRole);
    }

    for (const role of targetRoles) {
      const agentSubIds = this.subscriptionsByAgent.get(role);
      if (!agentSubIds) continue;

      agentSubIds.forEach(subId => {
        const subscription = this.subscriptionById.get(subId);
        if (subscription) {
          // Fire callback asynchronously to avoid blocking the sender
          try {
            subscription.callback(message);
          } catch (error) {
            console.error(
              `[AgentMessageBus] Subscriber callback error for ${role}:`,
              error
            );
          }
        }
      });
    }
  }

  /** Resolve a pending request-response promise */
  private resolvePendingRequest(originalMessageId: string, responseMessage: AgentMessage): void {
    const pending = this.pendingRequests.get(originalMessageId);
    if (!pending) return;

    clearTimeout(pending.timer);
    this.pendingRequests.delete(originalMessageId);
    pending.resolve(responseMessage);
  }

  /** Remove a message from all indices */
  private removeMessage(messageId: string): void {
    const msg = this.messagesById.get(messageId);
    if (!msg) return;

    // Remove from main store
    this.messagesById.delete(messageId);

    // Remove from agent index
    if (msg.to === 'broadcast') {
      for (const role of AGENT_ROLES) {
        if (role !== msg.from) {
          this.messagesByAgent.get(role)?.delete(messageId);
        }
      }
    } else {
      this.messagesByAgent.get(msg.to as AgentRole)?.delete(messageId);
    }

    // Remove from project index
    this.messagesByProject.get(msg.projectId)?.delete(messageId);

    // Remove from thread (but don't delete the thread itself — it's a conversation record)
    if (msg.threadId) {
      const thread = this.threadsById.get(msg.threadId);
      if (thread) {
        thread.messages = thread.messages.filter(m => m.id !== messageId);
      }
    }
  }
}

// Singleton instance
export const agentBus = new AgentMessageBus();
