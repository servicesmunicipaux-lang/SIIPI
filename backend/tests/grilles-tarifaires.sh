#!/usr/bin/env bash
# =============================================================================
# v0.15.90 — jalon G, lot G1 : les listes nationales des déchets assimilés et
# les grilles tarifaires (docs/specs_metier/SPEC_G_assimiles_conventions.md
# § 1, § 3.3 ; migration 098).
#
# Elle commence par ce qui est REFUSÉ :
#   - une commune qui écrit une liste nationale ; un attribut porté par la
#     mauvaise liste (une unité sur un flux, un flux sans « dangereux », une
#     catégorie sans unité) ; une date d'application absente hors de la base
#     légale ; une application qui précède la publication ;
#   - une grille écrite par la FNCT, ou dans une autre commune ; une catégorie
#     inconnue, ou pas encore en vigueur à la date d'effet ; deux tranches qui
#     se chevauchent ; une grille née approuvée ; une approbation écrite sans sa
#     procédure, datée dans l'avenir ou avant l'arrêté, sur une grille vide ;
#   - toute modification d'une grille approuvée, de ses lignes, de ses
#     majorations ; son retrait ; une seconde grille approuvée sur la même
#     période — même quand les deux approbations arrivent en même temps.
# Puis le cycle d'une grille : projet, modification, approbation, grille en
# vigueur à une date, clôture, remplacement ; le texte légal publié sans date
# d'application, « en attente », puis fixé une fois. Les tables des communes
# réelles ne bougent pas ; la table nationale des listes est rendue ligne entière.
#
#   docker compose exec -T api npm run test:grilles-tarifaires
# =============================================================================

set -u
cd "$(dirname "$0")/.." || exit 1
API="${API_URL:-http://localhost:4000}"
PSQL="psql -q -tA -h ${PGHOST:-localhost} -p ${PGPORT:-5432} -U ${PGUSER:-siipi_admin} -d ${PGDATABASE:-siipi_national}"
pass=0; fail=0
T=$(mktemp -d)
A=test_grilles_a; B=test_grilles_b
ESSAI="'$A','$B'"

chk() {
  if [ "$2" = "$3" ]; then printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1))
  else printf '  \033[31m✗\033[0m %s  (attendu %s, obtenu %s)\n' "$1" "$2" "$3"; fail=$((fail+1)); fi
}
sql() { $PSQL -c "$1" 2>&1 | tr -d ' '; }
tok() {
  curl -s -X POST "$API/auth/login" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"$2\"}" | python3 -c "import sys,json;print(json.load(sys.stdin).get('token',''))" 2>/dev/null
}
appel() { # méthode chemin jeton [corps] — code HTTP, corps dans $T/r.json
  curl -s -o "$T/r.json" -w '%{http_code}' -X "$1" "$API$2" ${3:+-H "Authorization: Bearer $3"} \
    -H 'Content-Type: application/json' ${4:+-d "$4"}
}
val() { python3 -c "import json;d=json.load(open('$T/r.json'));print($1)" 2>/dev/null || echo erreur; }
# Une écriture directe en base, sous le rôle de l'application et le compte $2 (rôle $1, commune $3).
en_base() { # rôle utilisateur commune instruction — le refus de la base, ou « ok »
  $PSQL -c "BEGIN; SELECT set_config('app.role', '$1', true), set_config('app.user_id', '$2', true), set_config('app.commune_id', '$3', true);
            SET LOCAL ROLE siipi_app; $4; ROLLBACK;" 2>&1 \
    | grep -oE '^ERROR: +[A-Z_]+:|permission denied|violates row-level security|violates check constraint "[a-z_]+"' | head -1 \
    | sed -E 's/^ERROR: +//; s/:$//; s/violates check constraint "([a-z_]+)"/\1/' | grep . || echo ok
}

. tests/outils/communes_essai.sh
. tests/outils/comptes_temporaires.sh
. tests/outils/base_reelle.sh
. tests/outils/tables_nationales.sh
nettoyer() {
  effacer_communes_essai "$ESSAI"
  retirer_comptes_temporaires
}
effacer_communes_essai "$ESSAI"
trap 'nettoyer; rm -rf "$T"' EXIT
garder_tables_nationales elements_listes_nationales
rendre_tables_nationales_en_sortie
releve_base_reelle

