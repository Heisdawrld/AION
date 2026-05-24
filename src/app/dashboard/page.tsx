'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { ThemeToggle } from '@/components/theme-toggle';
import {
  AGENT_EMOJIS,
  AGENT_NAMES,
  AGENT_COLORS,
  AGENT_ROLES,
  type AgentRole,
} from '@/lib/types/aion';
import {
  Zap,
  Search,
  ArrowUpDown,
  Plus,
  Globe,
  ExternalLink,
  MessageSquare,
  Hammer,
  Eye,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock,
  DollarSign,
  Activity,
  FolderKanban,
  TrendingUp,
  Filter,
  ChevronDown,
} from 'lucide-react';

// ============================================================
// Data interfaces
// ============================================================

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

// ============================================================
// Status configuration
// ============================================================

const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string; borderColor: string; dotColor: string; icon: React.ReactNode }> = {
  planning: {
    label: 'Planning',
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-50 dark:bg-blue-950/30',
    borderColor: 'border-blue-200 dark:border-blue-800/50',
    dotColor: 'bg-blue-500',
    icon: <Clock className="w-3 h-3" />,
  },
  building: {
    label: 'Building',
    color: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-50 dark:bg-amber-950/30',
    borderColor: 'border-amber-200 dark:border-amber-800/50',
    dotColor: 'bg-amber-500',
    icon: <Hammer className="w-3 h-3" />,
  },
  testing: {
    label: 'Testing',
    color: 'text-purple-600 dark:text-purple-400',
    bgColor: 'bg-purple-50 dark:bg-purple-950/30',
    borderColor: 'border-purple-200 dark:border-purple-800/50',
    dotColor: 'bg-purple-500',
    icon: <Activity className="w-3 h-3" />,
  },
  deploying: {
    label: 'Deploying',
    color: 'text-orange-600 dark:text-orange-400',
    bgColor: 'bg-orange-50 dark:bg-orange-950/30',
    borderColor: 'border-orange-200 dark:border-orange-800/50',
    dotColor: 'bg-orange-500',
    icon: <Zap className="w-3 h-3" />,
  },
  live: {
    label: 'Live',
    color: 'text-emerald-600 dark:text-emerald-400',
    bgColor: 'bg-emerald-50 dark:bg-emerald-950/30',
    borderColor: 'border-emerald-200 dark:border-emerald-800/50',
    dotColor: 'bg-emerald-500',
    icon: <CheckCircle2 className="w-3 h-3" />,
  },
  failed: {
    label: 'Failed',
    color: 'text-red-600 dark:text-red-400',
    bgColor: 'bg-red-50 dark:bg-red-950/30',
    borderColor: 'border-red-200 dark:border-red-800/50',
    dotColor: 'bg-red-500',
    icon: <AlertCircle className="w-3 h-3" />,
  },
};

type SortField = 'lastActivity' | 'name' | 'status' | 'cost';
type FilterStatus = 'all' | 'planning' | 'building' | 'testing' | 'deploying' | 'live' | 'failed';

// ============================================================
// Helper functions
// ============================================================

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}

function formatCost(cents: number): string {
  const dollars = cents / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(dollars);
}

function getProjectCost(projectId: string, costBreakdown: CostBreakdown | null): number {
  if (!costBreakdown) return 0;
  return costBreakdown.byProject[projectId]?.cost ?? 0;
}

function getAgentRolesForProject(project: ProjectListItem): AgentRole[] {
  const roles = new Set<AgentRole>();
  for (const task of project.tasks) {
    if (AGENT_ROLES.includes(task.assignedTo as AgentRole)) {
      roles.add(task.assignedTo as AgentRole);
    }
  }
  return Array.from(roles);
}

// ============================================================
// Main Component
// ============================================================

