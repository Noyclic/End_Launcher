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
check(js.includes("if (document.body.classList.contains('customizer-active')) return;"),
  'Keyboard account activation must not bypass customizer edit mode');

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
const customizeStart = js.indexOf('const makeCustomizable = (options = {}) => {');
const restoreIndex = js.indexOf('restoreCustomBaseStyles(el);', customizeStart);
const positionIndex = js.indexOf('const pos = state.positions[id];', customizeStart);
check(customizeStart >= 0 && restoreIndex > customizeStart && restoreIndex < positionIndex,
  'The original element styles must be restored before position overrides are applied');
check(js.includes("customizer-status').textContent = '✓ Кастомизация сброшена'"),
  'Customizer reset should clearly report completion');
check(/document\.addEventListener\('click',[\s\S]*?e\.stopImmediatePropagation\(\);[\s\S]*?renderSelectedTools\(\);[\s\S]*?\}, true\);/.test(js),
  'Customizer must intercept built-in control clicks during edit mode and open the selected element tools');
const dragHandler = js.match(/function startDrag\(e\) \{([\s\S]*?)\n  \}/);
check(!!dragHandler
    && dragHandler[1].includes('e.target instanceof Element')
    && dragHandler[1].includes("closest('[data-customizable=\"true\"]')")
    && !dragHandler[1].includes('e.currentTarget'),
  'Document-level dragging must resolve the element under the pointer, not the document');
check(js.includes("layer.style.pointerEvents = 'none';")
    && css.includes('.customizer-active #custom-media-layer{pointer-events:none}')
    && css.includes('.customizer-active .custom-media-item{pointer-events:auto'),
  'The full-screen media overlay must stay click-through while draggable children remain interactive');
check(js.includes("img.style.pointerEvents = edit ? 'auto' : 'none';")
    && js.includes("layer.querySelectorAll('.custom-media-item').forEach((media) => { media.style.pointerEvents = on ? 'auto' : 'none'; });"),
  'Existing media items must stop intercepting clicks when edit mode is disabled');
check(js.includes('el.dataset.widgetAction = item.action')
    && css.includes('body:not(.customizer-active) .custom-widget-button[data-widget-action]{pointer-events:auto;cursor:pointer}'),
  'Custom action buttons should be clickable outside edit mode, but inactive widgets should stay click-through');
check(css.includes(":root[data-ui='at'] #page-play .inst-card.active")
    && css.includes(":root[data-ui='official'] #page-play .inst-card.active")
    && css.includes(":root[data-ui='lunar'] #page-play .inst-card.active"),
  'AT, official, and Lunar-inspired layouts must have distinct selected-instance states');
check(css.includes(":root[data-ui='at'] .nav-btn.active")
    && css.includes(":root[data-ui='official'] .nav-btn.active")
    && css.includes(":root[data-ui='lunar'] .nav-btn.active"),
  'The three utilitarian layout variants must keep clear active navigation markers');
check(css.includes('@media (max-width: 900px)') && css.includes(":root[data-ui='lunar'] .sidebar nav {")
    && css.includes('@media (max-width: 600px)'),
  'AT, official, and Lunar-inspired layout tweaks must retain compact-window rules');

check(!html.includes('id="custom-media-layer" aria-hidden="true"'),
  'Interactive custom widgets must not be hidden from assistive technology');

check(js.includes("selectedLayer = {type:'media', index}; renderLayers(); renderSelectedTools();"),
  'Selecting a custom image must reveal its properties');
check(js.includes("el.closest('.customizer-modal, .account-modal, .welcome-wizard')")
    && js.includes("e.target.closest('.customizer-modal, .account-modal, .welcome-wizard')"),
  'Account and welcome dialogs must be excluded from customization and capture-phase edit selection so auth/setup controls keep working');
check(js.includes("if (!el || el.closest('.customizer-modal, .account-modal, .welcome-wizard')) return;"),
  'The document drag handler must ignore controls inside account and setup dialogs');

check(js.includes("selectedLayer = {type:'widget', index}; renderLayers(); renderSelectedTools();"),
  'Selecting a custom widget must reveal its properties');

const stableIdBlock = js.match(/const stableCustomId = \(el, index, legacyOccurrence, semanticOccurrence\) => \{([\s\S]*?)\n  \};/);
check(!!stableIdBlock && stableIdBlock[1].includes('identityBase') && stableIdBlock[1].includes('semanticOccurrence'),
  'Semantic ID generation must use a precomputed occurrence rather than requerying the entire document for every element');
