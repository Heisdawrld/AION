'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ThemeToggle } from '@/components/theme-toggle';
import { MarkdownRenderer } from '@/components/markdown-renderer';
import {
  AGENT_EMOJIS,
  AGENT_NAMES,
  AGENT_COLORS,
  type AgentRole,
} from '@/lib/types/aion';
import type { AutonomousProgressEvent } from '@/lib/engine/orchestrator';
import {
  ArrowLeft,
  Play,
  FastForward,
  Hammer,
  RefreshCw,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Clock,
  FileCode,
  Bug as BugIcon,
  Activity,
  Globe,
  Github,
  Zap,
  Eye,
  XCircle,
  AlertTriangle,
  ChevronRight,
  Package,
  ExternalLink,
  Shield,
  CircleDot,
  Rocket,
  GitBranch,
  MonitorCheck,
  ArrowRight,
  Terminal as TerminalIcon,
  Send,
  Trash2,
  ChevronUp,
} from 'lucide-react';

// ============================================================
// Data interfaces
// ============================================================

interface ProjectData {
  id: string;
  name: string;
  description: string;
  status: string;
  prd: any;
  executionPlan: any;
  liveUrl: string | null;
  githubRepo: string | null;
  totalCycles: number;
  tasks: TaskData[];
  files: FileData[];
  bugs: BugData[];
  testResults: TestResultData[];
  agentLogs: AgentLogData[];
  deployments: DeploymentData[];
}

interface TaskData {
  id: string;
  description: string;
  assignedTo: string;
  status: string;
  priority: string;
  phase: string;
  retryCount: number;
  maxRetries: number;
  createdAt: string;
  completedAt: string | null;
}

interface FileData {
  id: string;
  path: string;
  content: string;
  createdBy: string;
  updatedAt: string;
}

interface BugData {
  id: string;
  description: string;
  filePath: string | null;
  severity: string;
  status: string;
  reportedBy: string;
  assignedTo: string | null;
}

interface TestResultData {
  id: string;
  testType: string;
  passed: boolean;
  details: string | null;
  ranAt: string;
}

interface AgentLogData {
  id: string;
  agentRole: string;
  action: string;
  task: string | null;
  duration: number | null;
  confidence: number | null;
  createdAt: string;
}

interface DeploymentData {
  id: string;
  platform: string;
  status: string;
  url: string | null;
  githubRepo: string | null;
  errors: string | null;
  deployedAt: string | null;
}

interface QAGateData {
  gateStatus: string;
  canDeploy: boolean;
  buildPassed: boolean;
  typeCheckPassed: boolean;
  criticalBugCount: number;
  highBugCount: number;
  mediumBugCount: number;
  lowBugCount: number;
  summary: string;
}

// ============================================================
// Status mappings
// ============================================================

const STATUS_COLORS: Record<string, string> = {
  planning: 'bg-blue-500',
  building: 'bg-amber-500',
  testing: 'bg-purple-500',
  deploying: 'bg-orange-500',
  live: 'bg-emerald-500',
  failed: 'bg-red-500',
};

const TASK_STATUS_ICONS: Record<string, React.ReactNode> = {
  pending: <Clock className="w-3 h-3 text-gray-400" />,
  in_progress: <Loader2 className="w-3 h-3 text-blue-500 animate-spin" />,
  review: <AlertCircle className="w-3 h-3 text-amber-500" />,
  done: <CheckCircle2 className="w-3 h-3 text-emerald-500" />,
  failed: <AlertCircle className="w-3 h-3 text-red-500" />,
};

// ============================================================
// Main Component
// ============================================================

