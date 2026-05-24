// AION — Project API Route
// CRUD operations for projects + detailed project data

import { NextRequest, NextResponse } from 'next/server';
import { boardManager } from '@/lib/engine/board-manager';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('id');

    if (projectId) {
      // Get single project with full details
      const project = await boardManager.getProject(projectId);

      if (!project) {
        return NextResponse.json(
          { error: 'Project not found' },
          { status: 404 }
        );
      }

      return NextResponse.json(project);
    }

    // List all projects
    const projects = await boardManager.listProjects();
    return NextResponse.json(projects);
  } catch (error: any) {
    console.error('[AION Project API] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, description } = body;

    if (!name) {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      );
    }

    const projectId = await boardManager.createProject(name, description || '');

    return NextResponse.json({
      projectId,
      message: 'Project created',
    });
  } catch (error: any) {
    console.error('[AION Project API] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
