'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  AGENT_EMOJIS,
  AGENT_NAMES,
  AGENT_COLORS,
  type AgentRole,
  type ChatMessage,
  type AgentActivity,
} from '@/lib/types/aion';
import {
  Send,
  Zap,
  Loader2,
  Sparkles,
  ArrowRight,
  LayoutDashboard,
  FastForward,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  Activity,
} from 'lucide-react';

const AGENT_DESCRIPTIONS: Record<AgentRole, string> = {
  cto: 'Orchestrates the team, plans and delegates — your main point of contact',
  frontend: 'Builds React UI, components & pages',
  backend: 'Builds APIs, database & server logic',
  qa: 'Tests code, catches bugs, validates quality',
  devops: 'Deploys to GitHub & Render, tests URLs',
  business: 'Creates PRDs, defines features & scope',
};

export default function AIONHome() {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [agentActivities, setAgentActivities] = useState<AgentActivity[]>([]);
  const [projectStatus, setProjectStatus] = useState<string>('idle');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, agentActivities]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setProjectStatus('processing');

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: input.trim(),
          projectId,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      const data = await response.json();

      // Update project ID
      if (data.projectId && !projectId) {
        setProjectId(data.projectId);
      }

      // Add agent responses as messages
      if (data.agentResponses) {
        for (const agentResp of data.agentResponses) {
          const agentMsg: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: agentResp.statusUpdate || agentResp.analysis || 'Processing...',
            agentRole: agentResp.agentId,
            agentName: AGENT_NAMES[agentResp.agentId as AgentRole] || agentResp.agentId,
            agentEmoji: AGENT_EMOJIS[agentResp.agentId as AgentRole] || '🤖',
            timestamp: new Date().toISOString(),
            projectId: data.projectId,
            metadata: {
              confidence: agentResp.confidence,
              taskAssignments: agentResp.taskAssignments,
              status: data.projectStatus,
            },
          };
          setMessages(prev => [...prev, agentMsg]);

          // Track agent activity
          const activity: AgentActivity = {
            id: crypto.randomUUID(),
            agentRole: agentResp.agentId,
            agentName: AGENT_NAMES[agentResp.agentId as AgentRole] || agentResp.agentId,
            agentEmoji: AGENT_EMOJIS[agentResp.agentId as AgentRole] || '🤖',
            action: agentResp.statusUpdate || 'Completed task',
            timestamp: new Date().toISOString(),
            confidence: agentResp.confidence,
            status: agentResp.status === 'success' ? 'success' : 'failed',
          };
          setAgentActivities(prev => [...prev, activity]);
        }
      }

      setProjectStatus(data.projectStatus || 'processing');
    } catch (error: any) {
      setMessages(prev => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `❌ Error: ${error.message || 'Something went wrong. Please try again.'}`,
          agentRole: 'cto',
          agentName: 'AION',
          agentEmoji: '⚡',
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleContinue = async () => {
    if (!projectId || isLoading) return;

    // Use the chat API with a "continue" message for conversational flow
    setIsLoading(true);
    setProjectStatus('processing');

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'Continue building. What\'s next?',
          projectId,
        }),
      });

      const data = await response.json();

      if (data.agentResponses) {
        for (const agentResp of data.agentResponses) {
          const agentMsg: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: agentResp.statusUpdate || agentResp.analysis || 'Processing...',
            agentRole: agentResp.agentId,
            agentName: AGENT_NAMES[agentResp.agentId as AgentRole] || agentResp.agentId,
            agentEmoji: AGENT_EMOJIS[agentResp.agentId as AgentRole] || '🤖',
            timestamp: new Date().toISOString(),
            projectId,
            metadata: {
              confidence: agentResp.confidence,
              taskAssignments: agentResp.taskAssignments,
            },
          };
          setMessages(prev => [...prev, agentMsg]);

          setAgentActivities(prev => [
            ...prev,
            {
              id: crypto.randomUUID(),
              agentRole: agentResp.agentId,
              agentName: AGENT_NAMES[agentResp.agentId as AgentRole] || agentResp.agentId,
              agentEmoji: AGENT_EMOJIS[agentResp.agentId as AgentRole] || '🤖',
              action: agentResp.statusUpdate || 'Completed task',
              timestamp: new Date().toISOString(),
              confidence: agentResp.confidence,
              status: agentResp.status === 'success' ? 'success' : 'failed',
            },
          ]);
        }
      }

      setProjectStatus(data.projectStatus || 'processing');
    } catch (error: any) {
      setMessages(prev => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `❌ Error: ${error.message}`,
          agentRole: 'cto',
          agentName: 'AION',
          agentEmoji: '⚡',
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAutoBuild = async () => {
    if (!projectId || isLoading) return;

    setIsLoading(true);
    setProjectStatus('processing');

    try {
      const response = await fetch('/api/orchestrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          action: 'cycle',
          steps: 3,
        }),
      });

      const data = await response.json();

      if (data.agentResponses) {
        for (const agentResp of data.agentResponses) {
          const agentMsg: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: agentResp.statusUpdate || agentResp.analysis || 'Processing...',
            agentRole: agentResp.agentId,
            agentName: AGENT_NAMES[agentResp.agentId as AgentRole] || agentResp.agentId,
            agentEmoji: AGENT_EMOJIS[agentResp.agentId as AgentRole] || '🤖',
            timestamp: new Date().toISOString(),
            projectId,
            metadata: {
              confidence: agentResp.confidence,
              taskAssignments: agentResp.taskAssignments,
            },
          };
          setMessages(prev => [...prev, agentMsg]);

          setAgentActivities(prev => [
            ...prev,
            {
              id: crypto.randomUUID(),
              agentRole: agentResp.agentId,
              agentName: AGENT_NAMES[agentResp.agentId as AgentRole] || agentResp.agentId,
              agentEmoji: AGENT_EMOJIS[agentResp.agentId as AgentRole] || '🤖',
              action: agentResp.statusUpdate || 'Completed task',
              timestamp: new Date().toISOString(),
              confidence: agentResp.confidence,
              status: agentResp.status === 'success' ? 'success' : 'failed',
            },
          ]);
        }
      }

      if (data.message) {
        setMessages(prev => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: data.message,
            agentRole: 'cto',
            agentName: 'AION',
            agentEmoji: '⚡',
            timestamp: new Date().toISOString(),
          },
        ]);
      }

      setProjectStatus(data.projectStatus || 'processing');
    } catch (error: any) {
      setMessages(prev => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `❌ Error: ${error.message}`,
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white font-bold text-sm">
              A
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">AION</h1>
              <p className="text-xs text-muted-foreground">Autonomous Intelligent Orchestration Network</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={projectStatus === 'live' ? 'default' : 'secondary'} className="text-xs">
              {projectStatus === 'idle' ? 'Ready' : projectStatus === 'live' ? '🟢 Live' : `⚡ ${projectStatus}`}
            </Badge>
            {projectId && (
              <>
                <Badge variant="outline" className="text-xs font-mono">
                  {projectId.substring(0, 8)}
                </Badge>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1 text-xs"
                  onClick={() => router.push(`/project/${projectId}`)}
                >
                  <LayoutDashboard className="w-3 h-3" /> Dashboard
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex max-w-7xl w-full mx-auto">
        {/* Chat Area */}
        <div className="flex-1 flex flex-col">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4" ref={scrollRef}>
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-[70vh] text-center px-4">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center mb-6">
                  <Zap className="w-10 h-10 text-white" />
                </div>
                <h2 className="text-2xl font-bold mb-2">Welcome to AION</h2>
                <p className="text-muted-foreground mb-4 max-w-md">
                  Describe the app you want to build. Your Lead CTO will talk you through the plan, push back on bad ideas, and coordinate 6 AI agents to build, test, and ship it.
                </p>
                <p className="text-sm text-amber-500 font-medium mb-6">
                  Your CTO is bold, honest, and goes the extra mile. Not a yes-man.
                </p>

                {/* Agent Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-w-lg mb-8">
                  {(Object.entries(AGENT_NAMES) as [AgentRole, string][]).map(([role, name]) => (
                    <Card key={role} className={`p-3 text-center transition-colors ${role === 'cto' ? 'border-amber-500/50 bg-amber-500/5' : 'hover:border-amber-500/50'}`}>
                      <div className="text-2xl mb-1">{AGENT_EMOJIS[role]}</div>
                      <div className="text-xs font-medium">{name}</div>
                      <div className="text-[10px] text-muted-foreground">{AGENT_DESCRIPTIONS[role]}</div>
                      {role === 'cto' && (
                        <Badge variant="outline" className="text-[8px] mt-1 text-amber-500 border-amber-500/30">
                          Your main contact
                        </Badge>
                      )}
                    </Card>
                  ))}
                </div>

                {/* Example prompts */}
                <div className="flex flex-wrap gap-2 justify-center">
                  {[
                    'Build me a habit tracker app',
                    'Create a budget management tool',
                    'Make a recipe generator with AI',
                    'Build a project management board',
                  ].map((example) => (
                    <button
                      key={example}
                      onClick={() => setInput(example)}
                      className="text-xs px-3 py-1.5 rounded-full border border-border hover:bg-accent hover:border-amber-500/50 transition-colors"
                    >
                      {example}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-4 max-w-3xl mx-auto">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    {msg.role === 'assistant' && (
                      <div
                        className="w-9 h-9 rounded-lg flex items-center justify-center text-base shrink-0 mt-1"
                        style={{
                          backgroundColor: msg.agentRole
                            ? `${AGENT_COLORS[msg.agentRole as AgentRole]}20`
                            : '#f59e0b20',
                        }}
                      >
                        {msg.agentEmoji || '🤖'}
                      </div>
                    )}
                    <div
                      className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                        msg.role === 'user'
                          ? 'bg-primary text-primary-foreground'
                          : msg.agentRole === 'cto'
                            ? 'bg-card border border-amber-500/20 shadow-sm'
                            : 'bg-card border border-border'
                      }`}
                    >
                      {msg.agentName && msg.role === 'assistant' && (
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="text-xs font-semibold" style={{ color: AGENT_COLORS[msg.agentRole as AgentRole] || '#f59e0b' }}>
                            {msg.agentName}
                          </span>
                          {msg.agentRole === 'cto' && (
                            <Badge variant="outline" className="text-[8px] px-1 py-0 text-amber-500 border-amber-500/30">
                              LEAD
                            </Badge>
                          )}
                          {msg.metadata?.confidence && (
                            <span className="text-[10px] opacity-50 ml-auto">
                              {(msg.metadata.confidence * 100).toFixed(0)}%
                            </span>
                          )}
                        </div>
                      )}
                      <div className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</div>
                      {msg.metadata?.taskAssignments && msg.metadata.taskAssignments.length > 0 && (
                        <div className="mt-3 pt-2 border-t border-border/50 space-y-1.5">
                          <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Task Assignments</div>
                          {msg.metadata.taskAssignments.map((ta: any, i: number) => (
                            <div key={i} className="flex items-center gap-2 text-xs bg-muted/50 rounded-md px-2 py-1">
                              <span>{AGENT_EMOJIS[ta.assignedTo as AgentRole]}</span>
                              <span className="font-medium">{AGENT_NAMES[ta.assignedTo as AgentRole]}</span>
                              <span className="text-muted-foreground truncate flex-1">{ta.taskDescription}</span>
                              <Badge variant="secondary" className="text-[8px] px-1 py-0">{ta.priority}</Badge>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {isLoading && (
                  <div className="flex gap-3 justify-start">
                    <div className="w-9 h-9 rounded-lg bg-amber-500/20 flex items-center justify-center">
                      <Loader2 className="w-4 h-4 text-amber-500 animate-spin" />
                    </div>
                    <div className="bg-card border border-amber-500/20 rounded-2xl px-4 py-3">
                      <div className="text-sm text-muted-foreground flex items-center gap-2">
                        <Sparkles className="w-3 h-3 animate-pulse text-amber-500" />
                        CTO is thinking...
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Input Area */}
          <div className="border-t border-border p-4 bg-background/95 backdrop-blur">
            <div className="max-w-3xl mx-auto">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                  placeholder={
                    projectId
                      ? 'Ask your CTO anything — change plans, check progress, challenge decisions...'
                      : 'Describe the app you want to build...'
                  }
                  className="flex-1 rounded-xl border border-border bg-card px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50 placeholder:text-muted-foreground"
                  disabled={isLoading}
                />
                <Button
                  onClick={handleSend}
                  disabled={isLoading || !input.trim()}
                  className="rounded-xl px-4 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
              {projectId && !isLoading && (
                <div className="flex gap-2 mt-2">
                  <Button
                    onClick={handleContinue}
                    variant="outline"
                    size="sm"
                    className="rounded-lg gap-1 text-xs"
                  >
                    <MessageSquare className="w-3 h-3" /> Ask CTO
                  </Button>
                  <Button
                    onClick={handleAutoBuild}
                    variant="outline"
                    size="sm"
                    className="rounded-lg gap-1 text-xs"
                  >
                    <FastForward className="w-3 h-3" /> Auto Build (3 steps)
                  </Button>
                  <Button
                    onClick={() => router.push(`/project/${projectId}`)}
                    variant="outline"
                    size="sm"
                    className="rounded-lg gap-1 text-xs"
                  >
                    <LayoutDashboard className="w-3 h-3" /> Dashboard
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Agent Activity Panel (Sidebar) */}
        {agentActivities.length > 0 && (
          <div className="w-72 border-l border-border p-4 hidden lg:block overflow-y-auto">
            <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
              <Activity className="w-3 h-3" /> Agent Activity
            </h3>
            <div className="space-y-2">
              {agentActivities.slice(-20).reverse().map((activity) => (
                <Card key={activity.id} className="p-2.5">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-base">{activity.agentEmoji}</span>
                    <span className="text-xs font-medium" style={{ color: AGENT_COLORS[activity.agentRole as AgentRole] }}>
                      {activity.agentName}
                    </span>
                    {activity.status === 'success' ? (
                      <CheckCircle2 className="w-3 h-3 text-emerald-500 ml-auto" />
                    ) : (
                      <AlertCircle className="w-3 h-3 text-red-500 ml-auto" />
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground line-clamp-3">
                    {activity.action}
                  </div>
                  {activity.confidence !== undefined && (
                    <div className="mt-1.5 flex items-center gap-1">
                      <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${activity.confidence * 100}%`,
                            backgroundColor: AGENT_COLORS[activity.agentRole as AgentRole] || '#f59e0b',
                          }}
                        />
                      </div>
                      <span className="text-[10px] text-muted-foreground">{(activity.confidence * 100).toFixed(0)}%</span>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