commune_essai "$A" "TEST commune A des grilles"
commune_essai "$B" "TEST commune B des grilles"
compte_temporaire admin_commune "$A" "Directeur A"; T_A=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP"); ID_A=$COMPTE_ID
compte_temporaire admin_commune "$B" "Directeur B"; T_B=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP"); ID_B=$COMPTE_ID
compte_temporaire super_admin_fnct "" "FNCT des grilles"; T_F=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP"); ID_F=$COMPTE_ID
compte_temporaire gestionnaire_prestataire "$A" "Prestataire de A"; T_P=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP"); ID_P=$COMPTE_ID
[ -n "$T_A" ] && [ -n "$T_B" ] && [ -n "$T_F" ] && [ -n "$T_P" ] || { echo "API injoignable sur $API, ou compte temporaire refusé" >&2; exit 1; }
AUJ=$(sql "SELECT app.jour_tunis()")
DEMAIN=$(sql "SELECT app.jour_tunis() + 1")
PIECES_AVANT=$(sql "SELECT count(*) FROM app.liste_nationale('pieces_carte_precollecteur', app.jour_tunis())")
element() { appel POST "/listes-assimiles/listes/$1" "$2" "$3"; }
# La grille approuvée d'une date, lue en base par un directeur (rôle, utilisateur,
# commune principale) : app.grille_en_vigueur ne rend rien hors de son périmètre.
vigueur() { # utilisateur commune_principale commune date
  $PSQL -c "BEGIN; SELECT set_config('app.role', 'admin_commune', true), set_config('app.user_id', '$1', true), set_config('app.commune_id', '$2', true);
            SET LOCAL ROLE siipi_app; SELECT 'g:' || COALESCE(app.grille_en_vigueur('$3', $4)::text, 'None'); ROLLBACK;" 2>&1 \
    | grep -oE '^g:.*' | cut -d: -f2
}
etat() { # liste code — l'état du jour d'un élément ouvert
  appel GET /listes-assimiles "$T_A" >/dev/null
  val "[e['etat'] for l in d['listes'] if l['liste']=='$1' for e in l['elements'] if e['code']=='$2'][-1]"
}

# -----------------------------------------------------------------------------
echo
echo "1. Les listes des assimilés : ce qui est refusé"
chk "une commune n'écrit pas une liste nationale" 403 \
    "$(element categories_activite_assimiles "$T_A" '{"code":"test_kiosque","libelleFr":"TEST Kiosque","libelleAr":"كشك","dateEffet":"2000-01-01","unitesEchelle":["m2"]}')"
chk "une liste inconnue : introuvable (404)" 404 \
    "$(element listes_inventees "$T_F" '{"code":"test_x","libelleFr":"X","libelleAr":"س","dateEffet":"2000-01-01"}')"
chk "une catégorie sans unité d'échelle : 400, qui dit pourquoi" "400|1" \
    "$(element categories_activite_assimiles "$T_F" '{"code":"test_kiosque","libelleFr":"TEST Kiosque","libelleAr":"كشك","dateEffet":"2000-01-01"}')|$(val "1 if 'unités' in d['error'] else 0")"
chk "une unité inconnue : 400" 400 \
    "$(element categories_activite_assimiles "$T_F" '{"code":"test_kiosque","libelleFr":"TEST Kiosque","libelleAr":"كشك","dateEffet":"2000-01-01","unitesEchelle":["piece"]}')"
chk "un flux qui ne dit pas s'il est dangereux : 400" 400 \
    "$(element flux_assimiles "$T_F" '{"code":"test_huiles","libelleFr":"TEST Huiles","libelleAr":"زيوت","dateEffet":"2000-01-01"}')"
chk "une unité d'échelle sur un flux : 400" 400 \
    "$(element flux_assimiles "$T_F" '{"code":"test_huiles","libelleFr":"TEST Huiles","libelleAr":"زيوت","dateEffet":"2000-01-01","dangereux":true,"unitesEchelle":["m2"]}')"
chk "une catégorie sans date d'effet (seul un texte légal peut attendre la sienne) : 400" 400 \
    "$(element categories_activite_assimiles "$T_F" '{"code":"test_kiosque","libelleFr":"TEST Kiosque","libelleAr":"كشك","dateEffet":null,"unitesEchelle":["m2"]}')"
