@echo off
setlocal enabledelayedexpansion
REM ===========================================================================
REM  SIIPI - relance le front-end apres une correction de configuration.
REM
REM  Ne touche ni a la base ni aux donnees : seul le conteneur du front est
REM  recree, pour qu'il reprenne sa nouvelle configuration.
REM
REM  Le journal va dans relance.txt, a cote.
REM ===========================================================================
cd /d "%~dp0"
set LOG=relance.txt

echo ===== SIIPI - relance du front ===== > %LOG%
date /t >> %LOG% 2>&1
time /t >> %LOG% 2>&1

set DC=docker compose
docker compose version > nul 2>&1
if errorlevel 1 set DC=docker-compose

echo.
echo Recreation du conteneur du front...
echo. >> %LOG%
echo --- up -d --force-recreate web --- >> %LOG%
!DC! up -d --force-recreate web >> %LOG% 2>&1
if errorlevel 1 (
  echo   ECHEC. Voir relance.txt
  goto fin
)

echo Attente du demarrage du serveur de developpement...
timeout /t 12 /nobreak > nul

echo. >> %LOG%
echo --- etat --- >> %LOG%
!DC! ps >> %LOG% 2>&1
echo. >> %LOG%
echo --- journaux web --- >> %LOG%
!DC! logs --tail 40 web >> %LOG% 2>&1
echo. >> %LOG%
echo --- journaux api --- >> %LOG%
!DC! logs --tail 20 api >> %LOG% 2>&1

echo.
echo   Termine. La plateforme repond sur http://localhost:3000
echo.

:fin
echo   Journal : relance.txt
echo.
pause
