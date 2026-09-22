@echo off
setlocal enabledelayedexpansion
REM ===========================================================================
REM  SIIPI - mise a jour complete. LE SEUL FICHIER A LANCER.
REM
REM  Il applique toutes les migrations en attente, quelles qu'elles soient,
REM  regenere les types du front depuis le contrat d'API, redemarre tout et
REM  verifie que ca tient. Rien n'est efface : une migration qui echoue est
REM  annulee en entier.
REM
REM  Ce qu'il applique aujourd'hui, si ce n'est pas deja fait :
REM    030  comptes et acces (et la faille d'elevation de privilege refermee)
REM    031  fiche d'identite du circuit : secteur, poste, horaires, engins,
REM         campagne d'observation ; et la provenance du trace et des arrets
REM    032  parc materiel : l'ETAT d'un engin, distinct de sa POSITION.
REM         Les 29 engins de Dar Chaabane, inventaire du 19 avril 2024.
REM    033  recoupement du registre des circuits et de l'inventaire du parc
REM    036  RUBRIQUE 4 - pesees : un tonnage saisi a la main, rattache au
REM         CIRCUIT et au VOYAGE qui l'ont produit. Pas d'import ANGeD :
REM         l'interoperabilite avec leur plateforme n'est pas possible
REM         aujourd'hui, et le registre est bati pour les accueillir sans
REM         migration le jour venu. Le cout SALARIAL a la tonne, promis au
REM         module 4, se calcule enfin - sur des tonnages constates.
REM    035  MODULE 5 - communication : sondages, projets et notifications
REM         ciblees par perimetre geographique. Un seul socle pour les trois :
REM         un perimetre, un contenu bilingue, un cycle de vie. Les contenus
REM         d'exemple sont marques EN BASE et la base refuse de les publier
REM         vers les citoyens.
REM    034  MODULE 4 - personnel : effectif, affectation aux circuits,
REM         pointage quotidien, masse salariale du SERVICE.
REM         Ni CIN, ni telephone, ni salaire individuel, ni donnee de sante :
REM         la base n'a pas ces colonnes (decret-loi 2022-54). Les 60 ouvriers
REM         et le technicien principal de Dar Chaabane sont charges sous des
REM         NOMS FICTIFS ; grades, classes et echelons sont les vrais.
REM
REM  Journal complet dans migration.txt, a cote.
REM ===========================================================================
cd /d "%~dp0"
set LOG=migration.txt

echo ===== SIIPI - mise a jour ===== > %LOG%
date /t >> %LOG% 2>&1
time /t >> %LOG% 2>&1

set DC=docker compose
docker compose version > nul 2>&1
if errorlevel 1 set DC=docker-compose

echo.
echo ===== SIIPI - mise a jour de la plateforme =====
echo.

echo [1/7] Dependances...
echo. >> %LOG%
echo --- npm install --- >> %LOG%
!DC! run --rm api npm install --no-audit --no-fund >> %LOG% 2>&1
!DC! run --rm web npm install --no-audit --no-fund >> %LOG% 2>&1
echo       A jour.

echo [2/7] Application des migrations en attente...
echo. >> %LOG%
echo --- migrate --- >> %LOG%
!DC! run --rm api npm run migrate >> %LOG% 2>&1
if errorlevel 1 (
  echo   ECHEC. Rien n'a ete modifie : une migration qui echoue est annulee
  echo   en entier. Voir migration.txt
  goto fin
)
echo       Base a jour.

echo [3/7] Chargement des donnees de Dar Chaabane...
echo. >> %LOG%
echo --- seed:parc --- >> %LOG%
!DC! run --rm api npm run seed:parc >> %LOG% 2>&1
if errorlevel 1 (
  echo   Le parc n'a pas pu etre charge. La suite continue. Voir migration.txt
) else (
  echo       29 engins.
)
echo. >> %LOG%
echo --- seed:personnel --- >> %LOG%
!DC! run --rm api npm run seed:personnel >> %LOG% 2>&1
if errorlevel 1 (
  echo   Le personnel n'a pas pu etre charge. La suite continue.
) else (
  echo       61 agents, noms fictifs, 4 exercices de masse salariale.
)
echo. >> %LOG%
echo --- seed:communication --- >> %LOG%
!DC! run --rm api npm run seed:communication >> %LOG% 2>&1
if errorlevel 1 (
  echo   Les exemples de communication n'ont pas pu etre charges.
) else (
  echo       3 exemples de communication, en brouillon.
)

echo [4/7] Redemarrage de l'API...
echo. >> %LOG%
!DC! up -d --force-recreate api >> %LOG% 2>&1
if errorlevel 1 (
  echo   ECHEC au redemarrage de l'API. Voir migration.txt
  goto fin
)
timeout /t 20 /nobreak > nul

REM  Les types du front sont generes DEPUIS l'API qui tourne. Cet ordre n'est
REM  pas negociable : regenerer avant le redemarrage produirait les types de
REM  l'ancien contrat, et le front compilerait contre des routes disparues.
echo [5/7] Regeneration des types du front depuis le contrat d'API...
echo. >> %LOG%
echo --- types:api --- >> %LOG%
REM  « npm run types:api » vise localhost:4000, ce qui est juste quand on
REM  developpe sur sa machine. Lance ici, il tourne dans un conteneur web NEUF
REM  ou « localhost » designe ce conteneur, pas l'API : ECONNREFUSED. Sur le
REM  reseau compose, l'API s'appelle par son nom de service.
!DC! run --rm web npx openapi-typescript http://api:4000/openapi.json -o src/lib/api-types.ts >> %LOG% 2>&1
if errorlevel 1 (
  echo   ECHEC de la regeneration des types : les nouveaux onglets ne
  echo   compileront pas. Voir migration.txt
) else (
  echo       Types a jour.
)

echo [6/7] Redemarrage du front...
echo. >> %LOG%
!DC! up -d --force-recreate web >> %LOG% 2>&1
timeout /t 15 /nobreak > nul

echo [7/7] Verifications...
echo. >> %LOG%
echo --- contrat d'API --- >> %LOG%
!DC! exec -T api npm run verifier:contrat >> %LOG% 2>&1
echo. >> %LOG%
REM  Le front n'a jamais ete typecheck ici : Vite transpile sans verifier, donc
REM  l'application tourne avec des erreurs de typage bien reelles. C'est ainsi
REM  qu'un champ ecrit de travers (req.user.id au lieu de .sub) a pu vivre neuf
REM  fois dans le code. Ce controle arrive APRES la regeneration des types, la
REM  seule place ou il compare le front au contrat reellement servi.
echo --- typage du front --- >> %LOG%
!DC! run --rm web npx tsc --noEmit -p tsconfig.json >> %LOG% 2>&1
if errorlevel 1 (echo   ATTENTION : le typage du front signale des erreurs, voir %LOG%) else (echo   Typage du front : OK)
echo. >> %LOG%
echo --- campagne du module 2 (circuits) --- >> %LOG%
!DC! exec -T api npm run test:module2 >> %LOG% 2>&1
echo. >> %LOG%
echo --- campagne des acces --- >> %LOG%
!DC! exec -T api npm run test:comptes >> %LOG% 2>&1
echo. >> %LOG%
echo --- campagne du module 3 (parc) --- >> %LOG%
!DC! exec -T api npm run test:module3 >> %LOG% 2>&1
echo. >> %LOG%
echo --- campagne du module 4 (personnel) --- >> %LOG%
!DC! exec -T api npm run test:module4 >> %LOG% 2>&1
echo. >> %LOG%
echo --- campagne du module 5 (communication) --- >> %LOG%
!DC! exec -T api npm run test:module5 >> %LOG% 2>&1
echo. >> %LOG%
echo --- campagne du module 6 (pesees) --- >> %LOG%
!DC! exec -T api npm run test:module6 >> %LOG% 2>&1
echo. >> %LOG%
echo --- campagne du stockage de fichiers --- >> %LOG%
!DC! exec -T api npm run test:fichiers >> %LOG% 2>&1
echo. >> %LOG%
echo --- campagne des points proposes par les citoyens --- >> %LOG%
!DC! exec -T api npm run test:suggestions >> %LOG% 2>&1

echo. >> %LOG%
echo --- etat des conteneurs --- >> %LOG%
!DC! ps >> %LOG% 2>&1
echo. >> %LOG%
echo --- migrations appliquees --- >> %LOG%
!DC! exec -T db psql -U siipi_admin -d siipi_national -c "SELECT filename, applied_at::date FROM schema_migrations ORDER BY filename DESC LIMIT 8;" >> %LOG% 2>&1
echo. >> %LOG%
echo --- etat du parc --- >> %LOG%
!DC! exec -T db psql -U siipi_admin -d siipi_national -c "SELECT * FROM app.etat_du_parc('nabeul_dar_chaabane_el_fehri');" >> %LOG% 2>&1
echo. >> %LOG%
echo --- effectif du service --- >> %LOG%
!DC! exec -T db psql -U siipi_admin -d siipi_national -c "SELECT * FROM app.effectif_commune('nabeul_dar_chaabane_el_fehri');" >> %LOG% 2>&1
echo. >> %LOG%
echo --- masse salariale du service --- >> %LOG%
!DC! exec -T db psql -U siipi_admin -d siipi_national -c "SELECT * FROM app.cout_service('nabeul_dar_chaabane_el_fehri');" >> %LOG% 2>&1
echo. >> %LOG%
echo --- ciblage : combien de foyers par secteur --- >> %LOG%
!DC! exec -T db psql -U siipi_admin -d siipi_national -c "SELECT z.code, z.name, (app.compter_destinataires('nabeul_dar_chaabane_el_fehri','zones',ARRAY[z.id])).* FROM zones_collecte z WHERE z.commune_id='nabeul_dar_chaabane_el_fehri' AND z.status='active' AND z.deleted_at IS NULL ORDER BY z.code;" >> %LOG% 2>&1
echo. >> %LOG%
echo --- ce qu'il reste a peser aujourd'hui --- >> %LOG%
!DC! exec -T db psql -U siipi_admin -d siipi_national -c "SELECT circuit, voyage, vehicule_immat, poids_net_kg FROM app.pesees_attendues('nabeul_dar_chaabane_el_fehri');" >> %LOG% 2>&1
echo. >> %LOG%
echo --- ce qui ne colle pas, tous domaines --- >> %LOG%
!DC! exec -T db psql -U siipi_admin -d siipi_national -c "SELECT gravite, domaine, count(*) FROM app.incoherences_commune('nabeul_dar_chaabane_el_fehri') GROUP BY 1,2 ORDER BY 1,2;" >> %LOG% 2>&1
echo. >> %LOG%
echo --- journaux api --- >> %LOG%
!DC! logs --tail 25 api >> %LOG% 2>&1

echo.
echo   Termine. Rechargez http://localhost:3000 (Ctrl+F5).
echo.
echo   Portail municipal, NOUVEL onglet Personnel :
echo     - Pointage du jour : 61 lignes, un bouton "Tout le monde est la",
echo       puis on corrige les absents. C'est le geste d'un seul matin.
echo     - Effectif  : grade, classe, echelon, circuits affectes
echo     - Equipes   : par circuit, prevu / affecte / present
echo     - Cout      : 1 168 566 TND en 2021, 1 324 500 en 2024 (+13,3%%)
echo.
echo   NOUVEL onglet Pesees :
echo     - Saisie du jour : chaque voyage attendu a sa case. On tape un poids,
echo       on valide. Ce sont les TROUS qui s'affichent, pas les reussites.
echo     - Un poids au-dessus de la charge utile de l'engin est signale tout
echo       de suite : une decimale deplacee et une surcharge reelle appellent
echo       deux actions differentes, et aucune ne se voit un mois plus tard.
echo     - Tonnages par circuit et par flux, production specifique kg/hab/jour
echo.
echo   NOUVEL onglet Communication :
echo     - Choisir un perimetre AVANT d'ecrire : l'ecran dit aussitot combien
echo       de foyers il touche, et combien il rate faute d'adresse renseignee.
echo     - Sondages avec depouillement, projets, notifications ciblees
echo     - Historique : date, perimetre, volumes. Jamais la liste des gens.
echo.
echo   Ce que la base REFUSE de faire, et c'est verifie par les tests :
echo   stocker CIN, telephone, salaire individuel ou motif d'absence medical ;
echo   publier un contenu marque "exemple" vers les citoyens ; rendre la
echo   liste des citoyens d'un perimetre.
echo.

:fin
echo   Journal : migration.txt
echo.
pause