chk "un texte appliqué avant d'être publié : 400" 400 \
    "$(element base_legale_assimiles "$T_F" '{"code":"test_loi_x","libelleFr":"TEST Loi","libelleAr":"قانون","dateEffet":"2026-01-01","datePublication":"2026-02-01","provisoire":false,"reference":"TEST JORT n° 1"}')"
chk "la base refuse d'elle-même un attribut porté par la mauvaise liste" elements_attributs_par_liste \
    "$(en_base super_admin_fnct "$ID_F" "" "INSERT INTO elements_listes_nationales (liste, code, libelle_fr, libelle_ar, date_effet, dangereux) VALUES ('categories_activite_assimiles', 'test_y', 'Y', 'ي', DATE '2000-01-01', true)")"
chk "… et une date d'application vide hors de la base légale" elements_date_attendue \
    "$(en_base super_admin_fnct "$ID_F" "" "INSERT INTO elements_listes_nationales (liste, code, libelle_fr, libelle_ar, date_effet, dangereux) VALUES ('flux_assimiles', 'test_y', 'Y', 'ي', NULL, false)")"
chk "aucun élément TEST n'a été écrit par ces refus" 0 \
    "$(sql "SELECT count(*) FROM elements_listes_nationales WHERE code LIKE 'test\_%'")"

echo
echo "2. Les listes des assimilés : ce que fait la FNCT"
chk "les catégories de départ sont là, provisoires, chacune avec ses unités ; aucun flux ni texte légal n'est inventé" "9|9|0" \
    "$(sql "SELECT count(*) FROM elements_listes_nationales WHERE liste = 'categories_activite_assimiles' AND code IN ('cafe','restaurant','hotel','superette','boulangerie','marche','bureau','ecole','atelier')")|$(sql "SELECT count(*) FROM elements_listes_nationales WHERE liste = 'categories_activite_assimiles' AND code IN ('cafe','restaurant','hotel','superette','boulangerie','marche','bureau','ecole','atelier') AND provisoire AND cardinality(unites_echelle) > 0")|$(sql "SELECT count(*) FROM elements_listes_nationales WHERE liste IN ('flux_assimiles', 'base_legale_assimiles') AND reference LIKE 'Liste de départ%'")"
chk "la FNCT ajoute une catégorie (kiosque, au m²)" "201|m2" \
    "$(element categories_activite_assimiles "$T_F" '{"code":"test_kiosque","libelleFr":"TEST Kiosque","libelleAr":"كشك","dateEffet":"2000-01-01","unitesEchelle":["m2"]}')|$(val "','.join(d['unites_echelle'])")"
chk "… une catégorie qui ne s'appliquera qu'en 2030" 201 \
    "$(element categories_activite_assimiles "$T_F" '{"code":"test_tardive","libelleFr":"TEST Tardive","libelleAr":"متأخرة","dateEffet":"2030-01-01","unitesEchelle":["employe"]}')"
chk "… un flux dangereux" "201|True" \
    "$(element flux_assimiles "$T_F" '{"code":"test_huiles","libelleFr":"TEST Huiles usagées","libelleAr":"زيوت مستعملة","dateEffet":"2000-01-01","dangereux":true}')|$(val "d['dangereux']")"
chk "… un texte publié dont l'application attend un événement : sans date, « en attente »" "201|None|en_attente" \
    "$(element base_legale_assimiles "$T_F" '{"code":"test_decret_loi","libelleFr":"TEST Décret-loi","libelleAr":"مرسوم","dateEffet":null,"datePublication":"2026-09-30","provisoire":false,"reference":"TEST JORT n° 96"}')|$(val "d['date_effet']")|$(etat base_legale_assimiles test_decret_loi)"
ID_DL=$(sql "SELECT id FROM elements_listes_nationales WHERE code = 'test_decret_loi' AND retire_le IS NULL")
chk "… il n'est en vigueur à aucune date" 0 \
    "$(sql "SELECT count(*) FROM app.liste_nationale('base_legale_assimiles', DATE '2099-12-31') WHERE code = 'test_decret_loi'")"
chk "… et ne se ferme pas tant qu'il n'a pas de date d'application" 400 \
    "$(appel POST "/listes-assimiles/elements/$ID_DL/fin" "$T_F" '{"dateFin":"2027-01-01","reference":"TEST abrogation"}')"
