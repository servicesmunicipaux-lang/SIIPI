@echo off
setlocal enabledelayedexpansion
REM ===========================================================================
REM  SIIPI - demarrage complet.  Double-cliquez sur ce fichier.
REM
REM  C'est LE guide de demarrage : DEMARRAGE.md ne fait que l'expliquer, et
REM  donne les memes commandes pour un poste sans Windows. Si les deux
REM  divergent un jour, c'est ce fichier qui fait foi.
REM
REM  Tout ce qui se passe est ecrit dans demarrage.txt, a cote. En cas de
REM  probleme, ce fichier suffit a comprendre : rien a recopier.
REM
REM  Ecrit en .bat et non en PowerShell : PowerShell, avec l'arret sur erreur
REM  active, interrompt le script sur les messages de PROGRESSION de Docker,
REM  qui sortent sur la sortie d'erreur. Le script s'arretait donc en plein
REM  succes.
REM
REM  Rejouable : relance sur une installation existante, il applique les
REM  migrations en attente et recharge les jeux sans les dupliquer. Les
REM  donnees saisies ne sont pas touchees.
REM ===========================================================================
cd /d "%~dp0"
set LOG=demarrage.txt
set INCOMPLET=0

echo ===== SIIPI - demarrage ===== > %LOG%
date /t >> %LOG% 2>&1
time /t >> %LOG% 2>&1
echo. >> %LOG%

echo.
echo ===== SIIPI - Proprete Intercommunale =====
echo.

REM --- 1. Docker repond-il ? -------------------------------------------------
echo [1/9] Verification de Docker...
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

REM --- 2. Menage des lancements precedents -----------------------------------
REM
REM  Un conteneur d'un essai anterieur peut occuper le nom attendu et bloquer
REM  tout le demarrage sur « Conflict. The container name /siipi_db is already
REM  in use ». On enleve d'abord les conteneurs de ce projet, puis les quatre
REM  noms figes des anciennes versions du fichier Compose. Les DONNEES ne sont
REM  pas touchees : elles vivent dans des volumes nommes, pas dans les
REM  conteneurs.
echo [2/9] Menage des conteneurs d'un lancement precedent...
echo. >> %LOG%
echo --- [2] menage --- >> %LOG%
!DC! down --remove-orphans >> %LOG% 2>&1
docker rm -f siipi_db siipi_api siipi_web siipi_adminer >> %LOG% 2>&1
echo       Menage fait.

REM --- 3. La base ------------------------------------------------------------
echo [3/9] Demarrage de PostgreSQL + PostGIS...
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
goto dependances
:basePrete
echo       Base prete.
echo --- base prete --- >> %LOG%

REM --- 4. Les dependances de l'API -------------------------------------------
REM
REM  Indispensable, et c'est le piege du premier lancement : "compose run api
REM  npm run migrate" REMPLACE la commande du service, donc le "npm install"
REM  qui y figure ne s'execute jamais. Le volume de dependances etant vide au
REM  depart, tsx est introuvable et la migration echoue sans raison apparente.
:dependances
echo [4/9] Installation des dependances de l'API ^(plusieurs minutes la 1re fois^)...
echo. >> %LOG%
echo --- [4] npm install api --- >> %LOG%
!DC! run --rm api npm install --no-audit --no-fund >> %LOG% 2>&1
if errorlevel 1 (
  echo   ECHEC de l'installation des dependances. Voir demarrage.txt
  goto fin
)
echo       Dependances installees.

REM --- 5. Le schema ----------------------------------------------------------
REM  Pas de nombre de migrations ecrit ici : il change a chaque lot, et un
REM  chiffre fige finit toujours par mentir. Le migrateur dit lui-meme combien
REM  il en applique (voir demarrage.txt).
echo [5/9] Application des migrations...
echo. >> %LOG%
echo --- [5] migrate --- >> %LOG%
!DC! run --rm api npm run migrate >> %LOG% 2>&1
if errorlevel 1 (
  echo   ECHEC des migrations. Voir demarrage.txt
  echo   Une migration modifiee apres application arrete le migrateur, qui
  echo   dit laquelle : c'est voulu.
  goto fin
)
echo       Migrations appliquees.

