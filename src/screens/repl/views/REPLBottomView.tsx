import * as React from 'react'
import { Box } from '@anthropic/ink'

type REPLBottomViewProps = {
  useColumnLayout: boolean
  leadingCompanion?: React.ReactNode
  trailingCompanion?: React.ReactNode
  permissionStickyFooter?: React.ReactNode
  immediateToolContent?: React.ReactNode
  standaloneTasks?: React.ReactNode
  dialogs?: React.ReactNode
}

export function REPLBottomView({
  useColumnLayout,
  leadingCompanion,
  trailingCompanion,
  permissionStickyFooter,
  immediateToolContent,
  standaloneTasks,
  dialogs,
}: REPLBottomViewProps): React.ReactNode {
  return (
    <Box
      flexDirection={useColumnLayout ? 'column' : 'row'}
      width="100%"
      alignItems={useColumnLayout ? undefined : 'flex-end'}
    >
      {leadingCompanion}
      <Box flexDirection="column" flexGrow={1}>
        {permissionStickyFooter}
        {immediateToolContent}
        {standaloneTasks}
        {dialogs}
      </Box>
      {trailingCompanion}
    </Box>
  )
}
