// AION — Business Strategist Agent (Enhanced)
// Senior product manager — no fluff, opinionated features, real PRDs.
// Now with PRD validation, revision capability, and structured output extraction.
// The Business Agent is the first agent to touch every project — it sets the direction.

import { BaseAgent } from './base-agent';
import type { AgentResponse, PRD, Feature, UserStory } from '@/lib/types/aion';

// ============================================================
// THE BUSINESS STRATEGIST — BRUTALLY HONEST, OPINIONATED, NO FLUFF
// ============================================================
const BUSINESS_SYSTEM_PROMPT = `You are the Business Strategist Agent of AION.

You are a senior product manager and business analyst with 15+ years of experience shipping products. You've launched products that made millions and killed products that should never have been built. You've written PRDs that engineering teams loved — clear, specific, actionable — and you've shredded PRDs that wasted everyone's time with vague requirements and impossible scopes. You know the difference between a feature users NEED and a feature that sounds cool in a pitch meeting.

YOUR PERSONALITY:
- You are BRUTALLY HONEST about product viability. "That's a nice-to-have, not a must-have."
- You are OPINIONATED about feature prioritization. You know what ships products and what kills them.
- You write PRDs that ENGINEERS can build from. No ambiguity, no vague requirements, no "make it intuitive."
- You separate MUST-HAVE from NICE-TO-HAVE ruthlessly. MVP is about what you CUT, not what you add.
- You think about the BUSINESS — who pays, why they pay, what keeps them coming back.
- You CHALLENGE assumptions. "You say users want this. Where's the evidence?"
- You ESTIMATE complexity honestly. A "simple" chat feature is never simple.
- You think about what happens AFTER launch. How does this grow? What's the retention hook?

YOUR ROLE:
- Analyze the user's idea THOROUGHLY — don't just accept it, stress-test it
- Write a comprehensive, actionable PRD that engineers can build from
- Define user stories with CLEAR, SPECIFIC, TESTABLE acceptance criteria
- Define MVP scope aggressively — cut everything that isn't essential
- Prioritize features by business VALUE, not technical ease
- Identify risks, unknowns, and assumptions that could derail the project
- When revising a PRD, be surgical — change only what needs changing

PRD STRUCTURE (FOLLOW THIS EXACTLY):
Every PRD MUST include:

1. projectName: Short, memorable name (no "App" or "Platform" suffix unless essential)
2. problemStatement: 2-3 sentences anyone can understand. What pain exists? Who feels it?
3. targetUsers: SPECIFIC segment with context. "Freelance designers managing 5+ client projects" NOT "professionals"
4. coreFeatures: Array of features, each with:
   - name: Short feature name
   - description: What it does and why it matters (2-3 sentences)
   - userStories: Array of stories, each with:
     - id: "US01", "US02", etc.
     - asA: Specific user type
     - iWant: Specific capability
     - soThat: Specific benefit
     - acceptanceCriteria: Array of 2-4 SPECIFIC, TESTABLE criteria. NOT "good UX" or "works well"
   - priority: critical|high|medium|low
5. mvpFeatures: The MINIMUM set needed to solve the core problem. Be aggressive about cutting.
6. postMvpFeatures: Everything else. Nice to have, but not required for launch.
7. technicalPreferences: Suggested tech constraints (framework, auth, etc.)
8. successCriteria: MEASURABLE metrics. "User can create, edit, delete items within 2 clicks" NOT "good UX"
9. summary: 1-2 sentence elevator pitch

ACCEPTANCE CRITERIA RULES:
Good: "User can add a new item by clicking 'Add' button, filling in name (required) and description (optional), and clicking 'Save'. Item appears in the list within 1 second."
Bad: "User can add items easily."
Good: "When user clicks 'Delete', a confirmation dialog appears. On confirm, item is removed from list and a success toast is shown."
Bad: "User can delete items."
Good: "Dashboard shows total items count, items added today, and items due this week. Data refreshes when page loads."
Bad: "Dashboard provides useful information."

MVP CUTTING RULES:
- If the app works WITHOUT it, it's NOT MVP
- If it's about polish, analytics, or optimization, it's NOT MVP
- If only 20% of users would use it, it's NOT MVP
- If it requires a third-party integration, consider it post-MVP
- Default to FEWER features. You can always add. You can't always ship.

YOUR RULES (ANTI-HALLUCINATION):
1. You ONLY write about features the user actually mentioned or strongly implied
2. If you want to suggest additional features, clearly mark them as [SUGGESTION] with a reason WHY
3. Every feature MUST have at least 2 acceptance criteria — specific, testable, not vague
4. You MUST separate MVP features from post-MVP features — be aggressive about cutting from MVP
5. Your PRD MUST follow the exact JSON structure provided
6. Do NOT invent user needs — infer only from what the user said
7. If the user's idea is vague, be honest about what's unclear and make reasonable assumptions (clearly labeled)
8. When REVISING a PRD, only change what the user asked to change — don't rewrite everything
9. Never add more than 5 features to MVP — if you have more, you haven't cut enough

OUTPUT FORMAT:
Respond with valid JSON matching this structure:
{
  "status": "success" | "failed" | "needs_clarification",
  "output": {
    "analysis": "Your honest assessment — viability, risks, what's exciting, what's concerning",
    "prd": {
      "projectName": "...",
      "problemStatement": "Clear, specific problem this solves",
      "targetUsers": "Specific user segment with context",
      "coreFeatures": [{ "name": "...", "description": "...", "userStories": [{ "id": "US01", "asA": "...", "iWant": "...", "soThat": "...", "acceptanceCriteria": ["Specific, testable criterion"] }], "priority": "critical|high|medium|low" }],
      "mvpFeatures": ["Feature that is ESSENTIAL for launch"],
      "postMvpFeatures": ["Feature that would be nice but isn't required"],
      "technicalPreferences": "Suggested tech stack and constraints",
      "successCriteria": ["Measurable, specific success metric"],
      "summary": "1-2 sentence summary"
    },
    "statusUpdate": "What you produced — be specific about features, cuts, and any concerns",
    "nextSteps": ["Specific actions for the CTO to take"]
  },
  "confidence": 0.0-1.0
}`;

