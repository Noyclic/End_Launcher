# Changelog

## Prism/Pinecone reference pass 9

- Corrected the Folders menu's path semantics: “Корневая папка” now opens the configured game root; “Папка экземпляров” opens its instances directory; “Общие моды” opens shared mods; “Папка настроек” separately opens End Launcher's config directory.
- Added and registered a Rust/Tauri `open_game_folder` command so the root action follows a user-configured game directory rather than always opening the configuration folder.
- Extended the regression checks for the new command and registration.


## Prism/Pinecone reference pass 8

- Reworked the bottom status bar to match the reference's two-row rhythm more closely: project news/update label and a working “Больше новостей” action above; selected instance details and launch state below.
- The news link opens the End Launcher releases page and reports open failures rather than acting as a decorative control.
- Added a regression assertion for the link destination, styling, and active-instance field.


## Prism/Pinecone reference pass 7

- Aligned the floating P2P control's right offset with the narrowed 164 px desktop action rail (and 156 px compact breakpoint) so it no longer reserves space for the old 264 px panel.
- Reduced the visible right rail to the seven reference actions: Edit, Change Group, Folder, Export, Copy, Delete, Create Shortcut.
- Kept End Launcher features accessible: Mods, custom icon selection, and reset-icon move to the existing instance context menu, with Reset shown only when a custom icon is set.
- Extended UI regression checks for the responsive P2P offset and for context-menu access to the moved actions.


## Prism/Pinecone reference pass 6

- Corrected the Folders menu to match Prism's global-folder pattern: launcher root, central instances directory, and shared mods directory. The selected-instance folder remains on the right rail and in the instance context menu.
- Added a native Tauri command for opening the central instances folder, creating the directory if it does not yet exist.
- Added UI regression coverage for command registration and the corresponding Rust function.


## Prism/Pinecone reference pass 5

- Made the Folders menu and the general toolbar overflow menu mutually exclusive so they cannot obscure one another.
- Added a regression assertion for this interaction.


## Prism/Pinecone reference pass 4

- Prevented the relocated Settings control from inheriting the old full-width sidebar navigation width; it now sizes to its icon and label.
- Extended the UI check to guard against this regression.


## Prism/Pinecone reference pass 3

- Reworked the top Folders action into a real dropdown instead of redundantly opening the selected instance directory.
- Added menu actions for the selected instance folder, shared mods folder, and launcher folder using the existing Rust commands.
- The folder menu closes on outside click, Escape, layout switching, and window resize; it positions itself against the trigger and has keyboard-accessible menu items.
- Added UI regression checks for Settings toolbar relocation, restoring its original navigation slot in other modes, and the three folder actions.
- Visual comparison with the running Windows build is still pending at the agreed 10-request checkpoint.


## Prism/Pinecone reference pass 2

- Moved the Settings/Parameters control out of generic navigation and into the Prism-style top command strip; switching away from Prism restores the original navigation placement rather than cloning the control.
- Rebalanced the command strip and right-side action rail to match the supplied screenshot's 38 px toolbar rhythm, 164 px rail, 72 px selected-profile icon, and more legible action rows.
- Reasserted a three-row desktop layout (header, work area, status footer) and a compact stacked mobile layout so the footer does not become an accidental implicit grid row.
- Confirmed the HTML control ID, layout-switch restoration marker, DOM move code, and dedicated Prism CSS rule are present on branch ui-fidelity-pass. Native visual verification remains scheduled for the agreed 10-request checkpoint.


## Prism/Pinecone reference pass 21

- A double-click on an instance tile now selects and launches that exact Java instance in Prism mode, matching the desktop-launcher interaction pattern.
- Click-to-select and the separate Play button remain unchanged; double-clicking embedded buttons or form controls is ignored.
- Added a UI regression assertion for the Prism-only behavior.


## Prism/Pinecone reference pass 20

- Preserved the AI assistant page in Prism mode by moving its existing navigation button into the overflow menu with search, sort, import, and extra controls instead of hiding it.
- Added a regression assertion that the AI control is present, registered with the overflow list, and styled inside the overflow panel.


## Prism/Pinecone reference pass 19

- Added a true right-click instance context menu in Prism mode, positioned near the pointer and constrained to the viewport.
- Matched the reference action order: Rename, Change Icon, Launch, Kill when the matching Java instance is running, Edit, Change Group, Folder, Export, Copy, Delete, Create Shortcut.
- Reused the existing backend commands and instance editor/group editor rather than creating parallel handlers; the other interface modes keep their existing menu.
- Added regression checks for the pointer-triggered menu, key actions/order, and viewport-safe scrolling.


## Prism/Pinecone reference pass 18

- Fixed the missing DOM ID on the library toolbar action container. The existing Prism layout mover now finds and moves the real toolbar into the top strip instead of silently leaving it inside the library.
- Confirmed the search control already had its expected ID; with the toolbar container fixed, the search can correctly be moved into the overflow panel and restored when switching UI modes.
- Added a regression assertion for those actual HTML IDs and their mover code paths.


## Prism/Pinecone reference pass 17

- Added a real “Create Shortcut” action to the selected-instance rail. It creates a Windows .lnk, Linux .desktop, or macOS .command entry on the desktop and starts End Launcher with the target instance ID.
- Added startup argument handling so opening the shortcut selects and launches that exact instance rather than just opening the default library.
- Hid the separate Rename row in Prism mode because the reference uses Edit for instance details and has a Create Shortcut action in that position.
- Added UI regression coverage for native registration, shortcut invocation, startup target selection and the Prism action order.


## Prism/Pinecone reference pass 16

