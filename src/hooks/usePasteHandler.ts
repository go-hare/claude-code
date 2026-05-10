import { basename } from 'path'
import React from 'react'
import { logError } from 'src/utils/log.js'
import { useDebounceCallback } from 'usehooks-ts'
import type { InputEvent, Key } from '@anthropic/ink'
import {
  getImageFromClipboard,
  getTextFromClipboard,
  isImageFilePath,
  PASTE_THRESHOLD,
  tryReadImageFromPath,
} from '../utils/imagePaste.js'
import type { ImageDimensions } from '../utils/imageResizer.js'
import { getPlatform, type Platform } from '../utils/platform.js'

const CLIPBOARD_CHECK_DEBOUNCE_MS = 50
const PASTE_COMPLETION_TIMEOUT_MS = 100

type PasteHandlerProps = {
  onPaste?: (text: string) => void
  onInput: (input: string, key: Key) => void
  onImagePaste?: (
    base64Image: string,
    mediaType?: string,
    filename?: string,
    dimensions?: ImageDimensions,
    sourcePath?: string,
  ) => void
}

const EMPTY_KEY: Key = {
  upArrow: false,
  downArrow: false,
  leftArrow: false,
  rightArrow: false,
  pageDown: false,
  pageUp: false,
  wheelUp: false,
  wheelDown: false,
  home: false,
  end: false,
  return: false,
  escape: false,
  ctrl: false,
  shift: false,
  fn: false,
  tab: false,
  backspace: false,
  delete: false,
  meta: false,
  super: false,
}

export function shouldUseWindowsClipboardPasteFallback(
  input: string,
  key: Key,
  isFromPaste: boolean,
  platform: Platform,
): boolean {
  return platform === 'windows' && key.ctrl && input === 'v' && !isFromPaste
}

