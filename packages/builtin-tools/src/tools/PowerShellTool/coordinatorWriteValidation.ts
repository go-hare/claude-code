import type { ValidationResult } from 'src/Tool.js'
import {
  getFileRedirections,
  hasDirectoryChange,
  isCoordinatorMode,
  parsePowerShellCommand,
  getPathOperations,
  isRelativePowerShellPath,
  resolvePowerShellPath,
  validateCoordinatorWriteAccess,
} from './coordinatorWriteValidationDeps.js'

const POWERSHELL_WRITE_HINT =
  'Use FileEdit/FileWrite or a PowerShell command with explicit file paths.'

const LIKELY_FILESYSTEM_WRITE_PATTERN =
  /(^|[;|&\r\n(])\s*(set-content|sc|add-content|ac|remove-item|rm|ri|del|rd|rmdir|clear-content|clc|out-file|tee-object|export-csv|epcsv|export-clixml|new-item|ni|mkdir|md|copy-item|copy|cp|move-item|move|mv|rename-item|ren)\b|(?:^|[^&])>>?|[*]>>?/i

function fail(message: string): ValidationResult {
  return {
    result: false,
    message,
    errorCode: 12,
  }
}

export async function validateCoordinatorPowerShellWriteAccess(
  command: string,
  agentId?: string,
): Promise<ValidationResult> {
  if (!agentId || !isCoordinatorMode()) {
    return { result: true }
  }

  const parsed = await parsePowerShellCommand(command)
  if (!parsed.valid) {
    if (!LIKELY_FILESYSTEM_WRITE_PATTERN.test(command)) {
      return { result: true }
    }
    return fail(
      `[Coordinator] PowerShell worker file writes must be syntactically valid so target paths can be checked. ${POWERSHELL_WRITE_HINT}`,
    )
  }

  const writeOperations = getPathOperations(parsed).filter(
    operation => operation.operationType !== 'read',
  )
  const fileRedirections = getFileRedirections(parsed)

  if (writeOperations.length === 0 && fileRedirections.length === 0) {
    return { result: true }
  }

  const hasRelativeWriteTarget =
    writeOperations.some(operation =>
      operation.paths.some(path => isRelativePowerShellPath(path)),
    ) || fileRedirections.some(redirection => isRelativePowerShellPath(redirection.target))

  if (hasDirectoryChange(parsed) && hasRelativeWriteTarget) {
    return fail(
      `[Coordinator] PowerShell worker writes cannot combine directory changes with relative output paths. ${POWERSHELL_WRITE_HINT}`,
    )
  }

  for (const operation of writeOperations) {
    if (operation.hasUnvalidatablePathArg) {
      return fail(
        `[Coordinator] ${operation.commandName} uses a path expression that cannot be statically validated. ${POWERSHELL_WRITE_HINT}`,
      )
    }

    if (!operation.optionalWrite && operation.paths.length === 0) {
      return fail(
        `[Coordinator] ${operation.commandName} writes to the filesystem but no target path could be determined. ${POWERSHELL_WRITE_HINT}`,
      )
    }

    for (const rawPath of operation.paths) {
      const coordinatorWriteValidation = validateCoordinatorWriteAccess({
        filePath: resolvePowerShellPath(rawPath),
        sourceTool: `PowerShellTool(${operation.commandName})`,
      })
      if (!coordinatorWriteValidation.result) {
        return coordinatorWriteValidation
      }
    }
  }

  for (const redirection of fileRedirections) {
    const coordinatorWriteValidation = validateCoordinatorWriteAccess({
      filePath: resolvePowerShellPath(redirection.target),
      sourceTool: 'PowerShellTool(redirection)',
    })
    if (!coordinatorWriteValidation.result) {
      return coordinatorWriteValidation
    }
  }

  return { result: true }
}
