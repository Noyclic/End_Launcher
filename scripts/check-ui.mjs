import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [html, js, css, rustConfig, rustInstances, rustMain, rustJava] = await Promise.all([
  readFile(new URL('../src/index.html', import.meta.url), 'utf8'),
  readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/styles.css', import.meta.url), 'utf8'),
  readFile(new URL('../src-tauri/src/config.rs', import.meta.url), 'utf8'),
  readFile(new URL('../src-tauri/src/instances.rs', import.meta.url), 'utf8'),
  readFile(new URL('../src-tauri/src/main.rs', import.meta.url), 'utf8'),
  readFile(new URL('../src-tauri/src/java.rs', import.meta.url), 'utf8'),
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
  'play-ui', 'slot-page', 'slot-bar', 'launcher-banner', 'stop-btn',
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
check(/id="new-instance" class="create-instance-modal" style="display:none" aria-hidden="true"/.test(html),
  'New-instance dialog must have a dedicated, initially hidden overlay wrapper');
check(/class="panel create-instance-panel" role="dialog" aria-labelledby="create-instance-title"/.test(html),
  'New-instance panel must expose a labelled dialog');
check(js.includes('function closeNewInstance()')
    && js.includes("wrapper.setAttribute('aria-hidden', 'true')")
    && js.includes("trapModalFocus(event, wrapper.querySelector('[role=\"dialog\"]'))")
    && js.includes("if (event.key === 'Escape') {\n    closeNewInstance();"),
  'Prism new-instance dialog must restore focus, trap Tab, and close on Escape');
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


const fidelityModes = ['prism', 'modrinth', 'tl', 'gd', 'official', 'at', 'lunar'];
for (const mode of fidelityModes) {
  check(css.includes(`:root[data-ui='${mode}'] #library`),
    `The ${mode} layout must define its own library structure`);
  check(css.includes(`:root[data-ui='${mode}'] .sidebar`),
    `The ${mode} layout must define its own navigation geometry`);
}
check(css.includes(":root[data-ui='prism'] .layout {")
    && css.includes("grid-template-columns:minmax(0,1fr) 272px")
    && css.includes(":root[data-ui='prism'] #library .inst-card"),
  'Prism layout must have a compact desktop toolbar, dense tiles, and a dedicated launch rail');
check(css.includes(":root[data-ui='modrinth'] #library .inst-card")
    && css.includes("grid-template-columns:44px minmax(0,1fr) auto")
    && css.includes(":root[data-ui='modrinth'] .play-ui #play-btn"),
  'Modrinth layout must use compact library rows, green actions, and a persistent play strip');
check(css.includes(":root[data-ui='tl'] .layout { display:flex; flex-direction:column")
    && css.includes(":root[data-ui='tl'] #slot-page .play-ui")
    && css.includes(":root[data-ui='tl'] .playbar { display:none !important; }"),
  'TL layout must use a centered launch panel rather than the shared bottom playbar');
check(css.includes(":root[data-ui='gd'] #page-play .launcher-banner")
    && css.includes(":root[data-ui='gd'] #library {"),
  'GD layout must use a wide featured-library hierarchy and spacious cards');
check(css.includes(":root[data-ui='official'] #library .inst-card")
    && css.includes(":root[data-ui='official'] #page-play .launcher-banner-play"),
  'Official-inspired layout must use installation rows, a featured hero and rectangular green launch actions');
check(css.includes(":root[data-ui='at'] #library .inst-card")
    && css.includes("grid-template-columns:76px minmax(0,1fr) auto"),
  'AT layout must use dense instance-manager rows');
check(css.includes(":root[data-ui='lunar'] #library .inst-card::before")
    && css.includes(":root[data-ui='lunar'] #library .inst-card:nth-child(4n+2)::before"),
  'Lunar layout must use a distinct version gallery with original abstract artwork');
check(css.includes("@media (max-width:620px)")
    && css.includes(":root[data-ui='official'] .nav-btn .lbl,")
    && css.includes(":root[data-ui='lunar'] #library {"),
  'Reference-inspired layouts must retain dedicated compact-window behavior');
check(css.includes(":root:not([data-ui='end']) #page-play .library-help {")
    && css.includes("display: none;"),
  'Reference-inspired layouts should prioritize interface hierarchy over prototype help copy');


check(css.includes(":root:not([data-ui='end']) .end-void { background:var(--el-bg); transition:none; }")
    && css.includes(":root:not([data-ui='end']) #ender-particles { display:none !important; }"),
  'Reference-inspired skins must remove the classic End backdrop and particle layer');
for (const mode of ['prism','modrinth','tl','gd','official','at','lunar']) {
  check(css.includes(`:root[data-ui='${mode}'] .mods-search-panel`)
      && css.includes(`:root[data-ui='${mode}'] .account-dialog`)
      && css.includes(`:root[data-ui='${mode}'] input,`),
    `The ${mode} skin must cover secondary pages, dialogs and form controls`);
}
check(css.includes(":root:not([data-ui='end']) #page-mods,")
    && css.includes("max-width:min(100%, 1040px)"),
  'Reference-inspired secondary pages must use a wider, responsive content surface');


check(js.includes("const target = ['end', 'tl'].includes(mode) ? $('slot-page') : $('slot-bar');"),
  'TL layout must place the working play controls inside its centered launcher panel');
check(js.includes("!['modrinth', 'gd', 'official', 'lunar'].includes(mode)"),
  'Modrinth, GD, official and Lunar layouts must expose their selected-instance header where designed');
check(js.includes("if (currentUi === 'modrinth')") && js.includes("title.textContent = 'С возвращением!'"),
  'Modrinth home must use a welcome-back header instead of the generic End hero');
check(js.includes("$('launcher-banner-play')?.addEventListener('click', () => {")
    && js.includes('playBtn.click();'),
  'Featured launch buttons must invoke the actual native Play action');
check(css.includes(":root[data-ui='gd'] .sidebar nav {")
    && css.includes(":root[data-ui='gd'] .content {")
    && /:root\[data-ui='gd'\] \.playbar \{\s*order:2;/.test(css),
  'GDLauncher-inspired layout must use its horizontal app navigation, scrollable center and footer play strip');
check(css.includes(":root[data-ui='modrinth'] #page-play .launcher-banner {")
    && css.includes("display:flex !important;")
    && css.includes("border-bottom:1px solid #2e3432;"),
  'Modrinth welcome-back header must override the old hidden state and remain visible above the library list');
check(css.includes(":root[data-ui='tl'] #page-play::before")
    && css.includes(":root[data-ui='tl'] #slot-page {")
    && css.includes("background:rgba(234,241,238,.86);"),
  'TL Legacy-inspired mode must use a centered translucent launch selector over an original soft landscape-like background');
check(css.includes(":root[data-ui='gd'] .nav-btn.active")
    && css.includes(":root[data-ui='official'] #library .inst-card")
    && css.includes(":root[data-ui='prism'] #library .inst-card"),
  'Major launcher skins must retain separate application-level composition rules');


check(js.includes("playHeading.textContent = ({")
    && js.includes("official: 'Minecraft: Java Edition'")
    && js.includes("prism: 'Instances'")
    && js.includes("lunar: 'Play'"),
  'The main workspace heading must follow the selected layout rather than retaining one generic label');
check(css.includes(":root[data-ui='prism'] #library {")
    && css.includes("grid-template-columns:repeat(auto-fill,minmax(112px,1fr))")
    && css.includes(":root[data-ui='prism'] #library .inst-card:hover .inst-play"),
  'Prism needs compact icon tiles with action buttons that reveal on hover and keyboard focus');
check(css.includes(":root[data-ui='official'] #page-play > h1")
    && css.includes("official") === true
    && css.includes(":root[data-ui='official'] #library .inst-card.active"),
  'Official-inspired mode must keep the Java edition heading and selected-installation state distinct');
check(css.includes(":root[data-ui='at'] #library .inst-card.active")
    && css.includes("grid-template-columns:164px minmax(0,1fr) auto")
    && css.includes(":root[data-ui='at'] #library .inst-card.active .inst-icon"),
  'ATLauncher must give the focused installation a large preview area while retaining compact secondary rows');
check(css.includes(":root[data-ui='lunar'] #page-play .launcher-banner")
    && css.includes(":root[data-ui='lunar'] #library .inst-card.active")
    && css.includes("radial-gradient(ellipse at 85% 8%"),
  'Lunar-inspired mode must distinguish the featured active profile from the regular version gallery');


const layoutFeatureIds = ['prism-open-folder', 
  'prism-library-tools', 'prism-library-sort', 'prism-library-group',
  'official-library-tools', 'official-show-releases', 'official-show-snapshots',
  'official-show-modded', 'official-instance-sort',
  'modrinth-library-tools', 'gd-pack-tools', 'gd-open-modrinth',
  'gd-open-curseforge', 'gd-show-import', 'at-instance-tools',
  'at-duplicate-active', 'at-export-active', 'lunar-library-tools',
  'lunar-favorites-toggle', 'lunar-favorites-count',
  'installed-mod-state', 'installed-mod-sort'
];
for (const id of layoutFeatureIds) {
  check(seen.has(id), 'Launcher-specific feature control is missing: #' + id);
}
check(js.includes("const FAVORITES_STORE = 'end-launcher-favorite-instances-v1'")
    && js.includes('function toggleFavoriteInstance(id)')
    && js.includes('localStorage.setItem(FAVORITES_STORE, JSON.stringify([...favoriteInstanceIds]))')
    && js.includes("' is-favorite'"),
  'Favorites must persist by instance ID and be reflected on rendered cards');
check(js.includes("currentUi === 'lunar' && lunarFavoritesOnly")
    && js.includes('favoriteInstanceIds.has(String(b.id))'),
  'Lunar quick-access filter must show favorites and prioritize them in the gallery');
check(js.includes("currentUi === 'prism'")
    && js.includes("prismLibrarySort === 'version-desc'")
    && js.includes("prismLibraryGroup === 'loader'")
    && js.includes("return prismInstanceGroups[String(inst.id)] || 'Без группы'")
    && js.includes('library-group-heading'),
  'Prism instance library must sort instances and support custom, loader and version groups');
check(js.includes("currentUi === 'official' && !isOfficialCategoryVisible(inst)")
    && js.includes("officialInstanceSort === 'version'")
    && js.includes('official-show-snapshots'),
  'Official-inspired installation view must apply releases/snapshots/modded filters and sorting');
check(js.includes('function syncModrinthContentShortcuts()')
    && js.includes('button.dataset.modrinthType')
    && js.includes("$('mod-type').value = type")
    && js.includes("goPage('mods')"),
  'Modrinth home content shortcuts must route to the existing filtered mod/resourcepack/shader search');
check(js.includes("openPackCatalog('https://modrinth.com/modpacks')")
    && js.includes("openPackCatalog('https://www.curseforge.com/minecraft/search?page=1&pageSize=20&sortBy=relevancy&class=modpacks')")
    && js.includes("$('gd-show-import')?.addEventListener"),
  'GD-inspired modpack discovery actions must open real catalogs and expose the supported import flow');
check(js.includes("invoke('duplicate_instance', { id: inst.id })")
    && js.includes("invoke('export_instance', { id: inst.id })")
    && js.includes("$('at-duplicate-active')?.addEventListener")
    && js.includes("$('at-export-active')?.addEventListener"),
  'AT-inspired quick actions must reuse the existing duplicate/export backend commands');
check(js.includes('let installedModsCache = [];')
    && js.includes("stateFilter === 'enabled' && !mod.enabled")
    && js.includes("stateFilter === 'disabled' && mod.enabled")
    && js.includes("sortMode === 'size-desc'")
    && js.includes("sortMode === 'size-asc'"),
  'Modrinth-style installed-content list must filter enabled/disabled mods and sort by file size/name');

check(/:root\[data-ui='prism'\] #library\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fill,\s*minmax\(76px,\s*1fr\)\)/s.test(css),
  'Prism mode must keep the compact icon-grid library layout');
check(/:root\[data-ui='prism'\] #library \.inst-card\s*\{[^}]*flex-direction:\s*column/s.test(css),
  'Prism instance cards must remain vertically stacked like the reference launcher');
check(css.includes(":root[data-ui='prism'] .playbar") && css.includes(":root[data-ui='prism'] #library .inst-name")
    && css.includes(":root[data-ui='prism'] .library-toolbar"),
  'Prism layout needs a separate launch panel, profile-label tiles, and compact toolbar');

check(html.includes('id="stop-btn"')
      && js.includes("invoke('stop_instance', { id: String(runningInstanceId) })")
      && js.includes("payload.stopped === true")
      && rustMain.includes("java::stop_instance")
      && rustJava.includes("pub fn stop_instance(id: String)")
      && rustJava.includes("child.kill()")
      && css.includes(":root[data-ui='prism'] .play-ui #stop-btn"),
  'Prism Stop row must invoke the registered Rust process controller and report intentional stops separately from crashes');

check(js.includes("addAction('shortcut', '↗ Создать ярлык'")
      && js.includes("invoke('create_instance_shortcut', { id: String(inst.id) })")
      && js.includes("invoke('get_startup_instance')")
      && js.includes("playBtn.click();")
      && rustInstances.includes("pub fn create_instance_shortcut(id: String)")
      && rustInstances.includes("pub fn get_startup_instance() -> Option<String>")
      && rustMain.includes("instances::create_instance_shortcut,")
      && rustMain.includes("instances::get_startup_instance,")
      && css.includes("[data-action='shortcut']")
      && css.includes("[data-action='rename'] {\n  display: none !important;"),
  'Prism Create Shortcut must create a desktop entry, launch the intended instance, and replace the redundant Rename row');

check(js.includes("card.addEventListener('dblclick', async (event) => {")
      && js.includes("if (currentUi !== 'prism' || event.target.closest('button, input, select, textarea')) return;")
      && js.includes("await setActive(inst.id);\n      playBtn.click();"),
  'Double-clicking a Prism instance tile should launch that instance without changing click actions in other layouts');

const prismMenuStart = js.indexOf("if (currentUi === 'prism') {", js.indexOf("function toggleMenu(card, inst)"));
const prismMenuEnd = js.indexOf("item('🧩 Моды'", prismMenuStart);
const prismMenu = js.slice(prismMenuStart, prismMenuEnd);
check(js.includes("card.addEventListener('contextmenu'")
      && js.includes("event.preventDefault();")
      && js.includes("menu.dataset.contextMenu = 'true';")
      && prismMenu.includes("item('✎ Переименовать'")
      && prismMenu.includes("item('▶ Запустить'")
      && prismMenu.includes("item('▤ Изменить…'")
      && prismMenu.includes("item('▤ Изменить группу…'")
      && prismMenu.includes("item('📂 Папка'")
      && prismMenu.includes("item('⇩ Экспортировать…'")
      && prismMenu.includes("item('⧉ Копировать…'")
      && prismMenu.includes("item('↗ Создать ярлык'")
      && prismMenu.indexOf("item('✎ Переименовать'") < prismMenu.indexOf("item('▶ Запустить'")
      && prismMenu.indexOf("item('▶ Запустить'") < prismMenu.indexOf("item('▤ Изменить…'")
      && css.includes(".inst-menu[data-context-menu='true']")
      && css.includes("max-height: calc(100vh - 16px)"),
  'Prism right-click context menu must follow the classic action order, appear at the pointer, and remain scrollable inside the viewport');

check(js.includes('function syncPrismSelectedInstance()')
    && js.includes('function syncPrismQuickActions()')
    && js.includes("addAction('folder', '📂 Папка'")
    && js.includes("addAction('export', '⇩ Экспортировать…'")
    && js.includes("addAction('duplicate', '⧉ Копировать…'")
    && js.includes("addAction('delete', '▤ Удалить'"),
  'Prism action rail must expose working folder, export, copy, rename and delete actions');
check(js.includes('function openPrismInstanceEditor(inst, button, actions)')
    && js.includes("addAction('edit', '✎ Изменить…'")
    && js.includes("invoke('update_instance', { id: inst.id, name, version, loader })")
    && rustInstances.includes('pub fn update_instance(id: String, name: String, version: String, loader: String)')
    && rustInstances.includes('crate::mc::check_id(&version)?')
    && rustMain.includes('instances::update_instance,')
    && css.includes('.prism-instance-editor'),
  'Prism Edit must validate and persist the instance name, Minecraft version and loader via Rust');
check(html.includes('id="prism-status-bar"')
    && css.includes(':root[data-ui=\'prism\'] #prism-status-bar')
    && css.includes('grid-template-rows: 38px minmax(0, 1fr) 56px')
    && js.includes("statusBar.hidden = currentUi !== 'prism'")
    && html.includes('id="prism-status-news-link"')
    && js.includes("await invoke('open_url', { url: 'https://github.com/Noyclic/End_Launcher/releases' })")
    && css.includes(".prism-status-news-link::before")
    && html.includes('id="prism-status-active"'),
  'Prism footer should provide a working news/release link and keep selected-instance state in its two-row status bar');
check(html.includes('id="nav-ai-button" class="nav-btn" data-page="ai"')
      && js.includes("'nav-ai-button'")
      && js.includes("const prismOverflowIds =")
      && css.includes(".prism-toolbar-overflow > #nav-ai-button")
      && !css.includes(":root[data-ui='prism'] .sidebar .nav-btn[data-page='play'],\n:root[data-ui='prism'] .sidebar .nav-btn[data-page='ai']"),
  'Prism mode must move the AI page into the overflow menu rather than making the existing feature inaccessible');

check(html.includes('id="library-toolbar-actions" class="library-toolbar-actions"')
      && html.includes('id="library-search-control" class="library-search"')
      && js.includes("for (const id of ['library-toolbar-actions', 'prism-library-tools', 'nav-settings-button'])")
      && js.includes("'library-search-control'")
      && js.includes("sidebar.insertBefore(element, prismOverflowToggle || account)"),
  'Prism toolbar movers need matching element IDs so the real action row and search control move into their intended toolbar/overflow containers');

check(html.includes('id="library-search-control"')
    && html.includes('id="prism-help"')
    && html.includes('id="prism-update"')
    && js.includes('function syncPrismOverflow(mode)')
    && js.includes('function restorePrismOverflow()')
    && js.includes("README.ru.md")
    && js.includes("button.textContent = 'Проверка…'")
    && js.includes("button.textContent = 'Обновить…';")
    && !js.includes("button.textContent = '♻ Обновить…';")
    && css.includes(":root[data-ui='prism'] .sidebar #prism-help::before")
    && css.includes("content: '?';")
    && css.includes(":root[data-ui='prism'] .sidebar #prism-update::before")
    && css.includes("content: '☁';")
    && css.includes(":root[data-ui='prism'] .sidebar #prism-update::after")
    && css.includes("content: '↓';")
    && css.includes('.sidebar .prism-toolbar-overflow[hidden]')
    && css.includes(':root:not([data-ui=\'prism\']) .prism-header-action'),
  'Prism toolbar must keep help/update available while hiding advanced tools in an accessible overflow panel');
check(html.includes('id="nav-settings-button" class="nav-btn" data-page="settings"')
    && js.includes("const settingsButton = $('nav-settings-button')")
    && js.includes("settingsLabel.textContent = 'Параметры…'")
    && js.includes("settingsLabel.textContent = 'Настройки'")
    && js.includes("settingsButton.title = 'Параметры лаунчера'")
    && js.includes("prismToolbarHome['nav-settings-button']")
    && css.includes("Prism/Pinecone pass 20")
    && css.includes(":root[data-ui='prism'] .sidebar #nav-settings-button")
    && css.includes("width: auto;"),
  'Prism Parameters button must move into the top toolbar and return to the original navigation slot when switching layouts');

check(html.includes('aria-controls="prism-folders-menu"')
    && html.includes('Папки ▾')
    && js.includes('function ensurePrismFoldersMenu(sidebar)')
    && js.includes("await invoke('open_game_folder')")
    && js.includes("await invoke('open_instances_folder')")
    && js.includes("await invoke('open_mods_folder')")
    && js.includes("await invoke('open_launcher_folder')")
    && rustInstances.includes("pub fn open_game_folder()")
    && rustMain.includes("instances::open_game_folder,")
    && rustInstances.includes("pub fn open_instances_folder()")
    && rustMain.includes("instances::open_instances_folder,")
    && js.includes("event.key !== 'Escape'")
    && js.includes("closePrismFoldersMenu();\n      if (!prismOverflowPanel) return;")
    && js.includes("if (prismOverflowPanel && !prismOverflowPanel.hidden)")
    && css.includes('.prism-folders-menu-item:focus-visible'),
  'Prism Folders menu must open game root, instances, shared mods and config directories with keyboard dismissal');

check(js.indexOf("addAction('group', '▤ Изменить группу…'") < js.indexOf("addAction('folder', '📂 Папка'")
    && js.indexOf("addAction('folder', '📂 Папка'") < js.indexOf("addAction('export', '⇩ Экспортировать…'"),
  'Prism instance action rail should follow the reference order: group management before folder and export');

check(js.includes("currentGroupLabel = prismGroupKey(inst)")
    && js.includes("return prismInstanceGroups[String(inst.id)] || 'Без группы'")
    && js.includes("function togglePrismGroup(groupLabel, heading)")
    && js.includes("PRISM_COLLAPSED_GROUPS_STORE")
    && js.includes("heading.setAttribute('aria-expanded', String(!collapsed))")
    && js.includes("heading.addEventListener('keydown'")
    && css.includes("#library .library-group-heading[data-collapsed='true']::before")
    && css.includes("#library .inst-card[hidden]")
    && js.includes('PRISM_INSTANCE_GROUPS_STORE')
    && js.includes('function savePrismInstanceGroup')
    && js.includes('function openPrismGroupEditor')
    && js.includes("addAction('group', '▤ Изменить группу…'")
    && html.includes('<option value="none">Свои группы</option>')
    && css.includes(':root[data-ui=\'prism\'] #library .inst-card.add')
    && css.includes('display: none !important;'),
  'Prism must support persistent per-instance groups, an editor, the custom-group option and no duplicate add tile');

check(css.includes(":root[data-ui='prism'] .sidebar #library-add::before")
    && css.includes("width: 17px;")
    && css.includes(":root[data-ui='prism'] .sidebar #prism-open-folder .prism-folder-icon")
    && css.includes("font-size: 11px;")
    && css.includes("@media (max-width: 740px)"),
  'Prism toolbar must keep compact reference-sized icons and readable labels with narrower-window overrides');

check(js.includes('PRISM_INSTANCE_ICONS_STORE')
    && js.includes('PRISM_ICON_MAX_CHARS')
    && js.includes('PRISM_ICON_TOTAL_MAX_CHARS')
    && js.includes('function savePrismInstanceIcons')
    && js.includes('function choosePrismInstanceIcon')
    && js.includes("addAction('icon', '▧ Выбрать иконку…'")
    && js.includes("addAction('reset-icon', '× Сбросить иконку'")
    && css.includes('img.prism-custom-instance-icon')
    && css.includes('.prism-quick-actions button[hidden]'),
  'Prism custom icons must be bounded, persistent, resettable, and styled without changing tile geometry');

check(css.includes(":root[data-ui='prism'] #prism-library-tools")
    && css.includes(":root[data-ui='modrinth'] #modrinth-library-tools")
    && css.includes(":root[data-ui='gd'] #gd-pack-tools")
    && css.includes(":root[data-ui='official'] #official-library-tools")
    && css.includes(":root[data-ui='at'] #at-instance-tools")
    && css.includes(":root[data-ui='lunar'] #lunar-library-tools"),
  'Each feature toolbar must be scoped to its matching launcher-inspired style');


check(css.includes("/* Prism/Pinecone pass 24")
    && css.includes("--el-p2p-dock-right: 182px;")
    && css.includes("--el-p2p-dock-right: 174px;")
    && css.includes("--el-p2p-dock-right: 18px;"),
  'Prism P2P dock offset must track the 164/156 px right rail and switch below the responsive breakpoint');

check(css.includes("/* Prism/Pinecone pass 25")
    && css.includes(":root[data-ui='prism'] .play-ui .prism-quick-actions [data-action='mods']")
    && css.includes("[data-action='icon']")
    && css.includes("[data-action='reset-icon']")
    && js.includes("item('🧩 Моды', async () => {")
    && js.includes("if (prismInstanceIcons[String(inst.id)])")
    && js.includes("item('× Сбросить иконку'"),
  'Prism right rail should keep the seven reference actions while mods and icon tools remain accessible in the instance context menu');

check(css.includes('UI repair pass 43')
    && css.includes('--el-p2p-dock-bottom')
    && css.includes('.fab {')
    && css.includes('bottom: calc(var(--el-p2p-dock-bottom, 18px) + 52px'),
  'P2P control and popover must share a viewport-safe dock instead of covering the top toolbar');

check(css.includes(":root[data-ui='modrinth'] #page-play .library-toolbar-actions")
    && css.includes(":root[data-ui='modrinth'] #modrinth-library-tools")
    && css.includes(":root[data-ui='modrinth'] #mod-results > .mod-card")
    && css.includes(":root[data-ui='modrinth'] .mods-search-controls"),
  'Modrinth library, filters and catalog cards must use shrink-safe, responsive layouts');

check(css.lastIndexOf("/* Prism/Pinecone pass 14")
      > css.lastIndexOf("/* Prism/Pinecone pass 13")
      && css.includes("gap: 18px;")
      && css.includes("color: #91d47b;")
      && css.lastIndexOf("[data-action='delete'] { order: 6; }")
         < css.lastIndexOf("[data-action='shortcut'] { order: 7; }"),
  'Prism launch row should stay unboxed, use the green launch glyph, and keep Delete before Create Shortcut');

check(css.includes("/* Prism/Pinecone pass 15")
      && css.includes(":root[data-ui='prism'] .sidebar #account-box::after")
      && css.includes("margin-left: auto;")
      && css.includes("content: '▾';")
      && css.includes("border-color: transparent;"),
  'Prism account selector should have a quiet background, a visible dropdown cue, and overflow aligned in the free toolbar gap');


check(js.includes("const PRISM_PLAY_STATS_STORE = 'end-launcher-prism-play-stats-v1'")
    && js.includes('function formatPrismDuration(value)')
    && js.includes('function formatPrismLastPlayed(value)')
    && js.includes('function finishPrismPlaySession()')
    && js.includes("finishPrismPlaySession();")
    && js.includes('function startPrismPlaySession(inst)')
    && js.includes('function checkpointPrismPlaySession()')
    && js.includes("window.addEventListener('pagehide', checkpointPrismPlaySession)")
    && js.includes('baseTotalMs: previous.totalMs')
    && js.includes('renderPrismFooterStats(selected)')
    && css.includes('/* Prism/Pinecone pass 27')
    && css.includes('.prism-status-meta-row .prism-status-spacer')
    && css.includes('#prism-status-details')
    && css.includes('#prism-status-active')
    && html.includes('id="prism-status-details"')
    && html.includes('id="prism-status-active"'),
  'Prism footer must persist per-instance last-played time and completed session duration, and keep total-time text readable in the status row');


check(js.includes('function closePrismOverflow({ restoreFocus = false } = {})')
    && js.includes('closePrismOverflow({ restoreFocus: true })')
    && js.includes("window.addEventListener('resize', () => { closePrismFoldersMenu(); closePrismOverflow(); });")
    && js.includes("prismOverflowToggle?.setAttribute('aria-expanded', 'false')")
    && js.includes("event.key !== 'Escape' || currentUi !== 'prism' || !prismOverflowPanel || prismOverflowPanel.hidden"),
  'Prism overflow menu must dismiss on Escape and resize, update aria-expanded, and restore focus to its trigger');


check(js.includes('function openPrismEmptyContextMenu(event)')
    && js.includes('function closePrismEmptyContextMenu({ restoreFocus = false } = {})')
    && js.includes("menu.id = 'prism-empty-context-menu'")
    && js.includes("addItem('＋ Добавить экземпляр…', async () => {")
    && js.includes('closePrismEmptyContextMenu({ restoreFocus: true });')
    && js.includes('prismEmptyContextReturnFocus.focus({ preventScroll: true })')
    && js.includes("addItem('⇩ Импортировать экземпляр…'")
    && js.includes("addItem('↻ Обновить список', () => loadInstances())")
    && js.includes("document.querySelector('.content main')?.addEventListener('contextmenu', openPrismEmptyContextMenu)")
    && js.includes("if (event.key !== 'Escape' || !$('prism-empty-context-menu')) return;")
    && js.includes("target?.closest('.inst-card, button, input, select, textarea, a, [role=\"dialog\"], .inst-menu, .prism-folders-menu, .prism-toolbar-overflow')"),
  'Prism empty-library right-click menu must offer create/import/refresh, avoid intercepting cards or controls, and close on Escape');


check(css.includes("/* Prism/Pinecone pass 29")
    && css.includes(":root[data-ui='prism'] .sidebar #nav-settings-button .ico::before")
    && css.includes("box-shadow: 0 3px #d4dadd, 0 6px #d4dadd;")
    && css.includes(":root[data-ui='prism'] .sidebar #nav-settings-button .ico::after")
    && css.includes("box-shadow: 5px 3px #91d47b, 2px 6px #91d47b;"),
  'Prism Parameters command must use a compact project-owned settings/list glyph while retaining its navigation handler');


check(html.includes('id="prism-play-selects"')
    && html.includes('aria-label="Издание и экземпляр Minecraft"')
    && js.includes("'prism-play-selects'")
    && js.includes("const prismOverflowIds = ['library-search-control', 'library-view', 'library-import', 'layout-extras-toggle', 'prism-play-selects', 'prism-library-tools', 'nav-ai-button']")
    && css.includes("/* Prism/Pinecone pass 30")
    && css.includes(":root[data-ui='prism'] .sidebar .prism-toolbar-overflow > #prism-play-selects")
    && css.includes("grid-template-columns: minmax(0, .85fr) minmax(0, 1.35fr);")
    && css.includes("grid-template-columns: repeat(2, minmax(0, 1fr));")
    && css.includes("@media (max-width: 520px)"),
  'Prism right rail must stay focused on instance actions while Java/Bedrock and instance selectors remain available in the responsive overflow menu');


check(css.includes("/* Prism/Pinecone pass 31")
    && css.includes(":root[data-ui='prism'] #library .inst-card.active .inst-icon")
    && css.includes("border-color: #3e3e3e;")
    && css.includes("background-color: #363636;")
    && css.includes("#library .inst-card.active .inst-name")
    && css.includes("background: #91d85a;"),
  'Prism selected tiles should use the green label strip as the primary selection cue and keep the icon border neutral');



check(js.includes("const collapsed = !query && prismCollapsedGroups.has(currentGroupLabel);")
    && js.includes("card.hidden = !query && prismCollapsedGroups.has(currentGroupLabel);"),
  'Typing a library search must reveal matches within persisted collapsed groups without changing the saved group state');

check(js.includes("aria-keyshortcuts', 'ArrowLeft ArrowRight ArrowUp ArrowDown Home End Enter Space Shift+F10")
    && js.includes('const movement = {')
    && js.includes('ArrowLeft: [-1, 0]')
    && js.includes('ArrowRight: [1, 0]')
    && js.includes('ArrowUp: [0, -1]')
    && js.includes('ArrowDown: [0, 1]')
    && js.includes('const centerX = rect.left + rect.width / 2;')
    && js.includes("event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)")
    && js.includes("card.querySelector('.inst-menu button')?.focus();"),
  'Prism library cards must support spatial arrow navigation, Home/End, focus retention on selection, and keyboard access to instance actions');

check(css.includes('/* Prism/Pinecone pass 33 — keyboard navigation')
    && css.includes(":root[data-ui='prism'] #library .inst-card:focus-visible")
    && css.includes('text-overflow: ellipsis;')
    && css.includes(":root[data-ui='prism'] #library .library-group-heading:focus-visible"),
  'Prism keyboard focus and long profile labels must stay visible and contained within compact tiles');

console.log('UI regression checks passed: unique IDs, keyboard triggers, eight layouts across JS/HTML/Rust, first-run persistence, focus trapping, separate particle/global animation toggles, compact dialogs, bounded theme import, customizer baseline restoration, and safe edit-mode selection and pointer-drag target resolution and click-through media overlay and actionable custom widgets, shared navigation, lazy-news section visibility, and stable live property controls and theme-palette precedence, stable customizer IDs, safe layer deletion, dynamic content customization, keyboard nudging, and linear-time customizer refresh that preserves active drags, plus keyboard-navigable Prism profile tiles and search-aware collapsed groups.');
