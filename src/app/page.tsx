'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ThemeToggle } from '@/components/theme-toggle';
import { MarkdownRenderer } from '@/components/markdown-renderer';
import {
  AGENT_COLORS,
  AGENT_EMOJIS,
  AGENT_NAMES,
  type AgentActivity,
  type AgentRole,
  type ChatMessage,
} from '@/lib/types/aion';
import type { AutonomousProgressEvent } from '@/lib/engine/orchestrator';
import {
  Activity,
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  FastForward,
  LayoutDashboard,
  Loader2,
  MessageSquare,
  Send,
  Shield,
  Sparkles,
  Terminal,
  Zap,
} from 'lucide-react';

const AGENT_DESCRIPTIONS: Record<AgentRole, string> = {
  cto: 'Owns the call, delegates work, and reports to you in one voice.',
  frontend: 'Builds the interface layer and interaction system.',
  backend: 'Owns APIs, workflows, and application logic.',
  qa: 'Breaks weak builds, validates fixes, and guards release quality.',
  devops: 'Controls repo, runtime, deployment, and release operations.',
  business: 'Sharpens scope, PRD quality, and product framing.',
  research: 'Pulls outside evidence, docs, and competitive context.',
  security: 'Surfaces security gaps and hardens risky paths.',
  design: 'Refines UX, hierarchy, clarity, and visual systems.',
  data: 'Shapes schema, migrations, and storage decisions.',
  docs: 'Keeps the system legible with README and operational docs.',
  analytics: 'Defines metrics, instrumentation, and reporting.',
  integration: 'Owns external services, auth, and webhooks.',
  performance: 'Finds bottlenecks and improves runtime quality.',
  compliance: 'Covers privacy, licensing, and policy gaps.',
};

const EXAMPLE_PROMPTS = [
  'Build a phone-first AI CTO dashboard for my product team.',
  'Fix onboarding in my repo, run tests, and prep a safe push.',
  'Clone my Next.js repo, inspect auth, and tell me what is broken.',
  'Open staging, investigate checkout, and report back with screenshots.',
];

function getProgressIcon(type: string) {
  switch (type) {
    case 'step_start':
      return <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />;
    case 'step_complete':
      return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
    case 'phase_change':
      return <ArrowRight className="h-3.5 w-3.5 text-sky-500" />;
    case 'stuck_detected':
      return <AlertCircle className="h-3.5 w-3.5 text-amber-500" />;
    case 'complete':
      return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
    default:
      return <Activity className="h-3.5 w-3.5 text-muted-foreground" />;
  }
}