chk "fixer sa date d'application sans pièce : 400" 400 \
    "$(appel POST "/listes-assimiles/elements/$ID_DL/application" "$T_F" '{"dateEffet":"2026-10-15"}')"
chk "… avant sa publication : 400" 400 \
    "$(appel POST "/listes-assimiles/elements/$ID_DL/application" "$T_F" '{"dateEffet":"2026-09-01","reference":"TEST proclamation"}')"
chk "… une commune ne la fixe pas" 403 \
    "$(appel POST "/listes-assimiles/elements/$ID_DL/application" "$T_A" '{"dateEffet":"2026-10-15","reference":"TEST proclamation"}')"
chk "la FNCT la fixe, avec sa pièce : le texte entre en vigueur" "200|2026-10-15|en_vigueur" \
    "$(appel POST "/listes-assimiles/elements/$ID_DL/application" "$T_F" '{"dateEffet":"2026-10-15","reference":"TEST proclamation des résultats"}')|$(val "d['date_effet']")|$(etat base_legale_assimiles test_decret_loi)"
chk "… une seule fois : la refixer est introuvable (404)" 404 \
    "$(appel POST "/listes-assimiles/elements/$ID_DL/application" "$T_F" '{"dateEffet":"2026-11-01","reference":"TEST seconde proclamation"}')"
chk "… et la base refuse de la réécrire" ELEMENT_FIGE \
    "$(en_base super_admin_fnct "$ID_F" "" "UPDATE elements_listes_nationales SET date_effet = DATE '2026-11-01' WHERE id = '$ID_DL'")"
chk "les listes du secteur informel n'ont pas bougé" "$PIECES_AVANT" \
    "$(sql "SELECT count(*) FROM app.liste_nationale('pieces_carte_precollecteur', app.jour_tunis())")"

# -----------------------------------------------------------------------------
echo
echo "3. Les grilles tarifaires : ce qui est refusé"
grille() { # référence date_effet [lignes] — un corps de grille
  printf '{"intitule":"TEST %s","referenceArrete":"%s","dateArrete":"2026-01-10","referenceDeliberation":"TEST délibération","dateDeliberation":"2026-01-05","dateEffet":"%s","lignes":%s}' \
    "$1" "$1" "$2" "${3:-[]}"
}
L_CAFE='{"categorie":"cafe","mode":"forfait_annuel","tarif":120}'
L_HOTEL='{"categorie":"hotel","mode":"reel_levee","tarif":3.5,"majorations":[{"critere":"surface_m2","borneMin":0,"borneMax":100,"effet":"coefficient","valeur":1,"ordre":1},{"critere":"surface_m2","borneMin":100,"effet":"coefficient","valeur":1.5,"ordre":1},{"critere":"frequence_hebdo","borneMin":4,"effet":"ajout","valeur":2,"ordre":2}]}'
chk "la FNCT ne fixe pas les tarifs d'une commune (403)" 403 \
    "$(appel POST "/grilles-tarifaires?communeId=$A" "$T_F" "$(grille TEST-F 2026-02-01 "[$L_CAFE]")")"
chk "un directeur n'écrit pas dans une autre commune : introuvable (404)" 404 \
    "$(appel POST "/grilles-tarifaires?communeId=$A" "$T_B" "$(grille TEST-B 2026-02-01 "[$L_CAFE]")")"
chk "une catégorie inconnue : 400, qui la nomme" "400|1" \
    "$(appel POST "/grilles-tarifaires?communeId=$A" "$T_A" "$(grille TEST-X 2026-02-01 '[{"categorie":"casino","mode":"forfait_annuel","tarif":10}]')")|$(val "1 if 'casino' in d['error'] else 0")"
chk "une catégorie qui n'est pas encore en vigueur à la date d'effet : 400" 400 \
    "$(appel POST "/grilles-tarifaires?communeId=$A" "$T_A" "$(grille TEST-X 2026-02-01 '[{"categorie":"test_tardive","mode":"forfait_annuel","tarif":10}]')")"
chk "deux tranches d'un critère qui se chevauchent : 400" 400 \
    "$(appel POST "/grilles-tarifaires?communeId=$A" "$T_A" "$(grille TEST-X 2026-02-01 '[{"categorie":"cafe","mode":"forfait_annuel","tarif":10,"majorations":[{"critere":"surface_m2","borneMin":0,"borneMax":100,"effet":"coefficient","valeur":1.2,"ordre":1},{"critere":"surface_m2","borneMin":50,"effet":"coefficient","valeur":1.5,"ordre":1}]}]')")"
