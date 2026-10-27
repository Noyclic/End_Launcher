import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [html, js, css] = await Promise.all([
  readFile(new URL('../src/index.html', import.meta.url), 'utf8'),
  readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/styles.css', import.meta.url), 'utf8'),
]);

const check = (condition, message) => assert.ok(condition, message);

// Duplicate IDs silently break label associations and direct DOM lookups.
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
const seen = new Set();
const duplicates = new Set();
for (const id of ids) {
  if (seen.has(id)) duplicates.add(id);
  seen.add(id);
}
check(duplicates.size === 0, 'Duplicate HTML id attributes: ' + [...duplicates].join(', '));

for (const id of [
  'play-ui', 'slot-page', 'slot-bar', 'launcher-banner',
  'account-modal', 'account-modal-close', 'customizer-modal',
  'customizer-close', 'customizer-import', 'customizer-export',
  'welcome-layout', 'ui-styles'
]) {
  check(seen.has(id), 'Required UI element is missing: #' + id);
}

// The style IDs and the first-run selector must remain in sync.
const styleBlock = js.match(/const UI_STYLES\s*=\s*\{([\s\S]*?)\n\};/);
check(styleBlock, 'UI_STYLES declaration was not found');
const styleKeys = [...styleBlock[1].matchAll(/^\s{2}([a-z][a-z0-9_-]*):\s*\[/gm)]
  .map((match) => match[1]).sort();
const expectedStyles = ['at', 'end', 'gd', 'lunar', 'modrinth', 'official', 'prism', 'tl'].sort();
assert.deepEqual(styleKeys, expectedStyles, 'UI_STYLES must expose all eight supported layouts');

const welcomeSelect = html.match(/<select id="welcome-layout">([\s\S]*?)<\/select>/);
check(welcomeSelect, 'First-run layout selector was not found');
const welcomeStyles = [...welcomeSelect[1].matchAll(/<option\s+value="([^"]+)"/g)]
  .map((match) => match[1]).sort();
assert.deepEqual(welcomeStyles, expectedStyles, 'First-run options must match the supported layouts');

// Modal accessible names and semantics are a regression-sensitive part of the UI.
check(/class="account-dialog"[^>]*role="dialog"[^>]*aria-modal="true"[^>]*aria-labelledby="account-modal-title"/.test(html),
  'Account picker must expose labelled modal-dialog semantics');
check(/class="customizer-window"[^>]*role="dialog"[^>]*aria-modal="true"[^>]*aria-labelledby="customizer-title"/.test(html),
  'Customizer must expose labelled modal-dialog semantics');
check(js.includes('function trapModalFocus(event, dialog)') && (js.match(/trapModalFocus\(event,/g) || []).length >= 1,
  'Account dialog keyboard focus trapping is missing');
check(js.includes("trapModalFocus(e, modal.querySelector('[role=\"dialog\"]'))"),
  'Customizer keyboard focus trapping is missing');

// Keep known UI regressions from returning.
check(/\.launcher-banner\[hidden\]\s*\{\s*display:\s*none\s*!important;\s*\}/.test(css),
  'Hidden banner must not be forced visible by display:flex');
check(/@media\s*\(prefers-reduced-motion:\s*reduce\)/.test(css),
  'CSS must respect the operating system reduced-motion setting');
check(js.includes("window.matchMedia?.('(prefers-reduced-motion: reduce)')"),
  'Canvas particles must respect the operating system reduced-motion setting');
check(/max-height:\s*calc\(100dvh - 24px\)/.test(css),
  'Customizer must remain scrollable inside short windows');

// Theme files are user-controlled input; imports must enforce data and quantity bounds.
check(js.includes('Файл темы больше 10 МБ') && js.includes('const MAX_IMAGE_DATA_CHARS = 6 * 1024 * 1024'),
  'Theme import size limits are missing');
check(js.includes("!isImageData(item.src)") && js.includes('safe.media.length > 50') && js.includes('safe.widgets.length > 100'),
  'Theme import must validate embedded images and user-created layer limits');
check(html.includes('id="customizer-import"') && html.includes('id="customizer-export"'),
  'Theme backup import/export controls are missing');

console.log('UI regression checks passed: IDs, eight layouts, modal accessibility, hidden banner, reduced motion, compact dialogs, and theme import bounds.');
