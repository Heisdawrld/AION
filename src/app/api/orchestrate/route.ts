// AION — Orchestration API Route
// Runs the autonomous agent loop
// Supports single-step and multi-step execution

import { NextRequest, NextResponse } from 'next/server';
import { boardManager } from '@/lib/engine/board-manager';
import { runOrchestrationStep, runAutonomousCycle, runFullAutonomousPipeline, checkQAGate } from '@/lib/engine/orchestrator';
import { workspaceManager } from '@/lib/engine/workspace-manager';
import { commandRunner } from '@/lib/engine/command-runner';
import { db } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectId, action, steps = 5 } = body;

    if (!projectId) {
      return NextResponse.json(
        { error: 'projectId is required' },
        { status: 400 }
      );
    }

    switch (action) {
      case 'step': {
        // Run a single orchestration step
        const result = await runOrchestrationStep(projectId);

        return NextResponse.json({
          success: result.success,
          message: result.message,
          agentResponses: result.agentResponses.map(r => ({
            agentId: r.agentId,
            status: r.status,
            statusUpdate: r.output.statusUpdate,
            analysis: r.output.analysis?.substring(0, 500),
            confidence: r.confidence,
            taskAssignments: r.output.taskAssignments,
            filesCount: r.output.files?.length || 0,
            bugsCount: r.output.bugs?.length || 0,
            qaGateResult: r.output.qaGateResult,
          })),
          projectStatus: result.projectStatus,
          liveUrl: result.liveUrl,
          cycleCount: result.cycleCount,
          phase: result.phase,
          qaGateResult: result.qaGateResult,
        });
      }

      case 'cycle': {
        // Run multiple steps in sequence (autonomous loop)
        const result = await runAutonomousCycle(projectId, steps);

        return NextResponse.json({
          success: result.success,
          message: result.message,
          agentResponses: result.agentResponses.map(r => ({
            agentId: r.agentId,
            status: r.status,
            statusUpdate: r.output.statusUpdate,
            analysis: r.output.analysis?.substring(0, 300),
            confidence: r.confidence,
            taskAssignments: r.output.taskAssignments,
            filesCount: r.output.files?.length || 0,
            bugsCount: r.output.bugs?.length || 0,
          })),
          projectStatus: result.projectStatus,
          liveUrl: result.liveUrl,
          cycleCount: result.cycleCount,
          phase: result.phase,
        });
      }

      case 'build': {
        // Run the build in the workspace
        // First sync DB files to disk
        await workspaceManager.syncToDisk(projectId);

        // Install dependencies
        const installResult = commandRunner.installDeps(projectId);

        if (!installResult.success) {
          return NextResponse.json({
            success: false,
            message: 'Dependency installation failed',
            error: installResult.stderr.substring(0, 500),
          });
        }

        // Run build
        const buildResult = commandRunner.runBuild(projectId);

        // Save test result
        await db.testResult.create({
          data: {
            projectId,
            testType: 'build',
            passed: buildResult.success,
            details: buildResult.success
              ? 'Build succeeded'
              : buildResult.stderr.substring(0, 500),
          },
        });

        return NextResponse.json({
          success: buildResult.success,
          message: buildResult.success ? 'Build succeeded!' : 'Build failed',
          stdout: buildResult.stdout.substring(0, 500),
          stderr: buildResult.stderr.substring(0, 500),
          duration: buildResult.duration,
        });
      }

      case 'status': {
        // Get current project status
        const state = await boardManager.getProjectState(projectId);
        const workspaceInfo = await workspaceManager.getWorkspaceInfo(projectId);

        if (!state) {
          return NextResponse.json(
            { error: 'Project not found' },
            { status: 404 }
          );
        }

        // Include QA gate status
        const qaGate = await checkQAGate(projectId);

        return NextResponse.json({
          project: state,
          workspace: workspaceInfo,
          qaGate,
        });
      }

      case 'qa-gate': {
        // Check QA gate status specifically
        const qaGate = await checkQAGate(projectId);

        if (!qaGate) {
          return NextResponse.json({
            gateStatus: 'not_run',
            canDeploy: false,
            message: 'QA has not been run yet. Run QA first before deployment.',
          });
        }

        return NextResponse.json({
          gateStatus: qaGate.gateStatus,
          canDeploy: qaGate.canDeploy,
          buildPassed: qaGate.buildPassed,
          typeCheckPassed: qaGate.typeCheckPassed,
          criticalBugCount: qaGate.criticalBugCount,
          highBugCount: qaGate.highBugCount,
          mediumBugCount: qaGate.mediumBugCount,
          lowBugCount: qaGate.lowBugCount,
          summary: qaGate.summary,
        });
      }

      default:
        return NextResponse.json(
          { error: 'Invalid action. Use: step, cycle, build, status, or qa-gate' },
          { status: 400 }
        );
    }
  } catch (error: any) {
    console.error('[AION Orchestrate API] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
