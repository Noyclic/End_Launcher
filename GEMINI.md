# Gemini Night Agent — End Launcher

## Mission
Make End Launcher better through small, tested, coherent improvements. Work only on the existing shared branch `ui-fidelity-pass`. The Night Agent workflow owns commit/push; never create commits or push from Gemini.

## Product boundaries
- End Launcher remains the product. Other launcher layouts are reference-inspired modes, not separate applications.
- Prism is considered feature-complete. Do not redesign or casually restyle it; only fix a demonstrated bug or regression.
- Preserve all existing features, settings, user data, authentication, launch/install behavior, and compatibility.
- Never merge PR #1 into `main`. Never create or switch to a new feature branch.
- Never reorder the Prism toolbar. Preserve same-main-window navigation and dialogs.
- Do not replace large files or rewrite the launcher. Prefer the smallest coherent patch.
- Do not remove controls/features because they are difficult to implement.
- Do not change signing, release, credentials, repository secrets, or GitHub workflow configuration.
- Do not commit or push. The workflow validates and publishes with a SHA lease.

## Reference fidelity
- Use `Noyclic/End-Launcher-References` only when its contents are actually available. Inspect the exact image before describing or implementing it.
- Do not invent visual details, screenshots, or claims of pixel-perfect matching.
- Preserve End Launcher branding and original iconography; do not copy third-party logos/icons.
- Modrinth mode is the current active design direction. The current implementation is an initial approximation, not a finished pixel-perfect recreation. Improve it incrementally against the real repository reference when available.
- Keep Prism and all other layouts visually isolated from Modrinth-specific CSS/markup.

## Safe workflow
1. Inspect current branch state, recent commits, relevant implementation, and tests.
2. Choose exactly one bounded task. Avoid overlapping a recently completed change.
3. Add/update focused regression tests with the implementation.
4. Update `CHANGELOG.md` with only changes actually made.
5. Run `node --check src/main.js`, `npm run test:ui`, `cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check`, and `cargo test --manifest-path src-tauri/Cargo.toml` where possible.
6. If checks fail, fix the issue or revert the incomplete patch. Do not publish untested changes.
7. If no safe task is available, leave the tree clean and report that honestly.

## Priority order
1. Fix concrete bugs/regressions without changing established layout.
2. Improve Modrinth mode fidelity and usability against the exact reference images.
3. Add missing Modrinth workflows only when they can be implemented end-to-end and tested.
4. Improve accessibility, keyboard behavior, responsive layouts, and performance.
5. Improve other launcher-inspired modes only after checking they are not already complete.

## Reporting
Summarize the chosen task, files changed, tests actually run, and any remaining limitations. Never claim a build, test, or visual comparison passed unless it did.
