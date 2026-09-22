@echo off
setlocal enabledelayedexpansion
REM ===========================================================================
REM  SIIPI - demarrage complet.  Double-cliquez sur ce fichier.
REM
REM  Tout ce qui se passe est ecrit dans demarrage.txt, a cote. En cas de
REM  probleme, ce fichier suffit a comprendre : rien a recopier.
REM
REM  Ecrit en .bat et non en PowerShell : PowerShell, avec l'arret sur erreur
REM  active, interrompt le script sur les messages de PROGRESSION de Docker,
REM  qui sortent sur la sortie d'erreur. Le script s'arretait donc en plein
REM  succes.
REM ===========================================================================
cd /d "%~dp0"
set LOG=demarrage.txt

echo ===== SIIPI - demarrage ===== > %LOG%
date /t >> %LOG% 2>&1
time /t >> %LOG% 2>&1
echo. >> %LOG%

echo.
echo ===== SIIPI - Proprete Intercommunale =====
echo.

REM --- 1. Docker repond-il ? -------------------------------------------------
echo [1/8] Verification de Docker...
echo --- [1] docker version --- >> %LOG%
docker version >> %LOG% 2>&1
if errorlevel 1 (
  echo.
  echo   ECHEC : Docker ne repond pas.
  echo   Ouvrez Docker Desktop, attendez que la baleine soit stable, relancez.
  echo --- ECHEC : docker version --- >> %LOG%
  goto fin
)

REM Docker Compose v2 ^(docker compose^) ou v1 ^(docker-compose^) ?
set DC=docker compose
docker compose version >> %LOG% 2>&1
if errorlevel 1 (
  set DC=docker-compose
  docker-compose version >> %LOG% 2>&1
  if errorlevel 1 (
    echo   ECHEC : ni "docker compose" ni "docker-compose" ne fonctionne.
    echo --- ECHEC : aucune version de compose --- >> %LOG%
    goto fin
  )
)
echo       Docker repond. Compose : !DC!
echo --- compose utilise : !DC! --- >> %LOG%

REM --- 1 bis. Menage des lancements precedents -------------------------------
REM
REM  Un conteneur d'un essai anterieur peut occuper le nom attendu et bloquer
REM  tout le demarrage sur « Conflict. The container name /siipi_db is already
REM  in use ». On enleve d'abord les conteneurs de ce projet, puis les quatre
REM  noms figes des anciennes versions du fichier Compose. Les DONNEES ne sont
REM  pas touchees : elles vivent dans des volumes nommes, pas dans les
REM  conteneurs.
echo [2/8] Menage des conteneurs d'un lancement precedent...
echo. >> %LOG%
echo --- [2] menage --- >> %LOG%
!DC! down --remove-orphans >> %LOG% 2>&1
docker rm -f siipi_db siipi_api siipi_web siipi_adminer >> %LOG% 2>&1
echo       Menage fait.

REM --- 2. La base ------------------------------------------------------------
echo [3/8] Demarrage de PostgreSQL + PostGIS...
echo. >> %LOG%
echo --- [3] up -d db --- >> %LOG%
!DC! up -d db >> %LOG% 2>&1
if errorlevel 1 (
  echo   ECHEC au demarrage de la base. Voir demarrage.txt
  goto fin
)
echo       Attente que la base accepte les connexions...
set /a n=0
:attente
set /a n+=1
timeout /t 2 /nobreak > nul
!DC! exec -T db pg_isready -U siipi_admin -d siipi_national > nul 2>&1
if not errorlevel 1 goto basePrete
if !n! lss 30 goto attente
echo       La base tarde ; on continue quand meme.
echo --- base non confirmee apres 60 s --- >> %LOG%
goto migrations
:basePrete
echo       Base prete.
echo --- base prete --- >> %LOG%

REM --- 2 bis. Les dependances de l'API ---------------------------------------
REM
REM  Indispensable, et c'est le piege du premier lancement : "compose run api
REM  npm run migrate" REMPLACE la commande du service, donc le "npm install"
REM  qui y figure ne s'execute jamais. Le volume de dependances etant vide au
REM  depart, tsx est introuvable et la migration echoue sans raison apparente.
:migrations
echo [4/8] Installation des dependances de l'API ^(plusieurs minutes la 1re fois^)...
echo. >> %LOG%
echo --- [3] npm install api --- >> %LOG%
!DC! run --rm api npm install --no-audit --no-fund >> %LOG% 2>&1
if errorlevel 1 (
  echo   ECHEC de l'installation des dependances. Voir demarrage.txt
  goto fin
)
echo       Dependances installees.

REM --- 3. Le schema ----------------------------------------------------------
echo [5/8] Application des 26 migrations...
echo. >> %LOG%
echo --- [4] migrate --- >> %LOG%
!DC! run --rm api npm run migrate >> %LOG% 2>&1
if errorlevel 1 (
  echo   ECHEC des migrations. Voir demarrage.txt
  goto fin
)
echo       Migrations appliquees.

REM --- 4. Le referentiel -----------------------------------------------------
echo [6/8] Import des 350 communes et des comptes de demonstration...
echo. >> %LOG%
echo --- [5] seed --- >> %LOG%
!DC! run --rm api npm run seed >> %LOG% 2>&1
if errorlevel 1 (
  echo   ECHEC du seed. Voir demarrage.txt
  goto fin
)
echo       Referentiel importe.

REM --- 5. Le decoupage -------------------------------------------------------
echo [7/8] Import des 349 territoires officiels ^(environ une minute^)...
echo. >> %LOG%
echo --- [6] import:decoupage --- >> %LOG%
!DC! run --rm api npm run import:decoupage >> %LOG% 2>&1
if errorlevel 1 (
  echo   ECHEC de l'import du decoupage. Voir demarrage.txt
  goto fin
)
echo       Territoires importes.

REM --- 6. La plateforme ------------------------------------------------------
echo [8/8] Demarrage de la plateforme en arriere-plan...
echo. >> %LOG%
echo --- [7] up -d --- >> %LOG%
!DC! up -d >> %LOG% 2>&1
if errorlevel 1 (
  echo   ECHEC au demarrage. Voir demarrage.txt
  goto fin
)

echo. >> %LOG%
echo --- etat des conteneurs --- >> %LOG%
!DC! ps >> %LOG% 2>&1
echo. >> %LOG%
echo --- journaux api --- >> %LOG%
!DC! logs --tail 40 api >> %LOG% 2>&1
echo. >> %LOG%
echo --- journaux web --- >> %LOG%
!DC! logs --tail 40 web >> %LOG% 2>&1
echo. >> %LOG%
echo --- ports en ecoute --- >> %LOG%
netstat -ano | findstr /R /C:":3000 " /C:":4000 " /C:":5432 " >> %LOG% 2>&1

echo.
echo   La plateforme tourne en arriere-plan.
echo.
echo     Plateforme      : http://localhost:3000
echo     Contrat d'API   : http://localhost:4000/docs
echo     Base de donnees : http://localhost:8081
echo.
echo     Comptes - mot de passe : Siipi2026!
echo       Observatoire national : admin.national@siipi.tn
echo       Portail municipal     : directeur.houmtsouk@siipi.tn
echo       Espace prestataire    : prestataire.houmtsouk@siipi.tn
echo       Application citoyenne : citoyen.demo@siipi.tn
echo.
echo   Le conteneur du front installe ses paquets au premier lancement :
echo   comptez quelques minutes avant que le port 3000 reponde.
echo.
echo   Vous pouvez fermer cette fenetre : tout continue en arriere-plan.
echo.

:fin
echo.
echo   Journal complet : demarrage.txt
echo.
pause