export function usePasteHandler({
  onPaste,
  onInput,
  onImagePaste,
}: PasteHandlerProps): {
  wrappedOnInput: (input: string, key: Key, event: InputEvent) => void
  pasteState: {
    chunks: string[]
    timeoutId: ReturnType<typeof setTimeout> | null
  }
  isPasting: boolean
} {
  const [pasteState, setPasteState] = React.useState<{
    chunks: string[]
    timeoutId: ReturnType<typeof setTimeout> | null
  }>({ chunks: [], timeoutId: null })
  const [isPasting, setIsPasting] = React.useState(false)
  const isMountedRef = React.useRef(true)
  // Mirrors pasteState.timeoutId but updated synchronously. When paste + a
  // keystroke arrive in the same stdin chunk, both wrappedOnInput calls run
  // in the same discreteUpdates batch before React commits — the second call
  // reads stale pasteState.timeoutId (null) and takes the onInput path. If
  // that key is Enter, it submits the old input and the paste is lost.
  const pastePendingRef = React.useRef(false)
  const bracketedPastePendingRef = React.useRef(false)
  const queuedPostPasteInputsRef = React.useRef<
    Array<{ input: string; key: Key }>
  >([])
  const bracketedPasteTimerRef =
    React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const replayPostPasteTimerRef =
    React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const onInputRef = React.useRef(onInput)
  onInputRef.current = onInput

  const platform = React.useMemo(() => getPlatform(), [])
  const isMacOS = platform === 'macos'

  React.useEffect(() => {
    return () => {
      isMountedRef.current = false
      if (bracketedPasteTimerRef.current) {
        clearTimeout(bracketedPasteTimerRef.current)
      }
      if (replayPostPasteTimerRef.current) {
        clearTimeout(replayPostPasteTimerRef.current)
      }
    }
  }, [])

  const replayQueuedPostPasteInputs = React.useCallback(() => {
    const queuedInputs = queuedPostPasteInputsRef.current
    queuedPostPasteInputsRef.current = []
    bracketedPastePendingRef.current = false

    for (const queued of queuedInputs) {
      onInputRef.current(queued.input, queued.key)
    }
  }, [])

  const checkClipboardForImageImpl = React.useCallback(() => {
    if (!onImagePaste || !isMountedRef.current) return

    void getImageFromClipboard()
      .then(imageData => {
        if (imageData && isMountedRef.current) {
          onImagePaste(
            imageData.base64,
            imageData.mediaType,
            undefined, // no filename for clipboard images
            imageData.dimensions,
          )
        }
      })
      .catch(error => {
        if (isMountedRef.current) {
          logError(error as Error)
        }
      })
      .finally(() => {
        if (isMountedRef.current) {
          setIsPasting(false)
        }
      })
  }, [onImagePaste])

  const checkClipboardForImage = useDebounceCallback(
    checkClipboardForImageImpl,
    CLIPBOARD_CHECK_DEBOUNCE_MS,
  )

  const completeTextPaste = React.useCallback(
    (rawText: string) => {
      // Join chunks and filter out orphaned focus sequences
      // These can appear when focus events split during paste
      const pastedText = rawText.replace(/\[I$/, '').replace(/\[O$/, '')

      // Check if the pasted text contains image file paths
      // When dragging multiple images, they may come as:
      // 1. Newline-separated paths (common in some terminals)
      // 2. Space-separated paths (common when dragging from Finder)
      // For space-separated paths, we split on spaces that precede absolute paths:
      // - Unix: space followed by `/` (e.g., `/Users/...`)
      // - Windows: space followed by drive letter and `:\` (e.g., `C:\Users\...`)
      // This works because spaces within paths are escaped (e.g., `file\ name.png`)
      const lines = pastedText
        .split(/ (?=\/|[A-Za-z]:\\)/)
        .flatMap(part => part.split('\n'))
        .filter(line => line.trim())
      const imagePaths = lines.filter(line => isImageFilePath(line))

      if (onImagePaste && imagePaths.length > 0) {
        const isTempScreenshot =
          /\/TemporaryItems\/.*screencaptureui.*\/Screenshot/i.test(
            pastedText,
          )

        // Process all image paths
        void Promise.all(
          imagePaths.map(imagePath => tryReadImageFromPath(imagePath)),
        ).then(results => {
          const validImages = results.filter(
            (r): r is NonNullable<typeof r> => r !== null,
          )

          if (validImages.length > 0) {
            // Successfully read at least one image
            for (const imageData of validImages) {
              const filename = basename(imageData.path)
              onImagePaste(
                imageData.base64,
                imageData.mediaType,
                filename,
                imageData.dimensions,
                imageData.path,
              )
            }
            // If some paths weren't images, paste them as text
            const nonImageLines = lines.filter(
              line => !isImageFilePath(line),
            )
            if (nonImageLines.length > 0 && onPaste) {
              onPaste(nonImageLines.join('\n'))
            }
            setIsPasting(false)
          } else if (isTempScreenshot && isMacOS) {
            // For temporary screenshot files that no longer exist, try clipboard
            checkClipboardForImage()
          } else {
            if (onPaste) {
              onPaste(pastedText)
            }
            setIsPasting(false)
          }
        })
        return
      }

      // If paste is empty (common when trying to paste images with Cmd+V),
      // check if clipboard has an image (macOS only)
      if (isMacOS && onImagePaste && pastedText.length === 0) {
        checkClipboardForImage()
        return
      }

      // Handle regular paste
      if (onPaste) {
        onPaste(pastedText)
      }
      // Reset isPasting state after paste is complete
      setIsPasting(false)
    },
    [checkClipboardForImage, isMacOS, onImagePaste, onPaste],
  )

  const resetPasteTimeout = React.useCallback(
    (currentTimeoutId: ReturnType<typeof setTimeout> | null) => {
      if (currentTimeoutId) {
        clearTimeout(currentTimeoutId)
      }
      return setTimeout(
        (setPasteState, completeTextPaste, pastePendingRef) => {
          pastePendingRef.current = false
          setPasteState(({ chunks }) => {
            completeTextPaste(chunks.join(''))
            return { chunks: [], timeoutId: null }
          })
        },
        PASTE_COMPLETION_TIMEOUT_MS,
        setPasteState,
        completeTextPaste,
        pastePendingRef,
      )
    },
    [completeTextPaste],
  )

  // Paste detection is now done via the InputEvent's keypress.isPasted flag,
  // which is set by the keypress parser when it detects bracketed paste mode.
  // This avoids the race condition caused by having multiple listeners on stdin.
  // Previously, we had a stdin.on('data') listener here which competed with
  // the 'readable' listener in App.tsx, causing dropped characters.

  const wrappedOnInput = (input: string, key: Key, event: InputEvent): void => {
    // Detect paste from the parsed keypress event.
    // The keypress parser sets isPasted=true for content within bracketed paste.
    const isFromPaste = event.keypress.isPasted

    if (bracketedPastePendingRef.current && !isFromPaste) {
      queuedPostPasteInputsRef.current.push({ input, key })
      return
    }

    // If this is pasted content, set isPasting state for UI feedback
    if (isFromPaste) {
      setIsPasting(true)
    }

    // Handle large pastes (>PASTE_THRESHOLD chars)
    // Usually we get one or two input characters at a time. If we
    // get more than the threshold, the user has probably pasted.
    // Unfortunately node batches long pastes, so it's possible
    // that we would see e.g. 1024 characters and then just a few
    // more in the next frame that belong with the original paste.
    // This batching number is not consistent.

    // Handle potential image filenames (even if they're shorter than paste threshold)
    // When dragging multiple images, they may come as newline-separated or
    // space-separated paths. Split on spaces preceding absolute paths:
    // - Unix: ` /` - Windows: ` C:\` etc.
    const hasImageFilePath = input
      .split(/ (?=\/|[A-Za-z]:\\)/)
      .flatMap(part => part.split('\n'))
      .some(line => isImageFilePath(line.trim()))

    // Handle empty paste (clipboard image on macOS)
    // When the user pastes an image with Cmd+V, the terminal sends an empty
    // bracketed paste sequence. The keypress parser emits this as isPasted=true
    // with empty input.
    if (isFromPaste && input.length === 0 && isMacOS && onImagePaste) {
      checkClipboardForImage()
      // Reset isPasting since there's no text content to process
      setIsPasting(false)
      return
    }

    if (isFromPaste && onPaste) {
      pastePendingRef.current = false
      bracketedPastePendingRef.current = true
      queuedPostPasteInputsRef.current = []
      if (pasteState.timeoutId) {
        clearTimeout(pasteState.timeoutId)
      }
      setPasteState({ chunks: [], timeoutId: null })
      if (bracketedPasteTimerRef.current) {
        clearTimeout(bracketedPasteTimerRef.current)
      }
      bracketedPasteTimerRef.current = setTimeout(() => {
        bracketedPasteTimerRef.current = null
        if (!isMountedRef.current) return
        completeTextPaste(input)
        replayPostPasteTimerRef.current = setTimeout(() => {
          replayPostPasteTimerRef.current = null
          if (!isMountedRef.current) return
          replayQueuedPostPasteInputs()
        }, 0)
      }, 0)
      return
    }

    if (
      shouldUseWindowsClipboardPasteFallback(input, key, isFromPaste, platform)
    ) {
      setIsPasting(true)
      void getTextFromClipboard()
        .then(clipboardText => {
          if (!isMountedRef.current || clipboardText === null) {
            return
          }
          if (onPaste) {
            onPaste(clipboardText)
            return
          }
          onInput(clipboardText, EMPTY_KEY)
        })
        .catch(error => {
          if (isMountedRef.current) {
            logError(error as Error)
          }
        })
        .finally(() => {
          if (isMountedRef.current) {
            setIsPasting(false)
          }
        })
      return
    }

    // Check if we should handle as paste (from bracketed paste, large input, or continuation)
    const shouldHandleAsPaste =
      onPaste &&
      (input.length > PASTE_THRESHOLD ||
        pastePendingRef.current ||
        hasImageFilePath ||
        isFromPaste)

    if (shouldHandleAsPaste) {
      pastePendingRef.current = true
      setPasteState(({ chunks, timeoutId }) => {
        return {
          chunks: [...chunks, input],
          timeoutId: resetPasteTimeout(timeoutId),
        }
      })
      return
    }
    onInput(input, key)
    if (input.length > 10) {
      // Ensure that setIsPasting is turned off on any other multicharacter
      // input, because the stdin buffer may chunk at arbitrary points and split
      // the closing escape sequence if the input length is too long for the
      // stdin buffer.
      setIsPasting(false)
    }
  }

  return {
    wrappedOnInput,
    pasteState,
    isPasting,
  }
}
