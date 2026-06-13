import { logger } from '@/shared/logger.js';

/** Known PowerApps/PowerPlatform domains that the extension supports. */
const KNOWN_DOMAINS = [
  'runtime-app.powerapps.com',
  'runtime-app.powerplatform.com'
];

/** Extracts the hostname from a URL string. */
function extractDomain(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname || '';
  } catch (e) {
    return '';
  }
}

/** Checks whether a domain matches any of the known supported domains. */
function isKnownDomain(domain) {
  return KNOWN_DOMAINS.some(knownDomain => {
    if (knownDomain.startsWith('*.')) {
      const pattern = knownDomain.substring(2);
      return domain.endsWith(pattern) || domain === pattern.substring(2);
    }
    return domain === knownDomain;
  });
}

/** Displays a fixed-position warning notification about an unexpected iframe domain. */
function showDomainNotification(domain) {
  const notification = document.createElement('div');
  notification.id = 'powerapps-domain-warning';
  notification.style.cssText = `
    position: fixed;
    top: 65px;
    right: 20px;
    background-color: #fff3cd;
    border: 2px solid #ffc107;
    border-radius: 8px;
    padding: 16px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    font-size: 14px;
    color: #856404;
    z-index: 999999;
    max-width: 400px;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  `;

  const heading = document.createElement('div');
  heading.style.cssText = 'font-weight: bold; margin-bottom: 8px;';
  heading.textContent = 'Unexpected Domain Detected';

  const message1 = document.createElement('div');
  message1.style.cssText = 'margin-bottom: 8px; line-height: 1.4;';
  message1.textContent = 'The Grading Queue seems to have a slight change in how it works under the hood, and this prevents the "Helper for Canvas SpeedGrader" extension from doing the name check between the queue and SpeedGrader. Please notify the developer about the issue below.';

  const hr = document.createElement('hr');
  hr.style.cssText = 'margin: 14px 0;';

  const message2 = document.createElement('div');
  message2.textContent = 'The iframe is loading from an unexpected domain:';

  const domainDisplay = document.createElement('div');
  domainDisplay.style.cssText = 'margin-top: 8px; word-break: break-all; font-family: monospace; background-color: rgba(0, 0, 0, 0.05); padding: 8px; border-radius: 4px;';
  domainDisplay.textContent = domain;

  const closeButton = document.createElement('button');
  closeButton.textContent = '\u00d7';
  closeButton.style.cssText = `
    position: absolute;
    top: 10px;
    right: 10px;
    background: none;
    border: none;
    font-size: 24px;
    cursor: pointer;
    color: #856404;
    padding: 0;
    width: 24px;
    height: 24px;
    line-height: 1;
  `;
  closeButton.onclick = () => notification.remove();

  notification.appendChild(heading);
  notification.appendChild(message1);
  notification.appendChild(hr);
  notification.appendChild(message2);
  notification.appendChild(domainDisplay);
  notification.appendChild(closeButton);
  document.body.appendChild(notification);
}

/** Escapes HTML special characters to prevent XSS. */
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

/** Checks the iframe's src domain and shows a warning if it is unexpectd. */
function checkIframeDomain() {
  const iframe = document.getElementById('fullscreen-app-host');
  if (!iframe) return;

  try {
    const iframeSrc = iframe.src;
    if (!iframeSrc) return;

    const domain = extractDomain(iframeSrc);
    if (!domain || isKnownDomain(domain)) return;

    // Re-check after a short delay to avoid transient states
    setTimeout(() => {
      const currentDomain = extractDomain(iframe.src);
      if (currentDomain && !isKnownDomain(currentDomain)) {
        showDomainNotification(currentDomain);
      }
    }, 5000);
  } catch (e) {
    logger.warn('Error checking iframe domain:', e);
  }
}

/** Waits for the #fullscreen-app-host iframe to appear, then checks its domain. */
function watchForIframe() {
  if (document.getElementById('fullscreen-app-host')) {
    checkIframeDomain();
    return;
  }

  const observer = new MutationObserver(() => {
    if (document.getElementById('fullscreen-app-host')) {
      observer.disconnect();
      checkIframeDomain();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', watchForIframe);
} else {
  watchForIframe();
}
