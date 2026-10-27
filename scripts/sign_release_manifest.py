#!/usr/bin/env python3
"""Create a SHA-256 manifest and Ed25519 signature for release assets.
Requires cryptography. The private key must be supplied via END_SHIELD_PRIVATE_KEY_PEM.
"""
import base64, hashlib, json, os, pathlib, sys
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

folder = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "release-assets")
raw_key = os.environ.get("END_SHIELD_PRIVATE_KEY_PEM")
if not raw_key:
    raise SystemExit("Missing END_SHIELD_PRIVATE_KEY_PEM secret; not signing anything.")
key = serialization.load_pem_private_key(raw_key.replace('\\n', '\n').encode(), password=None)
if not isinstance(key, Ed25519PrivateKey):
    raise SystemExit("END_SHIELD_PRIVATE_KEY_PEM must be an Ed25519 private key.")
assets = []
for path in sorted(folder.iterdir()):
    if not path.is_file() or path.name in {"end-shield-manifest.json", "end-shield-manifest.sig"}:
        continue
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    assets.append({"name": path.name, "size": path.stat().st_size, "sha256": h.hexdigest()})
if not assets:
    raise SystemExit("No release assets found; refusing to sign an empty manifest.")
manifest = json.dumps({"schema": 1, "project": "Noyclic/End_Launcher", "assets": assets}, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()
(folder / "end-shield-manifest.json").write_bytes(manifest)
sig = key.sign(manifest)
(folder / "end-shield-manifest.sig").write_text(base64.b64encode(sig).decode() + "\n", encoding="ascii")
print(f"Signed manifest for {len(assets)} release assets.")
