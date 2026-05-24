// AION — Agent Registry
// Creates and provides access to all agent instances

import type { AgentRole } from '@/lib/types/aion';
import { BaseAgent } from './base-agent';
import { LeadCTOAgent } from './lead-cto';
import { BusinessStrategistAgent } from './business-strategist';
import { FrontendLeadAgent } from './frontend-lead';
import { BackendLeadAgent } from './backend-lead';
import { QAEngineerAgent } from './qa-engineer';
import { DevOpsLeadAgent } from './devops-lead';

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
      default:
        throw new Error(`Unknown agent role: ${role}`);
    }
  }
  return agents.get(role)!;
}

export function getAllAgents(): Map<AgentRole, BaseAgent> {
  // Initialize all agents
  for (const role of ['cto', 'business', 'frontend', 'backend', 'qa', 'devops'] as AgentRole[]) {
    getAgent(role);
  }
  return agents;
}
