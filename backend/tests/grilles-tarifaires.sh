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
#   - un montant qui ne tient pas dans la base (trop grand, ou plus fin que le
#     millime), une année 0000, un octet nul dans l'identifiant de commune ou
#     dans un texte ;
#   - toute modification d'une grille approuvée, de ses lignes, de ses
#     majorations ; son retrait ; une seconde grille approuvée sur la même
#     période — même quand les deux approbations arrivent en même temps ; une
#     approbation qui contrôlerait un projet en train d'être remplacé ; une ligne
#     ou une majoration ajoutée, ou retirée, pendant qu'une approbation est en cours.
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
    | grep -oE '^ERROR: +[A-Z_]+:|permission denied|violates row-level security|violates (check|unique) constraint "[a-z_]+"' | head -1 \
    | sed -E 's/^ERROR: +//; s/:$//; s/violates (check|unique) constraint "([a-z_]+)"/\2/' | grep . || echo ok
}

. tests/outils/communes_essai.sh
# Les restes d'une campagne tuée (un SIGKILL, au redémarrage du conteneur, ne
# laisse pas courir le piège de sortie) : ses communes de test, avec leurs
# grilles approuvées, et ses éléments TEST des listes des assimilés. Ils
# s'effacent AVANT comptes_temporaires.sh, dont la purge des comptes orphelins
# en dépend : effacer un compte remet à vide l'auteur de ce qu'il a écrit, ce
# qu'une grille approuvée et un élément de liste refusent (figés). Sans cela, la
# purge échouait en silence, les comptes restaient, et la table gardée ci-dessous
# aurait pris les restes pour son état de référence.
effacer_communes_essai "$ESSAI"
$PSQL -c "DELETE FROM elements_listes_nationales
           WHERE liste IN ('categories_activite_assimiles', 'flux_assimiles', 'base_legale_assimiles')
             AND code LIKE 'test\_%' AND libelle_fr LIKE 'TEST%'" >/dev/null
