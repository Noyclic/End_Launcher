import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [html, js, css, rustConfig] = await Promise.all([
  readFile(new URL('../src/index.html', import.meta.url), 'utf8'),
  readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/styles.css', import.meta.url), 'utf8'),
  readFile(new URL('../src-tauri/src/config.rs', import.meta.url), 'utf8'),
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
check(/id="account-box"[^>]*role="button"[^>]*tabindex="0"[^>]*aria-haspopup="dialog"/.test(html),
  'Account picker trigger must be reachable and announced as a button');
check(js.includes("$('account-box').addEventListener('keydown'") && js.includes("event.key === 'Enter' || event.key === ' '"),
  'Account picker must open from the keyboard');

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

// The frontend and Rust command must support the same eight layout IDs.
const rustStyles = rustConfig.match(/const VALID_UI_STYLES:\s*\[&str;\s*8\]\s*=\s*\[([\s\S]*?)\];/);
check(rustStyles, 'Rust VALID_UI_STYLES allow-list was not found');
const rustStyleKeys = [...rustStyles[1].matchAll(/"([a-z][a-z0-9_-]*)"/g)]
  .map((match) => match[1]).sort();
assert.deepEqual(rustStyleKeys, expectedStyles, 'Rust must support the same eight UI styles as the frontend');
check(rustConfig.includes('if !is_valid_ui_style(&style)'), 'Rust style setter must validate against the shared allow-list');
check(rustConfig.includes('.filter(|style| is_valid_ui_style(style))'), 'Rust style getter must handle unsupported saved values');

// First-run setup must apply through the shared code path and guard against a late config read.
check(js.includes('await chooseUi(layout);'), 'First-run setup must use the complete UI-style apply/persist path');
check(js.includes('if (uiChoiceRevision !== uiStartupRevision) return;'), 'A late startup preference read must not overwrite a newer UI choice');
check(js.includes("localStorage.setItem('el-ui-style', mode)"), 'UI choices should keep the legacy preference in sync');


// Modal accessible names and semantics are a regression-sensitive part of the UI.
check(/class="account-dialog"[^>]*role="dialog"[^>]*aria-modal="true"[^>]*aria-labelledby="account-modal-title"/.test(html),
  'Account picker must expose labelled modal-dialog semantics');
check(/class="customizer-window"[^>]*role="dialog"[^>]*aria-modal="true"[^>]*aria-labelledby="customizer-title"/.test(html),
  'Customizer must expose labelled modal-dialog semantics');
check(js.includes('function trapModalFocus(event, dialog)') && (js.match(/trapModalFocus\(event,/g) || []).length >= 1,
  'Account dialog keyboard focus trapping is missing');
check(js.includes("trapModalFocus(e, modal.querySelector('[role=\"dialog\"]'))"),
  'Customizer keyboard focus trapping is missing');
check(js.includes('trapModalFocus(event, wizard);') && js.includes("$('welcome-close')?.focus();"),
  'Welcome wizard must trap focus and move focus into the dialog on open');

// Keep known UI regressions from returning.
check(/\.launcher-banner\[hidden\]\s*\{\s*display:\s*none\s*!important;\s*\}/.test(css),
  'Hidden banner must not be forced visible by display:flex');
check(/@media\s*\(prefers-reduced-motion:\s*reduce\)/.test(css),
  'CSS must respect the operating system reduced-motion setting');
check(js.includes("window.matchMedia?.('(prefers-reduced-motion: reduce)')"),
  'Canvas particles must respect the operating system reduced-motion setting');
check(js.includes("document.documentElement.dataset.particles = state.particles ? 'on' : 'off';"),
  'The particle toggle must have its own state instead of disabling all UI animations');
check(js.includes("root.dataset.anim !== 'off' && root.dataset.particles !== 'off'"),
  'Canvas particles must observe both global animation and particle settings');
check(js.includes("attributeFilter: ['data-anim', 'data-particles']"),
  'Canvas loop must react when the particle toggle changes');
check(js.includes('const customizerBaseStyles = new WeakMap();') && js.includes('restoreCustomBaseStyles(el);'),
  'Customizer must restore each element\'s original inline styles before applying a theme');
const customizeStart = js.indexOf('const makeCustomizable = () => {');
const restoreIndex = js.indexOf('restoreCustomBaseStyles(el);', customizeStart);
const positionIndex = js.indexOf('const pos = state.positions[id];', customizeStart);
check(customizeStart >= 0 && restoreIndex > customizeStart && restoreIndex < positionIndex,
  'The original element styles must be restored before position overrides are applied');
check(js.includes("customizer-status').textContent = '✓ Кастомизация сброшена'"),
  'Customizer reset should clearly report completion');
check(/document\.addEventListener\('click',[\s\S]*?e\.stopImmediatePropagation\(\);[\s\S]*?renderSelectedTools\(\);[\s\S]*?\}, true\);/.test(js),
  'Customizer must intercept built-in control clicks during edit mode and open the selected element tools');
check(js.includes("selectedLayer = {type:'media', index}; renderLayers(); renderSelectedTools();"),
  'Selecting a custom image must reveal its properties');
check(js.includes("selectedLayer = {type:'widget', index}; renderLayers(); renderSelectedTools();"),
  'Selecting a custom widget must reveal its properties');
check(/max-height:\s*calc\(100dvh - 24px\)/.test(css),
  'Customizer must remain scrollable inside short windows');

// Theme files are user-controlled input; imports must enforce data and quantity bounds.
check(js.includes('Файл темы больше 10 МБ') && js.includes('const MAX_IMAGE_DATA_CHARS = 6 * 1024 * 1024'),
  'Theme import size limits are missing');
check(js.includes("!isImageData(item.src)") && js.includes('safe.media.length > 50') && js.includes('safe.widgets.length > 100'),
  'Theme import must validate embedded images and user-created layer limits');
check(html.includes('id="customizer-import"') && html.includes('id="customizer-export"'),
  'Theme backup import/export controls are missing');

console.log('UI regression checks passed: unique IDs, keyboard triggers, eight layouts across JS/HTML/Rust, first-run persistence, focus trapping, separate particle/global animation toggles, compact dialogs, bounded theme import, customizer baseline restoration, and safe edit-mode selection.');