check(js.includes('const legacyAllClassCounts = new Map();') && js.includes('const semanticCounts = new Map();')
    && js.includes('stableCustomId(el, i, legacyOccurrence, semanticOccurrence)'),
  'Customizer identity grouping should be computed in a single pass for large libraries');

check(!!stableIdBlock && stableIdBlock[1].includes('identityBase') && stableIdBlock[1].includes('semanticOccurrence')
    && stableIdBlock[1].includes('customIdStateMigrated = true') && js.includes('if (customIdStateMigrated)'),
  'Customizable elements need deterministic semantic IDs and a persisted migration for legacy saved styles');
const deleteHelper = js.match(/function deleteCustomLayer\(type, index\) \{([\s\S]*?)\n  \}/);
check(js.includes("'.inst-card', '.mini-mod', '.mod-card', '.mod-row', '.news-card', '.stat', '.island-card',")
    && js.includes("'.hscroll > *', '.news-grid > *', '.stats > *'"),
  'Dynamic library, mod, news, and home-stat content must be eligible for customization');
const nudgeStart = js.lastIndexOf("document.addEventListener('keydown', e => {");
const nudgeEnd = js.indexOf('refreshProfiles(); syncControls();', nudgeStart);
const nudgeCode = js.slice(nudgeStart, nudgeEnd);
check(nudgeStart >= 0 && nudgeEnd > nudgeStart
    && !nudgeCode.includes('document.activeElement !== document.body')
    && nudgeCode.includes("activeElement.matches('input, textarea, select, [contenteditable=\"true\"]')")
    && nudgeCode.includes("activeElement?.id === 'open-customizer'"),
  'Keyboard nudging should work when the customizer closes, without hijacking text fields or unrelated delete keys');

const observerStart = js.indexOf('const customizerDomObserver = new MutationObserver((records) => {');
const observerEnd = js.indexOf('customizerDomObserver.observe(observerRoot', observerStart);
const observerCode = js.slice(observerStart, observerEnd);
check(js.includes('const makeCustomizable = (options = {}) => {')
    && js.includes('if (onlyNew && el.dataset.customId) return;'),
  'Observer-triggered customizer refreshes must leave existing elements and in-progress pointer drags untouched');

check(observerStart >= 0 && observerEnd > observerStart && observerCode.includes('makeCustomizable({ onlyNew: true });')
    && !observerCode.includes('apply(false);'),
  'Dynamic DOM refreshes should not rebuild GIF/widget DOM while the user is dragging or editing a layer');

check(js.includes('const customizerDomObserver = new MutationObserver((records) => {')
    && js.includes("customizerDomObserver.observe(observerRoot, { childList: true, subtree: true });")
    && js.includes('return node.matches(CUSTOMIZABLE_SELECTOR) || !!node.querySelector(CUSTOMIZABLE_SELECTOR);'),
  'Newly rendered app content must be wired into the customizer without observing its own overlay');

check(!!deleteHelper && deleteHelper[1].includes('collection.splice(index, 1)')
    && deleteHelper[1].includes('selectedLayer.index -= 1') && deleteHelper[1].includes('apply();'),
  'Deleting a custom layer must keep the selected index valid and refresh the editor');
check(js.includes("deleteCustomLayer('media', i)") && js.includes("deleteCustomLayer('widget', i)")
    && js.includes('deleteCustomLayer(selectedLayer.type, selectedLayer.index)'),
  'All custom layer deletion entry points must use the shared selection-aware helper');

const selectedToolsStart = js.indexOf('function renderSelectedTools() {');
const selectedToolsEnd = js.indexOf('function renderList() {', selectedToolsStart);
const selectedToolsCode = js.slice(selectedToolsStart, selectedToolsEnd);
check(js.includes("document.dispatchEvent(new Event('end-launcher-theme-changed'));")
    && js.includes("document.addEventListener('end-launcher-theme-changed', () => {"),
  'Built-in theme changes must notify the full customizer so it can re-apply its explicit global design');
const applyDesignStart = js.indexOf('const applyDesign = () => {');
const applyDesignEnd = js.indexOf('const apply = (refreshEditor = true) => {', applyDesignStart);
const applyDesignCode = js.slice(applyDesignStart, applyDesignEnd);
check(applyDesignStart >= 0 && applyDesignEnd > applyDesignStart
    && applyDesignCode.includes("if (root.dataset.theme === 'custom')")
    && applyDesignCode.includes('applyPalette(palette);')
    && applyDesignCode.includes('clearPalette();')
    && applyDesignCode.includes("root.style.removeProperty(name)"),
  'Resetting full-customizer colors must restore the active Settings palette or clear customizer-only overrides');
