'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { ThemeToggle } from '@/components/theme-toggle';
import {
  AGENT_COLORS,
  AGENT_EMOJIS,
  AGENT_NAMES,
  AGENT_ROLES,
  type AgentRole,
} from '@/lib/types/aion';
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Clock,
  DollarSign,
  ExternalLink,
  FolderKanban,
  Globe,
  LayoutDashboard,
  Loader2,
  Search,
  Sparkles,
  Terminal,
  Zap,
} from 'lucide-react';

interface ProjectListItem {
  id: string;
  name: string;
  description: string;
  status: string;
  liveUrl: string | null;
  githubRepo: string | null;
  totalCycles: number;
  createdAt: string;
  updatedAt: string;
  tasks: TaskItem[];
  bugs: BugItem[];
  _count: {
    files: number;
    agentLogs: number;
  };
}

interface TaskItem {
  id: string;
  assignedTo: string;
  status: string;
}

interface BugItem {
  id: string;
  severity: string;
  status: string;
}

interface CostBreakdown {
  totalCost: number;
  byAgent: Record<string, { cost: number; calls: number; tokens: number }>;
  byProject: Record<string, { cost: number; calls: number }>;
  byModel: Record<string, { cost: number; calls: number }>;
}

const STATUS_LABELS: Record<string, string> = {
  planning: 'Planning',
  building: 'Building',
  testing: 'Testing',
  deploying: 'Deploying',
  live: 'Live',
  failed: 'Failed',
};

const STATUS_STYLES: Record<string, string> = {
  planning: 'border-sky-500/25 bg-sky-500/8 text-sky-600 dark:text-sky-300',
  building: 'border-amber-500/25 bg-amber-500/8 text-amber-600 dark:text-amber-300',
  testing: 'border-violet-500/25 bg-violet-500/8 text-violet-600 dark:text-violet-300',
  deploying: 'border-orange-500/25 bg-orange-500/8 text-orange-600 dark:text-orange-300',
  live: 'border-emerald-500/25 bg-emerald-500/8 text-emerald-600 dark:text-emerald-300',
  failed: 'border-red-500/25 bg-red-500/8 text-red-600 dark:text-red-300',
};

function formatRelativeTime(dateStr: string) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}

