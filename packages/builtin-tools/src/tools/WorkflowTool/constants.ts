import {
  getProjectConfigDirName,
  joinProjectConfigPath,
} from 'src/utils/configPaths.js'

export const WORKFLOW_TOOL_NAME = 'workflow'
export const WORKFLOW_FILE_EXTENSIONS = ['.yml', '.yaml', '.md']

export function getWorkflowDirRelativePath(): string {
  return `${getProjectConfigDirName()}/workflows`
}

export function getWorkflowDirPath(cwd: string): string {
  return joinProjectConfigPath(cwd, 'workflows')
}