export default function ProjectDashboard() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [project, setProject] = useState<ProjectData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [isBuilding, setIsBuilding] = useState(false);
  const [lastMessage, setLastMessage] = useState<string>('');

  // File viewer state
  const [viewingFile, setViewingFile] = useState<FileData | null>(null);
  const [fileDialogOpen, setFileDialogOpen] = useState(false);

  // QA Gate state
  const [qaGate, setQaGate] = useState<QAGateData | null>(null);
  const [qaLoading, setQaLoading] = useState(false);

  // SSE streaming state
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamEvents, setStreamEvents] = useState<AutonomousProgressEvent[]>([]);
  const [currentStreamStep, setCurrentStreamStep] = useState<{ step: number; total: number } | null>(null);

  // Terminal state
  const [terminalInput, setTerminalInput] = useState('');
  const [terminalHistory, setTerminalHistory] = useState<Array<{ command: string; output: string; stderr: string; exitCode: number; duration: number; timestamp: string; blocked?: boolean }>>([]);
  const [isTerminalRunning, setIsTerminalRunning] = useState(false);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const fetchProject = useCallback(async () => {
    try {
      const res = await fetch(`/api/project?id=${projectId}`);
      if (res.ok) {
        const data = await res.json();
        setProject(data);
      }
    } catch (error) {
      console.error('Failed to fetch project:', error);
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  const fetchQAGate = useCallback(async () => {
    setQaLoading(true);
    try {
      const res = await fetch('/api/orchestrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, action: 'qa-gate' }),
      });
      if (res.ok) {
        const data = await res.json();
        setQaGate(data);
      }
    } catch (error) {
      console.error('Failed to fetch QA gate:', error);
    } finally {
      setQaLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchProject();
    fetchQAGate();
    const interval = setInterval(fetchProject, 3000);
    return () => clearInterval(interval);
  }, [fetchProject, fetchQAGate]);

  const runStep = async () => {
    setIsRunning(true);
    try {
      const res = await fetch('/api/orchestrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, action: 'step' }),
      });
      const data = await res.json();
      setLastMessage(data.message || 'Step completed');
      await fetchProject();
      await fetchQAGate();
    } catch (error: any) {
      setLastMessage(`Error: ${error.message}`);
    } finally {
      setIsRunning(false);
    }
  };

  // Auto cycle with SSE streaming
  const runCycle = useCallback(async () => {
    setIsStreaming(true);
    setStreamEvents([]);
    setCurrentStreamStep(null);

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
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event: AutonomousProgressEvent = JSON.parse(line.slice(6));
              setStreamEvents(prev => [...prev, event]);

              if (event.totalSteps) {
                setCurrentStreamStep({ step: event.stepNumber, total: event.totalSteps });
              }

              if (event.type === 'complete' || event.type === 'error') {
                setLastMessage(event.message);
              }
            } catch {
              // Ignore malformed JSON
            }
          }
        }
      }
    } catch (error: any) {
      setLastMessage(`Stream error: ${error.message}`);
    } finally {
      setIsStreaming(false);
      await fetchProject();
      await fetchQAGate();
    }
  }, [projectId, fetchProject, fetchQAGate]);

  const runBuild = async () => {
    setIsBuilding(true);
    try {
      const res = await fetch('/api/orchestrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, action: 'build' }),
      });
      const data = await res.json();
      setLastMessage(data.message || 'Build completed');
      await fetchProject();
      await fetchQAGate();
    } catch (error: any) {
      setLastMessage(`Error: ${error.message}`);
    } finally {
      setIsBuilding(false);
    }
  };

  const handleFileClick = (file: FileData) => {
    setViewingFile(file);
    setFileDialogOpen(true);
  };

  // ============================================================
  // Loading / Not Found states
  // ============================================================

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-amber-500" />
          <p className="text-muted-foreground">Loading project...</p>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <AlertCircle className="w-8 h-8 mx-auto mb-4 text-red-500" />
          <p className="text-muted-foreground">Project not found</p>
          <Button variant="outline" className="mt-4" onClick={() => router.push('/')}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Home
          </Button>
        </div>
      </div>
    );
  }

  const completedTasks = project.tasks.filter(t => t.status === 'done').length;
  const totalTasks = project.tasks.length;
  const progressPercent = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

  // ============================================================
  // QA Gate status helpers
  // ============================================================

  const getGateStatusDisplay = () => {
    if (!qaGate || qaGate.gateStatus === 'not_run') {
      return {
        icon: <CircleDot className="w-5 h-5 text-gray-400" />,
        label: 'Not Run',
        color: 'text-gray-500',
        bg: 'bg-gray-50 dark:bg-gray-900/30',
        border: 'border-gray-200 dark:border-gray-800',
      };
    }
    switch (qaGate.gateStatus) {
      case 'pass':
        return {
          icon: <CheckCircle2 className="w-5 h-5 text-emerald-500" />,
          label: 'PASS',
          color: 'text-emerald-600 dark:text-emerald-400',
          bg: 'bg-emerald-50 dark:bg-emerald-950/30',
          border: 'border-emerald-200 dark:border-emerald-800',
        };
      case 'conditional_pass':
        return {
          icon: <AlertTriangle className="w-5 h-5 text-yellow-500" />,
          label: 'CONDITIONAL PASS',
          color: 'text-yellow-600 dark:text-yellow-400',
          bg: 'bg-yellow-50 dark:bg-yellow-950/30',
          border: 'border-yellow-200 dark:border-yellow-800',
        };
      case 'fail':
        return {
          icon: <XCircle className="w-5 h-5 text-red-500" />,
          label: 'FAIL',
          color: 'text-red-600 dark:text-red-400',
          bg: 'bg-red-50 dark:bg-red-950/30',
          border: 'border-red-200 dark:border-red-800',
        };
      default:
        return {
          icon: <CircleDot className="w-5 h-5 text-gray-400" />,
          label: 'Unknown',
          color: 'text-gray-500',
          bg: 'bg-gray-50 dark:bg-gray-900/30',
          border: 'border-gray-200 dark:border-gray-800',
        };
    }
  };

  const gateDisplay = getGateStatusDisplay();

  // ============================================================
  // Deployment pipeline helpers
  // ============================================================

  const getDeploymentStatusIcon = (status: string) => {
    switch (status) {
      case 'deployed': return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
      case 'failed': return <XCircle className="w-4 h-4 text-red-500" />;
      case 'building': return <Loader2 className="w-4 h-4 text-amber-500 animate-spin" />;
      default: return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  // Pipeline step status
  const getPipelineSteps = (deployment: DeploymentData) => {
    const steps = [
      { name: 'Build', icon: <Hammer className="w-3.5 h-3.5" />, status: 'pending' as string },
      { name: 'Git Push', icon: <GitBranch className="w-3.5 h-3.5" />, status: 'pending' as string },
      { name: 'Deploy', icon: <Rocket className="w-3.5 h-3.5" />, status: 'pending' as string },
      { name: 'URL Test', icon: <MonitorCheck className="w-3.5 h-3.5" />, status: 'pending' as string },
    ];

    if (deployment.status === 'failed') {
      // Mark build as failed, others as skipped
      steps[0].status = 'failed';
      steps[1].status = 'skipped';
      steps[2].status = 'skipped';
      steps[3].status = 'skipped';
    } else if (deployment.status === 'building') {
      steps[0].status = 'done';
      steps[1].status = 'in_progress';
      steps[2].status = 'pending';
      steps[3].status = 'pending';
    } else if (deployment.status === 'deployed') {
      if (deployment.url) {
        steps.forEach(s => s.status = 'done');
      } else {
        steps[0].status = 'done';
        steps[1].status = 'done';
        steps[2].status = 'done';
        steps[3].status = 'pending';
      }
    }

    return steps;
  };

  // ============================================================
  // Agent status helpers
  // ============================================================

  const getAgentStatus = (role: AgentRole) => {
    const inProgressTask = project.tasks.find(t => t.assignedTo === role && t.status === 'in_progress');
    const recentLog = project.agentLogs.find(l => l.agentRole === role);
    const lastActivity = recentLog?.createdAt;
    const confidence = recentLog?.confidence ?? null;

    let status: 'idle' | 'working' | 'done' = 'idle';
    if (inProgressTask) {
      status = 'working';
    } else if (project.tasks.some(t => t.assignedTo === role && t.status === 'done')) {
      status = 'done';
    }

    return {
      status,
      currentTask: inProgressTask?.description || null,
      lastActivity,
      confidence,
      lastAction: recentLog?.action || null,
    };
  };

  // ============================================================
  // SSE Progress icon
  // ============================================================

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

  // ============================================================
  // Render
  // ============================================================

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-background/95 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => router.push('/')}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white font-bold text-xs">
              A
            </div>
            <div>
              <h1 className="text-lg font-bold">{project.name}</h1>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${STATUS_COLORS[project.status] || 'bg-gray-400'}`} />
                <span className="text-xs text-muted-foreground capitalize">{project.status}</span>
                <span className="text-xs text-muted-foreground">• {project.totalCycles} cycles</span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <ThemeToggle />
            {project.liveUrl && (
              <a href={project.liveUrl} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm" className="gap-1">
                  <Globe className="w-3 h-3" /> Live URL
                </Button>
              </a>
            )}
            {project.githubRepo && (
              <a href={project.githubRepo} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm" className="gap-1">
                  <Github className="w-3 h-3" /> GitHub
                </Button>
              </a>
            )}
            <Button
              size="sm"
              variant="outline"
              className="gap-1"
              onClick={runStep}
              disabled={isRunning || isStreaming || project.status === 'live'}
            >
              {isRunning ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
              Step
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1 border-amber-500/30 text-amber-600 dark:text-amber-400"
              onClick={runCycle}
              disabled={isRunning || isStreaming || project.status === 'live'}
            >
              {isStreaming ? <Loader2 className="w-3 h-3 animate-spin" /> : <FastForward className="w-3 h-3" />}
              Auto (5 steps)
            </Button>
            <Button
              size="sm"
              className="gap-1 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white"
              onClick={runBuild}
              disabled={isBuilding}
            >
              {isBuilding ? <Loader2 className="w-3 h-3 animate-spin" /> : <Hammer className="w-3 h-3" />}
              Build
            </Button>
            <Button variant="ghost" size="icon" onClick={() => { fetchProject(); fetchQAGate(); }}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Progress Bar */}
      <div className="max-w-7xl mx-auto px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-muted-foreground">{completedTasks}/{totalTasks} tasks</span>
          <Progress value={progressPercent} className="flex-1 h-2" />
          <span className="text-xs text-muted-foreground">{progressPercent.toFixed(0)}%</span>
        </div>
        {lastMessage && (
          <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
            <Zap className="w-3 h-3 text-amber-500" /> {lastMessage}
          </p>
        )}
        {/* SSE Streaming Progress */}
        {isStreaming && streamEvents.length > 0 && (
          <Card className="mt-3 border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/20">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-500" />
                <span className="text-xs font-medium text-amber-600 dark:text-amber-400">Autonomous Cycle Running</span>
                {currentStreamStep && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    Step {currentStreamStep.step}/{currentStreamStep.total}
                  </Badge>
                )}
              </div>
              {currentStreamStep && (
                <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden mb-2">
                  <div
                    className="h-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-full transition-all duration-500"
                    style={{ width: `${(currentStreamStep.step / currentStreamStep.total) * 100}%` }}
                  />
                </div>
              )}
              <ScrollArea className="max-h-24">
                <div className="space-y-0.5">
                  {streamEvents.slice(-6).map((event, i) => (
                    <div key={i} className="flex items-start gap-2 text-[11px]">
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
            </CardContent>
          </Card>
        )}
      </div>

      {/* QA Gate Status Panel */}
      <div className="max-w-7xl mx-auto px-4 pb-3">
        <Card className={`${gateDisplay.bg} ${gateDisplay.border} border`}>
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Shield className={`w-5 h-5 ${gateDisplay.color}`} />
                <span className={`text-sm font-bold ${gateDisplay.color}`}>
                  QA Gate: {gateDisplay.label}
                </span>
              </div>
              <Separator orientation="vertical" className="h-8" />
              <div className="flex items-center gap-4 flex-1">
                {/* Build Status */}
                <div className="flex items-center gap-1.5">
                  {qaGate?.buildPassed ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  ) : qaGate?.buildPassed === false ? (
                    <XCircle className="w-4 h-4 text-red-500" />
                  ) : (
                    <CircleDot className="w-4 h-4 text-gray-400" />
                  )}
                  <span className="text-xs font-medium">Build</span>
                </div>
                {/* TypeCheck Status */}
                <div className="flex items-center gap-1.5">
                  {qaGate?.typeCheckPassed ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  ) : qaGate?.typeCheckPassed === false ? (
                    <XCircle className="w-4 h-4 text-red-500" />
                  ) : (
                    <CircleDot className="w-4 h-4 text-gray-400" />
                  )}
                  <span className="text-xs font-medium">TypeCheck</span>
                </div>
                {/* Deployable */}
                <div className="flex items-center gap-1.5">
                  {qaGate?.canDeploy ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  ) : qaGate ? (
                    <XCircle className="w-4 h-4 text-red-500" />
                  ) : (
                    <CircleDot className="w-4 h-4 text-gray-400" />
                  )}
                  <span className="text-xs font-medium">Can Deploy</span>
                </div>
              </div>
              {/* Bug counts */}
              {(qaGate && qaGate.gateStatus !== 'not_run') && (
                <div className="flex items-center gap-3">
                  {qaGate.criticalBugCount > 0 && (
                    <Badge variant="destructive" className="text-[10px] gap-1">
                      <BugIcon className="w-2.5 h-2.5" /> {qaGate.criticalBugCount} critical
                    </Badge>
                  )}
                  {qaGate.highBugCount > 0 && (
                    <Badge variant="secondary" className="text-[10px] gap-1 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                      <BugIcon className="w-2.5 h-2.5" /> {qaGate.highBugCount} high
                    </Badge>
                  )}
                  {qaGate.mediumBugCount > 0 && (
                    <Badge variant="secondary" className="text-[10px] gap-1 bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
                      <BugIcon className="w-2.5 h-2.5" /> {qaGate.mediumBugCount} medium
                    </Badge>
                  )}
                  {qaGate.lowBugCount > 0 && (
                    <Badge variant="secondary" className="text-[10px] gap-1">
                      <BugIcon className="w-2.5 h-2.5" /> {qaGate.lowBugCount} low
                    </Badge>
                  )}
                  {qaGate.criticalBugCount === 0 && qaGate.highBugCount === 0 && qaGate.mediumBugCount === 0 && qaGate.lowBugCount === 0 && (
                    <Badge variant="secondary" className="text-[10px] gap-1 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                      <CheckCircle2 className="w-2.5 h-2.5" /> No bugs
                    </Badge>
                  )}
                </div>
              )}
              {qaGate?.summary && (
                <span className="text-[10px] text-muted-foreground max-w-xs truncate">{qaGate.summary}</span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 pb-8">
        <Tabs defaultValue="tasks" className="w-full">
          <TabsList className="grid w-full grid-cols-7">
            <TabsTrigger value="tasks" className="gap-1">
              <Activity className="w-3 h-3" /> Tasks
            </TabsTrigger>
            <TabsTrigger value="files" className="gap-1">
              <FileCode className="w-3 h-3" /> Files ({project.files.length})
            </TabsTrigger>
            <TabsTrigger value="bugs" className="gap-1">
              <BugIcon className="w-3 h-3" /> Bugs ({project.bugs.filter(b => b.status === 'open').length})
            </TabsTrigger>
            <TabsTrigger value="agents" className="gap-1">
              <Zap className="w-3 h-3" /> Agents
            </TabsTrigger>
            <TabsTrigger value="terminal" className="gap-1">
              <TerminalIcon className="w-3 h-3" /> Terminal
            </TabsTrigger>
            <TabsTrigger value="deployments" className="gap-1">
              <Rocket className="w-3 h-3" /> Deploy
            </TabsTrigger>
            <TabsTrigger value="prd" className="gap-1">
              📋 PRD
            </TabsTrigger>
          </TabsList>

          {/* ====== Tasks Tab ====== */}
          <TabsContent value="tasks">
            <div className="space-y-3 mt-4">
              {project.tasks.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    No tasks yet. Run an orchestration step to generate tasks.
                  </CardContent>
                </Card>
              ) : (
                project.tasks.map(task => (
                  <Card key={task.id} className="overflow-hidden">
                    <CardContent className="p-3">
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5">
                          {TASK_STATUS_ICONS[task.status] || <Clock className="w-3 h-3 text-gray-400" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{task.description}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                              {AGENT_EMOJIS[task.assignedTo as AgentRole]} {AGENT_NAMES[task.assignedTo as AgentRole] || task.assignedTo}
                            </Badge>
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 capitalize">
                              {task.phase}
                            </Badge>
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 capitalize">
                              {task.priority}
                            </Badge>
                            {task.retryCount > 0 && (
                              <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                                Retries: {task.retryCount}/{task.maxRetries}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <Badge
                          className="text-[10px] capitalize shrink-0"
                          variant={task.status === 'done' ? 'default' : task.status === 'failed' ? 'destructive' : 'secondary'}
                        >
                          {task.status}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          {/* ====== Files Tab (with content viewer) ====== */}
          <TabsContent value="files">
            <div className="space-y-2 mt-4">
              {project.files.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    No files generated yet. Run builder agents to create code.
                  </CardContent>
                </Card>
              ) : (
                project.files.map(file => (
                  <Card
                    key={file.id}
                    className="overflow-hidden cursor-pointer hover:border-amber-500/50 transition-colors"
                    onClick={() => handleFileClick(file)}
                  >
                    <CardContent className="p-3 flex items-center gap-2">
                      <FileCode className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span className="text-sm font-mono flex-1">{file.path}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {AGENT_EMOJIS[file.createdBy as AgentRole]} {file.createdBy}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-amber-500"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleFileClick(file);
                        }}
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </Button>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          {/* ====== Bugs Tab ====== */}
          <TabsContent value="bugs">
            <div className="space-y-2 mt-4">
              {project.bugs.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    No bugs found yet. 🎉
                  </CardContent>
                </Card>
              ) : (
                project.bugs.map(bug => (
                  <Card key={bug.id} className={bug.status === 'open' ? 'border-red-200 dark:border-red-800/50' : ''}>
                    <CardContent className="p-3">
                      <div className="flex items-start gap-2">
                        <BugIcon className={`w-4 h-4 mt-0.5 shrink-0 ${bug.status === 'open' ? 'text-red-500' : 'text-emerald-500'}`} />
                        <div className="flex-1">
                          <p className="text-sm">{bug.description}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant={bug.severity === 'critical' ? 'destructive' : 'secondary'} className="text-[10px]">
                              {bug.severity}
                            </Badge>
                            {bug.filePath && (
                              <span className="text-[10px] text-muted-foreground font-mono">{bug.filePath}</span>
                            )}
                            {bug.assignedTo && (
                              <Badge variant="outline" className="text-[10px]">
                                {AGENT_EMOJIS[bug.assignedTo as AgentRole]} {bug.assignedTo}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <Badge variant={bug.status === 'open' ? 'destructive' : 'default'} className="text-[10px]">
                          {bug.status}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          {/* ====== Agents Tab (Enhanced) ====== */}
          <TabsContent value="agents">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
              {(['cto', 'business', 'frontend', 'backend', 'qa', 'devops'] as AgentRole[]).map(role => {
                const agentLogs = project.agentLogs.filter(l => l.agentRole === role);
                const lastLog = agentLogs[0];
                const agentTasks = project.tasks.filter(t => t.assignedTo === role);
                const doneTasks = agentTasks.filter(t => t.status === 'done').length;
                const agentState = getAgentStatus(role);

                return (
                  <Card key={role} className={`overflow-hidden ${
                    agentState.status === 'working'
                      ? 'border-amber-500/50 ring-1 ring-amber-500/20'
                      : ''
                  }`}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-sm"
                          style={{ backgroundColor: `${AGENT_COLORS[role]}20` }}
                        >
                          {AGENT_EMOJIS[role]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <CardTitle className="text-sm">{AGENT_NAMES[role]}</CardTitle>
                            {/* Status indicator */}
                            {agentState.status === 'working' ? (
                              <Badge className="text-[8px] px-1.5 py-0 bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30">
                                <Loader2 className="w-2.5 h-2.5 mr-0.5 animate-spin" /> Working
                              </Badge>
                            ) : agentState.status === 'done' ? (
                              <Badge variant="secondary" className="text-[8px] px-1.5 py-0 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                                <CheckCircle2 className="w-2.5 h-2.5 mr-0.5" /> Done
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-[8px] px-1.5 py-0">
                                Idle
                              </Badge>
                            )}
                          </div>
                          <p className="text-[10px] text-muted-foreground">
                            {doneTasks}/{agentTasks.length} tasks • {agentLogs.length} actions
                          </p>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      {/* Current task (if working) */}
                      {agentState.currentTask && (
                        <div className="mb-2 p-2 rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/30">
                          <div className="text-[10px] text-amber-600 dark:text-amber-400 font-medium mb-0.5">Current Task</div>
                          <div className="text-xs text-muted-foreground line-clamp-2">{agentState.currentTask}</div>
                        </div>
                      )}

                      {/* Last action */}
                      {lastLog ? (
                        <div className="text-xs text-muted-foreground">
                          <p className="font-medium line-clamp-2">{lastLog.action}</p>
                          {/* Confidence bar */}
                          {agentState.confidence !== null && (
                            <div className="mt-1.5 flex items-center gap-1">
                              <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all"
                                  style={{
                                    width: `${agentState.confidence * 100}%`,
                                    backgroundColor: agentState.confidence >= 0.7
                                      ? '#10b981'
                                      : agentState.confidence >= 0.4
                                        ? '#f59e0b'
                                        : '#ef4444',
                                  }}
                                />
                              </div>
                              <span className="text-[10px] font-medium">{(agentState.confidence * 100).toFixed(0)}%</span>
                            </div>
                          )}
                          <p className="mt-1 text-[10px]">
                            {agentState.lastActivity
                              ? new Date(agentState.lastActivity).toLocaleTimeString()
                              : 'N/A'
                            }
                          </p>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">Not activated yet</p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Agent Log */}
            <div className="mt-6">
              <h3 className="text-sm font-medium mb-3">Activity Log</h3>
              <ScrollArea className="h-[300px]">
                <div className="space-y-1">
                  {project.agentLogs.slice(0, 30).map(log => (
                    <div key={log.id} className="flex items-center gap-2 py-1 text-xs">
                      <span className="text-[10px] text-muted-foreground w-16 shrink-0">
                        {new Date(log.createdAt).toLocaleTimeString()}
                      </span>
                      <span>{AGENT_EMOJIS[log.agentRole as AgentRole]}</span>
                      <span className="font-medium">{AGENT_NAMES[log.agentRole as AgentRole] || log.agentRole}</span>
                      <span className="text-muted-foreground truncate flex-1">{log.action}</span>
                      {log.confidence !== null && (
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {(log.confidence * 100).toFixed(0)}%
                        </span>
                      )}
                      {log.duration && (
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {(log.duration / 1000).toFixed(1)}s
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </TabsContent>

          {/* ====== Terminal Tab ====== */}
          <TabsContent value="terminal">
            <div className="mt-4">
              <Card className="overflow-hidden border-2 border-gray-800 dark:border-gray-600">
                {/* Terminal Header */}
                <div className="bg-gray-900 dark:bg-gray-950 px-4 py-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1.5">
                      <div className="w-3 h-3 rounded-full bg-red-500" />
                      <div className="w-3 h-3 rounded-full bg-yellow-500" />
                      <div className="w-3 h-3 rounded-full bg-green-500" />
                    </div>
                    <span className="text-xs text-gray-400 font-mono ml-2">
                      AION Terminal — workspaces/{projectId.substring(0, 8)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-gray-500 hover:text-gray-300"
                      onClick={() => { setTerminalHistory([]); setCommandHistory([]); }}
                      title="Clear terminal"
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>

                {/* Terminal Output */}
                <div className="bg-gray-950 dark:bg-black p-4 min-h-[300px] max-h-[500px] overflow-y-auto font-mono text-sm" id="terminal-output">
                  {/* Welcome message */}
                  {terminalHistory.length === 0 && (
                    <div className="text-gray-500 text-xs space-y-1 mb-4">
                      <p>AION Terminal v1.0 — Workspace-scoped shell</p>
                      <p>Type commands below. They run in your project workspace.</p>
                      <p className="text-gray-600">Quick commands: ls, cat, head, grep, npm, npx, git, node</p>
                    </div>
                  )}

                  {/* Command history */}
                  {terminalHistory.map((entry, i) => (
                    <div key={i} className="mb-3">
                      {/* Command line */}
                      <div className="flex items-start gap-1">
                        <span className="text-emerald-400 shrink-0">$</span>
                        <span className="text-gray-200 break-all">{entry.command}</span>
                      </div>
                      {/* Stdout */}
                      {entry.output && (
                        <pre className="text-gray-300 text-xs whitespace-pre-wrap break-all mt-0.5 ml-4">
                          {entry.output}
                        </pre>
                      )}
                      {/* Stderr */}
                      {entry.stderr && (
                        <pre className={`text-xs whitespace-pre-wrap break-all mt-0.5 ml-4 ${entry.blocked ? 'text-yellow-400' : 'text-red-400'}`}>
                          {entry.stderr}
                        </pre>
                      )}
                      {/* Exit code indicator */}
                      <div className="flex items-center gap-2 mt-0.5 ml-4">
                        {entry.exitCode === 0 ? (
                          <span className="text-[10px] text-emerald-600">exited with code 0</span>
                        ) : (
                          <span className="text-[10px] text-red-600">exited with code {entry.exitCode}</span>
                        )}
                        <span className="text-[10px] text-gray-600">{entry.duration}ms</span>
                      </div>
                    </div>
                  ))}

                  {/* Running indicator */}
                  {isTerminalRunning && (
                    <div className="flex items-center gap-2 text-amber-400 text-xs">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span>Running...</span>
                    </div>
                  )}
                </div>

                {/* Terminal Input */}
                <div className="bg-gray-900 dark:bg-gray-950 border-t border-gray-800 px-4 py-2 flex items-center gap-2">
                  <span className="text-emerald-400 font-mono text-sm shrink-0">$</span>
                  <input
                    type="text"
                    value={terminalInput}
                    onChange={(e) => setTerminalInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey && terminalInput.trim()) {
                        e.preventDefault();
                        const cmd = terminalInput.trim();
                        setTerminalInput('');
                        setCommandHistory(prev => [...prev, cmd]);
                        setHistoryIndex(-1);

                        // Execute the command
                        setIsTerminalRunning(true);
                        fetch('/api/terminal', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ projectId, command: cmd }),
                        })
                          .then(res => res.json())
                          .then(data => {
                            setTerminalHistory(prev => [...prev, {
                              command: cmd,
                              output: data.stdout || '',
                              stderr: data.stderr || '',
                              exitCode: data.exitCode ?? 1,
                              duration: data.duration ?? 0,
                              timestamp: new Date().toISOString(),
                              blocked: data.blocked || false,
                            }]);
                            setIsTerminalRunning(false);
                            // Auto-scroll terminal output
                            setTimeout(() => {
                              const el = document.getElementById('terminal-output');
                              if (el) el.scrollTop = el.scrollHeight;
                            }, 50);
                          })
                          .catch(error => {
                            setTerminalHistory(prev => [...prev, {
                              command: cmd,
                              output: '',
                              stderr: `Connection error: ${error.message}`,
                              exitCode: 1,
                              duration: 0,
                              timestamp: new Date().toISOString(),
                            }]);
                            setIsTerminalRunning(false);
                          });
                      }
                      // Command history navigation
                      if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        if (commandHistory.length > 0) {
                          const newIndex = historyIndex === -1 ? commandHistory.length - 1 : Math.max(0, historyIndex - 1);
                          setHistoryIndex(newIndex);
                          setTerminalInput(commandHistory[newIndex]);
                        }
                      }
                      if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        if (historyIndex !== -1) {
                          const newIndex = historyIndex + 1;
                          if (newIndex >= commandHistory.length) {
                            setHistoryIndex(-1);
                            setTerminalInput('');
                          } else {
                            setHistoryIndex(newIndex);
                            setTerminalInput(commandHistory[newIndex]);
                          }
                        }
                      }
                    }}
                    placeholder={isTerminalRunning ? 'Running...' : 'Type a command...'}
                    className="flex-1 bg-transparent text-gray-200 font-mono text-sm focus:outline-none placeholder:text-gray-600"
                    disabled={isTerminalRunning}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0 text-gray-500 hover:text-emerald-400"
                    onClick={() => {
                      if (terminalInput.trim() && !isTerminalRunning) {
                        const cmd = terminalInput.trim();
                        setTerminalInput('');
                        setCommandHistory(prev => [...prev, cmd]);
                        setHistoryIndex(-1);
                        setIsTerminalRunning(true);
                        fetch('/api/terminal', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ projectId, command: cmd }),
                        })
                          .then(res => res.json())
                          .then(data => {
                            setTerminalHistory(prev => [...prev, {
                              command: cmd,
                              output: data.stdout || '',
                              stderr: data.stderr || '',
                              exitCode: data.exitCode ?? 1,
                              duration: data.duration ?? 0,
                              timestamp: new Date().toISOString(),
                              blocked: data.blocked || false,
                            }]);
                            setIsTerminalRunning(false);
                            setTimeout(() => {
                              const el = document.getElementById('terminal-output');
                              if (el) el.scrollTop = el.scrollHeight;
                            }, 50);
                          })
                          .catch(error => {
                            setTerminalHistory(prev => [...prev, {
                              command: cmd,
                              output: '',
                              stderr: `Connection error: ${error.message}`,
                              exitCode: 1,
                              duration: 0,
                              timestamp: new Date().toISOString(),
                            }]);
                            setIsTerminalRunning(false);
                          });
                      }
                    }}
                    disabled={isTerminalRunning || !terminalInput.trim()}
                  >
                    <Send className="w-3 h-3" />
                  </Button>
                </div>
              </Card>

              {/* Quick Commands */}
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="text-xs text-muted-foreground">Quick:</span>
                {[
                  'ls -la',
                  'cat package.json',
                  'git status',
                  'git log --oneline -5',
                  'npm run build',
                  'npx tsc --noEmit',
                  'npm run lint',
                  'cat README.md',
                  'node -e "console.log(process.version)"',
                  'du -sh .',
                ].map(cmd => (
                  <button
                    key={cmd}
                    onClick={() => setTerminalInput(cmd)}
                    className="text-[11px] px-2 py-1 rounded-md border border-border hover:bg-accent hover:border-amber-500/50 font-mono transition-colors text-muted-foreground hover:text-foreground"
                  >
                    {cmd}
                  </button>
                ))}
              </div>

              {/* Terminal Info */}
              <div className="mt-3 flex items-center gap-4 text-[11px] text-muted-foreground">
                <span>Commands run in project workspace directory</span>
                <span>Max timeout: 120s</span>
                <span>Output truncated at 100KB</span>
                <span className="text-yellow-600 dark:text-yellow-400">Dangerous commands are blocked</span>
              </div>
            </div>
          </TabsContent>

          {/* ====== Deployments Tab ====== */}
          <TabsContent value="deployments">
            <div className="space-y-4 mt-4">
              {project.deployments.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    <Rocket className="w-8 h-8 mx-auto mb-3 text-gray-300" />
                    <p>No deployments yet. Run DevOps to deploy the application.</p>
                  </CardContent>
                </Card>
              ) : (
                project.deployments.map(deployment => {
                  const pipelineSteps = getPipelineSteps(deployment);
                  return (
                    <Card key={deployment.id} className="overflow-hidden">
                      <CardContent className="p-4">
                        {/* Deployment header */}
                        <div className="flex items-center gap-3 mb-4">
                          {getDeploymentStatusIcon(deployment.status)}
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium capitalize">{deployment.platform}</span>
                              <Badge
                                variant={
                                  deployment.status === 'deployed' ? 'default' :
                                  deployment.status === 'failed' ? 'destructive' :
                                  'secondary'
                                }
                                className="text-[10px] capitalize"
                              >
                                {deployment.status}
                              </Badge>
                            </div>
                            {deployment.deployedAt && (
                              <span className="text-[10px] text-muted-foreground">
                                {new Date(deployment.deployedAt).toLocaleString()}
                              </span>
                            )}
                          </div>
                          {deployment.url && (
                            <a href={deployment.url} target="_blank" rel="noopener noreferrer">
                              <Button variant="outline" size="sm" className="gap-1 text-xs">
                                <ExternalLink className="w-3 h-3" /> Open
                              </Button>
                            </a>
                          )}
                        </div>

                        {/* Pipeline visualization */}
                        <div className="flex items-center gap-1">
                          {pipelineSteps.map((step, idx) => (
                            <div key={step.name} className="flex items-center gap-1 flex-1">
                              <div className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium flex-1 ${
                                step.status === 'done'
                                  ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/50'
                                  : step.status === 'in_progress'
                                    ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50'
                                    : step.status === 'failed'
                                      ? 'bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800/50'
                                      : 'bg-muted/50 text-muted-foreground border border-border'
                              }`}>
                                {step.status === 'done' ? (
                                  <CheckCircle2 className="w-3 h-3 shrink-0" />
                                ) : step.status === 'in_progress' ? (
                                  <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                                ) : step.status === 'failed' ? (
                                  <XCircle className="w-3 h-3 shrink-0" />
                                ) : (
                                  <span className="shrink-0">{step.icon}</span>
                                )}
                                <span className="truncate">{step.name}</span>
                              </div>
                              {idx < pipelineSteps.length - 1 && (
                                <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
                              )}
                            </div>
                          ))}
                        </div>

                        {/* Deployment URL */}
                        {deployment.url && (
                          <div className="mt-3 p-2 bg-muted/50 rounded-md flex items-center gap-2">
                            <Globe className="w-3 h-3 text-muted-foreground shrink-0" />
                            <span className="text-xs font-mono text-muted-foreground truncate flex-1">{deployment.url}</span>
                          </div>
                        )}

                        {/* Errors */}
                        {deployment.errors && (
                          <div className="mt-3 p-2 bg-red-50 dark:bg-red-950/20 rounded-md border border-red-200 dark:border-red-800/50">
                            <div className="text-[10px] text-red-600 dark:text-red-400 font-medium mb-1">Errors</div>
                            <div className="text-xs text-red-500 dark:text-red-300 font-mono line-clamp-3">{deployment.errors}</div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
          </TabsContent>

          {/* ====== PRD Tab ====== */}
          <TabsContent value="prd">
            <div className="mt-4">
              {project.prd ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Product Requirements Document</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <h4 className="text-sm font-medium mb-1">Problem Statement</h4>
                      <p className="text-sm text-muted-foreground">{project.prd.problemStatement}</p>
                    </div>
                    <Separator />
                    <div>
                      <h4 className="text-sm font-medium mb-1">Target Users</h4>
                      <p className="text-sm text-muted-foreground">{project.prd.targetUsers}</p>
                    </div>
                    <Separator />
                    <div>
                      <h4 className="text-sm font-medium mb-2">MVP Features</h4>
                      <div className="flex flex-wrap gap-1">
                        {project.prd.mvpFeatures?.map((f: string, i: number) => (
                          <Badge key={i} variant="secondary" className="text-xs">{f}</Badge>
                        ))}
                      </div>
                    </div>
                    <Separator />
                    <div>
                      <h4 className="text-sm font-medium mb-2">Success Criteria</h4>
                      <ul className="space-y-1">
                        {project.prd.successCriteria?.map((c: string, i: number) => (
                          <li key={i} className="text-sm text-muted-foreground flex items-center gap-2">
                            <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" /> {c}
                          </li>
                        ))}
                      </ul>
                    </div>
                    {project.prd.coreFeatures?.length > 0 && (
                      <>
                        <Separator />
                        <div>
                          <h4 className="text-sm font-medium mb-2">Core Features</h4>
                          <div className="space-y-2">
                            {project.prd.coreFeatures.map((f: any, i: number) => (
                              <Card key={i}>
                                <CardContent className="p-3">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="text-sm font-medium">{f.name}</span>
                                    <Badge variant="secondary" className="text-[10px]">{f.priority}</Badge>
                                  </div>
                                  <p className="text-xs text-muted-foreground">{f.description}</p>
                                </CardContent>
                              </Card>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    No PRD created yet. Run the Business Strategist agent first.
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* ====== File Content Viewer Dialog ====== */}
      <Dialog open={fileDialogOpen} onOpenChange={setFileDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] p-0">
          <DialogHeader className="p-4 pb-0">
            <DialogTitle className="flex items-center gap-2 text-sm">
              <FileCode className="w-4 h-4 text-muted-foreground" />
              <span className="font-mono">{viewingFile?.path}</span>
              {viewingFile && (
                <Badge variant="outline" className="text-[10px] ml-2">
                  {AGENT_EMOJIS[viewingFile.createdBy as AgentRole]} {viewingFile.createdBy}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="p-4 pt-2">
            {viewingFile?.content ? (
              <ScrollArea className="h-[65vh]">
                <pre className="text-xs font-mono leading-relaxed p-4 bg-muted/50 rounded-lg border border-border overflow-x-auto whitespace-pre-wrap break-words">
                  <code>{viewingFile.content}</code>
                </pre>
              </ScrollArea>
            ) : (
              <div className="py-12 text-center text-muted-foreground">
                <FileCode className="w-8 h-8 mx-auto mb-3 text-gray-300" />
                <p className="text-sm">No content available for this file.</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
