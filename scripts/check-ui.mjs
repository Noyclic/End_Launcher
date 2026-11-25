[object Object]

// Modrinth bulk-action recovery and keyboard feedback
check(html.includes('id="modrinth-bulk-status"') && html.includes('aria-live="polite"'), 'Modrinth bulk actions must expose a live status region');
check(js.includes('function setModrinthBulkStatus(message, tone = \'\')') && js.includes('function restoreModrinthBulkFocus'), 'Modrinth bulk action status and focus recovery helpers must exist');
check(js.includes('Control+Z Meta+Z') && js.includes('undoModrinthBulkAction()'), 'Modrinth bulk undo must be keyboard reachable with Ctrl/Cmd+Z');
check(js.includes("event.key === 'Escape'") && js.includes('modrinth-bulk-group-editor') && js.includes('restoreModrinthBulkFocus()'), 'Modrinth bulk group editor must close with Escape and restore focus');
check(js.includes('selection: selectedSnapshot') && js.includes('modrinthSelectedIds = new Set(selectedSnapshot)'), 'Bulk undo must restore the selection snapshot together with the data snapshot');
check(css.includes('.modrinth-bulk-status[data-tone=\'success\']') && css.includes('@media (max-width: 700px)'), 'Modrinth bulk status must remain readable and contained on narrow layouts');