check(js.includes('const apply = (refreshEditor = true) => {')
    && js.includes('if (refreshEditor) { renderList(); renderLayers(); }'),
  'Customizer must support visual updates without rebuilding editor controls');
check(selectedToolsStart >= 0 && selectedToolsEnd > selectedToolsStart
    && (selectedToolsCode.match(/apply\(false\)/g) || []).length >= 10
    && !selectedToolsCode.includes('apply()'),
  'Live property edits must keep focused inputs mounted to avoid interrupting range-slider interaction');

check(/max-height:\s*calc\(100dvh - 24px\)/.test(css),
  'Customizer must remain scrollable inside short windows');

// Theme files are user-controlled input; imports must enforce data and quantity bounds.
check(js.includes('Файл темы больше 10 МБ') && js.includes('const MAX_IMAGE_DATA_CHARS = 6 * 1024 * 1024'),
  'Theme import size limits are missing');
check(js.includes("!isImageData(item.src)") && js.includes('safe.media.length > 50') && js.includes('safe.widgets.length > 100'),
  'Theme import must validate embedded images and user-created layer limits');
check(/const save = \(\) => \{[\s\S]*?return true;[\s\S]*?return false;[\s\S]*?\};/.test(js),
  'Customizer persistence helper must report whether localStorage actually accepted the state');
check(js.includes("'✓ Тема импортирована и сохранена'") && js.includes('Тема проверена, но не применена: не удалось сохранить её'),
  'Theme import must not report success if persistence fails');
check(js.includes('const previousState = state;') && js.includes('state = previousState;')
    && js.includes('state.media = previousMedia;') && js.includes('state.background = previousBackground;'),
  'Failed theme/media/background writes must roll back to the previously saved appearance');
const resetBlock = js.match(/\$c\('customizer-reset'\)\.addEventListener\('click', \(\) => \{([\s\S]*?)\n  \}\);/);
check(!!resetBlock && resetBlock[1].includes('localStorage.removeItem(STORE);')
    && resetBlock[1].includes('if (localStorage.getItem(STORE) !== null) throw new Error')
    && resetBlock[1].includes('Не удалось сбросить кастомизацию')
    && resetBlock[1].indexOf('localStorage.removeItem(STORE);') < resetBlock[1].indexOf("state = createDefaultState();"),
  'Customizer reset must verify persisted-state deletion before applying defaults or reporting success');

check(js.includes('const createDefaultState = () => ({')
    && js.includes('state = createDefaultState();')
    && js.includes('state = { ...createDefaultState(), ...safe };')
    && js.includes('state = { ...createDefaultState(), ...JSON.parse(JSON.stringify(profiles[name])) };'),
  'Reset, import, and profile-load paths must use the same defaults and replace stale media/widgets rather than merging them');

check(js.includes('const previousProfile = profiles[name];') && js.includes('if (!saveProfiles())')
    && js.includes('Не удалось сохранить профили: слишком много данных.'),
  'Failed profile writes must preserve the previous profile instead of reporting a false success');

check(html.includes('id="customizer-import"') && html.includes('id="customizer-export"'),
  'Theme backup import/export controls are missing');

// Shared navigation should handle the same page activation side effects as programmatic navigation.
check(/document\.querySelectorAll\('\.nav-btn'\)\.forEach\(\(btn\)\s*=>\s*btn\.addEventListener\('click',\s*\(\)\s*=>\s*goPage\(btn\.dataset\.page\)\)\s*\);/.test(js),
  'Sidebar navigation must go through the shared page activation path');
const newsObserverBlock = js.match(/function ensureNewsLoaded\(\)\s*\{([\s\S]*?)\n\}/);
check(!!newsObserverBlock && newsObserverBlock[1].includes('const target = section?.parentElement;') && newsObserverBlock[1].includes('observe(target)'),
  'Lazy news loading must observe a visible container rather than the initially hidden news section');