- Added a real Stop action to the Prism right rail. It calls a registered Rust command and targets the process started for the specific running instance.
- The process monitor polls the child process, accepts a cancellation request, terminates only that launched Java process, and reports an intentional stop separately from a crash.
- The Stop row remains disabled when no Java instance is running and hidden in other interface modes.
- Added UI regression coverage for the registered command, frontend event handling, and Prism-only control.


## Prism/Pinecone reference pass 15

- Removed the persistent card-like outline behind the account selector, added a subtle dropdown cue, and retained a clear hover/focus state.
- Moved the toolbar overflow trigger into the otherwise empty area before the account selector, keeping the core Prism toolbar less cluttered.
- Added a regression check for account-selector and overflow placement.


## Prism/Pinecone reference pass 14

- Removed the filled blue treatment from the main Prism launch action to match the reference's compact, unboxed action row.
- Matched the green play glyph, selected-instance icon/name spacing, and right-rail action rhythm to the supplied PineconeMC screenshot.
- Moved Delete ahead of the extra Rename option to keep the closest reference actions together.
- Added a UI regression check for the launch-row treatment and action order. Build and screenshot review remain deferred to the agreed checkpoint.


## Prism/Pinecone reference pass 13

- Reordered the selected-instance action rail so Edit, Change Group, Folder, Export, Copy, Rename, and Delete appear before End Launcher-specific extras such as Mods and custom icons.
- The actions still use the existing handlers; this is ordering and layout only.


## Prism/Pinecone reference pass 12

- The project-owned mark now acts as an accessible “Open instance library” navigation shortcut in Prism mode. This keeps the reference toolbar compact without trapping users on Settings or the AI page after the main Play shortcut is hidden.
- The Settings toolbar label changes to “Параметры…” in Prism mode and restores to “Настройки” in other layouts.
- Verified the changes are isolated to the Prism layout; a fresh Windows build and screenshot comparison remain the visual acceptance step.


## Prism/Pinecone reference pass 11

- Reordered the compact desktop toolbar to follow the supplied capture: Add Instance, Folder, Settings, Help, Update, project-owned mark, overflow, and account.
- Hid duplicate Play/AI navigation shortcuts in this narrow toolbar; AI remains reachable from Settings.
- Matched the right action rail's surface, selected-instance spacing, play-row height, and compact quick-action rhythm more closely to the Pinecone screenshot.
- Adjusted horizontal content inset to keep the grouped instance library close to the reference's window edge.
- This remains a visual approximation pending a fresh Windows/Tauri screenshot.


## Prism/Pinecone reference pass 10

- Made instance group headings collapsible with keyboard support (Enter/Space), aria-expanded state and a visible focus outline.
- Collapse state is persisted locally and remains respected while filtering, so a group never claims to be collapsed while its tiles are visible.
- Added UI regression coverage for persistence/ARIA/keyboard handling, plus an explicit hidden-card rule so the grid layout does not override the collapsed state.
- The latest automated runs and a fresh Windows build must still confirm this pass; visual comparison stays scheduled for the 10-request checkpoint.

## Prism/Pinecone reference pass 8

- Added a functional instance editor to the right-side action rail. It edits the instance name, Minecraft version and loader without changing the instance folder or removing worlds/mods.
- Added Rust-side validation for the name, version identifier and supported loader before writing the updated instance metadata.
- The editor warns that changing Minecraft version/loader can affect mod and world compatibility; it reports backend errors and does not pretend that failed saves succeeded.
- UI regression checks now inspect the edit action, editor styling, Rust validation and command registration.
- Per-instance custom groups can now be assigned from the rail; the latest branch also includes collapsible group headings with a remembered collapsed state.


## Prism/Pinecone reference pass 9

- Added persistent per-instance custom icons, matching a useful Prism/Modrinth library feature. PNG, JPG, GIF, WebP and AVIF images are supported; each icon is capped at 256 KB and the saved collection has a total size cap.
- Custom icons overlay the generated vanilla/Fabric/Forge/NeoForge defaults in Prism tiles and the selected-instance preview; resetting an icon restores the generated default.
- Storage failures are reported, and the icon data is validated on load. UI regression coverage now checks the limits, picker, reset action and image styling.
- Automated UI checks and the Windows build are pending for this change. Visual comparison is still reserved for the planned checkpoint.


## Prism/Pinecone reference pass 7

- Reworked the Prism header into a compact desktop toolbar: Add Instance, selected-instance folder, Settings, Help, update check, and a single overflow button.
- Moved search, list/card view, import, extra launcher controls, and custom/loader/version grouping into an anchored overflow panel so the library stays visually clean by default without losing existing handlers.
- The panel closes on outside click; original controls return to their original DOM positions when switching away from Prism.
- Help opens End Launcher's Russian README; Update checks the existing release-check command and opens a newer release when available.
- Added UI regression assertions for the overflow panel and project help/update controls. Visual verification and the newest Windows installer build are pending.


## Prism/Pinecone reference pass 8

- Reordered the functional right-rail actions so profile grouping appears before the folder and export operations, closer to the supplied PineconeMC action order.
- Added a regression assertion for the quick-action order to prevent accidental drift.
- Automated checks for this latest sequence are pending; visual review stays deferred until the planned 10-request checkpoint.


## Prism/Pinecone reference pass 7

- Refined toolbar label sizing, Add Instance glyph size, and folder icon dimensions against the supplied desktop screenshot.
- Kept secondary sort/group controls compact and preserved smaller control sizes on narrow screens.
- Added a UI regression assertion for the toolbar geometry. The running Windows app still needs a side-by-side screenshot review after the current checks complete.


## Prism/Pinecone reference pass 6

