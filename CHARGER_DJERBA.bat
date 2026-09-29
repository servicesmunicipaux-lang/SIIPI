@echo off
setlocal enabledelayedexpansion
REM ===========================================================================
REM  SIIPI - charge les donnees reelles de Djerba (Houmt Souk, Midoun, Ajim)
REM  depuis le dossier de la mission GPS de la FNCT.
REM
REM  Usage : glisser le dossier de la mission sur ce fichier, ou le lancer et
REM  coller le chemin du dossier quand il est demande. Le dossier doit contenir
REM  Mission_FNCT.xlsx, GPX_FILES\ et le fichier GPSWpts-...kml.
REM
REM  Le dossier n'est jamais copie dans le depot : il contient les noms des
REM  chauffeurs. Il est depose dans le conteneur de l'API, le temps du
REM  chargement, puis retire.
REM
REM  La pile doit tourner (DEMARRER). Peut se relancer : rien n'est duplique,
REM  et les arrets deja en place ne sont pas ecrases. Journal : djerba.txt
REM ===========================================================================
cd /d "%~dp0"
set LOG=djerba.txt

set "DOSSIER=%~1"
if "%DOSSIER%"=="" set /p "DOSSIER=Chemin du dossier de la mission : "
set "DOSSIER=%DOSSIER:"=%"
if not exist "%DOSSIER%\Mission_FNCT.xlsx" (
  echo   Mission_FNCT.xlsx introuvable dans "%DOSSIER%".
  goto fin
)

echo ===== SIIPI - donnees de Djerba ===== > %LOG%
date /t >> %LOG% 2>&1
time /t >> %LOG% 2>&1

set DC=docker compose
docker compose version > nul 2>&1
if errorlevel 1 set DC=docker-compose

echo.
echo   Depot du dossier dans le conteneur de l'API...
!DC! exec -T api sh -c "rm -rf /tmp/djerba && mkdir -p /tmp/djerba" >> %LOG% 2>&1
if errorlevel 1 ( echo   ECHEC : la pile tourne-t-elle ? Voir djerba.txt & goto fin )
!DC! cp "%DOSSIER%\Mission_FNCT.xlsx" api:/tmp/djerba/ >> %LOG% 2>&1
!DC! cp "%DOSSIER%\GPX_FILES" api:/tmp/djerba/ >> %LOG% 2>&1
for %%F in ("%DOSSIER%\GPSWpts*.kml") do !DC! cp "%%F" api:/tmp/djerba/ >> %LOG% 2>&1

echo   Chargement...
echo. >> %LOG%
!DC! exec -T api sh -c "DJERBA_DIR=/tmp/djerba npm run -s seed:djerba" >> %LOG% 2>&1
set ECHEC=!errorlevel!
!DC! exec -T api sh -c "rm -rf /tmp/djerba" >> %LOG% 2>&1
if not "!ECHEC!"=="0" ( echo   ECHEC. Voir djerba.txt & goto fin )

echo.
echo   Donnees de Djerba chargees.
echo.
echo   Portail municipal : http://localhost:3000
echo     directeur.houmtsouk@siipi.tn  directeur.midoun@siipi.tn  directeur.ajim@siipi.tn
echo.

:fin
echo   Journal : djerba.txt
echo.
pause
