# Submission Adapter Interface Specification

All submission adapters must implement this interface to work with the submission dispatcher.

## Interface Contract

Each adapter must implement the following methods:

### `canHandle(submissionElement) → boolean`

Determines if this adapter can handle the given submission element.

**Parameters:**
- `submissionElement` (HTMLElement): The `.speedgrader-preview-frame` element containing the submission

**Returns:**
- `boolean`: True if this adapter can handle the submission type, false otherwise

**Notes:**
- This is called during dispatcher initialization to determine which adapter to use
- Must be a synchronous check
- Adapters are checked in registration order; first match wins

### `getText() → Promise<string>`

Extracts the text content of the submission.

**Returns:**
- `Promise<string>`: A promise that resolves to the complete text content of the submission, or rejects if extraction fails

**Behavior:**
- Should extract all visible text from the submission
- May include headings, body text, lists, etc.
- Should handle multiple sections or posts (e.g., discussion threads)
- For structured content (lists, tables), should preserve meaningful formatting via line breaks
- Should resolve quickly even for large submissions (streaming or chunking is not required)

**Error Handling:**
- Reject promise with descriptive error message if text extraction fails
- Include error type in message (e.g., "document not loaded", "element not found")

### `applyHighlights(ranges, cssHighlightName) → Promise<void>`

Applies CSS Custom Highlights to specified text ranges.

**Parameters:**
- `ranges` (Array<{start: number, end: number}>): Array of text ranges to highlight (0-based character offsets in the submission text)
- `cssHighlightName` (string): Name of the CSS highlight to apply (e.g., "highlight-1", "feedback-areas")

**Returns:**
- `Promise<void>`: A promise that resolves when highlights are applied, or rejects if application fails

**Behavior:**
- Must convert character offsets to DOM ranges within the submission
- Should create a CSS.Highlight with the given name and register it with CSS.highlights
- If CSS.Highlight API is not supported, may fallback to CSS classes on affected DOM nodes
- Should handle overlapping ranges gracefully
- Multiple calls with different highlight names should accumulate (not replace)
- Highlights should persist until `clearHighlights()` is called or page reloads

**Error Handling:**
- Reject with descriptive error if ranges are out of bounds
- Reject if CSS.Highlight API is unavailable and no fallback mechanism exists
- Include information about which ranges failed if some succeed and some fail

### `scrollIntoView(selector, options) → Promise<void>`

Scrolls an element matching the selector near to the top of the visible space.

**Parameters:**
- `selector` (string): CSS selector for the element to scroll into view
- `options` (Object, optional):
  - `behavior` (string): Scrolling behavior ('smooth' or 'auto'); defaults to 'smooth'
  - `block` (string): Vertical alignment ('start', 'center', 'end', 'nearest'); defaults to 'start'
  - `inline` (string): Horizontal alignment ('start', 'center', 'end', 'nearest'); defaults to 'nearest'

**Returns:**
- `Promise<void>`: A promise that resolves when scrolling completes, or rejects if scroll fails

**Behavior:**
- Must find the first element matching selector within submission bounds
- Should use element.scrollIntoView() with provided options
- May need to handle scrolling within nested containers (iframes, overflow divs)
- Should ensure the element is actually visible after scrolling (not obscured by sticky headers, etc.)

**Error Handling:**
- Reject with "element not found" if no matching element exists
- Reject with descriptive error if scrolling is not possible (element hidden, container not scrollable)

## Implementation Notes

### Iframe-based Adapters

Iframe adapters run inside the iframe context and communicate with the dispatcher via `postMessage`:

1. Dispatcher sends `IFRAME_SUBMISSION_REQUEST` message containing:
   - `action` (string): 'getText', 'applyHighlights', 'scrollIntoView'
   - `params` (Object): Parameters specific to the action

2. Adapter processes request and sends `IFRAME_SUBMISSION_RESPONSE` message containing:
   - `requestId` (string): Echo of the request ID for correlation
   - `success` (boolean): Whether the operation succeeded
   - `result` (any): The result data if successful
   - `error` (string): Error message if failed

### Direct DOM Adapters

Non-iframe adapters run directly in the page context and implement interface methods directly.

## Error Handling Best Practices

- Always provide descriptive error messages that help debugging
- Include context about the submission state when errors occur
- Use consistent error prefixes: "getText:", "applyHighlights:", "scrollIntoView:"
- Log errors to console for developer visibility (when appropriate)

## Extensibility

When implementing a new submission adapter:

1. Create a new file in appropriate location (iframe-content/ for iframe adapters, or directly in submission-adapters/ for DOM adapters)
2. Implement the complete interface as defined above
3. Register adapter with dispatcher via `Dispatcher.registerAdapter(adapter)`
4. The dispatcher will call `canHandle()` to determine when to use the adapter
5. All three interface methods must work correctly; partial implementations are not supported