chk "deux critères au même rang d'application : 400" 400 \
    "$(appel POST "/grilles-tarifaires?communeId=$A" "$T_A" "$(grille TEST-X 2026-02-01 '[{"categorie":"cafe","mode":"forfait_annuel","tarif":10,"majorations":[{"critere":"surface_m2","borneMin":0,"effet":"coefficient","valeur":1.2,"ordre":1},{"critere":"nb_points_vente","borneMin":2,"effet":"ajout","valeur":5,"ordre":1}]}]')")"
chk "une catégorie deux fois dans la même grille : 400" 400 \
    "$(appel POST "/grilles-tarifaires?communeId=$A" "$T_A" "$(grille TEST-X 2026-02-01 "[$L_CAFE,$L_CAFE]")")"
chk "un tarif nul : 400" 400 \
    "$(appel POST "/grilles-tarifaires?communeId=$A" "$T_A" "$(grille TEST-X 2026-02-01 '[{"categorie":"cafe","mode":"forfait_annuel","tarif":0}]')")"
chk "une date qui n'existe pas : 400, jamais 500" 400 \
    "$(appel POST "/grilles-tarifaires?communeId=$A" "$T_A" "$(grille TEST-X 2026-02-30 "[$L_CAFE]")")"
chk "aucune grille n'a été écrite par ces refus" 0 "$(sql "SELECT count(*) FROM grilles_tarifaires WHERE commune_id IN ($ESSAI)")"
chk "la base refuse une grille née approuvée" GRILLE_NAISSANCE \
    "$(en_base admin_commune "$ID_A" "$A" "INSERT INTO grilles_tarifaires (commune_id, reference_arrete, date_arrete, date_effet, date_approbation_tutelle, reference_approbation, approuve_le) VALUES ('$A', 'TEST', DATE '2026-01-10', DATE '2026-02-01', DATE '2026-01-20', 'TEST visa', now())")"

# -----------------------------------------------------------------------------
echo
echo "4. Le cycle d'une grille"
chk "le directeur enregistre un projet : deux tarifs, des majorations dans leur ordre" "201|projet|cafe,hotel|surface_m2,surface_m2,frequence_hebdo" \
    "$(appel POST "/grilles-tarifaires?communeId=$A" "$T_A" "$(grille TEST-ARRETE-1 2026-02-01 "[$L_CAFE,$L_HOTEL]")")|$(val "d['etat']")|$(val "','.join(l['categorie'] for l in d['lignes'])")|$(val "','.join(m['critere'] for m in d['lignes'][1]['majorations'])")"
G1=$(val "d['id']")
chk "… un projet ne s'applique jamais : aucune grille en vigueur" "None|None" \
    "$(appel GET "/grilles-tarifaires/en-vigueur?communeId=$A" "$T_A" >/dev/null; val "d['grille']")|$(vigueur "$ID_A" "$A" "$A" "app.jour_tunis()")"
chk "le projet se remplace : un seul tarif, le café à 150" "200|1|150.0" \
    "$(appel PUT "/grilles-tarifaires/$G1" "$T_A" "$(grille TEST-ARRETE-1 2026-02-01 '[{"categorie":"cafe","mode":"forfait_annuel","tarif":150}]')")|$(val "len(d['lignes'])")|$(val "float(d['lignes'][0]['tarif'])")"
chk "… les lignes remplacées sont retirées, pas effacées, avec leurs majorations" "2|3" \
    "$(sql "SELECT count(*) FROM lignes_grille WHERE grille_id = '$G1' AND deleted_at IS NOT NULL")|$(sql "SELECT count(*) FROM criteres_majoration m JOIN lignes_grille l ON l.id = m.ligne_id WHERE l.grille_id = '$G1' AND m.deleted_at IS NOT NULL")"
chk "la base refuse une approbation écrite sans sa procédure" "permission denied" \
    "$(en_base admin_commune "$ID_A" "$A" "UPDATE grilles_tarifaires SET date_approbation_tutelle = DATE '2026-01-20', reference_approbation = 'TEST', approuve_le = now() WHERE id = '$G1'")"