export default function AIONHome() {
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectStatus, setProjectStatus] = useState('idle');
  const [agentActivities, setAgentActivities] = useState<AgentActivity[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [sseProgress, setSseProgress] = useState<AutonomousProgressEvent[]>([]);
  const [currentStep, setCurrentStep] = useState<{ step: number; total: number } | null>(null);
  const [currentAgent, setCurrentAgent] = useState<AgentRole | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, agentActivities, sseProgress]);

  const appendAgentResponses = useCallback((data: any) => {
    if (!data.agentResponses) return;

    for (const agentResp of data.agentResponses) {
      const role = agentResp.agentId as AgentRole;
      setMessages(prev => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: agentResp.statusUpdate || agentResp.analysis || 'Processing...',
          agentRole: role,
          agentName: AGENT_NAMES[role] || role,
          agentEmoji: AGENT_EMOJIS[role] || 'AI',
          timestamp: new Date().toISOString(),
          projectId: data.projectId,
          metadata: {
            confidence: agentResp.confidence,
            taskAssignments: agentResp.taskAssignments,
            status: data.projectStatus,
          },
        },
      ]);

      setAgentActivities(prev => [
        {
          id: crypto.randomUUID(),
          agentRole: role,
          agentName: AGENT_NAMES[role] || role,
          agentEmoji: AGENT_EMOJIS[role] || 'AI',
          action: agentResp.statusUpdate || 'Updated execution state',
          timestamp: new Date().toISOString(),
          confidence: agentResp.confidence,
          status: (agentResp.status === 'success' ? 'success' : 'failed') as AgentActivity['status'],
        },
        ...prev,
      ].slice(0, 24));
    }
  }, []);

  const submitMessage = useCallback(async (rawMessage: string) => {
    const trimmed = rawMessage.trim();
    if (!trimmed) return;
    setMessages(prev => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: 'user',
        content: trimmed,
        timestamp: new Date().toISOString(),
      },
    ]);
    setInput('');
    setIsLoading(true);
    setProjectStatus('processing');

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const apiKey = process.env.NEXT_PUBLIC_AION_API_KEY;
      if (apiKey) headers['x-aion-api-key'] = apiKey;

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({ message: trimmed, projectId }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Request failed (${response.status})`);
      }

      const data = await response.json();
      if (data.projectId && !projectId) {
        setProjectId(data.projectId);
      }
      appendAgentResponses(data);
      setProjectStatus(data.projectStatus || 'processing');
    } catch (error: any) {
      setMessages(prev => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `System fault: ${error.message || 'Request failed.'}`,
          agentRole: 'cto',
          agentName: 'Lead CTO',
          agentEmoji: AGENT_EMOJIS.cto,
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }, [appendAgentResponses, projectId]);

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading || isStreaming) return;
    await submitMessage(trimmed);
  }, [input, isLoading, isStreaming, submitMessage]);

  const handleContinue = useCallback(async () => {
    if (!projectId || isLoading || isStreaming) return;
    await submitMessage('Continue building. What is the current call and next move?');
  }, [isLoading, isStreaming, projectId, submitMessage]);

  const handleAutoBuild = useCallback(async () => {
    if (!projectId || isStreaming) return;

    setIsStreaming(true);
    setSseProgress([]);
    setCurrentStep(null);
    setCurrentAgent(null);

    try {
      const headers: Record<string, string> = {};
      const apiKey = process.env.NEXT_PUBLIC_AION_API_KEY;
      if (apiKey) headers['x-aion-api-key'] = apiKey;

      const response = await fetch(`/api/orchestrate/stream?projectId=${projectId}&steps=5`, {
        headers,
      });

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
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;

          try {
            const event: AutonomousProgressEvent = JSON.parse(line.slice(6));
            setSseProgress(prev => [...prev, event]);

            if (event.totalSteps) {
              setCurrentStep({ step: event.stepNumber, total: event.totalSteps });
            }
            if (event.agentRole) {
              setCurrentAgent(event.agentRole);
            }

            if (event.type === 'complete') {
              setMessages(prev => [
                ...prev,
                {
                  id: crypto.randomUUID(),
                  role: 'assistant',
                  content: event.data?.liveUrl
                    ? `The cycle is complete. Deployment is live at ${event.data.liveUrl}.`
                    : `The autonomous cycle completed. ${event.message}`,
                  agentRole: 'cto',
                  agentName: AGENT_NAMES.cto,
                  agentEmoji: AGENT_EMOJIS.cto,
                  timestamp: new Date().toISOString(),
                  projectId,
                },
              ]);
            }
          } catch {}
        }
      }
    } catch (error: any) {
      setMessages(prev => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `Streaming failed: ${error.message}`,
          agentRole: 'cto',
          agentName: AGENT_NAMES.cto,
          agentEmoji: AGENT_EMOJIS.cto,
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsStreaming(false);
    }
  }, [projectId, isStreaming]);

  const leadSummary = [...messages].reverse().find(message => message.agentRole === 'cto');

  return (
    <div className="operator-shell">
      <div className="operator-grid pointer-events-none fixed inset-0 opacity-30" />

      <header className="sticky top-0 z-50 border-b border-border/70 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-primary via-orange-500 to-amber-300 text-sm font-semibold text-white shadow-lg shadow-primary/20">
              AI
            </div>
            <div>
              <p className="operator-chip">Lead CTO Command Center</p>
              <h1 className="mt-2 text-lg font-semibold tracking-[-0.03em] sm:text-xl">AION</h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button variant="outline" size="sm" className="rounded-full" onClick={() => router.push('/dashboard')}>
              <LayoutDashboard className="mr-2 h-4 w-4" />
              Dashboard
            </Button>
            {projectId && (
              <Button size="sm" className="rounded-full" onClick={() => router.push(`/project/${projectId}`)}>
                <Terminal className="mr-2 h-4 w-4" />
                War Room
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="space-y-6">
          <div className="operator-panel relative overflow-hidden p-6 sm:p-8">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
            <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-2xl">
                <p className="operator-chip">Approval-first autonomy</p>
                <h2 className="operator-title mt-4">
                  One sharp CTO voice. Full execution behind it.
                </h2>
                <p className="operator-subtitle mt-4 max-w-xl">
                  Talk to AION like a real operator. It plans, delegates, researches, tests, runs repos, and pauses only when a risky move needs your approval.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:min-w-[320px]">
                <Card className="operator-card rounded-2xl">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                      <Shield className="h-3.5 w-3.5 text-primary" />
                      Control
                    </div>
                    <p className="mt-3 text-2xl font-semibold">{projectId ? 'Live' : 'Ready'}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Phone-first approvals, repo boundaries, and operator-grade logs.</p>
                  </CardContent>
                </Card>
                <Card className="operator-card rounded-2xl">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                      <Zap className="h-3.5 w-3.5 text-primary" />
                      Status
                    </div>
                    <p className="mt-3 text-2xl font-semibold capitalize">{projectStatus === 'idle' ? 'Standby' : projectStatus}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Lead CTO stays front-facing while specialists work underneath.</p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>

          <div className="operator-panel overflow-hidden">
            <div className="border-b border-border/70 px-5 py-4 sm:px-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Lead channel</p>
                  <h3 className="mt-1 text-lg font-semibold tracking-[-0.03em]">Talk to the CTO</h3>
                </div>
                <Badge variant="outline" className="rounded-full border-primary/30 bg-primary/5 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-primary">
                  {projectId ? 'Active engagement' : 'New brief'}
                </Badge>
              </div>
            </div>

            <div ref={scrollRef} className="max-h-[620px] overflow-y-auto px-4 py-5 sm:px-6">
              {messages.length === 0 ? (
                <div className="space-y-6">
                  <div className="rounded-3xl border border-border/70 bg-background/60 p-5">
                    <div className="flex items-start gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/12 text-sm font-semibold text-primary">
                        {AGENT_EMOJIS.cto}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold">{AGENT_NAMES.cto}</p>
                          <Badge variant="outline" className="rounded-full border-primary/30 bg-primary/5 text-[10px] uppercase tracking-[0.18em] text-primary">
                            Lead
                          </Badge>
                        </div>
                        <p className="mt-2 text-sm leading-7 text-muted-foreground">
                          Bring me the product, the repo, or the problem. I will make the call, shape the build path, and drive the system until we have something shippable.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    {EXAMPLE_PROMPTS.map(prompt => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => setInput(prompt)}
                        className="rounded-2xl border border-border/70 bg-card/70 px-4 py-4 text-left text-sm text-muted-foreground transition hover:border-primary/40 hover:bg-card"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {messages.map(message => {
                    const isUser = message.role === 'user';
                    const agentRole = message.agentRole || 'cto';

                    return (
                      <div key={message.id} className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
                        {!isUser && (
                          <div
                            className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-xs font-semibold"
                            style={{ backgroundColor: `${AGENT_COLORS[agentRole] || '#f59e0b'}20`, color: AGENT_COLORS[agentRole] || '#f59e0b' }}
                          >
                            {message.agentEmoji || AGENT_EMOJIS[agentRole]}
                          </div>
                        )}

                        <div
                          className={`max-w-[85%] rounded-[1.5rem] px-4 py-3 sm:px-5 ${
                            isUser
                              ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/15'
                              : message.agentRole === 'cto'
                                ? 'border border-primary/20 bg-card shadow-sm'
                                : 'border border-border/70 bg-card/80'
                          }`}
                        >
                          {!isUser && (
                            <div className="mb-2 flex items-center gap-2">
                              <span className="text-xs font-semibold" style={{ color: AGENT_COLORS[agentRole] || '#f59e0b' }}>
                                {message.agentName}
                              </span>
                              {message.agentRole === 'cto' && (
                                <Badge variant="outline" className="rounded-full border-primary/30 bg-primary/5 text-[10px] uppercase tracking-[0.18em] text-primary">
                                  Lead
                                </Badge>
                              )}
                              {message.metadata?.confidence && (
                                <span className="ml-auto text-[10px] text-muted-foreground">
                                  {(message.metadata.confidence * 100).toFixed(0)}%
                                </span>
                              )}
                            </div>
                          )}

                          {isUser ? (
                            <p className="text-sm leading-7">{message.content}</p>
                          ) : (
                            <MarkdownRenderer content={message.content} />
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {(isLoading || isStreaming) && (
                    <div className="flex gap-3">
                      <div className="mt-1 flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/12 text-primary">
                        <Loader2 className="h-4 w-4 animate-spin" />
                      </div>
                      <div className="rounded-[1.5rem] border border-primary/20 bg-card px-4 py-3">
                        <p className="text-sm text-muted-foreground">
                          {isStreaming ? 'Autonomous cycle is running. The team is executing.' : 'Lead CTO is evaluating the next move.'}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="border-t border-border/70 px-4 py-4 sm:px-6">
              <div className="flex flex-col gap-3">
                <div className="flex gap-3">
                  <textarea
                    value={input}
                    onChange={event => setInput(event.target.value)}
                    onKeyDown={event => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        void handleSend();
                      }
                    }}
                    placeholder={projectId ? 'Talk to your CTO. Change the plan, inspect a repo, run a URL, challenge a decision.' : 'Describe what you want built or what you want AION to operate on.'}
                    className="min-h-[88px] flex-1 resize-none rounded-[1.4rem] border border-border/70 bg-background/70 px-4 py-3 text-sm leading-6 outline-none transition focus:border-primary/40 focus:ring-4 focus:ring-primary/10"
                    disabled={isLoading || isStreaming}
                  />
                  <Button
                    onClick={() => void handleSend()}
                    disabled={!input.trim() || isLoading || isStreaming}
                    className="h-auto rounded-[1.4rem] px-5"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>

                <div className="flex flex-wrap gap-2">
                  {projectId && (
                    <>
                      <Button variant="outline" size="sm" className="rounded-full" onClick={() => void handleContinue()}>
                        <MessageSquare className="mr-2 h-4 w-4" />
                        Ask for the call
                      </Button>
                      <Button variant="outline" size="sm" className="rounded-full border-primary/30 text-primary" onClick={() => void handleAutoBuild()}>
                        <FastForward className="mr-2 h-4 w-4" />
                        Run 5-step cycle
                      </Button>
                      <Button variant="outline" size="sm" className="rounded-full" onClick={() => router.push(`/project/${projectId}`)}>
                        <Terminal className="mr-2 h-4 w-4" />
                        Open war room
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        <aside className="space-y-6">
          <Card className="operator-panel overflow-hidden">
            <CardContent className="p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Lead readout</p>
                  <h3 className="mt-1 text-lg font-semibold tracking-[-0.03em]">Current call</h3>
                </div>
                <Sparkles className="h-4 w-4 text-primary" />
              </div>
              <p className="mt-4 text-sm leading-7 text-muted-foreground">
                {leadSummary?.content || 'No active briefing yet. Start with the outcome you want, the repo you care about, or the problem that needs the call.'}
              </p>
            </CardContent>
          </Card>

          <Card className="operator-panel overflow-hidden">
            <CardContent className="p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Execution lane</p>
                  <h3 className="mt-1 text-lg font-semibold tracking-[-0.03em]">Live progress</h3>
                </div>
                {currentStep && (
                  <Badge variant="outline" className="rounded-full">
                    {currentStep.step}/{currentStep.total}
                  </Badge>
                )}
              </div>

              {isStreaming && currentStep && (
                <div className="mt-4 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-2 rounded-full bg-gradient-to-r from-primary via-orange-500 to-amber-300 transition-all"
                    style={{ width: `${(currentStep.step / currentStep.total) * 100}%` }}
                  />
                </div>
              )}

              <ScrollArea className="mt-4 h-[220px] pr-3">
                <div className="space-y-3">
                  {(sseProgress.length > 0 ? sseProgress.slice(-10).reverse() : []).map((event, index) => (
                    <div key={`${event.timestamp}-${index}`} className="rounded-2xl border border-border/60 bg-background/55 p-3">
                      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                        {getProgressIcon(event.type)}
                        {event.agentRole ? AGENT_NAMES[event.agentRole] : 'System'}
                        {currentAgent === event.agentRole && <span className="text-primary">active</span>}
                      </div>
                      <p className="mt-2 text-sm text-foreground">{event.message}</p>
                    </div>
                  ))}

                  {sseProgress.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-border/70 p-4 text-sm text-muted-foreground">
                      No active autonomous cycle. Start a run when you want the system to move without manual stepping.
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          <Card className="operator-panel overflow-hidden">
            <CardContent className="p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Specialists</p>
                  <h3 className="mt-1 text-lg font-semibold tracking-[-0.03em]">Visible team</h3>
                </div>
                <Activity className="h-4 w-4 text-primary" />
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                {(['cto', 'frontend', 'backend', 'qa', 'devops', 'research'] as AgentRole[]).map(role => (
                  <div key={role} className="rounded-2xl border border-border/60 bg-background/55 p-3">
                    <div className="flex items-center gap-3">
                      <div
                        className="flex h-10 w-10 items-center justify-center rounded-2xl text-xs font-semibold"
                        style={{ backgroundColor: `${AGENT_COLORS[role]}20`, color: AGENT_COLORS[role] }}
                      >
                        {AGENT_EMOJIS[role]}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">{AGENT_NAMES[role]}</p>
                        <p className="text-xs text-muted-foreground">{AGENT_DESCRIPTIONS[role]}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </aside>
      </main>
    </div>
  );
}
