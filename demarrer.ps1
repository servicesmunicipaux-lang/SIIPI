# =============================================================================
# SIIPI - demarrage complet sur ce poste.
#
#   Clic droit sur ce fichier > "Executer avec PowerShell"
#   ou, dans un terminal ouvert dans ce dossier :  .\demarrer.ps1
#
# Le script s'arrete au premier probleme en expliquant lequel, plutot que de
# poursuivre et de laisser une installation a moitie faite.
# =============================================================================

$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

Write-Host ''
Write-Host '=== SIIPI - Proprete Intercommunale ===' -ForegroundColor Green
Write-Host ''

# --- 1. Docker repond-il ? ---------------------------------------------------
Write-Host '[1/6] Verification de Docker...' -ForegroundColor Cyan
try {
    docker version --format '{{.Server.Version}}' | Out-Null
} catch {
    Write-Host ''
    Write-Host 'Docker ne repond pas.' -ForegroundColor Red
    Write-Host 'Ouvrez Docker Desktop, attendez que l icone de la baleine soit stable,'
    Write-Host 'puis relancez ce script.'
    Write-Host 'Si Docker Desktop n est pas installe :'
    Write-Host '   https://www.docker.com/products/docker-desktop/'
    Read-Host 'Appuyez sur Entree pour fermer'
    exit 1
}
Write-Host '      Docker repond.' -ForegroundColor Green

# --- 2. La base --------------------------------------------------------------
Write-Host '[2/6] Demarrage de PostgreSQL + PostGIS...' -ForegroundColor Cyan
docker compose up -d db
Write-Host '      Attente que la base accepte les connexions (60 s max)...'
$pret = $false
foreach ($i in 1..60) {
    Start-Sleep -Seconds 1
    $etat = docker compose ps db 2>$null | Out-String
    if ($etat -match 'healthy') { $pret = $true; break }
}
if ($pret) {
    Write-Host '      Base prete.' -ForegroundColor Green
} else {
    Write-Host '      La base met du temps a demarrer ; on continue.' -ForegroundColor Yellow
}

# --- 3. Le schema ------------------------------------------------------------
Write-Host '[3/6] Application des 26 migrations...' -ForegroundColor Cyan
docker compose run --rm api npm run migrate

# --- 4. Le referentiel -------------------------------------------------------
Write-Host '[4/6] Import des 350 communes et des comptes de demonstration...' -ForegroundColor Cyan
docker compose run --rm api npm run seed

# --- 5. Le decoupage ---------------------------------------------------------
Write-Host '[5/6] Import des 349 territoires officiels (environ une minute)...' -ForegroundColor Cyan
docker compose run --rm api npm run import:decoupage

# --- 6. La plateforme --------------------------------------------------------
Write-Host ''
Write-Host '[6/6] Demarrage de la plateforme.' -ForegroundColor Cyan
Write-Host ''
Write-Host '   Plateforme      : http://localhost:3000' -ForegroundColor Green
Write-Host '   Contrat d API   : http://localhost:4000/docs'
Write-Host '   Base de donnees : http://localhost:8080'
Write-Host ''
Write-Host '   Comptes de demonstration - mot de passe : Siipi2026!'
Write-Host '     Observatoire national : admin.national@siipi.tn'
Write-Host '     Portail municipal     : directeur.houmtsouk@siipi.tn'
Write-Host '     Espace prestataire    : prestataire.houmtsouk@siipi.tn'
Write-Host '     Application citoyenne : citoyen.demo@siipi.tn'
Write-Host ''
Write-Host '   Laissez cette fenetre ouverte. Ctrl+C pour arreter.' -ForegroundColor Yellow
Write-Host ''
docker compose up