- Added persistent per-instance group assignment to Prism mode. The right-side action “Изменить группу…” opens a compact editor for existing groups, creating a new group, or returning an instance to “Без группы”.
- Custom groups are stored separately in local storage under a namespaced key; failures to write are reported instead of silently pretending the group was saved.
- Renamed the default grouping option to “Свои группы” and updated the UI regression check to cover custom, loader and Minecraft-version grouping.
- A regression check initially caught an outdated assertion that expected the older grouping condition; the assertion was updated to reflect the new per-instance group model. The updated workflow must be green before considering this layer validated.


## Prism/Pinecone reference pass 5

- Added a right-rail quick-action list for the selected instance: Mods, Open Folder, Export, Copy, Rename and two-step Delete. These call existing app operations instead of being decorative controls.
- Reset delete confirmation if the selected instance changes, preventing a stale confirmation from deleting a different profile.
- Updated Prism launch wording to compact title-case labels (“Запустить”, “Скачать и запустить”) while keeping existing text in the other layouts.
- Extended UI regression checks for the selected-instance summary, action rail, default group heading and bottom status strip.
- JavaScript syntax and UI regression checks passed on the current quick-action changes; Rust tests and a full Windows build remain in progress.


## Prism/Pinecone reference pass 4

- Consolidated the library action controls and Prism sort/group controls into the top application strip; the library now begins directly below it.
- Preserved original nodes and handlers, with comment anchors returning the controls to their original positions when the user switches to another layout.
- Always show the “Без группы” disclosure heading when Prism grouping is disabled, and hide the duplicate “new instance” tile because Add Instance is in the toolbar.
- Added a two-row bottom status strip with the selected instance name/version and launcher status.
- The active UI check and Windows build for the latest layout commits must finish before the pass can be considered validated; visual comparison remains pending.


## Prism/Pinecone reference pass 3

- Added a live selected-instance preview to the right action rail (instance name and Minecraft version), updated whenever the selected instance changes.
- Added project-generated pixel-style icons for vanilla, Fabric, Forge and NeoForge instances while keeping the styling scoped to Prism mode.
- Matched the reference's 38 px toolbar row and lime selected-instance name strip.
- Visual comparison and runtime interaction testing are still required; this pass is not marked final.


## Prism/Pinecone reference pass 2

- Moved the existing Add Instance and Open Folder buttons into the compact top action strip for Prism mode, preserving their original DOM IDs and event handlers.
- Added original CSS-only Qt-inspired button treatment and retained the search, import, extras, and list-view controls in the library area.
- Switching away from Prism returns both buttons to their original library-toolbar positions.
- Runtime and interaction validation are still pending.


## Prism/Pinecone reference pass 1

- Tuned the Prism-inspired window proportions against the supplied PineconeMC screenshot: compact top strip, narrower right-side action rail, tighter toolbar spacing, and a denser instance shelf.
- Adjusted instance tile width and icon size to better match the reference while retaining End Launcher-owned artwork and existing handlers.
- This is a first geometry pass; visual comparison in the running Windows build is still required before calling it close to final.


## UI fidelity pass — layout-specific polish

- Refined the instance library toolbar, card density, active-selection state, and launch controls independently for Prism-inspired, Modrinth-inspired, TL Legacy-inspired, GDLauncher Carbon-inspired, official Minecraft Launcher-inspired, ATLauncher-inspired, and Lunar-inspired layouts.
- Kept each layout within End Launcher's existing markup and behaviour so core launcher functions remain shared rather than duplicated.
- Added responsive wrapping for toolbar controls at narrower window widths.
- Used original CSS styling only; no third-party logos, icons, artwork, or source code were copied.
- Visual runtime review and full Tauri build are still required before considering the pass fully verified.

## 0.4.0 — Instance import / export and library UX

- Added OS-level drag-and-drop routing: `.jar` files go to the active build's mods; `.mrpack`, recognised `.zip` packs, and folders are treated as build imports.
- Added Modrinth `.mrpack` import: reads the official manifest, copies client overrides, downloads required client files over HTTPS from allowed hosts, and verifies SHA-1 when available.
- Added folder import for End Launcher, Prism/MultiMC (`mmc-pack.json`), and XMCL-style (`instance.json` with `runtime`) instance layouts. The importer copies game-specific data, not global assets/libraries/runtimes.
- Added CurseForge ZIP manifest and overrides import. Its manifest can list mod IDs without providing `.jar` files; the UI warns that those mods may need to be installed separately.
- Added a visible drop target and import instructions in the library. Import failures remove the incomplete new instance; archive paths are checked to prevent path traversal and oversized files are limited.
- Unsupported Quilt imports are rejected clearly rather than silently creating a misleading Vanilla profile.

## V13 — библиотека сборок и резервные копии
- Добавлено создание независимой копии сборки из меню «⋯» с модами, настройками, ресурспаками и сохранениями.
- Добавлен экспорт сборки в ZIP в папку `exports` внутри папки настроек лаунчера.
- Добавлена очистка неполной копии при ошибке копирования.
- Обновлена русская документация.


## V10 — раскладки с отдельной структурой и поиск по сборкам

### 🎨 Интерфейсы
- Добавлены отдельные CSS-композиции для Modrinth-inspired, Prism-inspired, TL Legacy-inspired, GDLauncher Carbon-inspired, официального Minecraft Launcher-inspired, ATLauncher-inspired и Lunar-inspired режимов. Они используют собственную оболочку End Launcher и не включают оригинальные логотипы/ресурсы этих проектов.
- Панель запуска вынесена в отдельный элемент раскладки: режимы могут располагать её справа или снизу без перемещения остального содержимого.
- Для стилей GD, Official и Lunar добавлены отдельные динамические баннеры с активной сборкой и быстрым запуском.
- Добавлены поиск по имени/версии/загрузчику сборки, переключение карточки/список и кнопка быстрого создания сборки.
- В режимах, где дополнительные виджеты мешают повторению исходной компоновки, их можно открыть кнопкой «Дополнительно»; функции острова, статистики, популярных модов и новостей не удалены.
- Настройки по-прежнему включают кнопку «Перезагрузить интерфейс» для полного повторного применения раскладки.

