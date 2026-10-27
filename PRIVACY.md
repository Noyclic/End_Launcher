# Privacy Policy

End Launcher is a local desktop application. It has **no servers of its own, no analytics and no telemetry**.

## What is stored on your device

In `<config>/config.json` (`%APPDATA%/end-launcher` on Windows, `~/.config/end-launcher` on Linux):

- launcher settings (theme, nickname, memory, selected account type);
- sign-in tokens for Microsoft / Ely.by, if you sign in. On Windows and macOS they are placed in the OS credential store when possible; otherwise (Linux, or if the store refuses) they stay in this file only lightly obfuscated, **not** strongly encrypted, so treat the file as sensitive;
- an optional Groq API key, if you enter one.

Passwords are never stored.

## What is sent over the network, and to whom

| When | To | What |
|---|---|---|
| Installing / launching the game | Mojang (`piston-meta`, `piston-data`, `libraries`, `resources`, `launchermeta`) | requests for game files and Java runtimes |
| Fabric / Forge / NeoForge | `meta.fabricmc.net`, `maven.minecraftforge.net`, `files.minecraftforge.net`, `maven.neoforged.net` | requests for loader files |
| Mods | `api.modrinth.com`, `cdn.modrinth.com` | searches and downloads |
| Built-in browser | any website you open in it | normal web requests, like any browser: those sites see your IP address and may store cookies in the app's local data; the launcher sends nothing of its own, and the sites get no access to launcher functions. Downloaded `.jar` files are looked up on Modrinth by SHA-1 hash |
| Microsoft sign-in | Microsoft (`login.microsoftonline.com`), Xbox Live, Minecraft Services | the sign-in flow; the launcher only receives tokens |
| Ely.by sign-in | `authserver.ely.by` | your login and password (sent once to sign in, not stored) |
| Ely.by skins | `authlib-injector.yushi.moe` (download of authlib-injector) | file download |
| Mod updates / launcher update notice | `api.modrinth.com` (SHA-1 hashes of your mod files), `api.github.com` (latest release of this project) | hashes and release metadata requests |
| P2P (only if you use it) | the iroh project's public discovery and relay servers, and the other player | your endpoint ID and connection metadata (relays see your IP address); game traffic is end-to-end encrypted between the two players. A room ticket you share contains your IP addresses, so the player who receives it learns them |
| Home page news | `launchercontent.mojang.com` (patch notes feed and its images) | feed requests |
| P2P direct TCP (only while a room is open) | your router (UPnP) and the friend | the launcher asks your router via UPnP to open a TCP port while the room is open; on Windows the firewall may ask for permission. The friend learns your public IP address from the code |
| Local AI download (only when you press the button) | `api.github.com` / `github.com` (llama.cpp release), `huggingface.co` (models) | file downloads |
| AI "Ender Brain" (only if you use it) | Groq (`api.groq.com`) | the text you submit (e.g. a crash log) |

Local AI modes run entirely on your computer.

The developer receives none of this data. Third-party services apply their own privacy policies.

## The pet

If you load your own picture or GIF for the pet, it is stored only in the app's local storage on your computer and is never uploaded anywhere.

## Contact

Open an issue in the project repository.
