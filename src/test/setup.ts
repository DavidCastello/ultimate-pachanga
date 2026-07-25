import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

afterEach(() => {
  cleanup()
})

// jsdom implements neither of these, and Radix primitives (Select, Popover,
// Dialog) call them during mount.
if (!window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

if (!window.ResizeObserver) {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

// jsdom implements no part of the Pointer Capture API, and Radix's Select
// calls these on the trigger while deciding whether a press became a drag.
// Without them, opening a Select in a test throws.
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false
  Element.prototype.setPointerCapture = () => {}
  Element.prototype.releasePointerCapture = () => {}
}

// Radix scrolls the highlighted option into view when a listbox opens.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {}
}

// jsdom has no blob URLs, which is how a form previews a photograph the user
// has only just chosen and not yet uploaded.
if (!URL.createObjectURL) {
  URL.createObjectURL = () => 'blob:preview'
  URL.revokeObjectURL = () => {}
}
