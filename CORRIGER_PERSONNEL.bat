@echo off
setlocal enabledelayedexpansion
REM ===========================================================================
REM  SIIPI - retrait des 17 agents fictifs de Dar Chaabane El Fehri.
REM
REM  POURQUOI. Le chargement du module 2 (16/09) avait cree 17 silhouettes
REM  MAT-* pour donner une equipe aux huit circuits. Le module 4 (21/09) a
REM  ensuite charge le registre reel : 61 agents DCF-, issus de la paie.
REM  Les deux jeux coexistent depuis, d ou 78 agents pour une commune qui en
REM  emploie 61, et un refus (409) quand on affecte un agent reel a un circuit
REM  dont le poste est deja tenu par quelqu un qui n existe pas.
REM
REM  CE QUE FAIT CE SCRIPT. Il clot les 16 affectations des MAT- (date de fin
REM  au jour meme, la ligne reste au journal) et retire les 17 agents par
REM  suppression LOGIQUE. Rien n est efface : tout reste relisible en base.
REM
REM  CE QU IL NE FAIT PAS. Il n affecte personne a leur place. La feuille de
REM  paie dit qui est employe, pas qui conduit le circuit n 3 : cette decision
REM  appartient a la commune. Apres passage, les huit circuits apparaitront
REM  comme non pourvus au panneau de coherence - c est exact, et c est la
REM  liste de ce qu il reste a saisir depuis l ecran Personnel.
REM
REM  Resultat dans correction-personnel.txt, a cote.
REM ===========================================================================
cd /d "%~dp0"
set LOG=correction-personnel.txt
set DC=docker compose
docker compose version > nul 2>&1
if errorlevel 1 set DC=docker-compose
set PSQL=!DC! exec -T db psql -U siipi_admin -d siipi_national
set COMMUNE=nabeul_dar_chaabane_el_fehri

echo ===== SIIPI - retrait des agents fictifs ===== > %LOG%
date /t >> %LOG% 2>&1
time /t >> %LOG% 2>&1

echo.
echo   Avant / apres dans correction-personnel.txt
echo.

echo. >> %LOG%
echo === AVANT === >> %LOG%
!PSQL! -c "SELECT CASE WHEN matricule LIKE 'MAT-%%' THEN 'fictif (module 2)' ELSE 'registre paie' END AS origine, count(*) FROM personnel WHERE commune_id='%COMMUNE%' AND deleted_at IS NULL GROUP BY 1 ORDER BY 1;" >> %LOG% 2>&1
!PSQL! -c "SELECT count(*) AS affectations_fictives FROM circuit_equipe ce JOIN personnel p ON p.id=ce.personnel_id WHERE p.commune_id='%COMMUNE%' AND p.matricule LIKE 'MAT-%%' AND ce.date_fin IS NULL;" >> %LOG% 2>&1

echo. >> %LOG%
echo === RETRAIT === >> %LOG%
!PSQL! -c "UPDATE circuit_equipe ce SET date_fin = CURRENT_DATE FROM personnel p WHERE p.id = ce.personnel_id AND p.commune_id='%COMMUNE%' AND p.matricule LIKE 'MAT-%%' AND ce.date_fin IS NULL;" >> %LOG% 2>&1
!PSQL! -c "UPDATE personnel SET deleted_at = now(), observation = coalesce(observation || ' | ', '') || 'Agent fictif du chargement de demonstration du 16/09/2026, retire le 21/09/2026 au profit du registre reel (matricules DCF-).' WHERE commune_id='%COMMUNE%' AND matricule LIKE 'MAT-%%' AND deleted_at IS NULL;" >> %LOG% 2>&1

echo. >> %LOG%
echo === APRES === >> %LOG%
!PSQL! -c "SELECT count(*) AS effectif_reel FROM personnel WHERE commune_id='%COMMUNE%' AND deleted_at IS NULL;" >> %LOG% 2>&1
!PSQL! -c "SELECT fonction, count(*) FROM personnel WHERE commune_id='%COMMUNE%' AND deleted_at IS NULL GROUP BY 1 ORDER BY 2 DESC;" >> %LOG% 2>&1

echo. >> %LOG%
echo === CE QU IL RESTE A SAISIR (panneau de coherence) === >> %LOG%
!PSQL! -c "SELECT gravite, domaine, count(*) FROM app.incoherences_commune('%COMMUNE%') GROUP BY 1,2 ORDER BY 1,2;" >> %LOG% 2>&1
!PSQL! -c "SELECT sujet, constat, quoi_faire FROM app.incoherences_commune('%COMMUNE%') WHERE domaine='personnel' AND gravite='bloquant' ORDER BY sujet;" >> %LOG% 2>&1

echo. >> %LOG%
echo === FIN === >> %LOG%
echo   Termine.
echo.
type %LOG% | more
pause
