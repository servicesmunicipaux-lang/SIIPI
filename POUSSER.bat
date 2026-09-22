@echo off
setlocal enabledelayedexpansion
REM ===========================================================================
REM  SIIPI - envoi du travail local vers GitHub.
REM
REM  POURQUOI CE SCRIPT EXISTE. Le commit est deja fait ; il ne manque que
REM  l'envoi, et celui-ci demande VOS identifiants GitHub. Ils sont dans le
REM  gestionnaire d'identifiants de Windows, auquel moi je n'ai pas acces —
REM  et c'est tres bien ainsi : un jeton qui donne les droits d'ecriture sur
REM  un depot ne se confie pas.
REM
REM  Au premier lancement, Windows ouvrira une fenetre de connexion GitHub.
REM  Ensuite il s'en souviendra.
REM
REM  AVANT DE LANCER : verifiez la visibilite du depot sur GitHub
REM  (Settings > General > Danger Zone). Ce qui part ici devient lisible par
REM  tout le monde si le depot est public.
REM ===========================================================================
cd /d "%~dp0"

echo.
echo   Depot  : https://github.com/servicesmunicipaux-lang/SIIPI.git
echo   Branche: main
echo.

git remote get-url origin > nul 2>&1
if errorlevel 1 (
  echo   Ajout du depot distant...
  git remote add origin https://github.com/servicesmunicipaux-lang/SIIPI.git
)

echo   --- ce qui va partir ---
git log --oneline origin/main..main 2>nul || git log --oneline -5
echo.

echo   Envoi en cours ^(une fenetre de connexion GitHub peut s'ouvrir^)...
git push -u origin main
if errorlevel 1 (
  echo.
  echo   L'envoi a echoue. Causes habituelles :
  echo     - connexion GitHub refusee ou annulee
  echo     - le depot distant contient deja des commits ^(faire d'abord : git pull --rebase origin main^)
  echo     - pas de droit d'ecriture sur ce depot
) else (
  echo.
  echo   Envoye. Verifiez sur https://github.com/servicesmunicipaux-lang/SIIPI
)
echo.
pause