chk "une approbation datée de demain : 400" 400 \
    "$(appel POST "/grilles-tarifaires/$G1/approbation" "$T_A" "{\"dateApprobation\":\"$DEMAIN\",\"reference\":\"TEST visa\"}")"
chk "… avant l'arrêté : 400" 400 \
    "$(appel POST "/grilles-tarifaires/$G1/approbation" "$T_A" '{"dateApprobation":"2026-01-01","reference":"TEST visa"}')"
chk "… par la FNCT : 403" 403 \
    "$(appel POST "/grilles-tarifaires/$G1/approbation" "$T_F" '{"dateApprobation":"2026-01-20","reference":"TEST visa"}')"
chk "… par le directeur d'une autre commune : introuvable (404)" 404 \
    "$(appel POST "/grilles-tarifaires/$G1/approbation" "$T_B" '{"dateApprobation":"2026-01-20","reference":"TEST visa"}')"
appel POST "/grilles-tarifaires?communeId=$A" "$T_A" "$(grille TEST-VIDE 2027-06-01)" >/dev/null; GV=$(val "d['id']")
chk "une grille sans aucun tarif ne s'approuve pas (409)" 409 \
    "$(appel POST "/grilles-tarifaires/$GV/approbation" "$T_A" '{"dateApprobation":"2026-01-20","reference":"TEST visa"}')"
chk "le directeur enregistre l'approbation de la tutelle : la grille est en vigueur" "200|en_vigueur|2026-01-20|TEST visa du gouverneur" \
    "$(appel POST "/grilles-tarifaires/$G1/approbation" "$T_A" '{"dateApprobation":"2026-01-20","reference":"TEST visa du gouverneur"}')|$(val "d['etat']")|$(val "d['date_approbation_tutelle']")|$(val "d['reference_approbation']")"
chk "… c'est elle qui s'applique aujourd'hui" "$G1|$G1" \
    "$(appel GET "/grilles-tarifaires/en-vigueur?communeId=$A" "$T_A" >/dev/null; val "d['grille']['id']")|$(vigueur "$ID_A" "$A" "$A" "app.jour_tunis()")"
chk "… une approbation ne se refait pas (409)" 409 \
    "$(appel POST "/grilles-tarifaires/$G1/approbation" "$T_A" '{"dateApprobation":"2026-01-21","reference":"TEST second visa"}')"

echo
echo "5. Une grille approuvée est figée"
chk "elle ne se remplace plus (409)" 409 "$(appel PUT "/grilles-tarifaires/$G1" "$T_A" "$(grille TEST-ARRETE-1 2026-02-01 "[$L_CAFE]")")"
chk "elle ne se retire pas (409)" 409 "$(appel DELETE "/grilles-tarifaires/$G1" "$T_A")"
L1=$(sql "SELECT id FROM lignes_grille WHERE grille_id = '$G1' AND deleted_at IS NULL")
chk "la base refuse d'en réécrire l'arrêté" GRILLE_FIGEE \
    "$(en_base admin_commune "$ID_A" "$A" "UPDATE grilles_tarifaires SET reference_arrete = 'TEST autre' WHERE id = '$G1'")"
chk "… l'application n'a aucun droit de retirer une ligne directement" "permission denied" \
    "$(en_base admin_commune "$ID_A" "$A" "UPDATE lignes_grille SET deleted_at = now() WHERE id = '$L1'")"
chk "… et la procédure de retrait des lignes refuse une grille approuvée" GRILLE_FIGEE \
    "$(en_base admin_commune "$ID_A" "$A" "SELECT app.retirer_lignes_projet('$G1')")"
chk "… d'y ajouter une ligne" GRILLE_FIGEE \
    "$(en_base admin_commune "$ID_A" "$A" "INSERT INTO lignes_grille (grille_id, commune_id, categorie_code, mode, tarif) VALUES ('$G1', '$A', 'hotel', 'reel_levee', 4)")"
chk "… ou une majoration" GRILLE_FIGEE \
    "$(en_base admin_commune "$ID_A" "$A" "INSERT INTO criteres_majoration (ligne_id, commune_id, critere, borne_min, effet, valeur, ordre) VALUES ('$L1', '$A', 'surface_m2', 0, 'coefficient', 2, 1)")"
chk "… et de la retirer par app.supprimer" GRILLE_FIGEE \
    "$(en_base admin_commune "$ID_A" "$A" "SELECT app.supprimer('grilles_tarifaires', '$G1')")"
