@echo off
setlocal enabledelayedexpansion
REM ===========================================================================
REM  SIIPI - campagne complete de tests.
REM
REM  Lance npm test : le contrat d'API, puis TOUTES les campagnes inscrites
REM  dans backend/package.json. Leur liste n'est pas recopiee ici : une liste
REM  recopiee se perime (celle-ci en comptait douze quand il y en avait 33).
REM
REM  Le conteneur de l'API tourne sous Alpine, qui n'embarque ni bash ni psql.
REM  Le lanceur tests/executer.sh les installe au premier passage : la
REM  premiere execution est donc un peu plus longue.
REM
REM  Resultat complet dans tests.txt.
REM ===========================================================================
cd /d "%~dp0"
set LOG=tests.txt

echo ===== SIIPI - campagne de tests ===== > %LOG%
date /t >> %LOG% 2>&1
time /t >> %LOG% 2>&1

set DC=docker compose
docker compose version > nul 2>&1
if errorlevel 1 set DC=docker-compose

echo.
echo ===== SIIPI - campagne complete de tests =====
echo.
echo   Comptez quelques minutes. Chaque campagne s'ecrit dans tests.txt
echo   au fur et a mesure.
echo.

echo. >> %LOG%
echo --- npm test --- >> %LOG%
!DC! exec -T api npm test >> %LOG% 2>&1
set RESULTAT=%errorlevel%

echo.
if "%RESULTAT%"=="0" (
  echo   Toutes les campagnes sont passees.
) else (
  echo   Au moins une campagne a echoue. Cherchez la croix rouge dans tests.txt
)
echo.
echo   Detail : tests.txt
echo.
pause
