import { logger } from '@/shared/logger.js';
import { HIGHLIGHT_CONFIG } from '@/shared/highlight-config.js';
import { get } from './settings-store.js';
import { getNext } from './highlight-class-selector.js';
import { sendLlmChat } from './llm-page-client.js';
import { findExcerpt } from './excerpt-matcher.js';

const TABLE_SELECTOR = '[data-testid="rubric-assessment-traditional-view"]';
const TBODY_SELECTOR = `${TABLE_SELECTOR} table > tbody`;

let _processing = false;
let _progressEl = null;
let _delegationSetUp = false;

function hexToRgba(hex, alpha) {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function buildSystemMessage() {
  return 'You are a grading assistant. Your only job is to identify where in a student submission the content relevant to a specific rubric aspect is located. You do not assign scores. Return only valid JSON with no preamble or markdown.';
}

function buildUserMessage(criterion, submissionText) {
  const { title, ratings } = criterion;
  const ratingLines = ratings
    .filter((r) => r.points > 0)
    .map((r) => `- ${r.description}: ${r.longDescription}`)
    .join('\n');

  return [
    `RUBRIC CRITERIA:`,
    title,
    ``,
    `POSSIBLE QUALITY LEVELS FOR THIS CRITERIA (for context only — do not search for one specific level; the submission may fall anywhere on this spectrum, including not at all):`,
    ratingLines,
    ``,
    `Your job is to locate where the submission addresses this criteria, regardless of how well it does so. If no part of the submission addresses this criteria at all, set found to false.`,
    ``,
    `SUBMISSION TEXT:`,
    submissionText,
    ``,
    `Find the portion of the submission most relevant to the rubric aspect above. Return a JSON object with these exact fields:`,
    `- "found": boolean — whether relevant content exists`,
    `- "excerpt": a verbatim quote of 15-30 words copied exactly as it appears in the submission, including original punctuation and spacing. Do not paraphrase or summarize. Copy the words exactly.`,
    `- "confidence": a float 0.0-1.0 representing how clearly the submission addresses this aspect`,
    ``,
    `If no relevant content exists, return found: false and excerpt: null.`,
  ].join('\n');
}

function extractCriteria(tbody) {
  const rows = tbody.querySelectorAll('tr');
  logger.debug('extractCriteria — rows found:', rows.length);
  return Array.from(rows).map((row, idx) => {
    const titleTd = row.querySelector('td:first-child');
    const ratingsTd = row.querySelector('td:nth-child(2)');
    const title = titleTd ? titleTd.textContent.trim() : '';

    const ratingButtons = ratingsTd
      ? ratingsTd.querySelectorAll('button[data-testid^="traditional-criterion-"]')
      : [];
    const ratings = Array.from(ratingButtons).map((btn) => {
      const testid = btn.dataset.testid;
      const descEl = testid ? btn.querySelector(`[data-testid="${testid}-description"]`) : null;
      const longDescEl = testid ? btn.querySelector(`[data-testid="${testid}-long-description"]`) : null;
      const pointsEl = testid ? btn.querySelector(`[data-testid="${testid}-points"]`) : null;
      const fullText = pointsEl ? pointsEl.textContent.trim() : '';
      const pointsMatch = fullText.match(/^(\d+)/);
      logger.debug(`extractCriteria — row ${idx} rating button: testid="${testid}", points=${pointsMatch ? pointsMatch[1] : 'N/A'}`);
      return {
        description: descEl ? descEl.textContent.trim() : '',
        longDescription: longDescEl ? longDescEl.textContent.trim() : '',
        points: pointsMatch ? parseInt(pointsMatch[1], 10) : 0,
      };
    });

    logger.debug(`extractCriteria — row ${idx}: title="${title.slice(0, 50)}..." ratings=${ratings.length} (total buttons found: ${ratingButtons.length})`);

    return { title, ratings, row, titleTd };
  });
}

function clearRowHighlights() {
  document.querySelectorAll('.csh-aspect-highlighted').forEach((el) => {
    el.style.backgroundColor = '';
    el.style.borderLeft = '';
    el.classList.remove('csh-aspect-highlighted');
  });
  document.querySelectorAll('.csh-aspect-status').forEach((el) => el.remove());
  document.querySelectorAll('.csh-confidence-warning').forEach((el) => el.remove());
}

function applyRowHighlight(titleTd, className) {
  const config = HIGHLIGHT_CONFIG.find((c) => c.className === className);
  const color = config ? config.color : '#fef08a';
  const rowColor = hexToRgba(color, 0.2);
  const borderColor = hexToRgba(color, 0.8);

  titleTd.style.backgroundColor = rowColor;
  titleTd.style.borderLeft = `4px solid ${borderColor}`;
  titleTd.classList.add('csh-aspect-highlighted');
}

function clearAspectStatus(titleTd) {
  const existing = titleTd.querySelector('.csh-aspect-status');
  if (existing) existing.remove();
  const warning = titleTd.querySelector('.csh-confidence-warning');
  if (warning) warning.remove();
}

function setAspectStatus(titleTd, text, color = '#999') {
  clearAspectStatus(titleTd);
  const el = document.createElement('div');
  el.className = 'csh-aspect-status';
  el.textContent = text;
  el.style.cssText = `font-size: 11px; color: ${color}; font-style: italic; position: relative; left: 0.5em; bottom: 1.5em;`;
  titleTd.appendChild(el);
}

function addConfidenceWarning(titleTd) {
  const existing = titleTd.querySelector('.csh-confidence-warning');
  if (existing) return;
  const el = document.createElement('span');
  el.className = 'csh-confidence-warning';
  el.textContent = ' \u26A0';
  el.title = 'Low confidence — manual review suggested';
  el.style.cssText = 'cursor: help; font-size: 14px;';
  titleTd.appendChild(el);
}

function createProgressPopup(total) {
  const div = document.createElement('div');
  div.id = 'csh-llm-progress';
  div.style.cssText = [
    'position: fixed',
    'bottom: 20px',
    'right: 20px',
    'z-index: 100000',
    'background: #1a1a2e',
    'color: #e0e0e0',
    'padding: 10px 16px',
    'border-radius: 8px',
    'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    'font-size: 13px',
    'box-shadow: 0 4px 12px rgba(0,0,0,0.3)',
    'max-width: 280px',
    'pointer-events: none',
  ].join(';');
  div.textContent = `Processing aspect 1 of ${total}...`;
  document.body.appendChild(div);
  return div;
}

function updateProgressPopup(el, current, total) {
  if (!el) return;
  el.textContent = `Processing aspect ${current} of ${total}...`;
}

function removeProgressPopup(el) {
  if (el && el.parentNode) el.parentNode.removeChild(el);
}

function createErrorBanner(message) {
  const existing = document.getElementById('csh-llm-error');
  if (existing) {
    existing.textContent = message;
    return existing;
  }
  const div = document.createElement('div');
  div.id = 'csh-llm-error';
  div.style.cssText = [
    'position: fixed',
    'bottom: 60px',
    'right: 20px',
    'z-index: 100000',
    'background: #ff4444',
    'color: white',
    'padding: 10px 16px',
    'border-radius: 8px',
    'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    'font-size: 13px',
    'box-shadow: 0 4px 12px rgba(0,0,0,0.3)',
    'max-width: 320px',
  ].join(';');
  div.textContent = message;
  document.body.appendChild(div);
  return div;
}

function removeErrorBanner() {
  const el = document.getElementById('csh-llm-error');
  if (el && el.parentNode) el.parentNode.removeChild(el);
}

async function processOneAspect(criterion, submissionText, api) {
  const { titleTd, ratings, title } = criterion;
  logger.debug(`processOneAspect — title="${title.slice(0, 40)}..." ratings:`, ratings.length);

  if (ratings.length === 0) {
    logger.debug('processOneAspect — no ratings, skipping');
    clearAspectStatus(titleTd);
    return;
  }

  const messages = [
    { role: 'system', content: buildSystemMessage() },
    { role: 'user', content: buildUserMessage(criterion, submissionText) },
  ];
  logger.debug('processOneAspect — calling sendLlmChat');

  let llmResult;
  try {
    llmResult = await sendLlmChat(messages);
    logger.debug('processOneAspect — AI result:', llmResult);
  } catch (e) {
    logger.debug('processOneAspect — AI error:', e.message);
    const displayMsg = e.message.includes('Failed to parse')
      ? 'AI response parsing failed'
      : 'AI request failed';
    setAspectStatus(titleTd, displayMsg, '#e74c3c');
    if (e.message.includes('timed out') || e.message.includes('fetch')) {
      createErrorBanner('Ollama is unreachable — AI features unavailable');
    }
    return;
  }

  if (!llmResult.found || !llmResult.excerpt) {
    logger.debug('processOneAspect — not found or no excerpt');
    setAspectStatus(titleTd, 'No relevant content identified', '#999');
    return;
  }

  logger.debug('processOneAspect — matching excerpt:', llmResult.excerpt.slice(0, 60));
  const match = findExcerpt(submissionText, llmResult.excerpt);
  logger.debug('processOneAspect — match result:', match);
  if (!match) {
    setAspectStatus(titleTd, 'Could not locate excerpt in submission', '#999');
    return;
  }

  const className = getNext();
  logger.debug('processOneAspect — className:', className);
  if (!className) return;

  try {
    logger.debug('processOneAspect — applying highlight:', match, className);
    await api.applyHighlights([{ start: match.start, end: match.end }], className);
    logger.debug('processOneAspect — highlight applied');
  } catch (e) {
    logger.error('Failed to apply submission highlight:', e.message);
  }

  applyRowHighlight(titleTd, className);

  if (llmResult.confidence != null && llmResult.confidence < 0.5) {
    addConfidenceWarning(titleTd);
  }

  clearAspectStatus(titleTd);
  logger.debug('processOneAspect — done');
}

async function startProcessing(api) {
  logger.debug('startProcessing called');
  if (_processing) { logger.debug('startProcessing — already processing, skipping'); return; }
  _processing = true;

  removeErrorBanner();

  const tbody = document.querySelector(TBODY_SELECTOR);
  logger.debug('startProcessing — tbody found:', !!tbody);
  if (!tbody) {
    _processing = false;
    return;
  }

  const criteria = extractCriteria(tbody);
  logger.debug('startProcessing — criteria count:', criteria.length);
  if (criteria.length === 0) {
    _processing = false;
    return;
  }

  clearRowHighlights();

  let submissionText;
  try {
    logger.debug('startProcessing — calling api.getText()');
    submissionText = await api.getText();
    logger.debug('startProcessing — getText succeeded, length:', submissionText?.length);
  } catch (e) {
    logger.error('Failed to get submission text:', e.message);
    createErrorBanner('Could not read submission text');
    _processing = false;
    return;
  }

  if (!submissionText || submissionText.trim().length === 0) {
    logger.log('Empty submission text — skipping AI highlighting');
    _processing = false;
    return;
  }

  _progressEl = createProgressPopup(criteria.length);
  logger.debug('startProcessing — progress popup created');

  for (let i = 0; i < criteria.length; i++) {
    updateProgressPopup(_progressEl, i + 1, criteria.length);
    logger.debug(`startProcessing — processing aspect ${i + 1}/${criteria.length}`);
    try {
      await processOneAspect(criteria[i], submissionText, api);
    } catch (e) {
      logger.error(`Failed processing aspect ${i + 1}:`, e.message);
    }
  }

  logger.debug('startProcessing — all aspects done');
  removeProgressPopup(_progressEl);
  _progressEl = null;
  _processing = false;
}

function setupViewRubricDelegation(api) {
  if (_delegationSetUp) return;
  _delegationSetUp = true;
  logger.debug('setupViewRubricDelegation — listener attached');

  document.addEventListener('click', (event) => {
    const btn = event.target.closest(
      'button[data-testid="view-rubric-button"], button[data-testid="save-rubric-assessment-button"]'
    );
    if (!btn) {
      return;
    }
    logger.debug('delegation — rubric button clicked:', btn.dataset.testid);
    setTimeout(() => {
      logger.debug('delegation — starting processing after click');
      startProcessing(api);
    }, 1200);
  });
}

function checkForExistingRubric(api) {
  const existing = document.querySelector(TBODY_SELECTOR);
  logger.debug('checkForExistingRubric — tbody present:', !!existing);
  if (existing) {
    setTimeout(() => {
      logger.debug('checkForExistingRubric — starting processing');
      startProcessing(api);
    }, 500);
  }
}

export function initRubricHighlighting(api) {
  const aiEnabled = get('aiEnabled');
  const highlightEnabled = get('highlightRubricRowSection');
  logger.debug('initRubricHighlighting — aiEnabled:', aiEnabled, 'highlightRubricRowSection:', highlightEnabled);
  if (!aiEnabled || !highlightEnabled) return;

  setupViewRubricDelegation(api);
  checkForExistingRubric(api);
}
