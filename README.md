# 🐉 End Launcher

[**English**](README.md) · [Русский](README.ru.md)

A dark, End-themed launcher for Minecraft. It installs and launches **Java Edition** (Vanilla, Fabric, Forge, NeoForge), downloads mods from **Modrinth** with automatic version and loader checks, finds or downloads the right **Java** by itself, and has an optional **AI helper** for crash logs.

![status](https://img.shields.io/badge/status-beta-purple) ![license](https://img.shields.io/badge/license-MIT-blue)

<!-- Add a screenshot: put it in assets/screenshot.png and uncomment
![End Launcher](assets/screenshot.png)
-->

> **Unofficial project.** Not approved by or associated with Mojang Studios or Microsoft. "Minecraft" is a trademark of Mojang Studios. The launcher does not distribute game files: they are downloaded from Mojang's servers at runtime. You need your own copy of the game to play on official servers.

## Importing instances

Drag a `.mrpack`, a recognised ZIP export, or a supported launcher instance folder onto the End Launcher window. `.jar` drops continue to import mods into the active instance. Modrinth packs are read via `modrinth.index.json`; the app copies client overrides, downloads listed client files over HTTPS and checks SHA-1 hashes when present. CurseForge ZIP exports often include mod IDs rather than the binaries, so those mods may require separate installation. Prism/MultiMC and XMCL folders are recognised through their instance metadata. The import creates a copy and leaves the source untouched; shared Minecraft assets/libraries/runtime files are installed by End Launcher rather than copied from another launcher.


## Features

- **Java Edition**: client, libraries and assets are downloaded and verified; versions from 1.7 to the latest release.
- **Automatic Java**: uses a matching Java from your system or downloads Mojang's official runtime for the selected version.
- **Loaders**: Vanilla, Fabric, Forge, NeoForge, installed with a single click on *Play*.
- **A full home screen**: your builds and quick stats appear first; popular mods load when their section enters view, and Minecraft patch notes load on demand.
- **Builds (instances)**: every build has its own game version, loader, mods, saves and settings; libraries and assets are shared. The ⋯ menu on a build opens its mods, folder, rename and delete.
- **Mods, resource packs, shaders (Modrinth)**: results appear immediately (most popular first) and update as you type; one-click install, required dependencies (e.g. Fabric API) and a compatibility check by game version and loader. A built-in browser opens any site (Modrinth, CurseForge, …) and saves downloaded `.jar` files straight into the selected build's `mods` folder; files from Modrinth get the same compatibility check. Prefer your own browser? Download a mod anywhere and drag the `.jar` into the launcher window: it goes to the selected build's `mods` folder and is checked the same way.
- **Mod manager**: enable, disable, delete and update installed mods.
- **Three ways to sign in**: offline nickname, Microsoft, Ely.by (with skins and Ely.by servers).
- **Play together (P2P)**: a friend joins your world directly, without port forwarding. It is a Minecraft-only tunnel (not a virtual LAN like Hamachi or Radmin).
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

Download the installer for your system from the [Releases](https://github.com/Noyclic/End_Launcher/releases) page. The builds are not code-signed, so Windows SmartScreen may show a warning.

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

## Play together (P2P)

The 🌐 icon in the top-right corner lets one player open a room; the friend pastes the code, and joins in-game via `localhost:<port>`. Both need the same game version.

- The host opens the world "to LAN" (or starts a server); the launcher finds the port in the game log by itself and warns if nothing is listening there.
- One **universal code** makes the friend's launcher try three methods in turn: direct TCP through UPnP (no servers involved), then the iroh ticket (relay + direct addresses, no DNS needed: for networks that block iroh's DNS), then the iroh Node ID (looked up through iroh's public DNS). The separate forms are also shown, and the 📨 button copies a ready invitation with instructions.
- A room code is an access key and the ticket also contains your IP addresses: only share them with friends. Guests can only reach the game port you chose.
- Traffic goes directly between the players when possible and through iroh's public relay servers otherwise. Closing the launcher closes the room and removes the router port mapping.
- P2P is built in by default; build with `--no-default-features` to leave it out.

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

## Troubleshooting

**Linux**
- `.deb` (Debian, Ubuntu, Mint) is the most reliable package. `.AppImage` needs FUSE 2 (`sudo apt install libfuse2`; on Ubuntu 24.04 `libfuse2t64`) and was built on Ubuntu 22.04, so on very new or very old distros prefer `.deb`/`.rpm`.
- Needs WebKitGTK 4.1 (`libwebkit2gtk-4.1-0`). Emoji (the pet and the island) need a colour emoji font: `sudo apt install fonts-noto-color-emoji`. The `.deb` pulls these in for you.
- Blank window or EGL errors on NVIDIA / Wayland: the launcher already turns off WebKit's DMABUF renderer. If you ever need the old behaviour, start it with `END_LAUNCHER_GPU=1`.
- Minecraft itself needs OpenAL (`libopenal1`) for sound and working OpenGL drivers. On Linux ARM there is no official Mojang Java runtime: install Java yourself (Settings → Advanced → path to Java).
- Sandboxed packages (Flatpak/Snap) may hide your Java or block `xdg-open`.

**macOS**
- The app is not notarised. If macOS says it is damaged or from an unidentified developer: right-click → Open, or run `xattr -dr com.apple.quarantine "/Applications/End Launcher.app"`.

**Windows**
- SmartScreen may warn because the build is unsigned: *More info → Run anyway*.

**Slow on an old PC?** Settings → Interface → turn off "Animations" (stops the island, the pet and the background particles).

**Anything else**: Settings → Diagnostics → "Copy info for a bug report" and paste it into a [GitHub issue](https://github.com/Noyclic/End_Launcher/issues). If the launcher crashed, attach `crash.log` from the settings folder.


## End Shield: release authenticity

End Shield can verify the Ed25519 signature of the release manifest published with a GitHub release. The manifest lists release assets and their SHA-256 hashes. A valid signature confirms that the manifest was signed by the holder of the project's private signing key.

**Scope:** this version verifies the manifest signature only. It does not scan your computer for malware and does not yet compare every installed launcher file with the manifest. A valid signature is not a guarantee that software is malware-free.

For privacy details, see [Privacy Policy](PRIVACY.md).

## Contributing

Issues and pull requests are welcome. For launch problems please attach `game/logs/launcher-latest.log` from your `<config>` folder.

## License

MIT, see [LICENSE](LICENSE).


