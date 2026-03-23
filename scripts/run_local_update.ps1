# run_local_update.ps1
# Script PowerShell pour simuler le workflow GitHub Actions en local

$ErrorActionPreference = "Stop"

function Write-Step {
    param($Message)
    Write-Host ""
    Write-Host "==========================================" -ForegroundColor Cyan
    Write-Host $Message -ForegroundColor Cyan
    Write-Host "==========================================" -ForegroundColor Cyan
}

Write-Step "1. Installation des dépendances Python"
pip install requests beautifulsoup4 FlagEmbedding numpy sentence-transformers

Write-Step "2. Mise à jour des députés"
python scripts/update_deputes_actifs.py

Write-Step "3. Synchronisation des photos des députés"
python scripts/sync_depute_photos.py

Write-Step "4. Téléchargement des votes (Scrutins.json.zip)"
if (-not (Test-Path "Scrutins")) {
    New-Item -ItemType Directory -Path "Scrutins" | Out-Null
}

$zipUrl = "https://data.assemblee-nationale.fr/static/openData/repository/17/loi/scrutins/Scrutins.json.zip"
$zipPath = "Scrutins.json.zip"

Write-Host "Téléchargement de $zipUrl..."
Invoke-WebRequest -Uri $zipUrl -OutFile $zipPath

Write-Host "Extraction..."
Expand-Archive -Path $zipPath -DestinationPath "Scrutins" -Force

Write-Step "5. Traitement des votes"
python scripts/process_votes.py

Write-Step "6. Mise à jour de l'hémicycle (SVG + Places)"
python scripts/update_hemicycle_svg.py
python scripts/scrap_places.py

Write-Step "7. Mise à jour des couleurs des groupes"
python scripts/update_group_colors.py

Write-Step "8. Génération des artefacts sémantiques (single-vector + multi-vector)"
python scripts/generate_semantic_index.py

Write-Step "9. Nettoyage et Fin"
if (Test-Path $zipPath) {
    Remove-Item $zipPath
}

Write-Host ""
Write-Host "✅ Mise à jour locale terminée avec succès !" -ForegroundColor Green
Write-Host "Les données sont fraîches dans ./public/data/"