### 🧪 Проверки
- JS-синтаксис проверен через `node --check` для основных файлов фронтенда.
- Проверены HTML-разметка и уникальность `id`; проверка Rust/Tauri-сборки в этой среде не выполнялась.

---

## 0.2.0 — стабильность, P2P без «эксперимента», оптимизация

### 🌐 Совместная игра (P2P) — теперь обычная функция
- P2P входит в сборку по умолчанию (флаг `--features p2p` больше не нужен). Отключить можно только сборкой с `--no-default-features`.
- **Универсальный код комнаты**: лаунчер друга пробует три способа по очереди — прямой TCP через UPnP, тикет iroh (relay + прямые адреса, без DNS), Node ID iroh (через DNS). Отдельные варианты тоже доступны, способ можно выбрать вручную.
- Лаунчер **сам находит порт открытого мира** в логе игры и **предупреждает, если на порту никто не слушает**.
- Кнопка 📨 копирует **готовое приглашение** для друга с инструкцией.
- Счётчик игроков, зелёная точка на значке 🌐, кнопка «Остановить всё» закрывает и уже открытые туннели.
- При закрытии лаунчера комната закрывается, а **проброс порта на роутере убирается**.

### 🛠 Стабильность
- **Linux**: окно открывается с отключённым DMABUF-рендерером WebKit (лечит пустое окно и ошибки EGL на NVIDIA/Wayland; вернуть старое поведение — `END_LAUNCHER_GPU=1`). `.deb` сам требует `xdg-utils`, `libopenal1` и шрифт эмодзи. В README добавлен раздел «Если что-то не работает» (FUSE для AppImage, WebKitGTK 4.1, Wayland, OpenAL, Linux ARM, Flatpak/Snap).
- **macOS**: CI собирает одну универсальную сборку (Apple Silicon + Intel); в README — как снять карантин (`xattr`).
- **Диагностика**: Настройки → «Диагностика» — копирование сведений для баг-репорта (версия, ОС, Java, пути, наличие crash.log) и открытие папки настроек.
- При падении программы пишется **`crash.log`** в папку настроек (раньше без консоли причину было не узнать).

### ⚡ Оптимизация
- Один общий HTTP-клиент на всё приложение (меньше соединений и TLS-рукопожатий; быстрее поиск модов и загрузки).
- Повторный запуск игры быстрее: проверка тысяч уже скачанных ресурсов без лишней нагрузки на пул потоков.
- Фоновые частицы легче (меньше частиц) и **сами облегчаются на слабом ПК**, а при совсем тяжёлых кадрах отключаются.
- Убрано размытие за панелью «Играть» (дорого на слабых видеокартах и без GPU-ускорения).
- Новости, популярные моды и список версий загружаются, когда окно уже показано, а не в момент запуска.
- Релизная сборка меньше (`opt-level = "s"`, LTO, `strip`).

### 🎨 Интерфейс
- Текст больше **не вылезает за рамки**: ряды с кнопками и полями переносятся на новую строку, длинные подписи и названия переносятся или обрезаются с «…» (панель P2P, настройки, карточки модов и сборок, статистика, нижняя панель, уведомления).

### 🔧 Сборка и прочее
- Ссылки и проверка обновлений обновлены под репозиторий `Noyclic/End_Launcher`.
- Версия поднята до 0.2.0 (в `Cargo.toml`, `tauri.conf.json`, `package.json`): баннер «Доступна новая версия» сравнивает тег релиза с версией сборки.

---

## English summary — 0.2.0

**P2P is now a regular feature** (built in by default): one universal room code tries direct TCP via UPnP, then the iroh ticket, then the iroh Node ID; the game port is detected automatically with a warning if nothing listens on it; a ready-made invitation can be copied; closing the launcher closes the room and removes the router port mapping.

**Stability**: Linux WebKit DMABUF workaround (blank window / EGL errors on NVIDIA/Wayland; set `END_LAUNCHER_GPU=1` to opt out), `.deb` dependencies (`xdg-utils`, `libopenal1`, emoji font), troubleshooting section in the README, universal macOS build, `crash.log` on panics, and Settings → Diagnostics (copy info for a bug report, open the settings folder).

**Performance**: one shared HTTP client, faster relaunch (no per-asset task spawning), lighter self-throttling background particles, no backdrop blur, lazy loading of secondary home-screen data, smaller release binary.

**UI**: text no longer overflows its boxes (rows wrap, long labels wrap or ellipsize).

**Housekeeping**: repository links point to `Noyclic/End_Launcher`; version bumped to 0.2.0.

---

## 0.1.0
Первый публичный релиз: запуск Java Edition (Vanilla, Fabric, Forge, NeoForge), Modrinth-моды с проверкой совместимости, сборки (instances), автоматическая Java, вход (офлайн / Microsoft / Ely.by), ИИ-помощник, встроенный браузер, менеджер модов, «Мой остров», питомец, темы и раскладки интерфейса, экспериментальная совместная игра (P2P).

## V15 — End Lite (режим слабого ПК)
- Добавлен переключатель End Lite в настройках интерфейса.
- Режим отключает декоративные частицы, анимации, переходы и дорогие эффекты размытия/свечения.
- Настройка сохраняется локально и применяется без перезапуска лаунчера.
- В обычном режиме сохранены прежние визуальные эффекты.
- Примечание: End Lite уменьшает нагрузку интерфейса, но не меняет расход ОЗУ самой Minecraft и не заменяет настройки Java/модов.

