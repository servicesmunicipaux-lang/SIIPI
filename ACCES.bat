@echo off
setlocal enabledelayedexpansion
REM ===========================================================================
REM  SIIPI - comptes et acces (migration 030).
REM
REM  Ce que cela change :
REM    - l'administrateur national ouvre le portail de N'IMPORTE quelle commune
REM      depuis son propre compte, sans qu'on cree un compte par commune ;
REM    - chaque commune ouvre et ferme elle-meme les comptes de ses agents,
REM      avec de vraies adresses electroniques ;
REM    - un mot de passe fixe par un tiers doit etre remplace a la premiere
REM      connexion ;
REM    - une faille est refermee : la politique d'ecriture sur les comptes
REM      verifiait la commune mais pas le ROLE, si bien qu'un agent communal
REM      pouvait s'ouvrir un compte NATIONAL et lire les 350 communes.
REM
REM  Journal : acces.txt
REM ===========================================================================
cd /d "%~dp0"
set LOG=acces.txt

echo ===== SIIPI - comptes et acces ===== > %LOG%
date /t >> %LOG% 2>&1
time /t >> %LOG% 2>&1

set DC=docker compose
docker compose version > nul 2>&1
if errorlevel 1 set DC=docker-compose

echo.
echo ===== SIIPI - comptes et acces =====
echo.

echo [1/3] Application de la migration 030...
echo. >> %LOG%
!DC! run --rm api npm run migrate >> %LOG% 2>&1
if errorlevel 1 (
  echo   ECHEC. Rien n'a ete modifie. Voir acces.txt
  goto fin
)
echo       Base a jour.

echo [2/3] Redemarrage de l'API et du front...
!DC! up -d --force-recreate api web >> %LOG% 2>&1
if errorlevel 1 ( echo   ECHEC au redemarrage. Voir acces.txt & goto fin )
timeout /t 18 /nobreak > nul

echo [3/3] Campagne de tests des acces...
echo. >> %LOG%
echo --- test:comptes --- >> %LOG%
!DC! exec -T api npm run test:comptes >> %LOG% 2>&1

echo. >> %LOG%
echo --- la faille est-elle refermee ? --- >> %LOG%
!DC! exec -T db psql -U siipi_admin -d siipi_national -c "SELECT tgname, tgenabled FROM pg_trigger WHERE tgname = 'trg_controler_attribution_role';" >> %LOG% 2>&1
echo. >> %LOG%
echo --- comptes existants --- >> %LOG%
!DC! exec -T db psql -U siipi_admin -d siipi_national -c "SELECT email, role, commune_id, mot_de_passe_provisoire FROM users WHERE deleted_at IS NULL ORDER BY role, email;" >> %LOG% 2>&1

echo.
echo   Termine. Rechargez http://localhost:3000 (Ctrl+F5).
echo.
echo   Connectez-vous avec admin.national@siipi.tn :
echo     un selecteur "Observatoire national / Portail municipal" apparait,
echo     puis vous choisissez la commune a ouvrir.
echo.
echo   L'onglet "Comptes" du portail municipal vous permet d'ouvrir les
echo   acces de vos agents avec leurs vraies adresses.
echo.

:fin
echo   Journal : acces.txt
echo.
pause
