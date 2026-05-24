'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ThemeToggle } from '@/components/theme-toggle';
import { MarkdownRenderer } from '@/components/markdown-renderer';
import {
  AGENT_EMOJIS,
  AGENT_NAMES,
  AGENT_COLORS,
  type AgentRole,
  type ChatMessage,
  type AgentActivity,
} from '@/lib/types/aion';
import type { AutonomousProgressEvent } from '@/lib/engine/orchestrator';
import {
  Send,
  Zap,
  Loader2,
  Sparkles,
  LayoutDashboard,
  FastForward,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  Activity,
  Eye,
  ArrowRight,
  AlertTriangle,
  Package,
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

  // SSE progress state
  const [sseProgress, setSseProgress] = useState<AutonomousProgressEvent[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentStep, setCurrentStep] = useState<{ step: number; total: number } | null>(null);
  const [currentAgent, setCurrentAgent] = useState<AgentRole | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, agentActivities, sseProgress]);

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

      if (data.projectId && !projectId) {
        setProjectId(data.projectId);
      }

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

  // Auto Build with SSE streaming
  const handleAutoBuild = useCallback(async () => {
    if (!projectId || isStreaming) return;

    setIsStreaming(true);
    setSseProgress([]);
    setCurrentStep(null);
    setCurrentAgent(null);

    try {
      const response = await fetch(`/api/orchestrate/stream?projectId=${projectId}&steps=5`);

      if (!response.ok || !response.body) {
        throw new Error('Failed to connect to stream');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process SSE events from buffer
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event: AutonomousProgressEvent = JSON.parse(line.slice(6));
              setSseProgress(prev => [...prev, event]);

              // Update current step/agent
              if (event.totalSteps) {
                setCurrentStep({ step: event.stepNumber, total: event.totalSteps });
              }
              if (event.agentRole) {
                setCurrentAgent(event.agentRole);
              }

              // On completion, add a summary message
              if (event.type === 'complete') {
                const liveUrl = event.data?.liveUrl;
                setMessages(prev => [
                  ...prev,
                  {
                    id: crypto.randomUUID(),
                    role: 'assistant',
                    content: liveUrl
                      ? `🚀 **Autonomous build complete!** Project is LIVE at ${liveUrl}`
                      : `✅ **Autonomous build cycle complete.** ${event.message}`,
                    agentRole: 'cto',
                    agentName: 'AION',
                    agentEmoji: '⚡',
                    timestamp: new Date().toISOString(),
                    projectId,
                  },
                ]);

                if (event.data?.projectStatus) {
                  setProjectStatus(event.data.projectStatus);
                }
              }

              if (event.type === 'error') {
                setMessages(prev => [
                  ...prev,
                  {
                    id: crypto.randomUUID(),
                    role: 'assistant',
                    content: `❌ **Build error:** ${event.message}`,
                    agentRole: 'cto',
                    agentName: 'AION',
                    agentEmoji: '⚡',
                    timestamp: new Date().toISOString(),
                  },
                ]);
              }
            } catch {
              // Ignore malformed JSON
            }
          }
          // Heartbeat lines (starting with ':') are ignored
        }
      }
    } catch (error: any) {
      setMessages(prev => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `❌ **Stream error:** ${error.message}`,
          agentRole: 'cto',
          agentName: 'AION',
          agentEmoji: '⚡',
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsStreaming(false);
    }
  }, [projectId, isStreaming]);

  // Get the icon for an SSE progress event type
  const getProgressIcon = (type: string) => {
    switch (type) {
      case 'step_start': return <Loader2 className="w-3 h-3 animate-spin text-amber-500" />;
      case 'step_complete': return <CheckCircle2 className="w-3 h-3 text-emerald-500" />;
      case 'phase_change': return <ArrowRight className="w-3 h-3 text-blue-500" />;
      case 'stuck_detected': return <AlertTriangle className="w-3 h-3 text-yellow-500" />;
      case 'deps_installing': return <Package className="w-3 h-3 text-purple-500" />;
      case 'complete': return <CheckCircle2 className="w-3 h-3 text-emerald-500" />;
      case 'error': return <AlertCircle className="w-3 h-3 text-red-500" />;
      default: return <Activity className="w-3 h-3" />;
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
            <ThemeToggle />
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
                      {msg.role === 'user' ? (
                        <div className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</div>
                      ) : (
                        <MarkdownRenderer content={msg.content} />
                      )}
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

                {/* SSE Real-time Progress Panel */}
                {isStreaming && sseProgress.length > 0 && (
                  <div className="flex gap-3 justify-start">
                    <div className="w-9 h-9 rounded-lg bg-amber-500/20 flex items-center justify-center">
                      <Loader2 className="w-4 h-4 text-amber-500 animate-spin" />
                    </div>
                    <div className="bg-card border border-amber-500/20 rounded-2xl px-4 py-3 max-w-[80%]">
                      <div className="flex items-center gap-2 mb-2">
                        <Sparkles className="w-3 h-3 animate-pulse text-amber-500" />
                        <span className="text-xs font-semibold text-amber-500">Auto Build in Progress</span>
                        {currentStep && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            {currentStep.step}/{currentStep.total} steps
                          </Badge>
                        )}
                        {currentAgent && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 gap-1">
                            {AGENT_EMOJIS[currentAgent]} {AGENT_NAMES[currentAgent]}
                          </Badge>
                        )}
                      </div>
                      {/* Progress bar */}
                      {currentStep && (
                        <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden mb-2">
                          <div
                            className="h-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-full transition-all duration-500"
                            style={{ width: `${(currentStep.step / currentStep.total) * 100}%` }}
                          />
                        </div>
                      )}
                      {/* Progress events */}
                      <ScrollArea className="max-h-40">
                        <div className="space-y-1">
                          {sseProgress.slice(-8).map((event, i) => (
                            <div key={i} className="flex items-start gap-2 text-xs">
                              <span className="mt-0.5 shrink-0">{getProgressIcon(event.type)}</span>
                              <span className={
                                event.type === 'error' ? 'text-red-500' :
                                event.type === 'stuck_detected' ? 'text-yellow-600 dark:text-yellow-400' :
                                event.type === 'complete' ? 'text-emerald-500 font-medium' :
                                'text-muted-foreground'
                              }>
                                {event.message}
                              </span>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </div>
                  </div>
                )}

                {/* Loading indicator (non-SSE) */}
                {isLoading && !isStreaming && (
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
                  disabled={isLoading || isStreaming}
                />
                <Button
                  onClick={handleSend}
                  disabled={isLoading || isStreaming || !input.trim()}
                  className="rounded-xl px-4 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
              {projectId && !isLoading && !isStreaming && (
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
                    className="rounded-lg gap-1 text-xs border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
                  >
                    <FastForward className="w-3 h-3" /> Auto Build (5 steps)
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
