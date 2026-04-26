import { isAbsolute } from 'path'
import type { ValidationResult } from 'src/Tool.js'
import { isCoordinatorMode } from 'src/coordinator/coordinatorMode.js'
import { validateCoordinatorWriteAccess } from 'src/coordinator/writeGuard.js'
import type { Redirect } from 'src/utils/bash/ast.js'
import { parseForSecurity } from 'src/utils/bash/ast.js'
import {
  extractOutputRedirections,
  splitCommand_DEPRECATED,
} from 'src/utils/bash/commands.js'
import {
  tryParseShellCommand,
} from 'src/utils/bash/shellQuote.js'
import { expandPath } from 'src/utils/path.js'

type WriteTarget = {
  path: string
  sourceTool: string
}

const BASH_WRITE_HINT =
  'Use FileEdit/FileWrite or a Bash command with explicit file paths assigned via owned_files.'

const OUTPUT_REDIRECT_OPS = new Set(['>', '>>', '>|', '&>', '&>>'])
const DIRECTORY_CHANGE_COMMANDS = new Set(['cd', 'pushd', 'popd'])
const LAST_ARG_TARGET_COMMANDS = new Set(['cp', 'mv', 'install', 'ln'])
const ALL_ARG_TARGET_COMMANDS = new Set([
  'mkdir',
  'rm',
  'rmdir',
  'touch',
  'truncate',
])
const SED_NAMES = new Set(['sed', 'gsed'])
const PERL_NAMES = new Set(['perl'])
const SHELL_NAMES = new Set(['bash', 'sh', 'zsh'])
const INLINE_INTERPRETERS = new Set([
  'python',
  'python3',
  'node',
  'bun',
  'ruby',
  'perl',
  'php',
  'bash',
  'sh',
  'zsh',
])

const INLINE_WRITE_PATTERN =
  /\b(?:open|fopen|File\.open)\s*\([^)]*,\s*['"]+[^'"]*[wax+>][^'"]*['"]+|\b(writeFile(?:Sync)?|appendFile(?:Sync)?|createWriteStream|write_text|write_bytes|File\.write)\s*\(/i
const INLINE_INTERPRETER_PREFIX_PATTERN =
  /(^|[\s;&|])(?:[A-Za-z_][A-Za-z0-9_]*=\S+\s+)*(python3?|node|bun|ruby|perl|php|bash|sh|zsh)(\s|$)/

function fail(message: string): ValidationResult {
  return {
    result: false,
    message,
    errorCode: 12,
  }
}

function isDeviceTarget(filePath: string): boolean {
  return (
    filePath === '/dev/null' ||
    filePath === '/dev/stdout' ||
    filePath === '/dev/stderr' ||
    filePath.startsWith('/dev/fd/') ||
    filePath.startsWith('/proc/self/fd/')
  )
}

function isRelativeBashPath(filePath: string): boolean {
  return (
    !isAbsolute(filePath) &&
    !filePath.startsWith('~/') &&
    !/^[A-Za-z]:[\\/]/.test(filePath)
  )
}

function parseArgv(command: string): string[] | null {
  const parsed = tryParseShellCommand(command, env => `$${env}`)
  if (!parsed.success) {
    return null
  }

  const argv: string[] = []
  for (const token of parsed.tokens) {
    if (typeof token === 'string') {
      argv.push(token)
      continue
    }
    if ('op' in token && token.op === 'glob') {
      argv.push(token.pattern)
      continue
    }
    return null
  }

  while (argv[0] && /^[A-Za-z_][A-Za-z0-9_]*=/.test(argv[0])) {
    argv.shift()
  }

  return argv.length > 0 ? argv : null
}

function normalizeCommandName(commandName: string): string {
  const withoutPath = commandName.replace(/\\/g, '/').split('/').at(-1) ?? commandName
  return withoutPath.toLowerCase()
}

function positionalArgs(
  argv: string[],
  flagsWithValue: ReadonlySet<string> = new Set(),
): string[] {
  const args: string[] = []
  let stopParsingFlags = false
  let skipNext = false

  for (const arg of argv) {
    if (skipNext) {
      skipNext = false
      continue
    }
    if (!stopParsingFlags && arg === '--') {
      stopParsingFlags = true
      continue
    }
    if (!stopParsingFlags && arg.startsWith('-')) {
      const [flag] = arg.split('=', 1)
      if (flagsWithValue.has(arg) || (flag && flagsWithValue.has(flag))) {
        skipNext = !arg.includes('=')
      }
      continue
    }
    args.push(arg)
  }

  return args
}

function teeTargets(argv: string[]): string[] {
  const targets: string[] = []
  let stopParsingFlags = false
  for (const arg of argv.slice(1)) {
    if (!stopParsingFlags && arg === '--') {
      stopParsingFlags = true
      continue
    }
    if (!stopParsingFlags && arg.startsWith('-')) {
      continue
    }
    targets.push(arg)
  }
  return targets
}

function sedTargets(argv: string[]): string[] {
  const hasInPlace = argv.some(arg => arg === '-i' || arg.startsWith('-i'))
  if (!hasInPlace) {
    return []
  }

  const targets: string[] = []
  let scriptConsumed = false
  let skipNext = false
  for (const arg of argv.slice(1)) {
    if (skipNext) {
      skipNext = false
      continue
    }
    if (arg === '--') {
      scriptConsumed = true
      continue
    }
    if (arg === '-e' || arg === '--expression' || arg === '-f' || arg === '--file') {
      skipNext = true
      continue
    }
    if (arg.startsWith('-')) {
      continue
    }
    if (!scriptConsumed) {
      scriptConsumed = true
      continue
    }
    targets.push(arg)
  }

  return targets
}

function perlTargets(argv: string[]): string[] | null {
  const hasInPlace = argv.some(
    arg => arg === '-i' || arg.startsWith('-i') || /^-[A-Za-z]*i[A-Za-z]*$/.test(arg),
  )
  if (!hasInPlace) {
    return []
  }

  const targets: string[] = []
  let skipNext = false
  for (const arg of argv.slice(1)) {
    if (skipNext) {
      skipNext = false
      continue
    }
    if (arg === '-e' || arg === '-E') {
      skipNext = true
      continue
    }
    if (arg.startsWith('-')) {
      continue
    }
    targets.push(arg)
  }

  return targets.length > 0 ? targets : null
}

function shellInlineCommand(argv: string[]): string | null | undefined {
  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '-c' || /^-[A-Za-z]*c[A-Za-z]*$/.test(arg)) {
      return argv[i + 1] ?? null
    }
  }
  return undefined
}