REM --- 6. Le referentiel -----------------------------------------------------
echo [6/9] Import des 350 communes et des comptes de demonstration...
echo. >> %LOG%
echo --- [6] seed --- >> %LOG%
!DC! run --rm api npm run seed >> %LOG% 2>&1
if errorlevel 1 (
  echo   ECHEC du seed. Voir demarrage.txt
  goto fin
)
echo       Referentiel importe.

REM --- 7. Le decoupage -------------------------------------------------------
echo [7/9] Import des territoires officiels ^(environ une minute^)...
echo. >> %LOG%
echo --- [7] import:decoupage --- >> %LOG%
!DC! run --rm api npm run import:decoupage >> %LOG% 2>&1
if errorlevel 1 (
  echo   ECHEC de l'import du decoupage. Voir demarrage.txt
  goto fin
)
echo       Territoires importes.

REM --- 8. La commune pilote --------------------------------------------------
REM
REM  L'ordre est celui d'une installation reelle, et celui dans lequel les
REM  campagnes de tests sont ecrites (CLAUDE.md, par. 7) : sans ces quatre
REM  chargements, TESTS.bat echouerait sur une installation pourtant saine.
REM  Un echec ici n'empeche pas la plateforme de tourner : on le signale a la
REM  fin au lieu de tout arreter.
echo [8/9] Chargement de la commune pilote Dar Chaabane El Fehri...
for %%s in (seed:dar-chaabane seed:parc seed:personnel seed:communication) do (
  echo. >> %LOG%
  echo --- [8] %%s --- >> %LOG%
  !DC! run --rm api npm run %%s >> %LOG% 2>&1
  if errorlevel 1 (
    echo       %%s : ECHEC, voir demarrage.txt
    set INCOMPLET=1
  ) else (
    echo       %%s : fait.
  )
)

REM --- 9. La plateforme ------------------------------------------------------
echo [9/9] Demarrage de la plateforme en arriere-plan...
echo. >> %LOG%
echo --- [9] up -d --- >> %LOG%
!DC! up -d >> %LOG% 2>&1
if errorlevel 1 (
  echo   ECHEC au demarrage. Voir demarrage.txt
  goto fin
)

REM  /health dit si la base est prete, et sinon ce qu'il faut lancer. On
REM  l'attend au plus 90 secondes. curl est livre avec Windows 10 et 11 ; sans
REM  lui, on saute ce controle plutot que d'echouer.
set SANTE=non verifiee
where curl > nul 2>&1
if errorlevel 1 goto etat
echo       Attente de l'API...
set /a n=0
:attenteApi
set /a n+=1
timeout /t 3 /nobreak > nul
curl -s -f http://localhost:4000/health > nul 2>&1
if not errorlevel 1 (
  set SANTE=ok
  goto etat
)
if !n! lss 30 goto attenteApi
set SANTE=en echec

:etat
echo. >> %LOG%
echo --- /health : !SANTE! --- >> %LOG%
where curl > nul 2>&1 && curl -s http://localhost:4000/health >> %LOG% 2>&1
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
netstat -ano | findstr /R /C:":3000 " /C:":4000 " /C:":5432 " /C:":8081 " >> %LOG% 2>&1

echo.
if "!SANTE!"=="en echec" (
  echo   ATTENTION : l'API ne se declare pas prete. Ouvrez
  echo   http://localhost:4000/health dans le navigateur : il dit la cause
  echo   et la commande a lancer.
  echo.
)
if "!INCOMPLET!"=="1" (
  echo   ATTENTION : la commune pilote n'est pas entierement chargee.
  echo   La plateforme fonctionne ; les campagnes de tests echoueront tant
  echo   que demarrage.txt signale un echec a l'etape 8.
  echo.
)
echo   La plateforme tourne en arriere-plan.
echo.
echo     Plateforme       : http://localhost:3000
echo     Contrat d'API    : http://localhost:4000/docs
echo     Etat de la base  : http://localhost:4000/health
echo     Base de donnees  : http://localhost:8081  ^(Adminer - serveur : db^)
echo.
REM  Le ^^! est voulu : sous enabledelayedexpansion, un ! nu disparait, et
REM  l'ecran affichait un mot de passe faux (Siipi2026, sans le point
REM  d'exclamation).
echo     Comptes - mot de passe : Siipi2026^^!
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
