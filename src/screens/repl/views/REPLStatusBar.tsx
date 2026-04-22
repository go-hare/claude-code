import * as React from 'react'
import figures from 'figures'
import { Box, Text } from '@anthropic/ink'
import { useShortcutDisplay } from '../../../keybindings/useShortcutDisplay.js'

type SearchBadge = {
  current: number
  count: number
}

type REPLStatusBarProps = {
  showAllInTranscript: boolean
  virtualScroll: boolean
  searchBadge?: SearchBadge
  suppressShowAll?: boolean
  status?: string
}

/**
 * Transcript footer/status bar.
 * Pure display layer: dynamic shortcut labels + search/status summary.
 * Must render under KeybindingSetup so shortcut context is available.
 */
export function REPLStatusBar({
  showAllInTranscript,
  virtualScroll,
  searchBadge,
  suppressShowAll = false,
  status,
}: REPLStatusBarProps): React.ReactNode {
  const toggleShortcut = useShortcutDisplay(
    'app:toggleTranscript',
    'Global',
    'ctrl+o',
  )
  const showAllShortcut = useShortcutDisplay(
    'transcript:toggleShowAll',
    'Transcript',
    'ctrl+e',
  )

  return (
    <Box
      noSelect
      alignItems="center"
      alignSelf="center"
      borderTopDimColor
      borderBottom={false}
      borderLeft={false}
      borderRight={false}
      borderStyle="single"
      marginTop={1}
      paddingLeft={2}
      width="100%"
    >
      <Text dimColor>
        Showing detailed transcript · {toggleShortcut} to toggle
        {searchBadge
          ? ' · n/N to navigate'
          : virtualScroll
            ? ` · ${figures.arrowUp}${figures.arrowDown} scroll · home/end top/bottom`
            : suppressShowAll
              ? ''
              : ` · ${showAllShortcut} to ${showAllInTranscript ? 'collapse' : 'show all'}`}
      </Text>
      {status ? (
        <>
          <Box flexGrow={1} />
          <Text>{status} </Text>
        </>
      ) : searchBadge ? (
        <>
          <Box flexGrow={1} />
          <Text dimColor>
            {searchBadge.current}/{searchBadge.count}
            {'  '}
          </Text>
        </>
      ) : null}
    </Box>
  )
}
