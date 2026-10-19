# 🐉 End Launcher

[**English**](README.md) · [Русский](README.ru.md)

A dark, End-themed launcher for Minecraft. It installs and launches **Java Edition** (Vanilla, Fabric, Forge, NeoForge), downloads mods from **Modrinth** with automatic version and loader checks, finds or downloads the right **Java** by itself, and has an optional **AI helper** for crash logs.

![status](https://img.shields.io/badge/status-beta-purple) ![license](https://img.shields.io/badge/license-MIT-blue)

<!-- Add a screenshot: put it in assets/screenshot.png and uncomment
![End Launcher](assets/screenshot.png)
-->

> **Unofficial project.** Not approved by or associated with Mojang Studios or Microsoft. "Minecraft" is a trademark of Mojang Studios. The launcher does not distribute game files: they are downloaded from Mojang's servers at runtime. You need your own copy of the game to play on official servers.

## Features

- **Java Edition**: client, libraries and assets are downloaded and verified; versions from 1.7 to the latest release.
- **Automatic Java**: uses a matching Java from your system or downloads Mojang's official runtime for the selected version.
- **Loaders**: Vanilla, Fabric, Forge, NeoForge, installed with a single click on *Play*.
- **A full home screen**: your builds, quick stats, popular mods for the selected build (loaded immediately) and Minecraft patch notes.
- **Builds (instances)**: every build has its own game version, loader, mods, saves and settings; libraries and assets are shared. The ⋯ menu on a build opens its mods, folder, rename and delete.
- **Mods, resource packs, shaders (Modrinth)**: results appear immediately (most popular first) and update as you type; one-click install, required dependencies (e.g. Fabric API) and a compatibility check by game version and loader. A built-in browser opens any site (Modrinth, CurseForge, …) and saves downloaded `.jar` files straight into the selected build's `mods` folder; files from Modrinth get the same compatibility check. Prefer your own browser? Download a mod anywhere and drag the `.jar` into the launcher window: it goes to the selected build's `mods` folder and is checked the same way.
- **Mod manager**: enable, disable, delete and update installed mods.
- **Three ways to sign in**: offline nickname, Microsoft, Ely.by (with skins and Ely.by servers).
- **Play together (P2P, experimental)**: a friend joins your world directly, without port forwarding. It is a Minecraft-only tunnel (not a virtual LAN like Hamachi or Radmin). Disabled in regular builds; see *Experimental P2P* below.
- **Bedrock Edition** launch (Windows, if installed).
- **AI helper (optional)**: explains crash logs locally or through the cloud with your own key; local components are downloaded only when you press a button. It can be switched off completely for weak PCs.
- **My Island**: a slowly rotating floating island made of blocks on the home screen. Build your own house (11 block types, a ready-made cottage button), and watch a cat and a dog run around and jump up the blocks. It saves automatically.
- **A pet** (cat, dog, fox, rabbit, turtle, or your own picture/GIF) walks along the bottom of the window, reacts to clicks and can be dragged. It only uses GPU-friendly animation and stands still when animations are turned off.
- **Nicer pickers**: dropdowns and switches are drawn in the theme's colours instead of the system's white lists; long lists (game versions) have a search box.
- **Smooth, light UI**: a side menu that slides out on hover (can be turned off), page and card animations that use only GPU-friendly properties, and a switch that disables all animations and background effects for weak PCs.
- **Customisation**: 4 End-style themes plus a custom colour palette, and switchable interface layouts (the original *End* layout or ones inspired by Modrinth App, Prism Launcher and TL Legacy; no code or artwork from those projects is used and this project is not affiliated with them).
- **Advanced**: memory limit, custom JVM arguments, your own Java.
- **Update notice**: a banner appears when a newer release is published here.

## Install

Download the installer for your system from the [Releases](https://github.com/Noyclic/end-launcher/releases) page. The builds are not code-signed, so Windows SmartScreen may show a warning.

## Signing in

| Method | Needs |
|---|---|
| Offline | nothing (nickname only; works on offline-mode servers) |
| Ely.by | a free [Ely.by](https://ely.by) account |
| Microsoft | a build that includes a Mojang-approved app ID (see below) |

Your password is never stored. Sign-in tokens and the optional Groq key go to the OS credential store (Windows Credential Manager, macOS Keychain) when available; otherwise (Linux, or if the store refuses) they are kept in the settings file, only lightly obfuscated. Details: [PRIVACY.md](PRIVACY.md).

## AI helper (optional)

- **Local** (Micro / Advanced): on the AI page press the download buttons (engine: [llama.cpp](https://github.com/ggml-org/llama.cpp), Windows only; models from Hugging Face (unsloth / bartowski, with fallback links)), or put `llama-cli` into `<config>/ai/bin` and a GGUF model into `<config>/ai/models` yourself. The model is loaded only while it answers.
- **Cloud** ("Ender Brain"): paste a free [Groq](https://console.groq.com) API key in Settings. Only the text you submit is sent.
- Settings → *AI helper* turns the whole feature off.

`<config>` is `%APPDATA%/end-launcher` on Windows and `~/.config/end-launcher` on Linux.

## Experimental P2P

The 🌐 icon in the top-right corner lets one player open a room and share a room code; the friend pastes it and joins in-game via `localhost:<port>`. Both need the same game version. The host gets a *universal code* that makes the friend's launcher try three connection methods in turn (direct TCP through UPnP, then the iroh ticket, then the iroh Node ID), plus the separate forms. The separate forms are: a short code (Node ID, found through iroh's public DNS: for the US/EU) and a long ticket (Node ID plus relay and direct IP addresses: no iroh DNS needed, for networks where it is blocked and for strict NATs). Both are access keys and the ticket also contains your IP addresses, so only share them with friends. Traffic goes directly between the players when possible and through public relay servers of the [iroh](https://iroh.computer) project otherwise. The feature is compiled in only with a flag, because it is still being tested:

```bash
npm run dev -- --features p2p
```

## Build from source

Requires [Node.js](https://nodejs.org) 20+, [Rust](https://rustup.rs) and the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).

```bash
npm install
npm run dev      # development
npm run build    # installers in src-tauri/target/release/bundle
```

The interface is plain HTML/CSS/JS in `src/`; everything else (installing, launching, mods, sign-in) is Rust in `src-tauri/src/`.

### Configuring your own build

- **Update notice**: set `GITHUB_REPO` in `src-tauri/src/update.rs` to `your-name/your-repo`.
- **Microsoft sign-in**: register an app in the Azure portal (Microsoft Entra ID → App registrations → *Personal Microsoft accounts only*, enable *Allow public client flows*), ask Mojang to approve it at <https://aka.ms/mce-reviewappid>, then enter its Client ID in Settings → Account or hard-code it in `src-tauri/src/auth.rs`. Until it is approved, Microsoft sign-in fails with "Invalid app registration"; offline and Ely.by keep working.

## Contributing

Issues and pull requests are welcome. For launch problems please attach `game/logs/launcher-latest.log` from your `<config>` folder.

## License

MIT, see [LICENSE](LICENSE).
