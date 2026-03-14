import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path


if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")


LEGISLATURE = "17"
DATA_DIR = Path("public/data/deputes_actifs")
OUT_DIR = Path("public/data/deputes_photos")
MANIFEST_PATH = OUT_DIR / "manifest.json"
PHOTO_URL = f"https://www2.assemblee-nationale.fr/static/tribun/{LEGISLATURE}/photos/{{matricule}}.jpg"


def load_active_deputes() -> list[dict]:
    latest = json.loads((DATA_DIR / "latest.json").read_text(encoding="utf-8"))
    version = latest["version"]
    return json.loads((DATA_DIR / f"{version}.json").read_text(encoding="utf-8"))


def build_request(url: str) -> urllib.request.Request:
    return urllib.request.Request(
        url,
        headers={
            "Accept": "image/jpeg,image/*;q=0.8,*/*;q=0.5",
            "User-Agent": "deputeGPT-photo-sync/1.0 (+https://github.com/wald52/deputeGPT)",
        },
    )


def download_photo(matricule: str, force: bool = False) -> tuple[str, str]:
    destination = OUT_DIR / f"{matricule}.jpg"

    if not force and destination.exists() and destination.stat().st_size > 0:
        return ("cached", matricule)

    try:
        with urllib.request.urlopen(build_request(PHOTO_URL.format(matricule=matricule)), timeout=30) as response:
            content_type = response.headers.get("Content-Type", "")
            payload = response.read()

        if content_type and not content_type.startswith("image/"):
            return ("error", f"{matricule}: contenu inattendu ({content_type})")
        if not payload:
            return ("error", f"{matricule}: fichier vide")

        tmp_path = destination.with_name(destination.name + ".tmp")
        with open(tmp_path, "wb") as tmp_file:
            tmp_file.write(payload)
        os.replace(tmp_path, destination)
        return ("downloaded", matricule)
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            return ("missing", matricule)
        return ("error", f"{matricule}: HTTP {exc.code}")
    except Exception as exc:
        return ("error", f"{matricule}: {exc}")


def write_manifest(total: int, counts: dict[str, int], missing: list[str], errors: list[str]) -> None:
    manifest = {
        "legislature": LEGISLATURE,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "total_deputes": total,
        "downloaded": counts["downloaded"],
        "cached": counts["cached"],
        "missing": missing,
        "errors": errors,
    }
    MANIFEST_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Synchronise localement les portraits des députés actifs.")
    parser.add_argument("--force", action="store_true", help="Retélécharge même les images déjà présentes.")
    parser.add_argument(
        "--workers",
        type=int,
        default=8,
        help="Nombre de téléchargements parallèles (défaut: 8).",
    )
    args = parser.parse_args()

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    deputes = load_active_deputes()
    matricules = sorted(
        {
            str(depute.get("id", "")).replace("PA", "", 1).strip()
            for depute in deputes
            if depute.get("id")
        }
    )
    matricules = [matricule for matricule in matricules if matricule]

    counts = {"downloaded": 0, "cached": 0, "missing": 0, "error": 0}
    missing: list[str] = []
    errors: list[str] = []

    print(f"Synchronisation des portraits pour {len(matricules)} députés actifs...")
    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as executor:
        futures = {
            executor.submit(download_photo, matricule, args.force): matricule for matricule in matricules
        }
        for future in as_completed(futures):
            status, payload = future.result()
            counts[status] += 1
            if status == "missing":
                missing.append(payload)
                print(f"Photo absente : {payload}")
            elif status == "error":
                errors.append(payload)
                print(f"Erreur : {payload}")

    missing.sort()
    errors.sort()
    write_manifest(len(matricules), counts, missing, errors)

    print(
        "Terminé.",
        f"Téléchargées: {counts['downloaded']}",
        f"Déjà présentes: {counts['cached']}",
        f"Absentes: {counts['missing']}",
        f"Erreurs: {counts['error']}",
    )
    return 0 if counts["error"] == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
