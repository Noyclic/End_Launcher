# Changelog

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
