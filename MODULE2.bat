@echo off
setlocal enabledelayedexpansion
REM ===========================================================================
REM  SIIPI - Module 2 : gestion des circuits.
REM
REM  Applique les migrations 028 et 029, installe la dependance de lecture
REM  KML, charge le registre communal de Dar Chaabane El Fehri (13 circuits :
REM  8 de levee, 5 de balayage) et redemarre l'API et le front.
REM
REM  Les donnees existantes sont conservees. Journal : module2.txt
REM ===========================================================================
cd /d "%~dp0"
set LOG=module2.txt

echo ===== SIIPI - Module 2 ===== > %LOG%
date /t >> %LOG% 2>&1
time /t >> %LOG% 2>&1

set DC=docker compose
docker compose version > nul 2>&1
if errorlevel 1 set DC=docker-compose

echo.
echo ===== SIIPI - Module 2 : gestion des circuits =====
echo.

echo [1/5] Installation de la dependance de lecture KML...
echo. >> %LOG%
echo --- npm install api --- >> %LOG%
!DC! run --rm api npm install --no-audit --no-fund >> %LOG% 2>&1
if errorlevel 1 ( echo   ECHEC. Voir module2.txt & goto fin )
!DC! run --rm web npm install --no-audit --no-fund >> %LOG% 2>&1
echo       Dependances a jour.

echo [2/5] Application des migrations 028 et 029...
echo. >> %LOG%
echo --- migrate --- >> %LOG%
!DC! run --rm api npm run migrate >> %LOG% 2>&1
if errorlevel 1 (
  echo   ECHEC. Rien n'a ete modifie : une migration qui echoue est annulee
  echo   en entier. Voir module2.txt
  goto fin
)
echo       Base a jour.

echo [3/5] Chargement du registre communal de Dar Chaabane El Fehri...
echo. >> %LOG%
echo --- seed dar chaabane --- >> %LOG%
!DC! run --rm api npm run seed:dar-chaabane >> %LOG% 2>&1
if errorlevel 1 ( echo   ECHEC du chargement. Voir module2.txt & goto fin )
echo       13 circuits charges.

echo [4/5] Redemarrage de l'API et du front...
echo. >> %LOG%
!DC! up -d --force-recreate api web >> %LOG% 2>&1
if errorlevel 1 ( echo   ECHEC au redemarrage. Voir module2.txt & goto fin )
timeout /t 18 /nobreak > nul

echo [5/5] Campagne de tests du module 2...
echo. >> %LOG%
echo --- test:module2 --- >> %LOG%
REM  Le conteneur de l'API tourne sous Alpine : ni bash, ni psql, ni les
REM  outils GNU. Le lanceur tests/executer.sh les installe au besoin et deduit
REM  la connexion a la base depuis DATABASE_URL.
!DC! exec -T api npm run test:module2 >> %LOG% 2>&1

echo. >> %LOG%
echo --- circuits charges --- >> %LOG%
!DC! exec -T db psql -U siipi_admin -d siipi_national -c "SELECT code, nom, mode_collecte, voyages_par_jour, longueur_declaree_km, taille_equipe FROM circuits WHERE code LIKE 'LEVEE-%%' OR code LIKE 'BALAYAGE-%%' ORDER BY code;" >> %LOG% 2>&1
echo. >> %LOG%
echo --- journaux api --- >> %LOG%
!DC! logs --tail 25 api >> %LOG% 2>&1

echo.
echo   Termine. Rechargez http://localhost:3000 (Ctrl+F5), onglet Circuits.
echo.

:fin
echo   Journal : module2.txt
echo.
pause