. tests/outils/comptes_temporaires.sh
. tests/outils/base_reelle.sh
. tests/outils/tables_nationales.sh
nettoyer() {
  effacer_communes_essai "$ESSAI"
  retirer_comptes_temporaires
}
garder_tables_nationales elements_listes_nationales
trap 'rendre_tables_nationales; nettoyer; rm -rf "$T" "$TABLES_NATIONALES_DIR"' EXIT
releve_base_reelle
chk "au départ, aucun reste d'une campagne précédente : ni élément TEST des listes des assimilés, ni compte temporaire" "0|0" \
    "$(sql "SELECT count(*) FROM elements_listes_nationales WHERE liste IN ('categories_activite_assimiles', 'flux_assimiles', 'base_legale_assimiles') AND code LIKE 'test\_%'")|$(sql "SELECT count(*) FROM users WHERE email LIKE 'test.compte.%@siipi.tn'")"

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
# Une course ne prouve rien si la session concurrente n'a pas attendu : sur une
# machine chargée, elle peut partir après la fin de l'autre et donner le refus
# attendu sans qu'aucun verrou ait servi — un succès à vide. Chaque session
# concurrente porte un nom (application_name) ; pendant que l'autre tient le
# verrou, on la voit l'attendre.
attendre_verrou() { # préfixe nombre — « attente » quand ce nombre de sessions de ce nom attendent un verrou
  local i=0
  while [ $i -lt 80 ]; do
    [ "$(sql "SELECT count(*) FROM pg_stat_activity WHERE application_name LIKE '$1%' AND wait_event_type = 'Lock'")" = "$2" ] && { echo attente; return 0; }
    sleep 0.1; i=$((i + 1))
  done
  echo aucune-attente
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
chk "une catégorie datée d'avant 2000 : 400 (seul un texte légal remonte plus loin)" 400 \
    "$(element categories_activite_assimiles "$T_F" '{"code":"test_kiosque","libelleFr":"TEST Kiosque","libelleAr":"كشك","dateEffet":"1990-01-01","unitesEchelle":["m2"]}')"
chk "une publication au JORT d'avant 1956 : 400, qui le dit" "400|1" \
    "$(element base_legale_assimiles "$T_F" '{"code":"test_loi_x","libelleFr":"TEST Loi","libelleAr":"قانون","dateEffet":null,"datePublication":"1950-01-01","provisoire":false,"reference":"TEST JORT n° 1"}')|$(val "1 if '1956' in json.dumps(d, ensure_ascii=False) else 0")"
chk "l'an 0000 : 400, jamais 500" 400 \
    "$(element flux_assimiles "$T_F" '{"code":"test_huiles","libelleFr":"TEST Huiles","libelleAr":"زيوت","dateEffet":"0000-01-01","dangereux":true}')"
chk "un libellé qui porte un octet nul : 400, qui le dit, jamais 500" "400|1" \
    "$(element flux_assimiles "$T_F" '{"code":"test_huiles","libelleFr":"TEST\u0000Huiles","libelleAr":"زيوت","dateEffet":"2000-01-01","dangereux":true}')|$(val "1 if 'caractère nul' in json.dumps(d, ensure_ascii=False) else 0")"
chk "la base refuse d'elle-même un attribut porté par la mauvaise liste" elements_attributs_par_liste \
    "$(en_base super_admin_fnct "$ID_F" "" "INSERT INTO elements_listes_nationales (liste, code, libelle_fr, libelle_ar, date_effet, dangereux) VALUES ('categories_activite_assimiles', 'test_y', 'Y', 'ي', DATE '2000-01-01', true)")"
chk "… et une date d'application vide hors de la base légale" elements_date_attendue \
    "$(en_base super_admin_fnct "$ID_F" "" "INSERT INTO elements_listes_nationales (liste, code, libelle_fr, libelle_ar, date_effet, dangereux) VALUES ('flux_assimiles', 'test_y', 'Y', 'ي', NULL, false)")"
chk "aucun élément TEST n'a été écrit par ces refus" 0 \
    "$(sql "SELECT count(*) FROM elements_listes_nationales WHERE code LIKE 'test\_%'")"

echo
echo "2. Les listes des assimilés : ce que fait la FNCT"
EN_VIGUEUR="len([e for l in d['listes'] if l['liste']=='categories_activite_assimiles' for e in l['elements'] if e['etat']=='en_vigueur'])"
N0=$(appel GET /listes-assimiles "$T_F" >/dev/null; val "$EN_VIGUEUR")
# Un flux ou un texte légal posé par la migration n'aurait pas d'auteur : il
# n'y en a aucun, seule la FNCT les inscrit.
chk "les catégories de départ sont là, ouvertes, provisoires, chacune avec ses unités ; aucun flux ni texte légal n'est inventé" "9|9|0" \
    "$(sql "SELECT count(*) FROM elements_listes_nationales WHERE liste = 'categories_activite_assimiles' AND retire_le IS NULL AND date_fin IS NULL AND code IN ('cafe','restaurant','hotel','superette','boulangerie','marche','bureau','ecole','atelier')")|$(sql "SELECT count(*) FROM elements_listes_nationales WHERE liste = 'categories_activite_assimiles' AND retire_le IS NULL AND date_fin IS NULL AND code IN ('cafe','restaurant','hotel','superette','boulangerie','marche','bureau','ecole','atelier') AND provisoire AND cardinality(unites_echelle) > 0")|$(sql "SELECT count(*) FROM elements_listes_nationales WHERE liste IN ('flux_assimiles', 'base_legale_assimiles') AND saisi_par IS NULL")"
chk "la FNCT ajoute une catégorie (kiosque, au m²)" "201|m2" \
    "$(element categories_activite_assimiles "$T_F" '{"code":"test_kiosque","libelleFr":"TEST Kiosque","libelleAr":"كشك","dateEffet":"2000-01-01","unitesEchelle":["m2"]}')|$(val "','.join(d['unites_echelle'])")"
chk "… une catégorie qui ne s'appliquera qu'en 2030" 201 \
    "$(element categories_activite_assimiles "$T_F" '{"code":"test_tardive","libelleFr":"TEST Tardive","libelleAr":"متأخرة","dateEffet":"2030-01-01","unitesEchelle":["employe"]}')"
chk "… une catégorie qui servira un projet, puis sera fermée" 201 \
    "$(element categories_activite_assimiles "$T_F" '{"code":"test_ephemere","libelleFr":"TEST Éphémère","libelleAr":"عابرة","dateEffet":"2000-01-01","unitesEchelle":["m2"]}')"
chk "… une catégorie inscrite par erreur" 201 \
    "$(element categories_activite_assimiles "$T_F" '{"code":"test_erreur","libelleFr":"TEST Inscrite par erreur","libelleAr":"خطأ","dateEffet":"2000-01-01","unitesEchelle":["m2"]}')"
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
chk "un texte légal appliqué depuis 1996 (avant 2000) s'inscrit" "201|1996-07-01" \
    "$(element base_legale_assimiles "$T_F" '{"code":"test_loi_96","libelleFr":"TEST Loi de 1996","libelleAr":"قانون 1996","dateEffet":"1996-07-01","datePublication":"1996-06-24","provisoire":false,"reference":"TEST JORT n° 52"}')|$(val "d['date_effet']")"
ID_K=$(sql "SELECT id FROM elements_listes_nationales WHERE code = 'test_kiosque' AND retire_le IS NULL")
chk "la FNCT ferme une catégorie à une date, avec son texte" "200|2030-01-01" \
    "$(appel POST "/listes-assimiles/elements/$ID_K/fin" "$T_F" '{"dateFin":"2030-01-01","reference":"TEST arrêté de fin"}')|$(val "d['date_fin']")"
chk "… une seule fois (409)" 409 \
    "$(appel POST "/listes-assimiles/elements/$ID_K/fin" "$T_F" '{"dateFin":"2031-01-01","reference":"TEST second arrêté"}')"
ID_ERR=$(sql "SELECT id FROM elements_listes_nationales WHERE code = 'test_erreur' AND retire_le IS NULL")
chk "la FNCT retire un élément inscrit à tort : il reste en base, retiré, avec son motif" "200|1" \
    "$(appel POST "/listes-assimiles/elements/$ID_ERR/retrait" "$T_F" '{"motif":"TEST inscrite par erreur"}')|$(sql "SELECT count(*) FROM elements_listes_nationales WHERE id = '$ID_ERR' AND retire_le IS NOT NULL AND motif_retrait = 'TEST inscrite par erreur'")"
# zod compte les unités UTF-16, la base les caractères : « n°𝟓𝟐 » fait six unités
# et quatre caractères. Le refus vient de l'API, en clair, pas d'une contrainte.
ID_H=$(sql "SELECT id FROM elements_listes_nationales WHERE code = 'test_huiles' AND retire_le IS NULL")
chk "un motif de retrait qui ne fait cinq caractères qu'en unités UTF-16 : 400, qui le dit ; l'élément n'est pas retiré" "400|1|1" \
    "$(appel POST "/listes-assimiles/elements/$ID_H/retrait" "$T_F" '{"motif":"n°\ud835\udfd3\ud835\udfd0"}')|$(val "1 if '5 caractères' in json.dumps(d, ensure_ascii=False) else 0")|$(sql "SELECT count(*) FROM elements_listes_nationales WHERE id = '$ID_H' AND retire_le IS NULL")"
# Depuis 098, la table porte aussi les listes des assimilés : les routes du
# secteur informel ne touchent que les leurs. La sonde vise une catégorie de la
# campagne, jamais une réelle : si la route régressait, c'est elle qui serait
# fermée puis retirée, et le rendu de la table l'efface en partant.
chk "… une catégorie pour éprouver la portée des routes du secteur informel" 201 \
    "$(element categories_activite_assimiles "$T_F" '{"code":"test_portee","libelleFr":"TEST Portée des routes","libelleAr":"نطاق","dateEffet":"2000-01-01","unitesEchelle":["m2"]}')"
ID_PORTEE=$(sql "SELECT id FROM elements_listes_nationales WHERE code = 'test_portee' AND retire_le IS NULL AND date_fin IS NULL")
chk "les routes du secteur informel ne ferment ni ne retirent une catégorie des assimilés (404), et refusent une date impossible (400, jamais 500)" "404|404|400|1" \
    "$(appel POST "/regles-informel/elements/$ID_PORTEE/fin" "$T_F" '{"dateFin":"2031-01-01","reference":"TEST portée des routes"}')|$(appel POST "/regles-informel/elements/$ID_PORTEE/retrait" "$T_F" '{"motif":"TEST portée des routes"}')|$(appel POST "/regles-informel/elements/$ID_PORTEE/fin" "$T_F" '{"dateFin":"2026-02-30","reference":"TEST portée des routes"}')|$(sql "SELECT count(*) FROM elements_listes_nationales WHERE id = '$ID_PORTEE' AND retire_le IS NULL AND date_fin IS NULL")"
chk "les listes du secteur informel n'ont pas bougé" "$PIECES_AVANT" \
    "$(sql "SELECT count(*) FROM app.liste_nationale('pieces_carte_precollecteur', app.jour_tunis())")"

# -----------------------------------------------------------------------------
echo
echo "3. Les grilles tarifaires : ce qui est refusé"
grille() { # référence date_effet [lignes] [version] — un corps de grille (avec la version lue, pour un remplacement)
  printf '{"intitule":"TEST %s","referenceArrete":"%s","dateArrete":"2026-01-10","referenceDeliberation":"TEST délibération","dateDeliberation":"2026-01-05","dateEffet":"%s","lignes":%s%s}' \
    "$1" "$1" "$2" "${3:-[]}" "${4:+,\"version\":\"$4\"}"
}
# La version d'une grille : le xmin de sa ligne, que l'API rend sous « version ».
version_de() { sql "SELECT xmin FROM grilles_tarifaires WHERE id = '$1'"; }
approbation() { # grille date pièce [version] — un corps d'approbation, avec la version lue (ou celle donnée)
  printf '{"dateApprobation":"%s","reference":"%s","version":"%s"}' "$2" "$3" "${4:-$(version_de "$1")}"
}
L_CAFE='{"categorie":"cafe","mode":"forfait_annuel","tarif":120}'
L_HOTEL='{"categorie":"hotel","mode":"reel_levee","tarif":3.5,"majorations":[{"critere":"surface_m2","borneMin":0,"borneMax":100,"effet":"coefficient","valeur":1,"ordre":1},{"critere":"surface_m2","borneMin":100,"effet":"coefficient","valeur":1.5,"ordre":1},{"critere":"frequence_hebdo","borneMin":4,"effet":"ajout","valeur":2,"ordre":2}]}'
chk "la FNCT ne fixe pas les tarifs d'une commune (403)" 403 \
    "$(appel POST "/grilles-tarifaires?communeId=$A" "$T_F" "$(grille TEST-F 2026-02-01 "[$L_CAFE]")")"
chk "un directeur n'écrit pas dans une autre commune : introuvable (404)" 404 \
    "$(appel POST "/grilles-tarifaires?communeId=$A" "$T_B" "$(grille TEST-B 2026-02-01 "[$L_CAFE]")")"
chk "une catégorie inconnue : 400, qui la nomme" "400|1" \
    "$(appel POST "/grilles-tarifaires?communeId=$A" "$T_A" "$(grille TEST-X 2026-02-01 '[{"categorie":"casino","mode":"forfait_annuel","tarif":10}]')")|$(val "1 if 'casino' in d['error'] else 0")"
chk "une catégorie retirée : 400" 400 \
    "$(appel POST "/grilles-tarifaires?communeId=$A" "$T_A" "$(grille TEST-X 2026-02-01 '[{"categorie":"test_erreur","mode":"forfait_annuel","tarif":10}]')")"
chk "une catégorie fermée au 1er janvier 2030, dans une grille qui commence ce jour-là : 400" 400 \
    "$(appel POST "/grilles-tarifaires?communeId=$A" "$T_A" "$(grille TEST-X 2030-01-01 '[{"categorie":"test_kiosque","mode":"forfait_annuel","tarif":10}]')")"
chk "une adresse mal encodée (%E0) : 400, jamais 500, même sans compte" "400|400" \
    "$(appel GET "/grilles-tarifaires/%E0" "")|$(appel POST "/listes-assimiles/elements/%E0/retrait" "$T_F" '{"motif":"TEST motif"}')"
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
chk "un tarif plus grand que ce que la base tient : 400, jamais 500" 400 \
    "$(appel POST "/grilles-tarifaires?communeId=$A" "$T_A" "$(grille TEST-X 2026-02-01 '[{"categorie":"cafe","mode":"forfait_annuel","tarif":10000000000}]')")"
chk "un tarif plus fin que le millime (que la base arrondirait à zéro) : 400" 400 \
    "$(appel POST "/grilles-tarifaires?communeId=$A" "$T_A" "$(grille TEST-X 2026-02-01 '[{"categorie":"cafe","mode":"forfait_annuel","tarif":0.0004}]')")"
chk "un coefficient trop grand : 400" 400 \
    "$(appel POST "/grilles-tarifaires?communeId=$A" "$T_A" "$(grille TEST-X 2026-02-01 '[{"categorie":"cafe","mode":"forfait_annuel","tarif":10,"majorations":[{"critere":"surface_m2","borneMin":0,"effet":"coefficient","valeur":10000000000,"ordre":1}]}]')")"
chk "l'an 0000 : 400, jamais 500" 400 \
    "$(appel POST "/grilles-tarifaires?communeId=$A" "$T_A" "$(grille TEST-X 0000-02-01 "[$L_CAFE]")")"
chk "un intitulé qui porte un octet nul : 400, qui le dit, jamais 500" "400|1" \
    "$(appel POST "/grilles-tarifaires?communeId=$A" "$T_A" '{"intitule":"TEST\u0000nul","referenceArrete":"TEST-NUL","dateArrete":"2026-01-10","dateEffet":"2026-02-01","lignes":[{"categorie":"cafe","mode":"forfait_annuel","tarif":10}]}')|$(val "1 if 'caractère nul' in json.dumps(d, ensure_ascii=False) else 0")"
chk "un octet nul dans l'identifiant de commune : introuvable (404), jamais 500" "404|404" \
    "$(appel GET "/grilles-tarifaires?communeId=$A%00" "$T_A")|$(appel POST "/grilles-tarifaires?communeId=$A%00" "$T_A" "$(grille TEST-X 2026-02-01 "[$L_CAFE]")")"
chk "une date qui n'existe pas : 400, jamais 500" 400 \
    "$(appel POST "/grilles-tarifaires?communeId=$A" "$T_A" "$(grille TEST-X 2026-02-30 "[$L_CAFE]")")"
chk "aucune grille n'a été écrite par ces refus" 0 "$(sql "SELECT count(*) FROM grilles_tarifaires WHERE commune_id IN ($ESSAI)")"
chk "la base refuse une grille née approuvée" GRILLE_NAISSANCE \
    "$(en_base admin_commune "$ID_A" "$A" "INSERT INTO grilles_tarifaires (commune_id, reference_arrete, date_arrete, date_effet, date_approbation_tutelle, reference_approbation, approuve_le) VALUES ('$A', 'TEST', DATE '2026-01-10', DATE '2026-02-01', DATE '2026-01-20', 'TEST visa', now())")"
# Le contrôle des trois décimales est exact : une tolérance refusait des montants
# valides au-delà de dix millions (542 235 156,182 en est un).
chk "… mais un grand montant au millime près s'enregistre tel quel (dans B, un projet)" "201|542235156.182" \
    "$(appel POST "/grilles-tarifaires?communeId=$B" "$T_B" "$(grille TEST-GRAND 2026-02-01 '[{"categorie":"cafe","mode":"forfait_annuel","tarif":542235156.182}]')")|$(val "d['lignes'][0]['tarif']")"
# Les mêmes catégories, à leurs dates : la règle est la date, pas la catégorie.
chk "… la catégorie de 2030 s'emploie dans un projet qui commence le 1er janvier 2030 (dans B)" 201 \
    "$(appel POST "/grilles-tarifaires?communeId=$B" "$T_B" "$(grille TEST-TARDIVE 2030-01-01 '[{"categorie":"test_tardive","mode":"forfait_annuel","tarif":10}]')")"
chk "… et celle fermée au 1er janvier 2030, dans un projet qui commence la veille (dans B)" 201 \
    "$(appel POST "/grilles-tarifaires?communeId=$B" "$T_B" "$(grille TEST-VEILLE 2029-12-31 '[{"categorie":"test_kiosque","mode":"forfait_annuel","tarif":10}]')")"

# -----------------------------------------------------------------------------
echo
echo "4. Le cycle d'une grille"
chk "le directeur enregistre un projet : deux tarifs, des majorations dans leur ordre" "201|projet|cafe,hotel|surface_m2,surface_m2,frequence_hebdo" \
    "$(appel POST "/grilles-tarifaires?communeId=$A" "$T_A" "$(grille TEST-ARRETE-1 2026-02-01 "[$L_CAFE,$L_HOTEL]")")|$(val "d['etat']")|$(val "','.join(l['categorie'] for l in d['lignes'])")|$(val "','.join(m['critere'] for m in d['lignes'][1]['majorations'])")"
G1=$(val "d['id']")
V1=$(version_de "$G1")
chk "… l'API rend la version de la grille, celle de la base" "$V1" "$(val "d['version']")"
chk "… un projet ne s'applique jamais : aucune grille en vigueur" "None|None" \
    "$(appel GET "/grilles-tarifaires/en-vigueur?communeId=$A" "$T_A" >/dev/null; val "d['grille']")|$(vigueur "$ID_A" "$A" "$A" "app.jour_tunis()")"
chk "le projet se remplace : un seul tarif, le café à 150" "200|1|150.0" \
    "$(appel PUT "/grilles-tarifaires/$G1" "$T_A" "$(grille TEST-ARRETE-1 2026-02-01 '[{"categorie":"cafe","mode":"forfait_annuel","tarif":150}]' "$V1")")|$(val "len(d['lignes'])")|$(val "float(d['lignes'][0]['tarif'])")"
chk "… les lignes remplacées sont retirées, pas effacées, avec leurs majorations" "2|3" \
    "$(sql "SELECT count(*) FROM lignes_grille WHERE grille_id = '$G1' AND deleted_at IS NOT NULL")|$(sql "SELECT count(*) FROM criteres_majoration m JOIN lignes_grille l ON l.id = m.ligne_id WHERE l.grille_id = '$G1' AND m.deleted_at IS NOT NULL")"
# Deux directeurs, ou deux onglets : chacun écrit avec la version qu'il a lue.
# Celui qui écrit sur une version dépassée est refusé, et rien n'est écrit.
chk "un remplacement sans la version lue : 400" 400 \
    "$(appel PUT "/grilles-tarifaires/$G1" "$T_A" "$(grille TEST-ARRETE-1 2026-02-01 "[$L_CAFE]")")"
chk "… avec la version d'avant le remplacement : 409, et le projet ne bouge pas (le café reste à 150)" "409|150.0" \
    "$(appel PUT "/grilles-tarifaires/$G1" "$T_A" "$(grille TEST-ARRETE-1 2026-02-01 "[$L_CAFE]" "$V1")")|$(appel GET "/grilles-tarifaires/$G1" "$T_A" >/dev/null; val "float(d['lignes'][0]['tarif'])")"
chk "une approbation sans la version lue : 400" 400 \
    "$(appel POST "/grilles-tarifaires/$G1/approbation" "$T_A" '{"dateApprobation":"2026-01-20","reference":"TEST visa"}')"
chk "… sur une version dépassée (celle d'avant le remplacement) : 409, qui dit de relire ; la grille reste un projet" "409|1|projet" \
    "$(appel POST "/grilles-tarifaires/$G1/approbation" "$T_A" "$(approbation "$G1" 2026-01-20 "TEST visa" "$V1")")|$(val "1 if 'changé' in d['error'] else 0")|$(appel GET "/grilles-tarifaires/$G1" "$T_A" >/dev/null; val "d['etat']")"
chk "la base refuse, sur un projet, une catégorie en double et un tarif nul" "uq_ligne_grille_categorie|lignes_grille_tarif_positif" \
    "$(en_base admin_commune "$ID_A" "$A" "INSERT INTO lignes_grille (grille_id, commune_id, categorie_code, mode, tarif) VALUES ('$G1', '$A', 'cafe', 'forfait_mensuel', 10)")|$(en_base admin_commune "$ID_A" "$A" "INSERT INTO lignes_grille (grille_id, commune_id, categorie_code, mode, tarif) VALUES ('$G1', '$A', 'hotel', 'reel_levee', 0)")"
# Même un administrateur de la base, qui a tous les droits sur la table, ne pose
# pas une approbation hors de sa procédure : c'est le déclencheur qui la garde.
chk "même sans la garde des droits, la base refuse une approbation hors de sa procédure" GRILLE_APPROBATION \
    "$($PSQL -c "BEGIN; UPDATE grilles_tarifaires SET date_approbation_tutelle = DATE '2026-01-20', reference_approbation = 'TEST', approuve_le = now() WHERE id = '$G1'; ROLLBACK;" 2>&1 | grep -oE 'GRILLE_[A-Z]+' | head -1)"
chk "la base refuse une approbation écrite sans sa procédure" "permission denied" \
    "$(en_base admin_commune "$ID_A" "$A" "UPDATE grilles_tarifaires SET date_approbation_tutelle = DATE '2026-01-20', reference_approbation = 'TEST', approuve_le = now() WHERE id = '$G1'")"
chk "une approbation datée de demain : 400" 400 \
    "$(appel POST "/grilles-tarifaires/$G1/approbation" "$T_A" "$(approbation "$G1" "$DEMAIN" "TEST visa")")"
chk "… avant l'arrêté : 400" 400 \
    "$(appel POST "/grilles-tarifaires/$G1/approbation" "$T_A" "$(approbation "$G1" 2026-01-01 "TEST visa")")"
chk "… par la FNCT : 403" 403 \
    "$(appel POST "/grilles-tarifaires/$G1/approbation" "$T_F" "$(approbation "$G1" 2026-01-20 "TEST visa")")"
chk "… par le directeur d'une autre commune : introuvable (404)" 404 \
    "$(appel POST "/grilles-tarifaires/$G1/approbation" "$T_B" "$(approbation "$G1" 2026-01-20 "TEST visa")")"
chk "… une pièce qui ne fait trois caractères qu'en unités UTF-16 : 400, qui le dit" "400|1" \
    "$(appel POST "/grilles-tarifaires/$G1/approbation" "$T_A" "$(approbation "$G1" 2026-01-20 'V\ud835\udfcf')")|$(val "1 if '3 caractères' in json.dumps(d, ensure_ascii=False) else 0")"
appel POST "/grilles-tarifaires?communeId=$A" "$T_A" "$(grille TEST-VIDE 2027-06-01)" >/dev/null; GV=$(val "d['id']")
chk "une grille sans aucun tarif ne s'approuve pas (409)" 409 \
    "$(appel POST "/grilles-tarifaires/$GV/approbation" "$T_A" "$(approbation "$GV" 2026-01-20 "TEST visa")")"
chk "le directeur enregistre l'approbation de la tutelle : la grille est en vigueur" "200|en_vigueur|2026-01-20|TEST visa du gouverneur" \
    "$(appel POST "/grilles-tarifaires/$G1/approbation" "$T_A" "$(approbation "$G1" 2026-01-20 "TEST visa du gouverneur")")|$(val "d['etat']")|$(val "d['date_approbation_tutelle']")|$(val "d['reference_approbation']")"
chk "… c'est elle qui s'applique aujourd'hui" "$G1|$G1" \
    "$(appel GET "/grilles-tarifaires/en-vigueur?communeId=$A" "$T_A" >/dev/null; val "d['grille']['id']")|$(vigueur "$ID_A" "$A" "$A" "app.jour_tunis()")"
chk "… une approbation ne se refait pas (409)" 409 \
    "$(appel POST "/grilles-tarifaires/$G1/approbation" "$T_A" "$(approbation "$G1" 2026-01-21 "TEST second visa")")"

echo
echo "5. Une grille approuvée est figée"
chk "elle ne se remplace plus (409)" 409 "$(appel PUT "/grilles-tarifaires/$G1" "$T_A" "$(grille TEST-ARRETE-1 2026-02-01 "[$L_CAFE]")")"
chk "elle ne se retire pas (409)" 409 "$(appel DELETE "/grilles-tarifaires/$G1?version=$(version_de "$G1")" "$T_A")"
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
    "$(appel POST "/grilles-tarifaires/$G2/approbation" "$T_A" "$(approbation "$G2" 2026-05-10 "TEST visa 2")")|$(val "1 if 'TEST-ARRETE-1' in d['error'] else 0")"
chk "la première se clôt au 1er juin, avec sa pièce" "200|close|2026-06-01" \
    "$(appel POST "/grilles-tarifaires/$G1/cloture" "$T_A" '{"dateFin":"2026-06-01","reference":"TEST arrêté 2"}')|$(val "d['etat']")|$(val "d['date_fin']")"
chk "… une seule fois (409)" 409 "$(appel POST "/grilles-tarifaires/$G1/cloture" "$T_A" '{"dateFin":"2026-07-01","reference":"TEST arrêté 3"}')"
chk "… un projet ne se clôt pas, il se corrige (409)" 409 "$(appel POST "/grilles-tarifaires/$G2/cloture" "$T_A" '{"dateFin":"2026-07-01","reference":"TEST arrêté 3"}')"
chk "la seconde s'approuve alors" "200|en_vigueur" \
    "$(appel POST "/grilles-tarifaires/$G2/approbation" "$T_A" "$(approbation "$G2" 2026-05-10 "TEST visa 2")")|$(val "d['etat']")"
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
approuver_en_base() { # grille attente_avant attente_apres [nom de la session]
  PGAPPNAME=${4:-g1_tient} $PSQL -c "BEGIN; SELECT set_config('app.role', 'admin_commune', true), set_config('app.user_id', '$ID_A', true), set_config('app.commune_id', '$A', true);
            SET LOCAL ROLE siipi_app; SELECT pg_sleep($2); SELECT 'ok:' FROM app.approuver_grille('$1', '$AUJ', 'TEST visa simultané', '$(version_de "$1")');
            SELECT pg_sleep($3); COMMIT;" 2>&1 | grep -oE '^ok:|GRILLE_[A-Z]+' | head -1
}
approuver_en_base "$G3" 0 2 > "$T/course3" & approuver_en_base "$G4" 0.5 0 g1_attend_course4 > "$T/course4" &
ATTENTE4=$(attendre_verrou g1_attend_course4 1); wait
chk "deux approbations simultanées de grilles qui se chevauchent : la seconde attend la première, puis refuse ; une seule passe" "attente|ok:|GRILLE_CHEVAUCHEMENT|1" \
    "$ATTENTE4|$(cat "$T/course3")|$(cat "$T/course4")|$(sql "SELECT count(*) FROM grilles_tarifaires WHERE id IN ('$G3', '$G4') AND date_approbation_tutelle IS NOT NULL")"
# Le remplacement d'un projet (PUT) et son approbation en même temps : le
# remplacement réécrit la grille puis retire ses lignes, et tient sa transaction
# ouverte ; l'approbation arrive pendant ce temps, avec la version lue avant lui.
# Elle doit attendre, puis voir que la grille a changé : refus. Sans le verrou de
# la grille, elle lisait l'ancienne version (la sienne), contrôlait l'ancien
# projet, puis approuvait une grille sans aucun tarif.
appel POST "/grilles-tarifaires?communeId=$B" "$T_B" "$(grille TEST-ARRETE-B1 2026-02-01 "[$L_CAFE]")" >/dev/null; G5=$(val "d['id']")
remplacer_en_base() { # grille
  $PSQL -c "BEGIN; SELECT set_config('app.role', 'admin_commune', true), set_config('app.user_id', '$ID_B', true), set_config('app.commune_id', '$B', true);
            SET LOCAL ROLE siipi_app; UPDATE grilles_tarifaires SET intitule = 'TEST remplacé' WHERE id = '$1';
            SELECT app.retirer_lignes_projet('$1'); SELECT pg_sleep(3); COMMIT;" >/dev/null 2>&1
}
approuver_b() { # grille version
  PGAPPNAME=g1_attend_course5 $PSQL -c "BEGIN; SELECT set_config('app.role', 'admin_commune', true), set_config('app.user_id', '$ID_B', true), set_config('app.commune_id', '$B', true);
            SET LOCAL ROLE siipi_app; SELECT pg_sleep(1); SELECT 'ok:' FROM app.approuver_grille('$1', '$AUJ', 'TEST visa pendant le remplacement', '$2'); COMMIT;" 2>&1 \
    | grep -oE '^ok:|GRILLE_[A-Z]+' | head -1
}
V5=$(version_de "$G5")
remplacer_en_base "$G5" & approuver_b "$G5" "$V5" > "$T/course5" &
ATTENTE5=$(attendre_verrou g1_attend_course5 1); wait
chk "une approbation pendant le remplacement du projet attend, puis voit que la grille a changé : refus" "attente|GRILLE_MODIFIEE|0|0|t" \
    "$ATTENTE5|$(cat "$T/course5")|$(sql "SELECT count(*) FROM grilles_tarifaires WHERE id = '$G5' AND date_approbation_tutelle IS NOT NULL")|$(sql "SELECT count(*) FROM lignes_grille WHERE grille_id = '$G5' AND deleted_at IS NULL")|$(sql "SELECT intitule = 'TEST remplacé' FROM grilles_tarifaires WHERE id = '$G5'")"
appel DELETE "/grilles-tarifaires/$G5?version=$(version_de "$G5")" "$T_B" >/dev/null
CREE_G6=$(appel POST "/grilles-tarifaires?communeId=$B" "$T_B" "{\"intitule\":\"TEST bornée\",\"referenceArrete\":\"TEST-ARRETE-B2\",\"dateArrete\":\"2026-01-10\",\"dateEffet\":\"2026-02-01\",\"dateFin\":\"2026-12-31\",\"lignes\":[$L_CAFE]}"); G6=$(val "d['id']")
chk "un projet borné dès l'arrêté (date de fin saisie) s'approuve : l'arrêté est la pièce de sa fin" "201|200|2026-12-31|TEST-ARRETE-B2" \
    "$CREE_G6|$(appel POST "/grilles-tarifaires/$G6/approbation" "$T_B" "$(approbation "$G6" 2026-01-20 "TEST visa B")")|$(val "d['date_fin']")|$(val "d['reference_fin']")"
# L'approbation verrouille la grille, et la garde ici quatre secondes ; une
# seconde et demie plus tard, trois écritures arrivent sur ses lignes : un retrait
# par la procédure, une ligne et une majoration ajoutées directement en base. Les
# déclencheurs des lignes verrouillent la grille : chaque écriture attend, puis
# voit la grille approuvée et la refuse. Sans ce verrou, elles passaient le
# contrôle sur la grille encore « projet », et la grille approuvée n'était plus
# celle que l'approbation avait contrôlée (ses lignes retirées, ou d'autres
# ajoutées).
appel POST "/grilles-tarifaires?communeId=$B" "$T_B" "$(grille TEST-ARRETE-B3 2027-01-01 "[$L_CAFE]")" >/dev/null; G7=$(val "d['id']")
L7=$(sql "SELECT id FROM lignes_grille WHERE grille_id = '$G7' AND deleted_at IS NULL")
CTX_B="SELECT set_config('app.role', 'admin_commune', true), set_config('app.user_id', '$ID_B', true), set_config('app.commune_id', '$B', true); SET LOCAL ROLE siipi_app"
approuver_tenu() { # grille
  $PSQL -c "BEGIN; $CTX_B; SELECT 'ok:' FROM app.approuver_grille('$1', '$AUJ', 'TEST visa tenu', '$(version_de "$1")'); SELECT pg_sleep(4); COMMIT;" 2>&1 \
    | grep -oE '^ok:|GRILLE_[A-Z]+' | head -1
}
intrus() { # instruction — son refus, ou ce qu'elle rend
  PGAPPNAME=g1_attend_intrus $PSQL -c "BEGIN; $CTX_B; SELECT pg_sleep(1.5); $1; COMMIT;" 2>&1 \
    | grep -oE '^ERROR: +[A-Z_]+:|^ins:|^n:[0-9]+' | head -1 | sed -E 's/^ERROR: +//; s/:$//'
}
approuver_tenu "$G7" > "$T/tenu" &
intrus "SELECT 'n:' || app.retirer_lignes_projet('$G7')" > "$T/intrus1" &
intrus "INSERT INTO lignes_grille (grille_id, commune_id, categorie_code, mode, tarif) VALUES ('$G7', '$B', 'hotel', 'reel_levee', 4) RETURNING 'ins:'" > "$T/intrus2" &
intrus "INSERT INTO criteres_majoration (ligne_id, commune_id, critere, borne_min, effet, valeur, ordre) VALUES ('$L7', '$B', 'surface_m2', 0, 'coefficient', 2, 1) RETURNING 'ins:'" > "$T/intrus3" &
ATTENTE7=$(attendre_verrou g1_attend_intrus 3); wait
chk "pendant une approbation, ni retrait de ligne, ni ligne, ni majoration ajoutées : chacune attend, puis est refusée" "attente|ok:|GRILLE_FIGEE|GRILLE_FIGEE|GRILLE_FIGEE" \
    "$ATTENTE7|$(cat "$T/tenu")|$(cat "$T/intrus1")|$(cat "$T/intrus2")|$(cat "$T/intrus3")"
chk "… la grille approuvée est celle que l'approbation a contrôlée : sa ligne, aucune autre, aucune majoration" "1|1|0|0" \
    "$(sql "SELECT count(*) FROM grilles_tarifaires WHERE id = '$G7' AND date_approbation_tutelle IS NOT NULL")|$(sql "SELECT count(*) FROM lignes_grille WHERE grille_id = '$G7' AND deleted_at IS NULL AND id = '$L7'")|$(sql "SELECT count(*) FROM lignes_grille WHERE grille_id = '$G7' AND id <> '$L7'")|$(sql "SELECT count(*) FROM criteres_majoration WHERE ligne_id = '$L7'")"
# Une catégorie fermée après la saisie des tarifs : l'approbation reprend le
# contrôle des catégories à la date d'effet, sur la liste du jour où elle se fait.
CREE_G8=$(appel POST "/grilles-tarifaires?communeId=$B" "$T_B" "{\"intitule\":\"TEST éphémère\",\"referenceArrete\":\"TEST-ARRETE-B4\",\"dateArrete\":\"2025-05-10\",\"dateEffet\":\"2025-06-01\",\"dateFin\":\"2026-01-01\",\"lignes\":[{\"categorie\":\"test_ephemere\",\"mode\":\"forfait_annuel\",\"tarif\":10}]}"); G8=$(val "d['id']")
ID_EPH=$(sql "SELECT id FROM elements_listes_nationales WHERE code = 'test_ephemere' AND retire_le IS NULL")
chk "un projet dont une catégorie a été fermée après la saisie de ses tarifs ne s'approuve pas : 400, qui la nomme ; il reste un projet" "201|200|400|1|projet" \
    "$CREE_G8|$(appel POST "/listes-assimiles/elements/$ID_EPH/fin" "$T_F" '{"dateFin":"2025-01-01","reference":"TEST arrêté de fin"}')|$(appel POST "/grilles-tarifaires/$G8/approbation" "$T_B" "$(approbation "$G8" 2025-05-20 "TEST visa B4")")|$(val "1 if 'test_ephemere' in d['error'] else 0")|$(appel GET "/grilles-tarifaires/$G8" "$T_B" >/dev/null; val "d['etat']")"
# Le retrait porte, lui aussi, la version lue : retirer le projet qu'un autre
# vient de remplacer effacerait son travail.
VGV=$(version_de "$GV")
chk "un retrait sans la version lue : 400" 400 "$(appel DELETE "/grilles-tarifaires/$GV" "$T_A")"
chk "… avec une version dépassée (le projet remplacé depuis) : 409, et le projet reste" "200|409|0" \
    "$(appel PUT "/grilles-tarifaires/$GV" "$T_A" "$(grille TEST-VIDE 2027-06-01 '[]' "$VGV")")|$(appel DELETE "/grilles-tarifaires/$GV?version=$VGV" "$T_A")|$(sql "SELECT count(*) FROM grilles_tarifaires WHERE id = '$GV' AND deleted_at IS NOT NULL")"
chk "un projet se retire (204), avec sa version, et reste en base, retiré" "204|1" \
    "$(appel DELETE "/grilles-tarifaires/$GV?version=$(version_de "$GV")" "$T_A")|$(sql "SELECT count(*) FROM grilles_tarifaires WHERE id = '$GV' AND deleted_at IS NOT NULL AND deleted_by = '$ID_A'")"

# -----------------------------------------------------------------------------
echo
echo "7. Qui lit quoi"
chk "la FNCT lit les grilles de A" 4 "$(appel GET "/grilles-tarifaires?communeId=$A" "$T_F" >/dev/null; val "len(d)")"
chk "le directeur de B ne voit aucune grille de A, ni par la liste ni par son identifiant" "0|404" \
    "$(appel GET "/grilles-tarifaires?communeId=$A" "$T_B" >/dev/null; val "len(d)")|$(appel GET "/grilles-tarifaires/$G1" "$T_B")"
chk "un prestataire de A n'y a pas accès (403), et la base ne lui en montre aucune ligne" "403|0|0" \
    "$(appel GET "/grilles-tarifaires?communeId=$A" "$T_P")|$($PSQL -c "BEGIN; SELECT set_config('app.role', 'gestionnaire_prestataire', true), set_config('app.user_id', '$ID_P', true), set_config('app.commune_id', '$A', true); SET LOCAL ROLE siipi_app; SELECT 'n:' || count(*) FROM grilles_tarifaires; ROLLBACK;" 2>&1 | grep -oE '^n:[0-9]+' | cut -d: -f2)|$($PSQL -c "BEGIN; SELECT set_config('app.role', 'gestionnaire_prestataire', true), set_config('app.user_id', '$ID_P', true), set_config('app.commune_id', '$A', true); SET LOCAL ROLE siipi_app; SELECT 'n:' || count(*) FROM lignes_grille; ROLLBACK;" 2>&1 | grep -oE '^n:[0-9]+' | cut -d: -f2)"
# Les catégories en vigueur, comptées : la route rend toujours trois listes, et
# compter les listes ne verrait pas une politique qui en cacherait les éléments.
# La campagne en a ajouté deux encore en vigueur (le kiosque, la portée).
N_F=$(appel GET /listes-assimiles "$T_F" >/dev/null; val "$EN_VIGUEUR")
chk "une commune lit les catégories en vigueur, les mêmes que la FNCT (celles d'avant la campagne, le kiosque et la portée)" "200|$((N0 + 2))|$((N0 + 2))" \
    "$(appel GET /listes-assimiles "$T_A")|$(val "$EN_VIGUEUR")|$N_F"
chk "le journal d'audit garde l'approbation et la clôture" "t|t" \
    "$(sql "SELECT count(*) > 0 FROM audit_log WHERE table_name = 'grilles_tarifaires' AND record_id = '$G1' AND 'date_approbation_tutelle' = ANY (changed_fields)")|$(sql "SELECT count(*) > 0 FROM audit_log WHERE table_name = 'grilles_tarifaires' AND record_id = '$G1' AND 'date_fin' = ANY (changed_fields)")"

echo
base_reelle_intacte "pendant la campagne"

# -----------------------------------------------------------------------------
# La table nationale d'abord : effacer le compte de la FNCT mettrait à vide
# l'auteur des éléments qu'il a inscrits, ce que le figement des éléments refuse.
rendre_tables_nationales
nettoyer
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
