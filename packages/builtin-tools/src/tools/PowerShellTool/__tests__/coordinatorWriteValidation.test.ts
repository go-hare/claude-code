import { beforeEach, describe, expect, mock, test } from 'bun:test'
import type { ExtractedPathOperation } from '../pathValidation.js'

const validateCoordinatorWriteAccessMock = mock(() => ({ result: true }))
const parsePowerShellCommandMock = mock(async () => ({ valid: true }))
const getFileRedirectionsMock = mock(() => [])
const hasDirectoryChangeMock = mock(() => false)
const getPathOperationsMock = mock(
  (): ExtractedPathOperation[] => [],
)
const isRelativePowerShellPathMock = mock((filePath: string) =>
  !/^[A-Za-z]:[\\/]/.test(filePath),
)
const resolvePowerShellPathMock = mock((filePath: string) => `C:\\repo\\${filePath}`)

mock.module('../coordinatorWriteValidationDeps.js', () => ({
  isCoordinatorMode: () => true,
  validateCoordinatorWriteAccess: validateCoordinatorWriteAccessMock,
  parsePowerShellCommand: parsePowerShellCommandMock,
  getFileRedirections: getFileRedirectionsMock,
  hasDirectoryChange: hasDirectoryChangeMock,
  getPathOperations: getPathOperationsMock,
  isRelativePowerShellPath: isRelativePowerShellPathMock,
  resolvePowerShellPath: resolvePowerShellPathMock,
}))

const { validateCoordinatorPowerShellWriteAccess } = await import(
  '../coordinatorWriteValidation.js'
)

describe('validateCoordinatorPowerShellWriteAccess', () => {
  beforeEach(() => {
    validateCoordinatorWriteAccessMock.mockReset()
    validateCoordinatorWriteAccessMock.mockImplementation(() => ({
      result: true,
    }))
    parsePowerShellCommandMock.mockReset()
    parsePowerShellCommandMock.mockImplementation(async () => ({ valid: true }))
    getFileRedirectionsMock.mockReset()
    getFileRedirectionsMock.mockImplementation(() => [])
    hasDirectoryChangeMock.mockReset()
    hasDirectoryChangeMock.mockImplementation(() => false)
    getPathOperationsMock.mockReset()
    getPathOperationsMock.mockImplementation(() => [])
    isRelativePowerShellPathMock.mockReset()
    isRelativePowerShellPathMock.mockImplementation(filePath =>
      !/^[A-Za-z]:[\\/]/.test(filePath),
    )
    resolvePowerShellPathMock.mockReset()
    resolvePowerShellPathMock.mockImplementation(
      filePath => `C:\\repo\\${filePath.replace(/^\.?[\\/]/, '')}`,
    )
  })

  test('validates explicit write targets through the coordinator write guard', async () => {
    getPathOperationsMock.mockImplementation(() => [
      {
        rawCommandName: 'Set-Content',
        commandName: 'set-content',
        paths: ['.\\owned.txt'],
        operationType: 'write',
        hasUnvalidatablePathArg: false,
        optionalWrite: false,
      },
    ])

    const result = await validateCoordinatorPowerShellWriteAccess(
      'Set-Content .\\owned.txt hello',
      'worker-1',
    )

    expect(result.result).toBe(true)
    expect(validateCoordinatorWriteAccessMock).toHaveBeenCalledWith({
      filePath: 'C:\\repo\\owned.txt',
      sourceTool: 'PowerShellTool(set-content)',
    })
  })

  test('rejects relative writes after a directory change', async () => {
    hasDirectoryChangeMock.mockImplementation(() => true)
    getPathOperationsMock.mockImplementation(() => [
      {
        rawCommandName: 'Set-Content',
        commandName: 'set-content',
        paths: ['.\\owned.txt'],
        operationType: 'write',
        hasUnvalidatablePathArg: false,
        optionalWrite: false,
      },
    ])

    const result = await validateCoordinatorPowerShellWriteAccess(
      'Set-Location .\\subdir; Set-Content .\\owned.txt hello',
      'worker-1',
    )

    expect(result.result).toBe(false)
    if (result.result) {
      throw new Error('expected directory change rejection')
    }
    expect(result.message).toContain('directory changes')
    expect(validateCoordinatorWriteAccessMock).not.toHaveBeenCalled()
  })

  test('rejects unstatable path expressions before execution', async () => {
    getPathOperationsMock.mockImplementation(() => [
      {
        rawCommandName: 'Set-Content',
        commandName: 'set-content',
        paths: [],
        operationType: 'write',
        hasUnvalidatablePathArg: true,
        optionalWrite: false,
      },
    ])

    const result = await validateCoordinatorPowerShellWriteAccess(
      'Set-Content -Path ($env:TARGET) hello',
      'worker-1',
    )

    expect(result.result).toBe(false)
    if (result.result) {
      throw new Error('expected unstatable path rejection')
    }
    expect(result.message).toContain('cannot be statically validated')
    expect(validateCoordinatorWriteAccessMock).not.toHaveBeenCalled()
  })

  test('allows parse failures when the command does not look like a file write', async () => {
    parsePowerShellCommandMock.mockImplementation(async () => ({ valid: false }))

    const result = await validateCoordinatorPowerShellWriteAccess(
      'git status',
      'worker-1',
    )

    expect(result.result).toBe(true)
    expect(validateCoordinatorWriteAccessMock).not.toHaveBeenCalled()
  })

  test('rejects parse failures for likely file writes', async () => {
    parsePowerShellCommandMock.mockImplementation(async () => ({ valid: false }))

    const result = await validateCoordinatorPowerShellWriteAccess(
      'Set-Content .\\owned.txt hello',
      'worker-1',
    )

    expect(result.result).toBe(false)
    if (result.result) {
      throw new Error('expected parse failure rejection')
    }
    expect(result.message).toContain('syntactically valid')
  })
})