// ============================================================
// INTERFACES
// ============================================================

interface BusinessOutput {
  status: 'success' | 'failed' | 'needs_clarification';
  output: {
    analysis?: string;
    prd?: PRD;
    statusUpdate?: string;
    nextSteps?: string[];
  };
  confidence: number;
}

export class BusinessStrategistAgent extends BaseAgent {
  constructor() {
    super({
      role: 'business',
      name: 'Business Strategist',
      systemPrompt: BUSINESS_SYSTEM_PROMPT,
      writeAccess: ['prd', 'userStories', 'mvpScope', 'agentLog'],
      deniedAccess: ['fileManifest', 'taskQueue', 'testResults', 'deployStatus'],
    });
  }

  /**
   * MAIN EXECUTE — Create or revise a PRD
   * This is the entry point for all Business Agent tasks
   */
  async execute(task: string, context: string): Promise<AgentResponse> {
    const userMessage = `CURRENT PROJECT STATE:\n${context}\n\nYOUR TASK:\n${task}`;

    const result = await this.callAgentAI<BusinessOutput>(userMessage);

    if (!result.data) {
      // Try to extract PRD from raw text if AI didn't return structured JSON
      const extractedPrd = this.tryExtractPRDFromRaw(result.raw);
      if (extractedPrd) {
        return this.createResponse(
          'business-task',
          'success',
          {
            analysis: 'PRD extracted from response (AI formatting was non-standard but content was captured).',
            statusUpdate: `📋 PRD created for "${extractedPrd.projectName}" with ${extractedPrd.coreFeatures?.length || 0} core features and ${extractedPrd.mvpFeatures?.length || 0} MVP features.`,
            nextSteps: ['CTO reviews PRD', 'Create execution plan'],
          },
          0.6
        );
      }

      return this.createResponse(
        'business-task',
        'needs_clarification',
        {
          analysis: 'I had trouble structuring the PRD. The idea might need more detail, or I need to retry.',
          statusUpdate: '⚠️ Business Agent encountered a formatting issue. Please try again or provide more detail about your idea.',
        },
        0.3
      );
    }

    const data = result.data;
    const prd = data.output?.prd;

    // Validate the PRD quality
    const validation = this.validatePRD(prd);

    // Build a detailed status update
    let statusUpdate = data.output?.statusUpdate;
    if (!statusUpdate && prd) {
      statusUpdate = this.buildStatusUpdate(prd, validation);
    }

    // Add validation warnings to analysis if any
    let analysis = data.output?.analysis;
    if (validation.warnings.length > 0) {
      analysis = (analysis || '') + '\n\n⚠️ PRD Quality Notes:\n' + validation.warnings.map(w => `- ${w}`).join('\n');
    }

    return this.createResponse(
      'business-task',
      data.status || (validation.isValid ? 'success' : 'needs_clarification'),
      {
        analysis,
        statusUpdate,
        nextSteps: data.output?.nextSteps || (validation.isValid
          ? ['CTO reviews PRD and creates execution plan', 'Begin building MVP features']
          : ['Refine PRD based on quality notes', 'Add more specific acceptance criteria']),
      },
      data.confidence || (validation.isValid ? 0.8 : 0.5)
    );
  }

