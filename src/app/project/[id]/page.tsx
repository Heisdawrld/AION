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
  AGENT_EMOJIS,
  AGENT_NAMES,
  AGENT_COLORS,
  type AgentRole,
} from '@/lib/types/aion';
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
} from 'lucide-react';

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
  deployedAt: string | null;
}

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

export default function ProjectDashboard() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [project, setProject] = useState<ProjectData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [isBuilding, setIsBuilding] = useState(false);
  const [lastMessage, setLastMessage] = useState<string>('');

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

  useEffect(() => {
    fetchProject();
    // Poll every 3 seconds when running
    const interval = setInterval(fetchProject, 3000);
    return () => clearInterval(interval);
  }, [fetchProject]);

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
    } catch (error: any) {
      setLastMessage(`Error: ${error.message}`);
    } finally {
      setIsRunning(false);
    }
  };

  const runCycle = async () => {
    setIsRunning(true);
    try {
      const res = await fetch('/api/orchestrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, action: 'cycle', steps: 5 }),
      });
      const data = await res.json();
      setLastMessage(data.message || 'Cycle completed');
      await fetchProject();
    } catch (error: any) {
      setLastMessage(`Error: ${error.message}`);
    } finally {
      setIsRunning(false);
    }
  };

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
    } catch (error: any) {
      setLastMessage(`Error: ${error.message}`);
    } finally {
      setIsBuilding(false);
    }
  };

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
              disabled={isRunning || project.status === 'live'}
            >
              {isRunning ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
              Step
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1"
              onClick={runCycle}
              disabled={isRunning || project.status === 'live'}
            >
              {isRunning ? <Loader2 className="w-3 h-3 animate-spin" /> : <FastForward className="w-3 h-3" />}
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
            <Button variant="ghost" size="icon" onClick={fetchProject}>
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
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 pb-8">
        <Tabs defaultValue="tasks" className="w-full">
          <TabsList className="grid w-full grid-cols-5">
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
            <TabsTrigger value="prd" className="gap-1">
              📋 PRD
            </TabsTrigger>
          </TabsList>

          {/* Tasks Tab */}
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

          {/* Files Tab */}
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
                  <Card key={file.id}>
                    <CardContent className="p-3 flex items-center gap-2">
                      <FileCode className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span className="text-sm font-mono flex-1">{file.path}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {AGENT_EMOJIS[file.createdBy as AgentRole]} {file.createdBy}
                      </Badge>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          {/* Bugs Tab */}
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
                  <Card key={bug.id} className={bug.status === 'open' ? 'border-red-200' : ''}>
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

          {/* Agents Tab */}
          <TabsContent value="agents">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
              {(['cto', 'business', 'frontend', 'backend', 'qa', 'devops'] as AgentRole[]).map(role => {
                const agentLogs = project.agentLogs.filter(l => l.agentRole === role);
                const lastLog = agentLogs[0];
                const agentTasks = project.tasks.filter(t => t.assignedTo === role);
                const doneTasks = agentTasks.filter(t => t.status === 'done').length;

                return (
                  <Card key={role}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-sm"
                          style={{ backgroundColor: `${AGENT_COLORS[role]}20` }}
                        >
                          {AGENT_EMOJIS[role]}
                        </div>
                        <div>
                          <CardTitle className="text-sm">{AGENT_NAMES[role]}</CardTitle>
                          <p className="text-[10px] text-muted-foreground">
                            {doneTasks}/{agentTasks.length} tasks • {agentLogs.length} actions
                          </p>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      {lastLog ? (
                        <div className="text-xs text-muted-foreground">
                          <p className="font-medium">{lastLog.action}</p>
                          {lastLog.confidence !== null && (
                            <div className="mt-1 flex items-center gap-1">
                              <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
                                <div
                                  className="h-full rounded-full"
                                  style={{
                                    width: `${(lastLog.confidence || 0) * 100}%`,
                                    backgroundColor: AGENT_COLORS[role],
                                  }}
                                />
                              </div>
                              <span className="text-[10px]">{((lastLog.confidence || 0) * 100).toFixed(0)}%</span>
                            </div>
                          )}
                          <p className="mt-1 text-[10px]">
                            {new Date(lastLog.createdAt).toLocaleTimeString()}
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

          {/* PRD Tab */}
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
    </div>
  );
}
