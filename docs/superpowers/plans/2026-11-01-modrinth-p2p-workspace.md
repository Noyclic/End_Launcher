> **Migration note (2026-11-02):** Preserved from `ui-fidelity-pass` as project history. Checklist items and branch-specific constraints below describe the original planning context; verify current `main` before treating them as outstanding work. Do not follow any instruction here to switch branches or modify `main` without checking the current project state.

# Modrinth Workspace P2P and Filter Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the Modrinth workspace free of floating-control overlap and make filtered library states recoverable and accessible.

**Architecture:** Reuse the existing P2P button and its DOM marker; move it into the Modrinth header only for that shell, leaving Prism's overflow placement unchanged and restoring the original position for other shells. Keep P2P behavior in the existing handlers, add accessible dialog state/focus restoration, and add a Modrinth-specific empty state that resets only search/group/loader filters.

**Tech Stack:** Existing vanilla JavaScript, HTML, CSS, Node static UI assertions.

**Spec:** Existing project constraints in `GEMINI.md` and Modrinth behavior/visual notes in `Noyclic/End-Launcher-References` (`REFERENCES.md`, `REFERENCES/LAUNCHER-UI-NOTES.md`).

## Global Constraints

- Work only on `ui-fidelity-pass`; do not create or switch branches and do not modify `main`.
- Keep Prism/Pinecone geometry, order, and behavior unchanged.
- Preserve existing P2P handlers, launcher features, game data, accounts, settings, and Rust commands.
- Do not modify workflows, secrets, signing, releases, or build configuration.
- Do not claim pixel-perfect fidelity without a fresh screenshot from the running application.

## Review Focus

- Switching End → Modrinth → Prism → Modrinth must not duplicate or detach the P2P button.
- Switching from Modrinth to each non-Prism style must restore the P2P button to its original parent/position.
- Closing P2P by outside click must not steal focus; Escape must restore focus to the trigger.
- The empty state must clear only search/group/loader filters and preserve the user's selected sort order.
- A narrow Modrinth window must keep the P2P trigger visible without covering navigation or the library.

---

### Task 1: Modrinth P2P Dock and Filter Recovery

**Files:**
- Modify: `src/index.html`
- Modify: `src/main.js`
- Modify: `src/prism-layout-fixes.css`
- Test: `scripts/check-ui.mjs`
- Modify: `CHANGELOG.md`

**Interfaces:**
- `syncModrinthP2pDock(mode)` moves the existing `#p2p-fab` to `#modrinth-app-header` in Modrinth mode and restores it via the original DOM marker in every non-Prism mode.
- `clearModrinthLibraryFilters()` clears search, group, and loader filters, preserves sort, re-renders the library, and returns focus to search.

- [x] **Step 1: Write regression assertions first.** Add checks for the P2P dialog relationship, docking marker/helper, responsive P2P CSS, live filter count, and the filter-reset empty state.
- [x] **Step 2: Verify RED against the pre-change source.** The original source was checked for all seven missing behavior anchors before implementation; each was absent.
- [x] **Step 3: Implement the existing-node docking and accessible P2P dialog.** Keep all original listener-bound elements; close by Escape and restore focus only when Escape is used.
- [x] **Step 4: Implement the Modrinth filtered-empty state and reset action.** Keep sort unchanged and persist cleared group/loader filters.
- [x] **Step 5: Add scoped responsive styles, regression assertions, and a changelog entry.**
- [ ] **Step 6: Run local verification.** Run `node --check src/main.js` and `npm run test:ui`; run a fresh Windows/Tauri build and compare a new screenshot before claiming visual fidelity.

**Verification limitation:** The current tool session cannot resolve `github.com` from its local shell, so local Node/Tauri commands and a fresh runtime screenshot are not available in this session. Static source-level assertions are checked before publishing this patch; a local test/build remains required.