## V16 — Interface refinement
- Expanded alternate interface workspaces so library, mods and settings can use the available window width instead of inheriting the narrow classic layout.
- Improved layout selector cards with clearer descriptions, a stronger active state, and responsive sizing.
- Refined navigation interaction details for each of the seven interface styles without copying third-party logos or artwork.
- Added reduced-motion handling for page transitions and style-picker animations.
- Preserved End Lite and existing launcher features.

## V17 — Screen-specific interface pass
- Gave the library toolbar and instance cards distinct spacing and hierarchy per selected layout, beyond palette-only differences.
- Refined Modrinth-inspired search controls so filters wrap into readable rows on narrow windows.
- Made Settings groups easier to scan and kept the customization action responsive instead of forcing a large full-width button.
- Added layout-specific library treatments for Prism-inspired, TL Legacy-inspired, Modrinth-inspired, GDLauncher Carbon-inspired, official-launcher-inspired, ATLauncher-inspired and Lunar-inspired modes.
- Kept the changes CSS-only to avoid adding runtime work; End Lite remains compatible.
- Validation: frontend JavaScript syntax, JSON parsing, HTML ID uniqueness, CSS brace balance and ZIP integrity checked; native Tauri build and live visual QA still require a local build.


### UI fidelity follow-up — library structure

- The Prism layout now uses a compact, single-column instance list with aligned icon, name, version/loader chip, and row actions.
- Modrinth and GDLauncher-inspired layouts now use their own icon-and-metadata grid arrangements instead of sharing the generic vertical card structure.
- The instance library exposes the active UI mode as a data attribute, so layout rules remain scoped and the existing list/card toggle continues to work.
- Validation: GitHub Actions should rerun the repository's existing Rust and JavaScript checks for this commit. A full visual review in the Tauri app is still required.


### UI fidelity pass 2 — page hierarchy

- Modrinth-inspired mode now prioritizes search and groups its library actions in a responsive toolbar.
- Official-launcher-inspired mode uses a quieter library header and a clear selected-installation marker.
- TL Legacy-inspired mode gives the version selector, offline nickname, status, and play button a deliberate footer layout.
- ATLauncher and Lunar-inspired modes received layout-specific toolbar/navigation refinements.
- Small-window rules now reflow the affected controls instead of forcing the desktop arrangement.
- Runtime visual inspection is still required before treating these layouts as final.


### UI fidelity pass 3 — mods and account screens

- Added layout-specific treatment for the Modrinth-powered content search panel in Modrinth, Prism, official-launcher-inspired, and Lunar-inspired modes.
- Reworked the search controls into a responsive grid for narrow windows without changing their IDs or search/install handlers.
- Improved account dialog heading/provider identity hierarchy, with mode-specific dialog surfaces that remain consistent with the selected layout.
- Existing authentication controls and backend calls are unchanged. Runtime interaction and visual checks remain necessary.


### UI fidelity pass 4 — settings and assistant

- Improved settings-page section spacing, responsive rows, and the customization entry card.
- Styled the optional AI settings disclosure and assistant input layout to make controls easier to scan.
- Added restrained mode-specific treatments for Prism, TL Legacy, Modrinth, GDLauncher-inspired, official-inspired, ATLauncher, and Lunar-inspired layouts.
- Refined active navigation treatment without changing page routing or control IDs.
- No authentication, game launch, or AI request logic was changed. Runtime visual review remains pending.


### UI fidelity pass 5 — library and launch surfaces

- Refined the selected-installation banner and made its title, metadata, and launch action hold together across wide and narrow windows.
- Tightened library toolbar hierarchy and search sizing, with actions wrapping into a compact layout on smaller windows.
- Added restrained banner/button treatments for Prism, Modrinth, TL Legacy, official-inspired, ATLauncher, and Lunar-inspired layouts.
- Kept existing launcher controls, selection state, and click handlers intact. Visual review in the running Tauri app remains pending.


### UI fidelity pass 6 — hidden-state regression fix

- Ensured the selected-installation banner respects its native `hidden` state even though the responsive layout gives it an explicit flex display when visible.
- This keeps the banner limited to layouts where the existing UI logic enables it, instead of accidentally displaying it in every layout.


### UI fidelity pass 7 — full customizer workspace

- Improved customizer window sizing and prevented horizontal overflow on narrow windows.
- Reorganized profile save/load/import/export controls into a responsive grid.
- Improved the layer and media management panels with adaptive item grids and safer long-text wrapping.
- Made animation presets, global color controls, and media controls wrap more predictably on small screens.
- Added subtle mode-specific panel treatments without changing customization storage or event handlers.


### UI fidelity pass 8 — first-run style selection

- Fixed the welcome wizard's GDLauncher option to use the actual `gd` style identifier.
- Exposed all eight existing interface styles in the first-run selector, so users can choose Prism, TL Legacy, Modrinth, GDLauncher Carbon, ATLauncher, Lunar, official Minecraft, or classic End before opening Settings.
- Reused existing style IDs and labels; no authentication or launcher behavior changed.


### UI fidelity pass 9 — accessibility and compact windows

- Added consistent visible keyboard focus rings with theme-aware accent color.
- Made account and welcome dialogs scroll safely inside short or narrow windows.
- Improved wrapping for authentication fields, mod search controls, and library actions on compact layouts.
- Respects the operating system's reduced-motion preference.


### UI fidelity pass 10 — keyboard-accessible custom scrollbars

- Kept the hover-reveal scrollbar behavior and also reveals the thumb when a scrollable region contains keyboard focus.
- This helps keyboard navigation without making scrollbars permanently visible.


