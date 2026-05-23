# LLM-Assisted Rubric Highlighting Feature

## Context

You are adding a new feature that uses a locally-running LLM (via Ollama) to identify and highlight the portions of a student's submission that are relevant to each rubric aspect.

The grading interface presents:
- A single-view page containing the student's submission as mostly plain text, potentially including some HTML formatting elements (e.g. `<ol>`, `<ul>`, `<li>`, `<strong>`, `<em>`)
- A rubric structured as a table, where each row represents a scorable aspect with a plain-text description

Ollama is running locally on `localhost:11434` and exposes an OpenAI-compatible REST API. Assume the model in use is `qwen2.5:3b`. CORS from `localhost` to `localhost:11434` should already be handled by Ollama, but note it if there are any concerns.

---

## Feature Requirements

### 1. Text Extraction

- Extract the full plain text of the student submission from the DOM for use in prompts
- Also build a **node map** of the DOM for later highlight placement (see section 4)
- Extract each rubric aspect's description text from the rubric table

### 2. LLM Processing via Ollama

- On page load, sequentially submit one prompt per rubric aspect to Ollama
- Do **not** fire all requests simultaneously — Ollama processes them serially anyway, so queue them one at a time
- Show visible progress to the user: e.g. "Processing aspect 2 of 6..."
- Store results in memory keyed by aspect identifier so they are ready when the user navigates to each aspect
- Use Ollama's `format: "json"` parameter to enforce structured JSON output

#### Prompt Design

Use the following structure:

```
System:
You are a grading assistant. Your only job is to identify where in a student
submission the content relevant to a specific rubric aspect is located.
You do not assign scores. Return only valid JSON with no preamble or markdown.

User:
RUBRIC ASPECT:
[aspect description]

SUBMISSION TEXT:
[full submission text]

Find the portion of the submission most relevant to the rubric aspect above.
Return a JSON object with these exact fields:
- "found": boolean — whether relevant content exists
- "excerpt": a verbatim quote of 15–30 words copied exactly as it appears in
  the submission, including original punctuation and spacing. Do not paraphrase
  or summarize. Copy the words exactly.
- "context": one sentence explaining why this location is relevant
- "confidence": a float 0.0–1.0 representing how clearly the submission
  addresses this aspect

If no relevant content exists, return found: false and excerpt: null.
```

Note: The `confidence` field is a soft signal only — treat low values as a flag for closer manual review, not as a calibrated metric.

### 3. Excerpt Matching (JS-side)

After receiving the LLM response, locate the excerpt in the DOM using the following layered strategy. Proceed to the next tier only if the previous fails.

#### Tier 1: Exact `indexOf()`
Run a standard string search against the extracted submission text.

#### Tier 2: Normalized Regex
Build a flexible regex from the excerpt that tolerates whitespace variation and smart/dumb quote differences:

```js
function buildFuzzyRegex(excerpt) {
  const escaped = excerpt
    .toLowerCase()
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\s+/g, '\\s+')
    .replace(/['']/g, "[''']")
    .replace(/[""]/g, '[""]');
  return new RegExp(escaped, 'i');
}
```

Run this regex against the **original** (non-normalized) accumulated text so that the match index maps cleanly back to the original string coordinates.

#### Tier 3: Levenshtein Scan
If regex also fails, perform a rolling window scan:

- Tokenize the submission text into words
- Slide a window of the same word count as the excerpt across the submission
- For each window, reconstruct a character string and compute Levenshtein distance against the normalized excerpt
- Track the lowest-distance window
- Accept the best match only if its distance is within **15% of the excerpt's character length**
- If no window meets the threshold, treat as not found

### 4. DOM Range Construction

Use a **TreeWalker + node map** approach to find the cross-element range corresponding to the matched position in the accumulated text string:

```js
function buildNodeMap() {
  const nodeMap = [];
  let accumulated = '';
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node;
  while (node = walker.nextNode()) {
    const text = node.textContent;
    nodeMap.push({ node, start: accumulated.length, end: accumulated.length + text.length });
    accumulated += text;
  }
  return { nodeMap, accumulated };
}

function findRange(matchIndex, matchLength, nodeMap) {
  const matchEnd = matchIndex + matchLength;
  const startEntry = nodeMap.find(n => n.end > matchIndex);
  const endEntry = nodeMap.find(n => n.end >= matchEnd);
  if (!startEntry || !endEntry) return null;

  const range = document.createRange();
  range.setStart(startEntry.node, matchIndex - startEntry.start);
  range.setEnd(endEntry.node, matchEnd - endEntry.start);
  return range;
}
```

The node map should be built once on page load and reused for all aspects.

### 5. Highlighting via CSS Custom Highlight API

Do **not** mutate the DOM by inserting `<span>` elements. Use the CSS Custom Highlight API instead, which handles cross-element ranges natively:

```js
function applyHighlight(range, aspectId) {
  const highlight = new Highlight(range);
  CSS.highlights.set(`aspect-${aspectId}`, highlight);
}

function clearHighlight(aspectId) {
  CSS.highlights.delete(`aspect-${aspectId}`);
}
```

Define highlight colors in the extension's injected CSS. Use a distinct color per aspect index, cycling if there are more aspects than defined colors:

```css
::highlight(aspect-0) { background-color: #fef08a; }
::highlight(aspect-1) { background-color: #bbf7d0; }
::highlight(aspect-2) { background-color: #bfdbfe; }
::highlight(aspect-3) { background-color: #fecaca; }
::highlight(aspect-4) { background-color: #e9d5ff; }
::highlight(aspect-5) { background-color: #fed7aa; }
```

### 6. Scroll Behavior

When an aspect is activated (manually or automatically), if a highlight exists for it:
- Scroll to the highlighted range using `scrollIntoView({ behavior: 'smooth', block: 'center' })`
- Call this on the start node of the range

### 7. Failure States

Handle and surface the following failure conditions clearly in the UI:

| Condition | Behavior |
|---|---|
| LLM returns `found: false` | Show "No relevant content identified" for that aspect |
| All three match tiers fail | Show "Could not locate excerpt in submission" |
| LLM returns malformed JSON | Show "LLM response parsing failed" — do not crash |
| Ollama unreachable | Show a persistent error banner on page load; disable the feature gracefully |
| `confidence` below 0.5 | Show a subtle warning indicator on the aspect (e.g. a ⚠ icon) suggesting manual review |

### 8. General Notes

- The student's name should be excluded from all prompt content where possible. If the name appears in the submission text itself, that is unavoidable and acceptable.
- All LLM processing and results remain in-memory only — nothing is persisted to storage.
- The feature should degrade gracefully if Ollama is not running — the rest of the extension's existing functionality must be unaffected.
- Keep the Ollama API call abstracted into a reusable module/function so the model name and endpoint URL can be easily reconfigured.
