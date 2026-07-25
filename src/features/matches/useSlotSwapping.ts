import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Swapping two players by dragging one onto the other.
 *
 * Built on Pointer Events rather than HTML5 drag-and-drop, which does not fire
 * on touch devices at all — and this league is run from phones. The same
 * handlers therefore cover mouse and finger.
 *
 * Dragging is not the only way in: a plain click selects a player and a second
 * click swaps them. That path is what keyboard and screen-reader users get, and
 * it is genuinely easier on a small screen than dragging a card across a pitch.
 */

/** How far a pointer must travel before a press counts as a drag, in pixels. */
const DRAG_THRESHOLD = 6

export interface DragState {
  /** Key of the entry being dragged, or null when nothing is moving. */
  key: string | null
  /** Viewport coordinates of the pointer, for positioning the drag preview. */
  x: number
  y: number
  /** Key currently under the pointer, if it can receive the drop. */
  overKey: string | null
}

export interface SlotSwapping {
  /** Key selected by clicking, awaiting a second click to swap with. */
  selectedKey: string | null
  drag: DragState
  isDragging: boolean
  /** Attach to each draggable element. */
  getHandlers: (key: string) => {
    onPointerDown: (event: React.PointerEvent) => void
    onClick: (event: React.MouseEvent) => void
    onKeyDown: (event: React.KeyboardEvent) => void
  }
  clearSelection: () => void
}

const NO_DRAG: DragState = { key: null, x: 0, y: 0, overKey: null }

/**
 * @param onSwap called with the two keys to exchange
 * @param enabled false for members, who see the pitch read-only
 * @param resolveKeyAt maps a viewport point to the drop target under it
 */
export function useSlotSwapping({
  onSwap,
  enabled,
  resolveKeyAt,
}: {
  onSwap: (from: string, to: string) => void
  enabled: boolean
  resolveKeyAt: (x: number, y: number) => string | null
}): SlotSwapping {
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [drag, setDrag] = useState<DragState>(NO_DRAG)

  // Held in a ref as well as state: the window listeners below need the live
  // press without being torn down and rebuilt on every pointer move.
  const pressRef = useRef<{
    key: string
    startX: number
    startY: number
    moved: boolean
  } | null>(null)

  const clearSelection = useCallback(() => setSelectedKey(null), [])

  useEffect(() => {
    if (!enabled) return

    function handleMove(event: PointerEvent) {
      const press = pressRef.current
      if (!press) return

      const travelled = Math.hypot(
        event.clientX - press.startX,
        event.clientY - press.startY,
      )

      if (!press.moved && travelled < DRAG_THRESHOLD) return
      press.moved = true

      setDrag({
        key: press.key,
        x: event.clientX,
        y: event.clientY,
        overKey: resolveKeyAt(event.clientX, event.clientY),
      })
    }

    function handleUp(event: PointerEvent) {
      const press = pressRef.current
      pressRef.current = null

      if (!press) return

      if (press.moved) {
        const target = resolveKeyAt(event.clientX, event.clientY)
        if (target && target !== press.key) onSwap(press.key, target)
        setDrag(NO_DRAG)
        // A completed drag has already done the job; leaving the origin
        // selected would then need an extra click to dismiss.
        setSelectedKey(null)
      }
    }

    function handleCancel() {
      pressRef.current = null
      setDrag(NO_DRAG)
    }

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    window.addEventListener('pointercancel', handleCancel)

    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
      window.removeEventListener('pointercancel', handleCancel)
    }
  }, [enabled, onSwap, resolveKeyAt])

  function toggleSelection(key: string) {
    setSelectedKey((current) => {
      if (current === null) return key
      if (current === key) return null

      onSwap(current, key)
      return null
    })
  }

  const getHandlers = useCallback(
    (key: string) => ({
      onPointerDown: (event: React.PointerEvent) => {
        if (!enabled) return
        // Only a primary press starts a drag; a right-click should not.
        if (event.button !== 0) return

        pressRef.current = {
          key,
          startX: event.clientX,
          startY: event.clientY,
          moved: false,
        }
      },

      onClick: (event: React.MouseEvent) => {
        if (!enabled) return
        // The click that concludes a drag must not also count as a selection.
        if (drag.key) return
        event.preventDefault()
        toggleSelection(key)
      },

      onKeyDown: (event: React.KeyboardEvent) => {
        if (!enabled) return

        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          toggleSelection(key)
          return
        }

        if (event.key === 'Escape') setSelectedKey(null)
      },
    }),
    // toggleSelection is recreated each render but only reads setState and the
    // current onSwap, both of which are in this dependency list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enabled, onSwap, drag.key],
  )

  return {
    selectedKey,
    drag,
    isDragging: drag.key !== null,
    getHandlers,
    clearSelection,
  }
}