export default function DashboardPage() {
  const router = useRouter();

  // Data state
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [costBreakdown, setCostBreakdown] = useState<CostBreakdown | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Filter/sort state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [sortField, setSortField] = useState<SortField>('lastActivity');
  const [sortAsc, setSortAsc] = useState(false);
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);

  // Fetch data
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
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Computed values
  const filteredAndSortedProjects = useMemo(() => {
    let result = [...projects];

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          p.description.toLowerCase().includes(query)
      );
    }

    if (filterStatus !== 'all') {
      result = result.filter((p) => p.status === filterStatus);
    }

    result.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'lastActivity':
          comparison = new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
          break;
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'status': {
          const statusOrder = ['building', 'testing', 'deploying', 'planning', 'live', 'failed'];
          comparison = statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status);
          break;
        }
        case 'cost': {
          const costA = getProjectCost(a.id, costBreakdown);
          const costB = getProjectCost(b.id, costBreakdown);
          comparison = costB - costA;
          break;
        }
      }
      return sortAsc ? -comparison : comparison;
    });

    return result;
  }, [projects, searchQuery, filterStatus, sortField, sortAsc, costBreakdown]);

  // Stats
  const totalProjects = projects.length;
  const totalCost = costBreakdown?.totalCost ?? 0;
  const activeProjects = projects.filter(
    (p) => p.status === 'building' || p.status === 'testing' || p.status === 'deploying'
  ).length;
  const liveProjects = projects.filter((p) => p.status === 'live').length;

  // Toggle sort
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  // ============================================================
  // Loading state
  // ============================================================

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center mx-auto mb-4">
            <Zap className="w-8 h-8 text-white" />
          </div>
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-3 text-amber-500" />
          <p className="text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  // ============================================================
  // Render
  // ============================================================

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white font-bold text-sm cursor-pointer"
              onClick={() => router.push('/')}
            >
              A
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">AION Dashboard</h1>
              <p className="text-xs text-muted-foreground">Multi-Project Overview</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Separator orientation="vertical" className="h-6 mx-1" />
            <Button
              size="sm"
              className="gap-1.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white"
              onClick={() => router.push('/')}
            >
              <Plus className="w-3.5 h-3.5" /> New Project
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card className="overflow-hidden">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Total Projects</p>
                  <p className="text-2xl font-bold mt-1">{totalProjects}</p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                  <FolderKanban className="w-5 h-5 text-amber-500" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Active</p>
                  <p className="text-2xl font-bold mt-1">{activeProjects}</p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center">
                  <Activity className="w-5 h-5 text-orange-500" />
                </div>
              </div>
              {activeProjects > 0 && (
                <p className="text-[10px] text-muted-foreground mt-1">
                  {projects.filter((p) => p.status === 'building').length} building,{' '}
                  {projects.filter((p) => p.status === 'testing').length} testing
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Live</p>
                  <p className="text-2xl font-bold mt-1 text-emerald-600 dark:text-emerald-400">
                    {liveProjects}
                  </p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Total AI Cost</p>
                  <p className="text-2xl font-bold mt-1">{formatCost(totalCost)}</p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center">
                  <DollarSign className="w-5 h-5 text-violet-500" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Cost Summary by Agent Role */}
        {costBreakdown && Object.keys(costBreakdown.byAgent).length > 0 && (
          <Card className="mb-6 overflow-hidden border-amber-500/20">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-amber-500" />
                <CardTitle className="text-sm">AI Cost by Agent Role</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                {AGENT_ROLES.filter((role) => costBreakdown.byAgent[role]).map((role) => {
                  const data = costBreakdown.byAgent[role];
                  return (
                    <div
                      key={role}
                      className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                    >
                      <div
                        className="w-7 h-7 rounded-md flex items-center justify-center text-sm shrink-0"
                        style={{ backgroundColor: `${AGENT_COLORS[role]}20` }}
                      >
                        {AGENT_EMOJIS[role]}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] text-muted-foreground truncate">
                          {AGENT_NAMES[role]}
                        </p>
                        <p className="text-xs font-semibold">{formatCost(data.cost)}</p>
                        <p className="text-[9px] text-muted-foreground">
                          {data.calls} calls
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Filters & Search */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-5">
          {/* Search */}
          <div className="relative flex-1 w-full sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 text-sm"
            />
          </div>

          {/* Status Filter */}
          <div className="relative">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 h-9"
              onClick={() => setShowFilterDropdown(!showFilterDropdown)}
            >
              <Filter className="w-3.5 h-3.5" />
              {filterStatus === 'all' ? 'All Status' : STATUS_CONFIG[filterStatus]?.label || filterStatus}
              <ChevronDown className="w-3 h-3" />
            </Button>
            {showFilterDropdown && (
              <div className="absolute top-full mt-1 left-0 z-50 bg-popover border border-border rounded-lg shadow-lg py-1 min-w-[160px]">
                {(['all', 'planning', 'building', 'testing', 'deploying', 'live', 'failed'] as FilterStatus[]).map(
                  (status) => (
                    <button
                      key={status}
                      className={`w-full text-left px-3 py-1.5 text-sm hover:bg-accent transition-colors flex items-center gap-2 ${
                        filterStatus === status ? 'bg-accent text-amber-600 dark:text-amber-400' : ''
                      }`}
                      onClick={() => {
                        setFilterStatus(status);
                        setShowFilterDropdown(false);
                      }}
                    >
                      {status !== 'all' && (
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${STATUS_CONFIG[status]?.dotColor || 'bg-gray-400'}`}
                        />
                      )}
                      {status === 'all' ? 'All Status' : STATUS_CONFIG[status]?.label || status}
                      {status !== 'all' && (
                        <span className="ml-auto text-xs text-muted-foreground">
                          {projects.filter((p) => p.status === status).length}
                        </span>
                      )}
                    </button>
                  )
                )}
              </div>
            )}
          </div>

          {/* Sort */}
          <div className="flex items-center gap-1">
            {(['lastActivity', 'name', 'status', 'cost'] as SortField[]).map((field) => (
              <Button
                key={field}
                variant={sortField === field ? 'secondary' : 'ghost'}
                size="sm"
                className="h-9 gap-1 text-xs"
                onClick={() => handleSort(field)}
              >
                <ArrowUpDown className="w-3 h-3" />
                {field === 'lastActivity'
                  ? 'Activity'
                  : field === 'name'
                    ? 'Name'
                    : field === 'status'
                      ? 'Status'
                      : 'Cost'}
              </Button>
            ))}
          </div>
        </div>

        {/* Project Grid */}
        {filteredAndSortedProjects.length === 0 ? (
          <Card className="overflow-hidden">
            <CardContent className="py-16 text-center">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-600/20 flex items-center justify-center mx-auto mb-4">
                <FolderKanban className="w-8 h-8 text-amber-500" />
              </div>
              <h3 className="text-lg font-semibold mb-2">
                {projects.length === 0 ? 'No projects yet' : 'No matching projects'}
              </h3>
              <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                {projects.length === 0
                  ? 'Start by describing the app you want to build. Your Lead CTO will coordinate 15 AI agents to bring it to life.'
                  : 'Try adjusting your search or filter criteria.'}
              </p>
              {projects.length === 0 && (
                <Button
                  className="bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white"
                  onClick={() => router.push('/')}
                >
                  <Plus className="w-4 h-4 mr-2" /> Create Your First Project
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredAndSortedProjects.map((project) => {
              const statusCfg = STATUS_CONFIG[project.status] || STATUS_CONFIG.planning;
              const completedTasks = project.tasks.filter((t) => t.status === 'done').length;
              const totalTasks = project.tasks.length;
              const progressPercent = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;
              const projectCost = getProjectCost(project.id, costBreakdown);
              const agentRoles = getAgentRolesForProject(project);
              const openBugs = project.bugs.filter((b) => b.status === 'open').length;

              return (
                <Card
                  key={project.id}
                  className="overflow-hidden cursor-pointer hover:border-amber-500/50 transition-all duration-200 hover:shadow-md group"
                  onClick={() => router.push(`/project/${project.id}`)}
                >
                  {/* Status stripe */}
                  <div className={`h-1 w-full ${statusCfg.dotColor}`} />

                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <CardTitle className="text-base truncate group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
                          {project.name}
                        </CardTitle>
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                          {project.description || 'No description'}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={`shrink-0 text-[10px] gap-1 ${statusCfg.color} ${statusCfg.borderColor}`}
                      >
                        {statusCfg.icon}
                        {statusCfg.label}
                      </Badge>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-3">
                    {/* Progress */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] text-muted-foreground font-medium">
                          Progress
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {completedTasks}/{totalTasks} tasks
                        </span>
                      </div>
                      <Progress value={progressPercent} className="h-1.5" />
                    </div>

                    {/* Agent Activity */}
                    {agentRoles.length > 0 && (
                      <div>
                        <p className="text-[10px] text-muted-foreground font-medium mb-1.5">
                          Agents
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {agentRoles.slice(0, 8).map((role) => (
                            <div
                              key={role}
                              className="w-6 h-6 rounded-md flex items-center justify-center text-xs"
                              style={{ backgroundColor: `${AGENT_COLORS[role]}20` }}
                              title={AGENT_NAMES[role]}
                            >
                              {AGENT_EMOJIS[role]}
                            </div>
                          ))}
                          {agentRoles.length > 8 && (
                            <div className="w-6 h-6 rounded-md flex items-center justify-center text-[10px] bg-muted text-muted-foreground font-medium">
                              +{agentRoles.length - 8}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Metrics Row */}
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <DollarSign className="w-3 h-3" />
                        <span>{formatCost(projectCost)}</span>
                      </div>
                      {openBugs > 0 && (
                        <div className="flex items-center gap-1 text-red-500">
                          <AlertCircle className="w-3 h-3" />
                          <span>{openBugs} bug{openBugs !== 1 ? 's' : ''}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1">
                        <Activity className="w-3 h-3" />
                        <span>{project._count.agentLogs} logs</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <FolderKanban className="w-3 h-3" />
                        <span>{project._count.files} files</span>
                      </div>
                    </div>

                    {/* Live URL */}
                    {project.liveUrl && (
                      <div className="flex items-center gap-1.5 p-1.5 rounded-md bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/30">
                        <Globe className="w-3 h-3 text-emerald-500 shrink-0" />
                        <span className="text-[10px] text-emerald-600 dark:text-emerald-400 truncate flex-1 font-medium">
                          {project.liveUrl.replace(/^https?:\/\//, '')}
                        </span>
                        <ExternalLink
                          className="w-3 h-3 text-emerald-500 shrink-0 cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation();
                            window.open(project.liveUrl!, '_blank');
                          }}
                        />
                      </div>
                    )}

                    <Separator />

                    {/* Footer Row */}
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatRelativeTime(project.updatedAt)}
                      </span>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-[10px] gap-1 text-muted-foreground hover:text-amber-600 dark:hover:text-amber-400"
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/project/${project.id}`);
                          }}
                        >
                          <Eye className="w-3 h-3" /> View
                        </Button>
                        {project.status !== 'live' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-[10px] gap-1 text-muted-foreground hover:text-amber-600 dark:hover:text-amber-400"
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(`/project/${project.id}`);
                            }}
                          >
                            <Hammer className="w-3 h-3" /> Build
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-[10px] gap-1 text-muted-foreground hover:text-amber-600 dark:hover:text-amber-400"
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push('/');
                          }}
                        >
                          <MessageSquare className="w-3 h-3" /> Chat
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Bottom spacer for scroll */}
        <div className="h-8" />
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-background/95 backdrop-blur mt-auto">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-md bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white font-bold text-[8px]">
              A
            </div>
            <span>AION — Autonomous Intelligent Orchestration Network</span>
          </div>
          <div className="flex items-center gap-4">
            <span>{AGENT_ROLES.length} AI Agents</span>
            <span>{totalProjects} Projects</span>
            <span>Total Cost: {formatCost(totalCost)}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