function formatCost(cents: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function getProjectCost(projectId: string, costBreakdown: CostBreakdown | null) {
  if (!costBreakdown) return 0;
  return costBreakdown.byProject[projectId]?.cost ?? 0;
}

export default function DashboardPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [costBreakdown, setCostBreakdown] = useState<CostBreakdown | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [projectsRes, costRes] = await Promise.all([
        fetch('/api/project'),
        fetch('/api/cost'),
      ]);

      if (projectsRes.ok) {
        const data = await projectsRes.json();
        setProjects(Array.isArray(data) ? data : []);
      }

      if (costRes.ok) {
        const data = await costRes.json();
        setCostBreakdown(data);
      }
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const filteredProjects = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const sorted = [...projects].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );

    if (!query) return sorted;

    return sorted.filter(project =>
      project.name.toLowerCase().includes(query) ||
      project.description.toLowerCase().includes(query)
    );
  }, [projects, searchQuery]);

  const totalProjects = projects.length;
  const activeProjects = projects.filter(project =>
    ['building', 'testing', 'deploying'].includes(project.status)
  ).length;
  const liveProjects = projects.filter(project => project.status === 'live').length;

  if (isLoading) {
    return (
      <div className="operator-shell flex items-center justify-center">
        <div className="text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-primary/12 text-primary">
            <LayoutDashboard className="h-7 w-7" />
          </div>
          <Loader2 className="mx-auto mt-4 h-6 w-6 animate-spin text-primary" />
          <p className="mt-3 text-sm text-muted-foreground">Loading command center...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="operator-shell">
      <div className="operator-grid pointer-events-none fixed inset-0 opacity-25" />

      <header className="sticky top-0 z-50 border-b border-border/70 bg-background/82 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-4">
            <div
              className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-2xl bg-gradient-to-br from-primary via-orange-500 to-amber-300 text-sm font-semibold text-white shadow-lg shadow-primary/20"
              onClick={() => router.push('/')}
            >
              AI
            </div>
            <div>
              <p className="operator-chip">Portfolio command center</p>
              <h1 className="mt-2 text-xl font-semibold tracking-[-0.03em]">AION Dashboard</h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button variant="outline" size="sm" className="rounded-full" onClick={() => router.push('/')}>
              <Sparkles className="mr-2 h-4 w-4" />
              New brief
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <section className="operator-panel overflow-hidden p-6 sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="operator-chip">Multi-repo oversight</p>
              <h2 className="operator-title mt-4">See the whole machine in one place.</h2>
              <p className="operator-subtitle mt-4 max-w-xl">
                Track active builds, approvals, live systems, and agent effort without dropping into the noise. Open any project when you want the full war room.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Card className="operator-card rounded-2xl">
                <CardContent className="p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Projects</p>
                  <p className="mt-3 text-3xl font-semibold">{totalProjects}</p>
                </CardContent>
              </Card>
              <Card className="operator-card rounded-2xl">
                <CardContent className="p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Active</p>
                  <p className="mt-3 text-3xl font-semibold">{activeProjects}</p>
                </CardContent>
              </Card>
              <Card className="operator-card rounded-2xl">
                <CardContent className="p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">AI spend</p>
                  <p className="mt-3 text-3xl font-semibold">{formatCost(costBreakdown?.totalCost ?? 0)}</p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative w-full sm:max-w-sm">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={event => setSearchQuery(event.target.value)}
                  placeholder="Search projects..."
                  className="h-11 rounded-full border-border/70 bg-card/70 pl-9"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="rounded-full px-3 py-1 text-xs">
                  {activeProjects} active
                </Badge>
                <Badge variant="outline" className="rounded-full px-3 py-1 text-xs">
                  {liveProjects} live
                </Badge>
              </div>
            </div>

            {filteredProjects.length === 0 ? (
              <Card className="operator-panel">
                <CardContent className="py-16 text-center">
                  <FolderKanban className="mx-auto h-10 w-10 text-primary" />
                  <h3 className="mt-4 text-lg font-semibold">No projects found</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Start a new brief from the home screen or adjust your search.
                  </p>
                </CardContent>
              </Card>
            ) : (
              filteredProjects.map(project => {
                const completedTasks = project.tasks.filter(task => task.status === 'done').length;
                const totalTasksForProject = project.tasks.length;
                const progress = totalTasksForProject > 0 ? (completedTasks / totalTasksForProject) * 100 : 0;
                const openBugs = project.bugs.filter(bug => bug.status === 'open').length;
                const agentRoles = Array.from(
                  new Set(
                    project.tasks
                      .map(task => task.assignedTo)
                      .filter(role => AGENT_ROLES.includes(role as AgentRole))
                  )
                ) as AgentRole[];

                return (
                  <Card
                    key={project.id}
                    className="operator-panel cursor-pointer overflow-hidden transition hover:border-primary/35 hover:shadow-[0_24px_80px_-34px_rgba(234,88,12,0.38)]"
                    onClick={() => router.push(`/project/${project.id}`)}
                  >
                    <CardContent className="p-5 sm:p-6">
                      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge className={`rounded-full border ${STATUS_STYLES[project.status] || STATUS_STYLES.planning}`}>
                              {STATUS_LABELS[project.status] || project.status}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              Updated {formatRelativeTime(project.updatedAt)}
                            </span>
                          </div>

                          <h3 className="mt-4 text-xl font-semibold tracking-[-0.03em]">{project.name}</h3>
                          <p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground">
                            {project.description || 'No description yet.'}
                          </p>
                        </div>

                        <div className="flex gap-2">
                          {project.liveUrl && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="rounded-full"
                              onClick={event => {
                                event.stopPropagation();
                                window.open(project.liveUrl!, '_blank');
                              }}
                            >
                              <Globe className="mr-2 h-4 w-4" />
                              Live
                            </Button>
                          )}
                          <Button size="sm" className="rounded-full">
                            <Terminal className="mr-2 h-4 w-4" />
                            Open
                          </Button>
                        </div>
                      </div>

                      <div className="mt-6 grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
                        <div className="space-y-4">
                          <div>
                            <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                              <span>Execution progress</span>
                              <span>{completedTasks}/{totalTasksForProject} tasks</span>
                            </div>
                            <Progress value={progress} className="h-2" />
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <div className="rounded-full border border-border/70 bg-background/60 px-3 py-1 text-xs text-muted-foreground">
                              {project._count.files} files
                            </div>
                            <div className="rounded-full border border-border/70 bg-background/60 px-3 py-1 text-xs text-muted-foreground">
                              {project._count.agentLogs} logs
                            </div>
                            <div className="rounded-full border border-border/70 bg-background/60 px-3 py-1 text-xs text-muted-foreground">
                              {formatCost(getProjectCost(project.id, costBreakdown))}
                            </div>
                            {openBugs > 0 && (
                              <div className="rounded-full border border-red-500/20 bg-red-500/8 px-3 py-1 text-xs text-red-600 dark:text-red-300">
                                {openBugs} open bug{openBugs === 1 ? '' : 's'}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="space-y-3 rounded-3xl border border-border/60 bg-background/55 p-4">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Active specialists</p>
                            <ArrowRight className="h-4 w-4 text-primary" />
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {agentRoles.length > 0 ? (
                              agentRoles.slice(0, 8).map(role => (
                                <div
                                  key={role}
                                  className="flex items-center gap-2 rounded-full border border-border/60 px-3 py-1.5 text-xs"
                                  style={{ backgroundColor: `${AGENT_COLORS[role]}14` }}
                                >
                                  <span style={{ color: AGENT_COLORS[role] }}>{AGENT_EMOJIS[role]}</span>
                                  <span>{AGENT_NAMES[role]}</span>
                                </div>
                              ))
                            ) : (
                              <p className="text-sm text-muted-foreground">No agent assignments yet.</p>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>

          <aside className="space-y-4">
            <Card className="operator-panel">
              <CardContent className="p-5">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Control summary</p>
                <h3 className="mt-2 text-lg font-semibold tracking-[-0.03em]">Portfolio health</h3>
                <div className="mt-5 space-y-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Live systems</span>
                    <span className="font-semibold">{liveProjects}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Active builds</span>
                    <span className="font-semibold">{activeProjects}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Total spend</span>
                    <span className="font-semibold">{formatCost(costBreakdown?.totalCost ?? 0)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="operator-panel">
              <CardContent className="p-5">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Agent footprint</p>
                <h3 className="mt-2 text-lg font-semibold tracking-[-0.03em]">Where the effort went</h3>
                <div className="mt-4 space-y-3">
                  {AGENT_ROLES.filter(role => costBreakdown?.byAgent[role]).slice(0, 6).map(role => (
                    <div key={role} className="flex items-center gap-3 rounded-2xl border border-border/60 bg-background/55 p-3">
                      <div
                        className="flex h-10 w-10 items-center justify-center rounded-2xl text-xs font-semibold"
                        style={{ backgroundColor: `${AGENT_COLORS[role]}20`, color: AGENT_COLORS[role] }}
                      >
                        {AGENT_EMOJIS[role]}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{AGENT_NAMES[role]}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatCost(costBreakdown?.byAgent[role]?.cost ?? 0)} across {costBreakdown?.byAgent[role]?.calls ?? 0} calls
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </aside>
        </section>
      </main>
    </div>
  );
}