  /**
   * Create a PRD from a user's idea — convenience method
   */
  async createPRD(userIdea: string, projectState: string): Promise<AgentResponse> {
    const task = `Create a comprehensive PRD for this idea: "${userIdea}"

Remember:
- Be HONEST about viability. Is this a good idea? What are the risks?
- Every feature needs CLEAR, SPECIFIC acceptance criteria — not vague ones
- Separate MVP from post-MVP AGGRESSIVELY — cut everything that isn't essential
- Mark suggested features as [SUGGESTION] with a clear reason WHY
- Be specific about target users — not "everyone" but a specific segment
- Include measurable success criteria
- MVP should have NO MORE than 5 features — if you have more, cut harder`;

    return this.execute(task, projectState);
  }

  /**
   * Revise an existing PRD based on feedback or changes
   */
  async revisePRD(existingPRD: PRD, feedback: string, projectState: string): Promise<AgentResponse> {
    const task = `REVISE the existing PRD based on this feedback: "${feedback}"

EXISTING PRD:
${JSON.stringify(existingPRD, null, 2)}

INSTRUCTIONS:
- Only change what the feedback asks for — don't rewrite everything
- If the feedback asks to add features, consider if they should be MVP or post-MVP
- If the feedback asks to remove features, remove them and update user stories accordingly
- Keep all the parts that aren't being changed
- Make sure the revised PRD still follows all quality standards
- Update the summary if the scope has changed significantly`;

    return this.execute(task, projectState);
  }

  // ============================================================
  // PRD VALIDATION
  // ============================================================

  /**
   * Validate a PRD for quality and completeness
   * Returns validation result with warnings for issues
   */
  private validatePRD(prd: PRD | undefined): { isValid: boolean; warnings: string[] } {
    const warnings: string[] = [];

    if (!prd) {
      return { isValid: false, warnings: ['No PRD was generated'] };
    }

    // Check required fields
    if (!prd.projectName) warnings.push('Missing project name');
    if (!prd.problemStatement) warnings.push('Missing problem statement');
    if (!prd.targetUsers) warnings.push('Missing target users — should be specific, not generic');
    if (!prd.summary) warnings.push('Missing summary — need a 1-2 sentence elevator pitch');

    // Check core features
    if (!prd.coreFeatures || prd.coreFeatures.length === 0) {
      warnings.push('No core features defined — PRD needs at least 1 feature');
    } else {
      // Check each feature
      for (const feature of prd.coreFeatures) {
        if (!feature.name) warnings.push(`Feature missing name`);
        if (!feature.description) warnings.push(`Feature "${feature.name}" missing description`);

        // Check user stories
        if (!feature.userStories || feature.userStories.length === 0) {
          warnings.push(`Feature "${feature.name}" has no user stories`);
        } else {
          for (const story of feature.userStories) {
            if (!story.asA || !story.iWant || !story.soThat) {
              warnings.push(`User story "${story.id}" is incomplete — needs asA, iWant, soThat`);
            }
            if (!story.acceptanceCriteria || story.acceptanceCriteria.length < 2) {
              warnings.push(`User story "${story.id}" needs at least 2 specific acceptance criteria`);
            }
          }
        }

        // Check priority
        if (!['critical', 'high', 'medium', 'low'].includes(feature.priority)) {
          warnings.push(`Feature "${feature.name}" has invalid priority: ${feature.priority}`);
        }
      }
    }

    // Check MVP features
    if (!prd.mvpFeatures || prd.mvpFeatures.length === 0) {
      warnings.push('No MVP features defined — need to specify which features are essential');
    } else if (prd.mvpFeatures.length > 5) {
      warnings.push(`MVP has ${prd.mvpFeatures.length} features — consider cutting to 5 or fewer for a faster launch`);
    }

    // Check success criteria
    if (!prd.successCriteria || prd.successCriteria.length === 0) {
      warnings.push('No success criteria defined — need measurable metrics');
    }

    // Check for vague language
    const vaguePhrases = ['intuitive', 'user-friendly', 'easy to use', 'seamless', 'good ux', 'works well', 'nice'];
    const allText = JSON.stringify(prd).toLowerCase();
    const foundVague = vaguePhrases.filter(phrase => allText.includes(phrase));
    if (foundVague.length > 0) {
      warnings.push(`PRD contains vague language: "${foundVague.join('", "')}". Replace with specific, testable criteria.`);
    }

    // PRD is valid if there are no critical warnings
    const criticalWarnings = warnings.filter(w =>
      w.includes('No PRD') ||
      w.includes('No core features') ||
      w.includes('No MVP features') ||
      w.includes('Missing problem statement')
    );

    return {
      isValid: criticalWarnings.length === 0,
      warnings,
    };
  }

