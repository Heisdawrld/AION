#!/usr/bin/env node
// AION — Turso Database Migration Script
// Prisma CLI's `db push` doesn't work with libsql:// URLs (only accepts file: protocol).
// This script creates all tables using the @libsql/client directly.

const { createClient } = require('@libsql/client');

async function main() {
  const url = process.env.DATABASE_URL;
  const authToken = process.env.DATABASE_AUTH_TOKEN;

  if (!url || !url.startsWith('libsql://')) {
    console.error('ERROR: DATABASE_URL must be a libsql:// URL (Turso)');
    console.error('For local SQLite, use: npx prisma db push');
    process.exit(1);
  }

  if (!authToken) {
    console.error('ERROR: DATABASE_AUTH_TOKEN is required for Turso');
    process.exit(1);
  }

  console.log('Connecting to Turso:', url);

  const db = createClient({ url, authToken });

  // Test connection
  try {
    await db.execute('SELECT 1 as test');
    console.log('Connected to Turso successfully!');
  } catch (e) {
    console.error('Failed to connect to Turso:', e.message);
    process.exit(1);
  }

  const tables = [
    {
      name: 'Project',
      sql: `CREATE TABLE IF NOT EXISTS Project (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'planning',
        prd TEXT,
        executionPlan TEXT,
        liveUrl TEXT,
        githubRepo TEXT,
        totalCycles INTEGER NOT NULL DEFAULT 0,
        createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`
    },
    {
      name: 'Task',
      sql: `CREATE TABLE IF NOT EXISTS Task (
        id TEXT PRIMARY KEY NOT NULL,
        projectId TEXT NOT NULL,
        description TEXT NOT NULL,
        assignedTo TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        priority TEXT NOT NULL DEFAULT 'medium',
        phase TEXT NOT NULL DEFAULT 'build',
        retryCount INTEGER NOT NULL DEFAULT 0,
        maxRetries INTEGER NOT NULL DEFAULT 3,
        output TEXT,
        feedback TEXT,
        dependsOn TEXT,
        createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        completedAt DATETIME,
        FOREIGN KEY (projectId) REFERENCES Project(id) ON DELETE CASCADE
      )`
    },
    {
      name: 'ProjectFile',
      sql: `CREATE TABLE IF NOT EXISTS ProjectFile (
        id TEXT PRIMARY KEY NOT NULL,
        projectId TEXT NOT NULL,
        path TEXT NOT NULL,
        content TEXT NOT NULL,
        createdBy TEXT NOT NULL,
        createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (projectId) REFERENCES Project(id) ON DELETE CASCADE
      )`
    },
    {
      name: 'Bug',
      sql: `CREATE TABLE IF NOT EXISTS Bug (
        id TEXT PRIMARY KEY NOT NULL,
        projectId TEXT NOT NULL,
        description TEXT NOT NULL,
        filePath TEXT,
        severity TEXT NOT NULL DEFAULT 'medium',
        status TEXT NOT NULL DEFAULT 'open',
        reportedBy TEXT NOT NULL,
        assignedTo TEXT,
        fixTaskId TEXT,
        resolvedAt DATETIME,
        FOREIGN KEY (projectId) REFERENCES Project(id) ON DELETE CASCADE
      )`
    },
    {
      name: 'TestResult',
      sql: `CREATE TABLE IF NOT EXISTS TestResult (
        id TEXT PRIMARY KEY NOT NULL,
        projectId TEXT NOT NULL,
        testType TEXT NOT NULL,
        passed BOOLEAN NOT NULL,
        details TEXT,
        ranAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (projectId) REFERENCES Project(id) ON DELETE CASCADE
      )`
    },
    {
      name: 'AgentLog',
      sql: `CREATE TABLE IF NOT EXISTS AgentLog (
        id TEXT PRIMARY KEY NOT NULL,
        projectId TEXT NOT NULL,
        agentRole TEXT NOT NULL,
        action TEXT NOT NULL,
        task TEXT,
        input TEXT,
        output TEXT,
        duration INTEGER,
        confidence REAL,
        createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (projectId) REFERENCES Project(id) ON DELETE CASCADE
      )`
    },
    {
      name: 'Deployment',
      sql: `CREATE TABLE IF NOT EXISTS Deployment (
        id TEXT PRIMARY KEY NOT NULL,
        projectId TEXT NOT NULL,
        platform TEXT NOT NULL DEFAULT 'render',
        status TEXT NOT NULL DEFAULT 'pending',
        url TEXT,
        githubRepo TEXT,
        errors TEXT,
        deployedAt DATETIME,
        FOREIGN KEY (projectId) REFERENCES Project(id) ON DELETE CASCADE
      )`
    },
    {
      name: 'ConversationMessage',
      sql: `CREATE TABLE IF NOT EXISTS ConversationMessage (
        id TEXT PRIMARY KEY NOT NULL,
        projectId TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        agentRole TEXT,
        metadata TEXT,
        createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (projectId) REFERENCES Project(id) ON DELETE CASCADE
      )`
    },
    {
      name: 'AgentMemoryEntry',
      sql: `CREATE TABLE IF NOT EXISTS AgentMemoryEntry (
        id TEXT PRIMARY KEY NOT NULL,
        agentRole TEXT NOT NULL,
        category TEXT NOT NULL,
        pattern TEXT NOT NULL,
        resolution TEXT,
        confidence REAL NOT NULL DEFAULT 0.5,
        projectId TEXT,
        createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        expiresAt DATETIME
      )`
    },
    {
      name: 'AgentTaskPattern',
      sql: `CREATE TABLE IF NOT EXISTS AgentTaskPattern (
        id TEXT PRIMARY KEY NOT NULL,
        agentRole TEXT NOT NULL,
        taskType TEXT NOT NULL,
        approach TEXT NOT NULL,
        outcome TEXT NOT NULL,
        confidence REAL NOT NULL DEFAULT 0.5,
        frequency INTEGER NOT NULL DEFAULT 1,
        projectId TEXT,
        createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        expiresAt DATETIME
      )`
    },
    {
      name: 'AgentErrorResolution',
      sql: `CREATE TABLE IF NOT EXISTS AgentErrorResolution (
        id TEXT PRIMARY KEY NOT NULL,
        agentRole TEXT NOT NULL,
        errorPattern TEXT NOT NULL,
        resolution TEXT NOT NULL,
        workedCount INTEGER NOT NULL DEFAULT 0,
        failedCount INTEGER NOT NULL DEFAULT 0,
        projectId TEXT,
        createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`
    },
    {
      name: 'AgentProjectContext',
      sql: `CREATE TABLE IF NOT EXISTS AgentProjectContext (
        id TEXT PRIMARY KEY NOT NULL,
        projectId TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        updatedBy TEXT NOT NULL,
        createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (projectId) REFERENCES Project(id) ON DELETE CASCADE,
        CONSTRAINT AgentProjectContext_projectId_key UNIQUE (projectId, key)
      )`
    },
    {
      name: 'AICostEntry',
      sql: `CREATE TABLE IF NOT EXISTS AICostEntry (
        id TEXT PRIMARY KEY NOT NULL,
        projectId TEXT,
        agentRole TEXT NOT NULL,
        model TEXT NOT NULL,
        inputTokens INTEGER NOT NULL,
        outputTokens INTEGER NOT NULL,
        duration INTEGER NOT NULL,
        estimatedCost INTEGER NOT NULL,
        taskSnippet TEXT,
        createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (projectId) REFERENCES Project(id) ON DELETE CASCADE
      )`
    },
    {
      name: 'BudgetConfig',
      sql: `CREATE TABLE IF NOT EXISTS BudgetConfig (
        id TEXT PRIMARY KEY NOT NULL,
        projectId TEXT UNIQUE,
        dailyLimit INTEGER NOT NULL,
        monthlyLimit INTEGER NOT NULL,
        alertThreshold REAL NOT NULL DEFAULT 0.8,
        createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`
    },
    {
      name: 'RepoWorkspace',
      sql: `CREATE TABLE IF NOT EXISTS RepoWorkspace (
        id TEXT PRIMARY KEY NOT NULL,
        projectId TEXT NOT NULL,
        name TEXT NOT NULL,
        slug TEXT NOT NULL,
        repoUrl TEXT,
        repoProvider TEXT,
        defaultBranch TEXT DEFAULT 'main',
        currentBranch TEXT DEFAULT 'main',
        rootPath TEXT,
        status TEXT NOT NULL DEFAULT 'inactive',
        isPrimary BOOLEAN NOT NULL DEFAULT false,
        lastSyncedAt DATETIME,
        createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (projectId) REFERENCES Project(id) ON DELETE CASCADE,
        CONSTRAINT RepoWorkspace_projectId_slug_key UNIQUE (projectId, slug)
      )`
    },
    {
      name: 'ExecutionRun',
      sql: `CREATE TABLE IF NOT EXISTS ExecutionRun (
        id TEXT PRIMARY KEY NOT NULL,
        projectId TEXT NOT NULL,
        workspaceId TEXT,
        agentRole TEXT,
        kind TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'queued',
        summary TEXT NOT NULL,
        command TEXT,
        requestedBy TEXT,
        approvalRequired BOOLEAN NOT NULL DEFAULT false,
        startedAt DATETIME,
        completedAt DATETIME,
        output TEXT,
        error TEXT,
        createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (projectId) REFERENCES Project(id) ON DELETE CASCADE,
        FOREIGN KEY (workspaceId) REFERENCES RepoWorkspace(id) ON DELETE SET NULL
      )`
    },
    {
      name: 'ApprovalRequest',
      sql: `CREATE TABLE IF NOT EXISTS ApprovalRequest (
        id TEXT PRIMARY KEY NOT NULL,
        projectId TEXT NOT NULL,
        workspaceId TEXT,
        runId TEXT,
        type TEXT NOT NULL,
        riskLevel TEXT NOT NULL DEFAULT 'medium',
        status TEXT NOT NULL DEFAULT 'pending',
        summary TEXT NOT NULL,
        commandPreview TEXT,
        diffSummary TEXT,
        requestedBy TEXT,
        decidedBy TEXT,
        decisionReason TEXT,
        decidedAt DATETIME,
        createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (projectId) REFERENCES Project(id) ON DELETE CASCADE,
        FOREIGN KEY (workspaceId) REFERENCES RepoWorkspace(id) ON DELETE SET NULL,
        FOREIGN KEY (runId) REFERENCES ExecutionRun(id) ON DELETE SET NULL
      )`
    },
    {
      name: 'ExecutionArtifact',
      sql: `CREATE TABLE IF NOT EXISTS ExecutionArtifact (
        id TEXT PRIMARY KEY NOT NULL,
        projectId TEXT NOT NULL,
        workspaceId TEXT,
        runId TEXT,
        kind TEXT NOT NULL,
        title TEXT NOT NULL,
        path TEXT,
        contentType TEXT,
        content TEXT,
        metadata TEXT,
        sizeBytes INTEGER,
        createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (projectId) REFERENCES Project(id) ON DELETE CASCADE,
        FOREIGN KEY (workspaceId) REFERENCES RepoWorkspace(id) ON DELETE SET NULL,
        FOREIGN KEY (runId) REFERENCES ExecutionRun(id) ON DELETE SET NULL
      )`
    },
  ];

  const indexes = [
    'CREATE INDEX IF NOT EXISTS Task_projectId_idx ON Task(projectId)',
    'CREATE INDEX IF NOT EXISTS ProjectFile_projectId_idx ON ProjectFile(projectId)',
    'CREATE INDEX IF NOT EXISTS Bug_projectId_idx ON Bug(projectId)',
    'CREATE INDEX IF NOT EXISTS TestResult_projectId_idx ON TestResult(projectId)',
    'CREATE INDEX IF NOT EXISTS AgentLog_projectId_idx ON AgentLog(projectId)',
    'CREATE INDEX IF NOT EXISTS Deployment_projectId_idx ON Deployment(projectId)',
    'CREATE INDEX IF NOT EXISTS ConversationMessage_projectId_idx ON ConversationMessage(projectId)',
    'CREATE INDEX IF NOT EXISTS AICostEntry_projectId_idx ON AICostEntry(projectId)',
    'CREATE INDEX IF NOT EXISTS AgentMemoryEntry_agentRole_idx ON AgentMemoryEntry(agentRole)',
    'CREATE INDEX IF NOT EXISTS AgentTaskPattern_agentRole_idx ON AgentTaskPattern(agentRole)',
    'CREATE INDEX IF NOT EXISTS AgentErrorResolution_agentRole_idx ON AgentErrorResolution(agentRole)',
    'CREATE INDEX IF NOT EXISTS AgentProjectContext_projectId_idx ON AgentProjectContext(projectId)',
    'CREATE INDEX IF NOT EXISTS RepoWorkspace_projectId_idx ON RepoWorkspace(projectId)',
    'CREATE INDEX IF NOT EXISTS ExecutionRun_projectId_idx ON ExecutionRun(projectId)',
    'CREATE INDEX IF NOT EXISTS ExecutionRun_workspaceId_idx ON ExecutionRun(workspaceId)',
    'CREATE INDEX IF NOT EXISTS ApprovalRequest_projectId_idx ON ApprovalRequest(projectId)',
    'CREATE INDEX IF NOT EXISTS ApprovalRequest_workspaceId_idx ON ApprovalRequest(workspaceId)',
    'CREATE INDEX IF NOT EXISTS ApprovalRequest_runId_idx ON ApprovalRequest(runId)',
    'CREATE INDEX IF NOT EXISTS ExecutionArtifact_projectId_idx ON ExecutionArtifact(projectId)',
    'CREATE INDEX IF NOT EXISTS ExecutionArtifact_workspaceId_idx ON ExecutionArtifact(workspaceId)',
    'CREATE INDEX IF NOT EXISTS ExecutionArtifact_runId_idx ON ExecutionArtifact(runId)',
  ];

  console.log(`\nCreating ${tables.length} tables...`);

  for (const table of tables) {
    try {
      await db.execute(table.sql);
      console.log(`  OK ${table.name}`);
    } catch (e) {
      if (e.message && e.message.includes('already exists')) {
        console.log(`  SKIP ${table.name} (already exists)`);
      } else {
        console.error(`  FAIL ${table.name}: ${e.message}`);
      }
    }
  }

  console.log(`\nCreating ${indexes.length} indexes...`);
  for (const idxSql of indexes) {
    try {
      await db.execute(idxSql);
    } catch (e) {
      if (!e.message?.includes('already exists')) {
        console.error(`  Index error: ${e.message}`);
      }
    }
  }
  console.log('  OK indexes created');

  console.log('\nVerifying tables...');
  const result = await db.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
  const tableNames = result.rows.map(r => r.name);
  console.log('Tables in database:', tableNames.join(', '));

  console.log('\nDatabase migration complete!');
}

main().catch(e => {
  console.error('Migration failed:', e.message);
  process.exit(1);
});
