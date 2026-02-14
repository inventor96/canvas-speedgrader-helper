(() => {
'use strict';
// Known domains that are expected in the iframe
const KNOWN_DOMAINS = [
  'runtime-app.powerapps.com',
  'runtime-app.powerplatform.com'
];

/**
 * Extracts the domain from a URL
 * @param {string} url - The full URL
 * @returns {string} - The domain
 */
function extractDomain(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname || '';
  } catch (e) {
    return '';
  }
}

/**
 * Checks if a domain is in the known domains list
 * @param {string} domain - The domain to check
 * @returns {boolean} - True if the domain is known
 */
function isKnownDomain(domain) {
  return KNOWN_DOMAINS.some(knownDomain => {
    if (knownDomain.startsWith('*.')) {
      // Match wildcard domains
      const pattern = knownDomain.substring(2); // Remove *. prefix
      return domain.endsWith(pattern) || domain === pattern.substring(2);
    }
    return domain === knownDomain;
  });
}

/**
 * Shows a notification about an unexpected domain
 * @param {string} domain - The unexpected domain
 */
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
  closeButton.textContent = '×';
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

/**
 * Escapes HTML special characters
 * @param {string} text - The text to escape
 * @returns {string} - Escaped text
 */
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

/**
 * Polls for the iframe and checks its domain
 */
function pollForIframe() {
  const iframe = document.getElementById('fullscreen-app-host');

  if (iframe) {
    // Iframe found, check its URL
    try {
      // Note: Due to CORS, we may not always be able to access contentWindow
      // Try to get the src attribute and the actual current URL
      const iframeSrc = iframe.src;

      if (iframeSrc) {
        const domain = extractDomain(iframeSrc);

        if (domain && !isKnownDomain(domain)) {
          // Wait 5 seconds before showing notification
          setTimeout(() => {
            // Double-check that the domain is still unknown (in case it changed)
            const currentDomain = extractDomain(iframe.src);
            if (currentDomain && !isKnownDomain(currentDomain)) {
              showDomainNotification(currentDomain);
            }
          }, 5000);
        }
      }
    } catch (e) {
      console.warn('Error checking iframe domain:', e);
    }
  } else {
    // Iframe not found yet, retry after 500ms
    console.log('Iframe not found, retrying...');
    setTimeout(pollForIframe, 500);
  }
}

// Start polling when the page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', pollForIframe);
  console.log('Waiting for DOM to load before starting iframe polling...');
} else {
  // If DOM is already loaded, start polling immediately
  pollForIframe();
  console.log('DOM already loaded, starting iframe polling...');
}
})();