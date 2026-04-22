import { useCallback, useEffect, useRef, useState } from 'react'
import { useInput } from '@anthropic/ink'
import type { JumpHandle } from '../../../components/VirtualMessageList.js'
import { useBackgroundTaskNavigation } from '../../../hooks/useBackgroundTaskNavigation.js'

type UseReplNavigationControllerOptions = {
  inTranscript: boolean
  searchModeActive: boolean
  transcriptCols: number
  setHighlightQuery: (query: string) => void
  clearSearchPositions: () => void
  onOpenBackgroundTasks?: () => void
  onTogglePipeSelector: () => void
}

export function useReplNavigationController(
  options: UseReplNavigationControllerOptions,
) {
  const {
    inTranscript,
    searchModeActive,
    transcriptCols,
    setHighlightQuery,
    clearSearchPositions,
    onOpenBackgroundTasks,
    onTogglePipeSelector,
  } = options

  const jumpRef = useRef<JumpHandle | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchCount, setSearchCount] = useState(0)
  const [searchCurrent, setSearchCurrent] = useState(0)

  const onSearchMatchesChange = useCallback((count: number, current: number) => {
    setSearchCount(count)
    setSearchCurrent(current)
  }, [])

  useInput(
    (input, key, event) => {
      if (key.ctrl || key.meta) return
      if (input === '/') {
        jumpRef.current?.setAnchor()
        setSearchOpen(true)
        event.stopImmediatePropagation()
        return
      }

      const c = input[0]
      if (
        (c === 'n' || c === 'N') &&
        input === c.repeat(input.length) &&
        searchCount > 0
      ) {
        const fn = c === 'n' ? jumpRef.current?.nextMatch : jumpRef.current?.prevMatch
        if (fn) {
          for (let i = 0; i < input.length; i++) fn()
        }
        event.stopImmediatePropagation()
      }
    },
    { isActive: searchModeActive && !searchOpen },
  )

  const prevColsRef = useRef(transcriptCols)
  useEffect(() => {
    if (prevColsRef.current !== transcriptCols) {
      prevColsRef.current = transcriptCols
      if (searchQuery || searchOpen) {
        setSearchOpen(false)
        setSearchQuery('')
        setSearchCount(0)
        setSearchCurrent(0)
        jumpRef.current?.disarmSearch()
        setHighlightQuery('')
      }
    }
  }, [transcriptCols, searchOpen, searchQuery, setHighlightQuery])

  useEffect(() => {
    setHighlightQuery(inTranscript ? searchQuery : '')
    if (!inTranscript) {
      setSearchQuery('')
      setSearchCount(0)
      setSearchCurrent(0)
      setSearchOpen(false)
      clearSearchPositions()
    }
  }, [clearSearchPositions, inTranscript, searchQuery, setHighlightQuery])

  useBackgroundTaskNavigation({
    onOpenBackgroundTasks,
    onTogglePipeSelector,
  })

  return {
    jumpRef,
    searchOpen,
    setSearchOpen,
    searchQuery,
    setSearchQuery,
    searchCount,
    setSearchCount,
    searchCurrent,
    setSearchCurrent,
    onSearchMatchesChange,
  }
}