chk "aucun privilège de suppression sur les grilles" "f|f|f" \
    "$(sql "SELECT has_table_privilege('siipi_app', 'grilles_tarifaires', 'DELETE')")|$(sql "SELECT has_table_privilege('siipi_app', 'lignes_grille', 'DELETE')")|$(sql "SELECT has_table_privilege('siipi_app', 'criteres_majoration', 'DELETE')")"

echo
echo "6. Une seule grille approuvée à une date"
appel POST "/grilles-tarifaires?communeId=$A" "$T_A" "$(grille TEST-ARRETE-2 2026-06-01 "[$L_CAFE]")" >/dev/null; G2=$(val "d['id']")
chk "une seconde grille sur une période déjà couverte ne s'approuve pas (409), qui nomme la première" "409|1" \
    "$(appel POST "/grilles-tarifaires/$G2/approbation" "$T_A" '{"dateApprobation":"2026-05-10","reference":"TEST visa 2"}')|$(val "1 if 'TEST-ARRETE-1' in d['error'] else 0")"
chk "la première se clôt au 1er juin, avec sa pièce" "200|close|2026-06-01" \
    "$(appel POST "/grilles-tarifaires/$G1/cloture" "$T_A" '{"dateFin":"2026-06-01","reference":"TEST arrêté 2"}')|$(val "d['etat']")|$(val "d['date_fin']")"
chk "… une seule fois (409)" 409 "$(appel POST "/grilles-tarifaires/$G1/cloture" "$T_A" '{"dateFin":"2026-07-01","reference":"TEST arrêté 3"}')"
chk "… un projet ne se clôt pas, il se corrige (409)" 409 "$(appel POST "/grilles-tarifaires/$G2/cloture" "$T_A" '{"dateFin":"2026-07-01","reference":"TEST arrêté 3"}')"
chk "la seconde s'approuve alors" "200|en_vigueur" \
    "$(appel POST "/grilles-tarifaires/$G2/approbation" "$T_A" '{"dateApprobation":"2026-05-10","reference":"TEST visa 2"}')|$(val "d['etat']")"
chk "la grille d'une date est celle de son arrêté : mars, la première ; aujourd'hui, la seconde" "$G1|$G2|None" \
    "$(vigueur "$ID_A" "$A" "$A" "DATE '2026-03-01'")|$(vigueur "$ID_A" "$A" "$A" "app.jour_tunis()")|$(vigueur "$ID_A" "$A" "$A" "DATE '2026-01-15'")"
chk "… et le directeur de B n'en lit aucune pour A" None "$(vigueur "$ID_B" "$B" "$A" "app.jour_tunis()")"
# Deux approbations simultanées de deux projets qui se chevauchent : la
# procédure verrouille la commune, une seule passe. La course se joue en base,
# deux sessions : par l'API, deux requêtes du même compte se suivent, et l'essai
# ne prouverait rien. La première approuve puis garde sa transaction ouverte ;
# la seconde arrive pendant ce temps. Avec le verrou, elle attend, voit la
# première et refuse ; sans lui, elle ne la voit pas et passe.
$PSQL -c "UPDATE grilles_tarifaires SET date_fin = DATE '2027-01-01', reference_fin = 'TEST arrêté 3' WHERE id = '$G2'" >/dev/null
appel POST "/grilles-tarifaires?communeId=$A" "$T_A" "$(grille TEST-ARRETE-3 2027-01-01 "[$L_CAFE]")" >/dev/null; G3=$(val "d['id']")
appel POST "/grilles-tarifaires?communeId=$A" "$T_A" "$(grille TEST-ARRETE-4 2027-03-01 "[$L_CAFE]")" >/dev/null; G4=$(val "d['id']")
approuver_en_base() { # grille attente_avant attente_apres
  $PSQL -c "BEGIN; SELECT set_config('app.role', 'admin_commune', true), set_config('app.user_id', '$ID_A', true), set_config('app.commune_id', '$A', true);
            SET LOCAL ROLE siipi_app; SELECT pg_sleep($2); SELECT 'ok:' FROM app.approuver_grille('$1', '$AUJ', 'TEST visa simultané');
            SELECT pg_sleep($3); COMMIT;" 2>&1 | grep -oE '^ok:|GRILLE_[A-Z]+' | head -1
}
approuver_en_base "$G3" 0 2 > "$T/course3" & approuver_en_base "$G4" 0.5 0 > "$T/course4" & wait
chk "deux approbations simultanées de grilles qui se chevauchent : une seule passe, la seconde attend et refuse" "ok:|GRILLE_CHEVAUCHEMENT|1" \
    "$(cat "$T/course3")|$(cat "$T/course4")|$(sql "SELECT count(*) FROM grilles_tarifaires WHERE id IN ('$G3', '$G4') AND date_approbation_tutelle IS NOT NULL")"
