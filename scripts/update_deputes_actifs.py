import json, hashlib, os, sys, urllib.request
from datetime import datetime, timezone
from urllib.parse import urlencode

RESOURCE_ID = "092bd7bb-1543-405b-b53c-932ebb49bb8e"
BASE = f"https://tabular-api.data.gouv.fr/api/resources/{RESOURCE_ID}/data/"
OUT_DIR = "public/data/deputes_actifs"

def fetch_json(url: str) -> dict:
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))

def canonical_bytes(rows) -> bytes:
    # JSON canonique (stable) pour un hash stable
    return json.dumps(rows, ensure_ascii=False, separators=(",", ":"), sort_keys=True).encode("utf-8")

def read_latest_sha256(latest_path: str) -> str | None:
    if not os.path.exists(latest_path):
        return None
    try:
        with open(latest_path, "r", encoding="utf-8") as f:
            return json.load(f).get("sha256")
    except Exception:
        return None

def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    latest_path = os.path.join(OUT_DIR, "latest.json")

    # 1) Récupération paginée
    page, page_size = 1, 1000
    all_rows = []
    while True:
        url = BASE + "?" + urlencode({"page": page, "page_size": page_size})
        payload = fetch_json(url)
        all_rows.extend(payload.get("data", []))
        nxt = (payload.get("links") or {}).get("next")
        if not nxt:
            break
        page += 1

    # 2) Hash + comparaison avec latest
    blob = canonical_bytes(all_rows)
    sha256 = hashlib.sha256(blob).hexdigest()
    prev_sha256 = read_latest_sha256(latest_path)

    if prev_sha256 == sha256:
        print("No change detected (sha256 identical).")
        return 0

    # 3) Écriture d'une nouvelle version + bascule latest
    version = "v" + datetime.now(timezone.utc).strftime("%Y-%m-%d")
    out_path = os.path.join(OUT_DIR, f"{version}.json")

    tmp = out_path + ".tmp"
    with open(tmp, "wb") as f:
        f.write(blob)
    os.replace(tmp, out_path)

    tmp_latest = latest_path + ".tmp"
    with open(tmp_latest, "w", encoding="utf-8") as f:
        json.dump(
            {"version": version, "generated_at": datetime.now(timezone.utc).isoformat(), "sha256": sha256},
            f,
            ensure_ascii=False,
            separators=(",", ":"),
        )
    os.replace(tmp_latest, latest_path)

    print(f"Updated: {out_path} rows={len(all_rows)} sha256={sha256}")
    return 0

if __name__ == "__main__":
    sys.exit(main())