function commandWriteTargets(argv: string[], sourceCommand: string): WriteTarget[] | null {
  const commandName = normalizeCommandName(argv[0] ?? '')
  if (!commandName) {
    return []
  }

  if (commandName === 'tee') {
    return teeTargets(argv).map(path => ({
      path,
      sourceTool: 'BashTool(tee)',
    }))
  }

  if (LAST_ARG_TARGET_COMMANDS.has(commandName)) {
    const args = positionalArgs(argv.slice(1))
    const target = args.at(-1)
    return target ? [{ path: target, sourceTool: `BashTool(${commandName})` }] : null
  }

  if (ALL_ARG_TARGET_COMMANDS.has(commandName)) {
    const flagsWithValue =
      commandName === 'touch'
        ? new Set(['-r', '--reference', '-t', '-d', '--date'])
        : commandName === 'truncate'
          ? new Set(['-s', '--size', '-r', '--reference'])
          : commandName === 'mkdir'
            ? new Set(['-m', '--mode', '-Z', '--context'])
            : new Set<string>()
    const args = positionalArgs(argv.slice(1), flagsWithValue)
    return args.length > 0
      ? args.map(path => ({ path, sourceTool: `BashTool(${commandName})` }))
      : null
  }

  if (SED_NAMES.has(commandName)) {
    return sedTargets(argv).map(path => ({
      path,
      sourceTool: `BashTool(${commandName})`,
    }))
  }

  if (PERL_NAMES.has(commandName)) {
    const targets = perlTargets(argv)
    if (targets === null) {
      return null
    }
    if (targets.length > 0) {
      return targets.map(path => ({
        path,
        sourceTool: `BashTool(${commandName})`,
      }))
    }
    if (INLINE_WRITE_PATTERN.test(`${sourceCommand}\n${argv.join(' ')}`)) {
      return null
    }
    return []
  }

  if (
    INLINE_INTERPRETERS.has(commandName) &&
    INLINE_WRITE_PATTERN.test(`${sourceCommand}\n${argv.join(' ')}`)
  ) {
    return null
  }

  return []
}

function hasInlineInterpreterWritePattern(sourceCommand: string): boolean {
  return (
    INLINE_WRITE_PATTERN.test(sourceCommand) &&
    INLINE_INTERPRETER_PREFIX_PATTERN.test(sourceCommand)
  )
}

function isOutputRedirect(redirect: Redirect): boolean {
  if (OUTPUT_REDIRECT_OPS.has(redirect.op)) {
    return true
  }
  return redirect.op === '>&' && !/^[0-9-]+$/.test(redirect.target)
}

