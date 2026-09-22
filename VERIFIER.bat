@echo off
setlocal enabledelayedexpansion
REM ===========================================================================
REM  SIIPI - diagnostic cible. Ne modifie RIEN, ne fait que lire.
REM  Repond aux quatre questions restees ouvertes apres la migration du 21/09.
REM  Resultat dans verification.txt, a cote.
REM ===========================================================================
cd /d "%~dp0"
set LOG=verification.txt
set DC=docker compose
docker compose version > nul 2>&1
if errorlevel 1 set DC=docker-compose
set PSQL=!DC! exec -T db psql -U siipi_admin -d siipi_national

echo ===== SIIPI - verification ===== > %LOG%
date /t >> %LOG% 2>&1
time /t >> %LOG% 2>&1

echo.
echo   Diagnostic en cours...
echo.

echo. >> %LOG%
echo === 1. DROITS D EXECUTION SUR LES FONCTIONS DE COHERENCE === >> %LOG%
!PSQL! -c "SELECT p.proname, p.prosecdef AS security_definer, pg_get_userbyid(p.proowner) AS proprietaire, has_function_privilege('siipi_app', p.oid, 'EXECUTE') AS siipi_app_peut FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='app' AND p.proname LIKE 'incoherences%%' ORDER BY 1;" >> %LOG% 2>&1

echo. >> %LOG%
echo === 2. APPEL REEL DANS LA PEAU DE siipi_app === >> %LOG%
!PSQL! -c "BEGIN; SET LOCAL ROLE siipi_app; SELECT set_config('app.role','admin_commune',true), set_config('app.commune_id','nabeul_dar_chaabane_el_fehri',true); SELECT count(*) AS lignes FROM app.incoherences_commune('nabeul_dar_chaabane_el_fehri'); ROLLBACK;" >> %LOG% 2>&1
echo --- et chaque sous-fonction separement --- >> %LOG%
!PSQL! -c "BEGIN; SET LOCAL ROLE siipi_app; SELECT count(*) AS registres FROM app.incoherences_registres('nabeul_dar_chaabane_el_fehri'); ROLLBACK;" >> %LOG% 2>&1
!PSQL! -c "BEGIN; SET LOCAL ROLE siipi_app; SELECT count(*) AS communication FROM app.incoherences_communication('nabeul_dar_chaabane_el_fehri'); ROLLBACK;" >> %LOG% 2>&1
!PSQL! -c "BEGIN; SET LOCAL ROLE siipi_app; SELECT count(*) AS pesees FROM app.incoherences_pesees('nabeul_dar_chaabane_el_fehri'); ROLLBACK;" >> %LOG% 2>&1

echo. >> %LOG%
echo === 3. DROITS DE TABLE POUR siipi_app === >> %LOG%
!PSQL! -c "SELECT table_name, string_agg(privilege_type, ',' ORDER BY privilege_type) AS droits FROM information_schema.table_privileges WHERE grantee='siipi_app' AND table_name IN ('publications','sondage_questions','sondage_reponses','envois_notification','publication_documents','pesees','personnel','circuit_equipe','presences','effectifs_service') GROUP BY 1 ORDER BY 1;" >> %LOG% 2>&1

echo. >> %LOG%
echo === 4. POURQUOI 78 AGENTS AU LIEU DE 61 === >> %LOG%
!PSQL! -c "SELECT COALESCE(left(matricule,4),'(sans matricule)') AS prefixe, count(*), min(created_at)::date AS cree_le FROM personnel WHERE commune_id='nabeul_dar_chaabane_el_fehri' AND deleted_at IS NULL AND actif GROUP BY 1 ORDER BY 2 DESC;" >> %LOG% 2>&1
!PSQL! -c "SELECT nom_complet, fonction, matricule, observation FROM personnel WHERE commune_id='nabeul_dar_chaabane_el_fehri' AND deleted_at IS NULL AND actif AND (matricule IS NULL OR matricule NOT LIKE 'DCF-%') LIMIT 20;" >> %LOG% 2>&1

echo. >> %LOG%
echo === 5. CHAUFFEURS DEJA AFFECTES (cause probable du 409) === >> %LOG%
!PSQL! -c "SELECT c.nom AS circuit, ce.role, p.nom_complet, ce.date_fin FROM circuit_equipe ce JOIN circuits c ON c.id=ce.circuit_id JOIN personnel p ON p.id=ce.personnel_id WHERE c.commune_id='nabeul_dar_chaabane_el_fehri' ORDER BY c.nom, ce.role LIMIT 20;" >> %LOG% 2>&1

echo. >> %LOG%
echo === 6. LES PESEES DE TEST ET LEUR SUPPRESSION LOGIQUE === >> %LOG%
!PSQL! -c "SELECT bon_numero, poids_net_kg, deleted_at IS NOT NULL AS annulee, deleted_by IS NOT NULL AS imputee FROM pesees WHERE commune_id='nabeul_dar_chaabane_el_fehri' ORDER BY created_at DESC LIMIT 10;" >> %LOG% 2>&1

echo. >> %LOG%
echo === 7. L ENGIN QUE LA CAMPAGNE CHOISIT, ET SA CHARGE UTILE === >> %LOG%
!PSQL! -c "SELECT id, registration, type, charge_utile_t, etat FROM vehicules WHERE commune_id='nabeul_dar_chaabane_el_fehri' AND deleted_at IS NULL AND etat='en_service' AND charge_utile_t > 0 ORDER BY registration LIMIT 5;" >> %LOG% 2>&1

echo. >> %LOG%
echo === 8. LES TYPES DU FRONT SONT-ILS A JOUR ? === >> %LOG%
!DC! exec -T web sh -c "grep -c '/pesees' src/lib/api-types.ts 2>/dev/null || echo ABSENT" >> %LOG% 2>&1
!DC! exec -T web sh -c "grep -c '/personnel' src/lib/api-types.ts 2>/dev/null || echo ABSENT" >> %LOG% 2>&1

echo   Termine. Envoyez-moi verification.txt (ou dites juste "c'est fait").
echo.
pause