chk "un projet se retire (204), et reste en base, retiré" "204|1" \
    "$(appel DELETE "/grilles-tarifaires/$GV" "$T_A")|$(sql "SELECT count(*) FROM grilles_tarifaires WHERE id = '$GV' AND deleted_at IS NOT NULL AND deleted_by = '$ID_A'")"

# -----------------------------------------------------------------------------
echo
echo "7. Qui lit quoi"
chk "la FNCT lit les grilles de A" 4 "$(appel GET "/grilles-tarifaires?communeId=$A" "$T_F" >/dev/null; val "len(d)")"
chk "le directeur de B ne voit aucune grille de A, ni par la liste ni par son identifiant" "0|404" \
    "$(appel GET "/grilles-tarifaires?communeId=$A" "$T_B" >/dev/null; val "len(d)")|$(appel GET "/grilles-tarifaires/$G1" "$T_B")"
chk "un prestataire de A n'y a pas accès (403), et la base ne lui en montre aucune ligne" "403|0|0" \
    "$(appel GET "/grilles-tarifaires?communeId=$A" "$T_P")|$($PSQL -c "BEGIN; SELECT set_config('app.role', 'gestionnaire_prestataire', true), set_config('app.user_id', '$ID_P', true), set_config('app.commune_id', '$A', true); SET LOCAL ROLE siipi_app; SELECT 'n:' || count(*) FROM grilles_tarifaires; ROLLBACK;" 2>&1 | grep -oE '^n:[0-9]+' | cut -d: -f2)|$($PSQL -c "BEGIN; SELECT set_config('app.role', 'gestionnaire_prestataire', true), set_config('app.user_id', '$ID_P', true), set_config('app.commune_id', '$A', true); SET LOCAL ROLE siipi_app; SELECT 'n:' || count(*) FROM lignes_grille; ROLLBACK;" 2>&1 | grep -oE '^n:[0-9]+' | cut -d: -f2)"
chk "une commune lit les listes nationales (pour sa grille)" "200|3" \
    "$(appel GET /listes-assimiles "$T_A")|$(val "len(d['listes'])")"
chk "le journal d'audit garde l'approbation et la clôture" "t|t" \
    "$(sql "SELECT count(*) > 0 FROM audit_log WHERE table_name = 'grilles_tarifaires' AND record_id = '$G1' AND 'date_approbation_tutelle' = ANY (changed_fields)")|$(sql "SELECT count(*) > 0 FROM audit_log WHERE table_name = 'grilles_tarifaires' AND record_id = '$G1' AND 'date_fin' = ANY (changed_fields)")"

echo
base_reelle_intacte "pendant la campagne"

# -----------------------------------------------------------------------------
# La table nationale d'abord : effacer le compte de la FNCT mettrait à vide
# l'auteur des éléments qu'il a inscrits, ce que le figement des éléments refuse.
rendre_tables_nationales
nettoyer
T=$(mktemp -d)
chk "en partant : les communes de test, leurs grilles et les comptes temporaires sont effacés" "0|0|0" \
    "$(sql "SELECT count(*) FROM communes WHERE id IN ($ESSAI)")|$(sql "SELECT count(*) FROM grilles_tarifaires WHERE commune_id IN ($ESSAI)")|$(sql "SELECT count(*) FROM users WHERE email LIKE 'test.compte.%@siipi.tn'")"
base_reelle_intacte "en partant"
tables_nationales_rendues "en partant"

echo
if [ "$fail" -eq 0 ]; then
  printf '\033[32m%s tests réussis, aucun échec.\033[0m\n\n' "$pass"; exit 0
else
  printf '\033[31m%s réussis, %s ÉCHOUÉS.\033[0m\n\n' "$pass" "$fail"; exit 1
fi
