import { describe, expect, test } from 'bun:test'

import {
  getCliCommandGraphNode,
  listCliCommandGraph,
} from '../cliCommandGraph.js'

describe('cli command graph', () => {
  test('includes mcp add as a runtime-owned command', () => {
    const node = getCliCommandGraphNode(['mcp', 'add'])

    expect(node).toMatchObject({
      id: 'mcp.add',
      path: ['mcp', 'add'],
      ownership: 'runtime-capability',
      reuse: 'reuse-with-isolation',
      capability: 'mcp',
    })
    expect(node.description).toContain('Add an MCP server')
    expect(listCliCommandGraph()).toContainEqual(node)
  })

  test('keeps autonomy deep status parity with the CLI help surface', () => {
    expect(getCliCommandGraphNode(['autonomy', 'status']).description).toBe(
      'Print autonomy run, flow, team, pipe, and remote-control status',
    )
    expect(getCliCommandGraphNode(['autonomy', 'flow']).description).toBe(
      'Inspect or manage a single autonomy flow',
    )
    expect(getCliCommandGraphNode(['autonomy', 'flow', 'resume']).description).toBe(
      'Resume a waiting autonomy flow and print the prepared prompt',
    )
  })
})
