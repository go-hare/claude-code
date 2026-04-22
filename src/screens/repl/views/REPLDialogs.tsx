import * as React from 'react'

type REPLDialogsProps = {
  activeDialog?: React.ReactNode
  passiveIndicators?: React.ReactNode
  promptArea?: React.ReactNode
  messageActionsBar?: React.ReactNode
  messageSelectorDialog?: React.ReactNode
  devBar?: React.ReactNode
}

/**
 * Pure composition layer for REPL dialog/adornment rendering.
 * All state, branching, and callbacks stay in REPL.tsx; this component only
 * preserves render order.
 */
export function REPLDialogs({
  activeDialog,
  passiveIndicators,
  promptArea,
  messageActionsBar,
  messageSelectorDialog,
  devBar,
}: REPLDialogsProps): React.ReactNode {
  return (
    <>
      {activeDialog}
      {passiveIndicators}
      {promptArea}
      {messageActionsBar}
      {messageSelectorDialog}
      {devBar}
    </>
  )
}