### UI fidelity pass 11 — customizer dialog semantics

- Marked the full customization window as a modal dialog with an explicit accessible title.
- Added a descriptive accessible name to its close button for screen-reader users.


### UI fidelity pass 12 — keyboard handling for the customizer

- Opening the customization dialog moves keyboard focus to its close control.
- Escape closes the dialog, and focus returns to the control that opened it.


### UI fidelity pass 13 — account dialog keyboard focus

- Move focus to the account dialog close control when the account picker opens.
- Restore focus to the previous control when the dialog closes, including with Escape or backdrop click.


### UI fidelity pass 14 — keyboard access, theme portability, and regression checks

- Added keyboard focus trapping to the account picker and full customizer; Escape remains a single close path and focus restoration targets are cleared after closing.
- Made decorative canvas particles stop when the operating system requests reduced motion, while retaining the launcher's own animation controls.
- Hardened theme import: bounds the file and embedded image sizes, limits media/widget counts, checks image data URLs, clamps numeric layout properties, and validates palette/font fields before applying them.
- Made theme export report success/failure and defer object-URL cleanup so the download has time to start.
- Made the customizer and account dialogs scroll reliably in short windows and improved compact-height layout.
- Added a dependency-free frontend UI regression check for duplicate IDs, all eight layout styles, modal semantics, reduced motion, hidden banner behavior, and theme-import bounds; CI runs it after JavaScript syntax checks.


### UI fidelity pass 15 — fix persistent layout selection

