// AION — Agent Registry
// Creates and provides access to all agent instances
// 15 agents — from planning to production, research to compliance

import type { AgentRole } from '@/lib/types/aion';
import { BaseAgent } from './base-agent';
import { LeadCTOAgent } from './lead-cto';
import { BusinessStrategistAgent } from './business-strategist';
import { FrontendLeadAgent } from './frontend-lead';
import { BackendLeadAgent } from './backend-lead';
import { QAEngineerAgent } from './qa-engineer';
import { DevOpsLeadAgent } from './devops-lead';
import { ResearchAnalystAgent } from './research-analyst';
import { SecurityEngineerAgent } from './security-engineer';
import { DesignArchitectAgent } from './design-architect';
import { DataEngineerAgent } from './data-engineer';
import { DocumentationLeadAgent } from './docs-lead';
import { AnalyticsEngineerAgent } from './analytics-engineer';
import { IntegrationSpecialistAgent } from './integration-specialist';
import { PerformanceEngineerAgent } from './performance-engineer';
import { ComplianceOfficerAgent } from './compliance-officer';

// Singleton instances
const agents: Map<AgentRole, BaseAgent> = new Map();

export function getAgent(role: AgentRole): BaseAgent {
  if (!agents.has(role)) {
    switch (role) {
      case 'cto':
        agents.set(role, new LeadCTOAgent());
        break;
      case 'business':
        agents.set(role, new BusinessStrategistAgent());
        break;
      case 'frontend':
        agents.set(role, new FrontendLeadAgent());
        break;
      case 'backend':
        agents.set(role, new BackendLeadAgent());
        break;
      case 'qa':
        agents.set(role, new QAEngineerAgent());
        break;
      case 'devops':
        agents.set(role, new DevOpsLeadAgent());
        break;
      case 'research':
        agents.set(role, new ResearchAnalystAgent());
        break;
      case 'security':
        agents.set(role, new SecurityEngineerAgent());
        break;
      case 'design':
        agents.set(role, new DesignArchitectAgent());
        break;
      case 'data':
        agents.set(role, new DataEngineerAgent());
        break;
      case 'docs':
        agents.set(role, new DocumentationLeadAgent());
        break;
      case 'analytics':
        agents.set(role, new AnalyticsEngineerAgent());
        break;
      case 'integration':
        agents.set(role, new IntegrationSpecialistAgent());
        break;
      case 'performance':
        agents.set(role, new PerformanceEngineerAgent());
        break;
      case 'compliance':
        agents.set(role, new ComplianceOfficerAgent());
        break;
      default:
        throw new Error(`Unknown agent role: ${role}`);
    }
  }
  return agents.get(role)!;
}

export function getAllAgents(): Map<AgentRole, BaseAgent> {
  // Initialize all agents
  for (const role of [
    'cto', 'business', 'frontend', 'backend', 'qa', 'devops',
    'research', 'security', 'design', 'data', 'docs', 'analytics',
    'integration', 'performance', 'compliance',
  ] as AgentRole[]) {
    getAgent(role);
  }
  return agents;
}
