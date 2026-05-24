-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'planning',
    "prd" TEXT,
    "executionPlan" TEXT,
    "liveUrl" TEXT,
    "githubRepo" TEXT,
    "totalCycles" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "assignedTo" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "phase" TEXT NOT NULL DEFAULT 'build',
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "output" TEXT,
    "feedback" TEXT,
    "dependsOn" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "completedAt" DATETIME,
    CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProjectFile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProjectFile_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Bug" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "filePath" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'medium',
    "status" TEXT NOT NULL DEFAULT 'open',
    "reportedBy" TEXT NOT NULL,
    "assignedTo" TEXT,
    "fixTaskId" TEXT,
    "resolvedAt" DATETIME,
    CONSTRAINT "Bug_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TestResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "testType" TEXT NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "details" TEXT,
    "ranAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TestResult_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AgentLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "agentRole" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "task" TEXT,
    "input" TEXT,
    "output" TEXT,
    "duration" INTEGER,
    "confidence" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Deployment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'render',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "url" TEXT,
    "githubRepo" TEXT,
    "errors" TEXT,
    "deployedAt" DATETIME,
    CONSTRAINT "Deployment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ConversationMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "agentRole" TEXT,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConversationMessage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AgentMemoryEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentRole" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "resolution" TEXT,
    "confidence" REAL NOT NULL DEFAULT 0.5,
    "projectId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME
);

-- CreateTable
CREATE TABLE "AgentTaskPattern" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentRole" TEXT NOT NULL,
    "taskType" TEXT NOT NULL,
    "approach" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "confidence" REAL NOT NULL DEFAULT 0.5,
    "frequency" INTEGER NOT NULL DEFAULT 1,
    "projectId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "expiresAt" DATETIME
);

-- CreateTable
CREATE TABLE "AgentErrorResolution" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentRole" TEXT NOT NULL,
    "errorPattern" TEXT NOT NULL,
    "resolution" TEXT NOT NULL,
    "workedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "projectId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AgentProjectContext" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AICostEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT,
    "agentRole" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "duration" INTEGER NOT NULL,
    "estimatedCost" INTEGER NOT NULL,
    "taskSnippet" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AICostEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BudgetConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT,
    "dailyLimit" INTEGER NOT NULL,
    "monthlyLimit" INTEGER NOT NULL,
    "alertThreshold" REAL NOT NULL DEFAULT 0.8,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "AgentProjectContext_projectId_key_key" ON "AgentProjectContext"("projectId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetConfig_projectId_key" ON "BudgetConfig"("projectId");
└─────────────────────────────────────────────────────────┘