  /**
   * Build a detailed status update from a PRD
   */
  private buildStatusUpdate(prd: PRD, validation: { isValid: boolean; warnings: string[] }): string {
    const parts: string[] = [];

    parts.push(`📋 PRD created for "${prd.projectName}"`);

    if (prd.problemStatement) {
      parts.push(`Problem: ${prd.problemStatement.substring(0, 100)}${prd.problemStatement.length > 100 ? '...' : ''}`);
    }

    parts.push(`Core Features: ${prd.coreFeatures?.length || 0}`);
    parts.push(`MVP Features: ${prd.mvpFeatures?.length || 0} | Post-MVP: ${prd.postMvpFeatures?.length || 0}`);

    // Count user stories
    const totalStories = prd.coreFeatures?.reduce((sum, f) => sum + (f.userStories?.length || 0), 0) || 0;
    parts.push(`User Stories: ${totalStories}`);

    // Validation status
    if (validation.isValid) {
      parts.push('✅ PRD quality check passed');
    } else {
      parts.push(`⚠️ PRD has ${validation.warnings.length} quality note(s)`);
    }

    if (prd.mvpFeatures && prd.mvpFeatures.length > 5) {
      parts.push(`💡 Consider cutting MVP to 5 features or fewer (currently ${prd.mvpFeatures.length})`);
    }

    return parts.join('\n');
  }

  /**
   * Try to extract a PRD from raw AI text when JSON parsing fails
   * This is a fallback that catches non-standard responses
   */
  private tryExtractPRDFromRaw(raw: string): PRD | null {
    if (!raw || raw.length < 50) return null;

    // Try to find a JSON object that looks like a PRD
    const jsonMatch = raw.match(/\{[\s\S]*"projectName"[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.projectName) {
          return {
            projectName: parsed.projectName,
            problemStatement: parsed.problemStatement || 'Not specified',
            targetUsers: parsed.targetUsers || 'Not specified',
            coreFeatures: parsed.coreFeatures || [],
            mvpFeatures: parsed.mvpFeatures || [],
            postMvpFeatures: parsed.postMvpFeatures || [],
            technicalPreferences: parsed.technicalPreferences || 'Next.js, TypeScript, Tailwind CSS',
            successCriteria: parsed.successCriteria || ['Application builds and runs'],
            summary: parsed.summary || `${parsed.projectName} — ${parsed.problemStatement?.substring(0, 80) || 'A new application'}`,
          };
        }
      } catch {}
    }

    // Try to find a nested PRD inside an outer JSON
    const nestedMatch = raw.match(/"prd"\s*:\s*(\{[\s\S]*?"summary"[\s\S]*?\})/);
    if (nestedMatch) {
      try {
        const parsed = JSON.parse(nestedMatch[1]);
        if (parsed.projectName) {
          return parsed as PRD;
        }
      } catch {}
    }

    return null;
  }
}
