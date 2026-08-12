import type { VolitionProjectConfig } from '@volition/schema';
import { tacticalWizardWorkbenchConfig } from './referenceProjectConfig';

export interface WorkbenchProject {
  readonly workspaceVersion: 1;
  readonly id: string;
  readonly name: string;
  readonly nameZh?: string;
  readonly description: string;
  readonly kind: 'built-in' | 'local';
  readonly config: VolitionProjectConfig;
  readonly defaultMapId: string;
}

export const tacticalWizardExampleProject: WorkbenchProject = {
  workspaceVersion: 1,
  id: 'example:tactical-wizard',
  name: 'Tactical Wizard AI',
  nameZh: '战术巫师 AI',
  description: 'Reference example for a generic rifle squad.',
  kind: 'built-in',
  config: tacticalWizardWorkbenchConfig,
  defaultMapId: 'tactical-wizard-training-yard',
};

const STORAGE_KEY = 'volition.workbench.projects.v1';

export function loadLocalProjects(): readonly WorkbenchProject[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]') as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isWorkbenchProject).map((project) => ({ ...project, kind: 'local' as const }));
  } catch {
    return [];
  }
}

export function saveLocalProjects(projects: readonly WorkbenchProject[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(projects.filter((project) => project.kind === 'local')));
}

export function duplicateAsLocal(project: WorkbenchProject, suffix = 'Copy'): WorkbenchProject {
  const timestamp = Date.now().toString(36);
  return {
    ...structuredClone(project),
    id: `local:${project.id.replace(/[^a-z0-9-]/gi, '-')}:${timestamp}`,
    name: `${project.name} ${suffix}`,
    nameZh: project.nameZh ? `${project.nameZh} 副本` : undefined,
    kind: 'local',
  };
}

export function createBlankProject(name: string): WorkbenchProject {
  const base = structuredClone(tacticalWizardExampleProject);
  return {
    ...base,
    id: `local:${slug(name)}:${Date.now().toString(36)}`,
    name,
    nameZh: undefined,
    description: 'Local Volition AI project.',
    kind: 'local',
    config: {
      ...base.config,
      projectId: slug(name),
      displayName: name,
    },
  };
}

export function parseWorkbenchProject(text: string): WorkbenchProject {
  const parsed = JSON.parse(text) as unknown;
  if (!isWorkbenchProject(parsed)) throw new Error('Unsupported Volition Workbench project file.');
  return { ...parsed, kind: 'local' };
}

export function serializeWorkbenchProject(project: WorkbenchProject): string {
  return JSON.stringify({ ...project, kind: 'local' }, null, 2);
}

function isWorkbenchProject(value: unknown): value is WorkbenchProject {
  if (typeof value !== 'object' || value === null) return false;
  const project = value as Partial<WorkbenchProject>;
  return project.workspaceVersion === 1
    && typeof project.id === 'string'
    && typeof project.name === 'string'
    && typeof project.description === 'string'
    && typeof project.defaultMapId === 'string'
    && typeof project.config === 'object'
    && project.config !== null;
}

function slug(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-').replace(/^-|-$/g, '') || 'volition-project';
}
