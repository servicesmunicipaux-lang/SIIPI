@echo off
REM ===========================================================================
REM  SIIPI - diagnostic.
REM
REM  Double-cliquez. Le script ecrit tout ce qu'il trouve dans diagnostic.txt,
REM  a cote de lui. Je lis ce fichier directement : rien a recopier.
REM ===========================================================================
cd /d "%~dp0"
set R=diagnostic.txt

echo ===== SIIPI diagnostic ===== > %R%
echo. >> %R%

echo --- date --- >> %R%
date /t >> %R% 2>&1
time /t >> %R% 2>&1

echo. >> %R%
echo --- docker version --- >> %R%
docker version >> %R% 2>&1

echo. >> %R%
echo --- docker compose ps --- >> %R%
docker compose ps -a >> %R% 2>&1

echo. >> %R%
echo --- conteneurs (tous) --- >> %R%
docker ps -a >> %R% 2>&1

echo. >> %R%
echo --- journaux db (30 dernieres lignes) --- >> %R%
docker compose logs --tail 30 db >> %R% 2>&1

echo. >> %R%
echo --- journaux api (60 dernieres lignes) --- >> %R%
docker compose logs --tail 60 api >> %R% 2>&1

echo. >> %R%
echo --- journaux web (60 dernieres lignes) --- >> %R%
docker compose logs --tail 60 web >> %R% 2>&1

echo. >> %R%
echo --- ports en ecoute (3000, 4000, 5432, 8080) --- >> %R%
netstat -ano ^| findstr /R /C:":3000 " /C:":4000 " /C:":5432 " /C:":8080 " >> %R% 2>&1

echo. >> %R%
echo --- fichiers presents --- >> %R%
dir /b >> %R% 2>&1

echo.
echo Diagnostic ecrit dans diagnostic.txt
echo Vous pouvez fermer cette fenetre : je lis le fichier moi-meme.
pause
