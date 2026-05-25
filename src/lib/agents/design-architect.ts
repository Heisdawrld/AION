// AION — Design Architect Agent
// UI/UX design, design systems, accessibility, and visual consistency.
// "Good design is invisible. Bad design is everywhere. I make the invisible kind."

import { BaseAgent } from './base-agent';
import type {
  AgentResponse,
  FileChange,
} from '@/lib/types/aion';

// ============================================================
// THE DESIGN ARCHITECT — OBSESSED WITH USERS, RUTHLESS ABOUT CONSISTENCY
// ============================================================
const DESIGN_SYSTEM_PROMPT = `You are the Design Architect Agent of AION. Build consistent, accessible, mobile-first design systems. Every pixel has a purpose. Consistency beats creativity.

ROLE: Design UI components with proper layout/spacing/hierarchy, create design systems (colors, typography, spacing), ensure mobile-first responsive design, implement accessibility, generate Tailwind CSS config/custom styles.

FILES: Only write to src/components/**, src/app/**/page.tsx, src/app/**/layout.tsx, src/app/globals.css, tailwind.config.ts. Never write API routes or database queries.

DESIGN PRINCIPLES: Mobile first, consistency (same spacing/colors everywhere), hierarchy, feedback on every action, simplicity, accessibility (WCAG 2.1 AA), whitespace.

STANDARDS: 4px base grid, consistent border-radius, 3 shadow levels, transitions 150-300ms, Tailwind utilities only, cn() helper, responsive breakpoints sm/md/lg/xl.

RULES:
1. TypeScript, no plain JS
2. Tailwind CSS classes (no inline styles except dynamic)
3. Responsive classes on every component
4. Accessibility attributes (aria-*, role, tabIndex)
5. Complete working components, no placeholders
6. Use existing shadcn/ui components
7. Include hover/focus/active/disabled states

OUTPUT JSON:
{"status":"success|failed|needs_clarification","output":{"analysis":"...","files":[{"path":"...","content":"...","action":"create|update","description":"..."}],"designSystem":{"colors":[{"name":"...","value":"...","usage":"..."}],"typography":"...","spacing":"...","components":["..."]},"dependencies":["..."],"statusUpdate":"...","nextSteps":["..."]},"confidence":0.0-1.0}`;

// ============================================================
// INTERFACES
// ============================================================

interface DesignOutput {
  status: 'success' | 'failed' | 'needs_clarification';
  output: {
    analysis?: string;
    files?: FileChange[];
    designSystem?: {
      colors?: { name: string; value: string; usage: string }[];
      typography?: string;
      spacing?: string;
      components?: string[];
    };
    dependencies?: string[];
    statusUpdate?: string;
    nextSteps?: string[];
  };
  confidence: number;
}

export class DesignArchitectAgent extends BaseAgent {
  constructor() {
    super({
      role: 'design',
      name: 'Design Architect',
      systemPrompt: DESIGN_SYSTEM_PROMPT,
      writeAccess: ['fileManifest:design', 'designSystem', 'agentLog'],
      deniedAccess: ['src/app/api/**', 'prisma/**', 'testResults', 'deployStatus'],
    });
  }

  async execute(task: string, context: string): Promise<AgentResponse> {
    const userMessage = `CURRENT PROJECT STATE:\n${context}\n\nYOUR DESIGN TASK:\n${task}`;

    const result = await this.callAgentAI<DesignOutput>(userMessage);

    if (!result.data) {
      return this.createResponse(
        'design-task',
        'needs_clarification',
        { analysis: 'I had trouble generating the design. Let me try again.' },
        0.3
      );
    }

    const data = result.data;

    return this.createResponse(
      'design-task',
      data.status || 'success',
      {
        analysis: data.output?.analysis,
        files: data.output?.files,
        statusUpdate: data.output?.statusUpdate,
        nextSteps: data.output?.nextSteps,
      },
      data.confidence || 0.7
    );
  }
}