function astRedirectTargets(command: string): Promise<{
  targets: WriteTarget[]
  hasDirectoryChange: boolean
  unavailable: boolean
}> {
  return parseForSecurity(command).then(parsed => {
    if (parsed.kind !== 'simple') {
      return { targets: [], hasDirectoryChange: false, unavailable: true }
    }

    const targets: WriteTarget[] = []
    let hasDirectoryChange = false
    for (const parsedCommand of parsed.commands) {
      const commandName = normalizeCommandName(parsedCommand.argv[0] ?? '')
      if (DIRECTORY_CHANGE_COMMANDS.has(commandName)) {
        hasDirectoryChange = true
      }
      for (const redirect of parsedCommand.redirects) {
        if (isOutputRedirect(redirect)) {
          targets.push({
            path: redirect.target,
            sourceTool: 'BashTool(redirection)',
          })
        }
      }
    }

    return { targets, hasDirectoryChange, unavailable: false }
  })
}

function fallbackWriteTargets(command: string, depth = 0): {
  targets: WriteTarget[]
  hasDirectoryChange: boolean
  hasUnvalidatableWrite: boolean
} {
  const targets: WriteTarget[] = []
  let hasDirectoryChange = false
  let hasUnvalidatableWrite = false

  const redirections = extractOutputRedirections(command)
  if (redirections.hasDangerousRedirection) {
    hasUnvalidatableWrite = true
  }
  for (const redirection of redirections.redirections) {
    targets.push({
      path: redirection.target,
      sourceTool: 'BashTool(redirection)',
    })
  }

  for (const subcommand of splitCommand_DEPRECATED(command)) {
    const argv = parseArgv(subcommand)
    if (!argv) {
      if (hasInlineInterpreterWritePattern(subcommand)) {
        hasUnvalidatableWrite = true
      }
      continue
    }

    const commandName = normalizeCommandName(argv[0] ?? '')
    if (DIRECTORY_CHANGE_COMMANDS.has(commandName)) {
      hasDirectoryChange = true
    }

    if (SHELL_NAMES.has(commandName)) {
      const nestedCommand = shellInlineCommand(argv)
      if (nestedCommand === null) {
        hasUnvalidatableWrite = true
        continue
      }
      if (nestedCommand !== undefined) {
        if (depth >= 3) {
          hasUnvalidatableWrite = true
          continue
        }
        const nestedTargets = fallbackWriteTargets(nestedCommand, depth + 1)
        targets.push(...nestedTargets.targets)
        hasDirectoryChange =
          hasDirectoryChange || nestedTargets.hasDirectoryChange
        hasUnvalidatableWrite =
          hasUnvalidatableWrite || nestedTargets.hasUnvalidatableWrite
        continue
      }
    }

    const commandTargets = commandWriteTargets(argv, subcommand)
    if (commandTargets === null) {
      hasUnvalidatableWrite = true
      continue
    }
    targets.push(...commandTargets)
  }

  return { targets, hasDirectoryChange, hasUnvalidatableWrite }
}

export async function validateCoordinatorBashWriteAccess(
  command: string,
  agentId?: string,
): Promise<ValidationResult> {
  if (!agentId || !isCoordinatorMode()) {
    return { result: true }
  }

  const astTargets = await astRedirectTargets(command)
  const fallbackTargets = fallbackWriteTargets(command)
  const targets =
    astTargets.unavailable || astTargets.targets.length === 0
      ? fallbackTargets.targets
      : astTargets.targets.concat(
          fallbackTargets.targets.filter(
            fallback =>
              !astTargets.targets.some(
                target =>
                  target.path === fallback.path &&
                  target.sourceTool === fallback.sourceTool,
              ),
          ),
        )

  if (fallbackTargets.hasUnvalidatableWrite) {
    return fail(
      `[Coordinator] Bash worker file writes must use statically valid target paths. ${BASH_WRITE_HINT}`,
    )
  }

  if (targets.length === 0) {
    return { result: true }
  }

  const hasDirectoryChange =
    astTargets.hasDirectoryChange || fallbackTargets.hasDirectoryChange
  if (hasDirectoryChange && targets.some(target => isRelativeBashPath(target.path))) {
    return fail(
      `[Coordinator] Bash worker writes cannot combine directory changes with relative output paths. ${BASH_WRITE_HINT}`,
    )
  }

  for (const target of targets) {
    if (isDeviceTarget(target.path)) {
      continue
    }

    const coordinatorWriteValidation = validateCoordinatorWriteAccess({
      filePath: expandPath(target.path),
      sourceTool: target.sourceTool,
    })
    if (!coordinatorWriteValidation.result) {
      return coordinatorWriteValidation
    }
  }

  return { result: true }
}