- Fixed a backend/frontend mismatch where the UI offered eight styles but Rust accepted only four; all eight layout IDs are now validated by one allow-list.
- Added Rust unit tests to verify that every frontend layout can be saved and unknown IDs remain rejected.
- Updated the first-run wizard to apply the selected layout through the shared layout function, including playbar relocation, banner visibility, toolbar mode, and the Rust configuration save.
- Guarded the asynchronous startup preference read so it cannot overwrite a newer choice made while the app is loading.
- Synced the legacy local preference and added migration for styles previously saved only by the first-run wizard.
- Extended the UI regression script to compare HTML, JavaScript, and Rust layout IDs and to assert first-run persistence behavior.
- Added \`npm run test:ui\` for convenient local execution of the dependency-free regression checks.


### UI fidelity pass 16 — accessible entry points and independent effects

- Made the sidebar account/profile entry keyboard accessible with button semantics, Enter/Space activation, and an explicit relationship to the account dialog.
- Applied keyboard focus trapping to the welcome wizard, moved focus into it on first open, and supported Escape through its existing close behavior.
- Separated the decorative-particle switch from global UI animation state; disabling particles no longer accidentally disables all interface animations.
- Updated the particle animation observer to respond to both global animation and particle setting changes.
- Extended regression checks for the keyboard-accessible account trigger, welcome-dialog focus management, and independent particle/global animation settings.


### UI fidelity pass 17 — restore the actual base appearance on reset/import

- Captured the original inline values for properties owned by the customizer and restore them before applying the active saved profile.
- Prevented stale scale, rotation, opacity, border, spacing, typography, and position overrides from leaking between theme changes or remaining after reset.
- Made the reset action explicitly report that the customization was cleared.
- Extended the regression checks to verify that baseline restoration occurs before current positions and element styles are applied.


### UI fidelity pass 18 — safer edit-mode selection

- Changed built-in element selection to capture-phase click handling so choosing a control for customization cannot activate its normal action (such as navigation or launch).
- Selecting a built-in element now updates both the layer list and the property tools panel.
- Selecting a custom GIF/image or user-created widget now opens its own property tools immediately.
- Prevented the account keyboard shortcut from bypassing edit mode and opening a dialog while the user is trying to customize the layout.
- Added regression checks for action suppression and property-panel updates in the customizer.


### UI fidelity pass 19 — repair actual built-in element dragging

- Fixed the document-level pointer handler to resolve the nearest customizable DOM element from the event target instead of treating `document` as the dragged element.
- Ensured the drag path ignores targets outside editable elements and still excludes the customizer dialog itself.
- Added a regression assertion to prevent the broken `currentTarget` pattern from returning.


### UI fidelity pass 20 — unblocking customizer pointer events

- Fixed the full-window media overlay so it no longer intercepts mouse events intended for underlying launcher controls during editing.
- Kept pointer events enabled on draggable media and widget children, while the parent overlay remains click-through.
- Added regression checks for the overlay's pointer-event behavior and the draggable media children.


### UI fidelity pass 21 — media hit testing and usable custom buttons

- Reset existing custom image pointer-events when edit mode toggles, preventing hidden drag targets from blocking normal UI clicks after editing.
- Added action metadata to configured custom buttons and allowed only those buttons to receive clicks outside edit mode; passive text widgets remain click-through.
- Re-applies the custom widget after action selection so pointer behavior reflects the chosen action.
- Removed `aria-hidden` from the shared media/widget layer so user-created controls and image alternatives remain exposed to assistive technology.
- Added regression checks for media pointer reset, action-button hit testing, and accessibility-tree exposure.


### UI fidelity pass 22 — shared navigation and reliable news loading

- Routed sidebar navigation through the shared page activation function so page-specific refresh and lazy-loading behavior runs for normal clicks as well as internal navigation.
- Fixed the news lazy-loader observing a wrapper that starts `display:none`; it now observes the visible parent container and loads when that home section approaches the viewport.
- Repaired custom button actions that targeted nonexistent sidebar buttons for “Library” and “News”; they now open the real home page, scroll to the library or load/scroll to news.
- Added regression checks for shared navigation, the visible news observer target, and valid custom-button destinations.


### UI fidelity pass 23 — stable live property controls

- Separated visual application from rebuilding the customizer editor panel with an `apply(refreshEditor)` option.
- Changed property-field handlers to apply updated visuals without recreating the selected-tools subtree, so range sliders and number inputs don't lose focus while the user edits values.
- Added a regression check that guards against property-panel redraws during live edits.


### UI fidelity pass 24 — consistent theme and customizer precedence

- Resolved the conflict between the existing Settings palette and the full-customizer global design.
- Built-in theme changes now notify the customizer, allowing an explicitly saved customizer palette to remain the higher-priority override.
- When full-customizer colors are reset, the active built-in theme/palette is preserved rather than being cleared accidentally.
- Added regression checks for the theme-change event and palette-reset precedence.


### UI fidelity pass 25 — stable customizer layer identity and deletion

- Changed customizer element IDs to use semantic tag/class identity rather than the page-wide DOM index, reducing preference drift when layouts move or rerender elements.
- Added an automatic state migration for legacy position/style keys, and persists migrated preferences so the fix survives future launches.
- Centralized deletion of custom GIFs and widgets so selection is cleared or its index is adjusted when nearby layers are removed; used the helper for property-panel, list, and keyboard deletion paths.
- Added regression checks for semantic IDs, legacy migration, and selection-safe deletion.


### UI fidelity pass 26 — dynamic content joins the customizer

- Added dynamic instance cards, mod rows/cards, home mod tiles, news cards, stats, and island panels to the customizable element selector.
- Added a scoped MutationObserver for the launcher layout so content created after initial load (for example, after loading instances or news) receives stable customizer IDs and persisted style overrides.
- The observer watches only the app layout, not the separate custom-media overlay, to avoid self-triggered rendering loops.
- Added regression checks for the expanded selector and scoped observer.


### UI fidelity pass 27 — keyboard nudging after closing the editor

- Fixed keyboard movement so selected layers can still be nudged with arrow keys after closing the customizer panel, which restores focus to its opener rather than `document.body`.
- Prevented arrow/delete shortcuts from hijacking text inputs, form controls, or other open dialogs; Delete/Backspace is guarded against accidental removal while an unrelated control is focused.
- Added regression checks for keyboard nudging and protected input behavior.


### UI fidelity pass 28 — efficient dynamic refresh without interrupting drag

- Reworked stable customizer identity generation to use precomputed occurrence maps instead of querying every matching element for each new node, keeping the pass linear for large libraries.
- Preserved legacy-ID migration while using semantic IDs for current positions and styles.
- Changed the dynamic-content observer to decorate new app nodes without rebuilding the separate GIF/widget overlay, preventing unrelated library/news updates from interrupting an in-progress drag.
- Refreshes the layer list when the customizer opens so content loaded after launch is visible in the editor.
- Added checks for single-pass identity grouping and non-destructive dynamic refresh.


### UI fidelity pass 29 — preserve active drag state during background updates

- Added an `onlyNew` path for dynamic customizer refreshes: occurrence maps are still calculated for all nodes, but already-customized elements are not restored or repositioned during unrelated DOM updates.
- Prevented lazy news, mod lists, and instance cards updating in the background from resetting a built-in element that the user is currently dragging.
- Extended regression checks to enforce this non-destructive observer path.


### UI fidelity pass 30 — make the custom News action visible in every layout

- Fixed the custom-button “News” action so it reveals the hidden home extras panel in alternate layouts before scrolling to the news section.
- Reused the same extras-toggle state and label updates as the visible toolbar button.
- Added a regression check so the News action cannot silently scroll to a section inside a hidden parent again.


### UI fidelity pass 31 — truthful persistence and rollback on quota errors

- Made the customizer save helper return a real success/failure result instead of only changing status text.
- Profile save/load now rolls back on a failed storage write and no longer overwrites an error with a false “saved” message.
- Theme import, image upload, and background upload now restore the prior state if local storage rejects the new data, and clearly state that the change was not applied/persisted.
- Added regression checks for persistence results, rollback paths, and success messaging.


### UI fidelity pass 32 — consistent reset, import, and profile semantics

- Centralized the customizer's default state and reuse it for initial startup, reset, theme import, and profile loading.
- Changed theme import/profile load to replace stale settings rather than merging absent keys from the previous state; older profiles receive known defaults for missing fields.
- Added regression checks for shared defaults and replacement behavior.


### UI fidelity pass 33 — verify persisted state removal before reset success

- Made the full customizer reset verify that the stored theme key was actually removed before applying defaults.
- If local storage is unavailable or removal fails, the existing in-memory appearance is left intact and the interface reports the failure instead of falsely claiming success.
- Added a regression check for the order of storage removal, defaults application, and success reporting.

### UI fidelity pass 34 — restore the real palette and protect modal controls

- When global customizer colors are reset, explicitly re-apply the active Settings palette if the custom palette is selected; when a built-in theme is active, clear inline customizer overrides.
- Excluded account and welcome dialogs from draggable/customizable targets and capture-phase edit selection, so leaving edit mode on cannot intercept Microsoft/Ely.by login or first-run wizard controls.
- Extended regression checks for palette restoration and dialog-safe edit behavior.



### UI fidelity pass 38 — carry the reference style across the whole app

- Extended each launcher-inspired visual language to the Mods screen, settings, create-instance form, account dialog, customizer dialog and AI output instead of styling only the library.
- Reworked form surfaces, input geometry, project rows, source tags and panel borders per mode, keeping original End Launcher controls and actions.
- Removed the classic End backdrop gradients and ambient particle canvas in reference-inspired layouts so they no longer compete with the target launcher's flatter or more focused surfaces.
- Added regression checks for secondary-page coverage, dialogs, form controls and backdrop suppression.





### UI fidelity pass 42 — bring launcher-specific workflows into their matching skins

- Prism: added persistent instance sorting and optional grouping by loader or Minecraft version, using the existing per-instance cards/actions.
- Official-inspired: added release/snapshot/modded inclusion filters and sorting for the installation list.
- Modrinth-inspired: added direct Content shortcuts for mods, resource packs and shaders, plus installed-mod filters for enabled/disabled state and sorting by size/name without re-reading the filesystem for every keystroke.
- GDLauncher-inspired: added quick links to the real Modrinth and CurseForge modpack catalogues plus a shortcut to End Launcher's supported pack-import flow.
- ATLauncher-inspired: exposed the existing duplicate and ZIP-export actions beside the selected instance.
- Lunar-inspired: added persisted favourites and a one-click favourites-only gallery, with favourite instances prioritised in the gallery.
- Reused existing launch, import, duplicate, export, mod search and mod management commands; no fake launch actions or copied third-party icons were added.
- Added regression checks for each feature route, state persistence, filters and style scoping.

### UI fidelity pass 41 — preserve the Modrinth welcome header

- Resolved a CSS precedence conflict where an older hidden-banner rule still took priority over the newer Modrinth welcome-back header.
- Made the new header explicitly visible and extended the regression check to require that override.

### UI fidelity pass 40 — Prism, Official, ATLauncher and Lunar refinements

- Tightened Prism's instance shelf into compact icon tiles and reduced visual noise by revealing secondary card actions on hover or keyboard focus.
- Clarified the official-launcher-inspired workspace with a Java Edition heading, flat installation rows and a distinct green selected state.
- Added ATLauncher's large focused-instance row above compact instance entries, using original CSS artwork rather than copied instance art.
- Refined the Lunar-inspired header and active-instance presentation with its own purple gradient hierarchy.
- Made the main workspace heading follow the selected skin so its visual language no longer inherits one generic page title.
- Added UI regression checks for the unique structures and states.

### UI fidelity pass 39 — launcher-specific home composition

- Reworked GDLauncher-inspired mode around the horizontal app header, featured library banner, wider instance gallery and bottom play strip seen in the current Carbon layout.
- Brought Modrinth-inspired mode closer to its home dashboard pattern by exposing a dedicated “Welcome back” header above the compact library rows, with a green play action.
- Rebuilt TL Legacy-inspired mode around a centered translucent launch selector over an original, softly layered landscape-style background; the actual install/library tools remain available below it.
- Connected the featured banner's Play control to the same existing launcher action as the main Play button.
- Added UI regression coverage for the layout routing, banner visibility, launch-button wiring and the three reference-specific home compositions.
- Kept app logos and third-party icon artwork out of the styling pass. Runtime screenshot comparison in the Tauri window remains the next visual QA step.

### UI fidelity pass 38 — cross-screen skin consistency

- Extended reference-inspired styling beyond the home page to the mods browser, settings, dialogs, profile editor, forms and security panel.
- Added per-skin surfaces, borders, radii, typography and input/button treatment while keeping the same functional controls.
- Hid the classic particles/backdrop for reference-inspired styles and widened secondary pages to avoid the classic layout's narrow content column.

### UI fidelity pass 37 — structural launcher layout pass

- Rebuilt the Prism-inspired desktop workspace around a compact top toolbar, dense instance tiles and a dedicated launch rail.
- Reworked the Modrinth-inspired workspace into a graphite icon rail, green-accented library rows and a persistent bottom launch strip.
- Gave TL Legacy-inspired mode a full-width top navigation bar and a flatter blue-gray workbench with a fixed launch footer.
- Expanded the GDLauncher Carbon-inspired featured-library hierarchy and card density, while keeping existing launch and library actions.
- Reworked the official-launcher-inspired layout into a product rail, featured installation area, compact installation rows and rectangular green play actions.
- Made ATLauncher-inspired mode denser and more utility-focused, with low-radius instance-manager rows and a clearer selected instance.
- Turned Lunar-inspired mode into a wide version gallery with distinct, original CSS-gradient artwork rather than copied launcher images or icons.
- Added regression coverage for each layout's navigation geometry, library structure, unique visual hierarchy and compact-window behavior.
- The layouts reuse End Launcher controls and behavior; live Tauri screenshots and manual visual comparison against current reference builds are still required.

### UI fidelity pass 36 — undo/redo for full customization

- Added Undo and Redo controls to the full customizer, with Ctrl/Cmd+Z, Ctrl/Cmd+Y, and Ctrl/Cmd+Shift+Z shortcuts.
- Groups rapid slider/text edits into a single step, so a continuous adjustment does not flood the history.
- Limits history by both entry count and snapshot size to avoid unbounded memory use when custom themes contain images or GIFs.
- Preserves whether the customizer state was stored at all, so undoing and redoing the reset action restores the correct persistence behavior.
- Keeps native editing shortcuts in text fields and account/first-run dialogs untouched; a storage failure leaves the current appearance intact.
- Added UI regression checks for shortcut safety, bounded history, reset undo, and storage-aware restore.

### UI fidelity pass 35 — selection and navigation polish for AT, Official, and Lunar

- Added distinct selected-instance treatments for ATLauncher-inspired, official-launcher-inspired, and Lunar-inspired layouts so the active build remains obvious without relying on the same generic card background.
- Sharpened each style's toolbar, version/loader chips, navigation active marker, and keyboard focus ring while keeping original app controls and behavior unchanged.
- Added compact-window refinements for horizontally stacked navigation and the cards/toolbar on these three styles.
- Added regression checks for the style-specific selected states and responsive rules.