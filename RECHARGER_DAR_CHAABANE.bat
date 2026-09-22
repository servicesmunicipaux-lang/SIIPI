@echo off
setlocal enabledelayedexpansion
REM ===========================================================================
REM  SIIPI - recharge le registre de Dar Chaabane El Fehri.
REM
REM  Deux corrections par rapport au premier passage :
REM    - creation des comptes d'acces au portail municipal (sans eux, les
REM      circuits sont en base mais personne ne peut les ouvrir) ;
REM    - la mise a jour d'un circuit deja present fonctionne, alors qu'elle
REM      echouait au second passage.
REM
REM  Peut se relancer autant de fois que necessaire. Journal : dar-chaabane.txt
REM ===========================================================================
cd /d "%~dp0"
set LOG=dar-chaabane.txt

echo ===== SIIPI - registre Dar Chaabane ===== > %LOG%
date /t >> %LOG% 2>&1
time /t >> %LOG% 2>&1

set DC=docker compose
docker compose version > nul 2>&1
if errorlevel 1 set DC=docker-compose

echo.
echo   Rechargement du registre communal...
echo. >> %LOG%
!DC! run --rm api npm run seed:dar-chaabane >> %LOG% 2>&1
if errorlevel 1 ( echo   ECHEC. Voir dar-chaabane.txt & goto fin )

echo. >> %LOG%
echo --- comptes de la commune --- >> %LOG%
!DC! exec -T db psql -U siipi_admin -d siipi_national -c "SELECT email, role FROM users WHERE commune_id='nabeul_dar_chaabane_el_fehri' AND deleted_at IS NULL ORDER BY role;" >> %LOG% 2>&1

echo.
echo   Registre recharge.
echo.
echo   Portail municipal : http://localhost:3000
echo     directeur.darchaabane@siipi.tn    - mot de passe : Siipi2026!
echo     prestataire.darchaabane@siipi.tn  - mot de passe : Siipi2026!
echo.

:fin
echo   Journal : dar-chaabane.txt
echo.
pause