const widgetActionsStart = js.indexOf("if (item.kind === 'button' && item.action)");
const widgetActionsEnd = js.indexOf('\n      });', widgetActionsStart);
const widgetActions = js.slice(widgetActionsStart, widgetActionsEnd);
check(widgetActions.includes("goPage('settings')") && widgetActions.includes("goPage('play')")
    && widgetActions.includes("scrollToContentSection('library')")
    && widgetActions.includes('loadNews()') && widgetActions.includes("scrollToContentSection('news-section')")
    && widgetActions.includes('revealHomeExtrasForCurrentLayout()'),
  'Custom widget navigation actions must target real pages and sections');
check(js.includes('function revealHomeExtrasForCurrentLayout() {')
    && js.includes("if (root.dataset.ui !== 'end') setHomeExtrasOpen(true);"),
  'The News action must reveal hidden home extras in alternate layouts before scrolling to the section');

check(!widgetActions.includes("document.querySelector('[data-page=\"library\"]')")
    && !widgetActions.includes("document.querySelector('[data-page=\"news\"]')"),
  'Custom widget actions must not target nonexistent sidebar buttons');

// Undo/redo is bounded, storage-aware, debounced, and does not steal native text-field shortcuts.
for (const id of ['customizer-undo', 'customizer-redo']) {
  check(seen.has(id), 'Customizer history control is missing: #' + id);
}
check(html.includes('aria-keyshortcuts="Control+Z Meta+Z"')
    && html.includes('aria-keyshortcuts="Control+Y Control+Shift+Z Meta+Shift+Z"'),
  'Undo/redo controls must advertise keyboard shortcuts accessibly');
check(js.includes('const HISTORY_LIMIT = 30;')
    && js.includes('const HISTORY_MEMORY_LIMIT = 12 * 1024 * 1024')
    && js.includes('const HISTORY_DEBOUNCE_MS = 450'),
  'Customizer history must have explicit count, memory, and debounce bounds');
check(js.includes('function queueHistoryCheckpoint()')
    && js.includes('window.setTimeout(flushHistoryCheckpoint, HISTORY_DEBOUNCE_MS)')
    && js.includes('queueHistoryCheckpoint();'),
  'Customizer changes must create debounced undo checkpoints');
check(js.includes('function restoreHistoryFrame(frame)')
    && js.includes('if (frame.persisted) localStorage.setItem(STORE, JSON.stringify(nextState))')
    && js.includes("localStorage.removeItem(STORE);")
    && js.includes('Не удалось изменить историю'),
  'History restore must preserve the difference between a stored theme and a reset/default theme, and fail safely');
check(js.includes('function undoCustomization()')
    && js.includes('function redoCustomization()')
    && js.includes('addHistoryEntry(historyRedo, current)')
    && js.includes('addHistoryEntry(historyUndo, current)'),
  'Undo/redo must move current frames between stacks correctly');
check(js.includes("key === 'z' && e.shiftKey && historyRedo.length")
    && js.includes("key === 'z' && !e.shiftKey && (historyUndo.length || historyPendingSnapshot)")
    && js.includes("key === 'y' && historyRedo.length")
    && js.includes('!typing && !outsideCustomizerModal'),
  'Undo/redo shortcuts must support Ctrl/Cmd+Z, Ctrl/Cmd+Y and Shift+Z without hijacking form editing or other modals');
const historyResetBlock = js.match(/\$c\('customizer-reset'\)\.addEventListener\('click', \(\) => \{([\s\S]*?)\n  \}\);/);
check(!!historyResetBlock && historyResetBlock[1].includes('localStorage.removeItem(STORE);')
    && historyResetBlock[1].includes('queueHistoryCheckpoint();')
    && historyResetBlock[1].indexOf('state = createDefaultState();') < historyResetBlock[1].indexOf('queueHistoryCheckpoint();'),
  'Resetting the customization must itself be undoable without storing default values unnecessarily');
check(/\.customizer-history button:disabled\{[^}]*opacity:\.38;[^}]*cursor:not-allowed/.test(css),
  'History buttons need a visible disabled state');

console.log('UI regression checks passed: unique IDs, keyboard triggers, eight layouts across JS/HTML/Rust, first-run persistence, focus trapping, separate particle/global animation toggles, compact dialogs, bounded theme import, customizer baseline restoration, and safe edit-mode selection and pointer-drag target resolution and click-through media overlay and actionable custom widgets, shared navigation, lazy-news section visibility, and stable live property controls and theme-palette precedence, stable customizer IDs, safe layer deletion, dynamic content customization, keyboard nudging, and linear-time customizer refresh that preserves active drags.');
