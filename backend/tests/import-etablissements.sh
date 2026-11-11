#!/usr/bin/env bash
# =============================================================================
# v0.15.94 — jalon G, lot G2b : l'import des établissements, liste TCL et open
# data (docs/specs_metier/SPEC_G_assimiles_conventions.md § 3.2 ; décisions du
# 4 et du 10 novembre 2026 ; migration 102).
#
# Elle commence par ce qui est REFUSÉ :
#   - un import par la FNCT, par le directeur d'une autre commune, par un
#     prestataire ; l'ancien format .xls, un fichier vide, un fichier sans ligne,
#     un contenu qui n'est pas du base64, un nom de fichier qui porte un octet nul ;
#   - une correspondance sans raison sociale, vers une colonne absente, ou qui
#     donne la même colonne à deux champs ; un jeu open data sans sa licence ;
#   - en base : un import qui se réécrit, un établissement qui change d'import,
#     un jeu open data sans licence, une correspondance vers une catégorie inconnue.
# Puis la correspondance proposée (en-têtes de la commune, non reformatés), l'aperçu
# (créer, à vérifier, rattacher, inchangé, sans catégorie, erreur), l'écriture des
# seules lignes valides, le modèle gardé, la correspondance des activités, la
# relance du même fichier sans doubles, et un classeur Excel open data.
#
#   docker compose exec -T api npm run test:import-etablissements
# =============================================================================

set -u
cd "$(dirname "$0")/.." || exit 1
API="${API_URL:-http://localhost:4000}"
PSQL="psql -q -tA -h ${PGHOST:-localhost} -p ${PGPORT:-5432} -U ${PGUSER:-siipi_admin} -d ${PGDATABASE:-siipi_national}"
pass=0; fail=0
T=$(mktemp -d)
A=test_import_a; B=test_import_b
ESSAI="'$A','$B'"

chk() {
  if [ "$2" = "$3" ]; then printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1))
  else printf '  \033[31m✗\033[0m %s  (attendu %s, obtenu %s)\n' "$1" "$2" "$3"; fail=$((fail+1)); fi
}
sql() { $PSQL -c "$1" 2>&1 | tr -d ' '; }
sqlt() { $PSQL -c "$1" 2>&1; }
tok() {
  curl -s -X POST "$API/auth/login" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"$2\"}" | python3 -c "import sys,json;print(json.load(sys.stdin).get('token',''))" 2>/dev/null
}
appel() { # méthode chemin jeton [fichier du corps] — code HTTP, corps dans $T/r.json
  curl -s -o "$T/r.json" -w '%{http_code}' -X "$1" "$API$2" ${3:+-H "Authorization: Bearer $3"} \
    -H 'Content-Type: application/json' ${4:+--data-binary "@$4"}
}
val() { python3 -c "import json;d=json.load(open('$T/r.json'));print($1)" 2>/dev/null || echo erreur; }
en_base() { # rôle utilisateur commune instruction — le refus de la base, ou « ok »
  $PSQL -c "BEGIN; SELECT set_config('app.role', '$1', true), set_config('app.user_id', '$2', true), set_config('app.commune_id', '$3', true);
            SET LOCAL ROLE siipi_app; $4; ROLLBACK;" 2>&1 \
    | grep -oE '^ERROR: +[A-Z_]+:|permission denied|violates row-level security|violates (check|unique|not-null) constraint "[a-z_]+"' | head -1 \
    | sed -E 's/^ERROR: +//; s/:$//; s/violates (check|unique|not-null) constraint "([a-z_]+)"/\2/' | grep . || echo ok
}

# corps <sortie> <fichier source> <nomFichier> [JSON en plus] — le corps d'un envoi, le fichier en base64.
corps() {
  python3 - "$@" <<'PY'
import base64, json, sys
sortie, source, nom = sys.argv[1], sys.argv[2], sys.argv[3]
extra = json.loads(sys.argv[4]) if len(sys.argv) > 4 and sys.argv[4] else {}
d = {"source": extra.pop("source", "import_tcl"), "nomFichier": nom,
     "contenu": base64.b64encode(open(source, "rb").read()).decode()}
d.update(extra)
json.dump(d, open(sortie, "w"), ensure_ascii=False)
PY
}

. tests/outils/communes_essai.sh
. tests/outils/comptes_temporaires.sh
. tests/outils/base_reelle.sh
nettoyer() {
  effacer_communes_essai "$ESSAI"
  retirer_comptes_temporaires
}
effacer_communes_essai "$ESSAI"
trap 'nettoyer; rm -rf "$T"' EXIT
releve_base_reelle

commune_essai "$A" "TEST commune A de l'import"
commune_essai "$B" "TEST commune B de l'import"
compte_temporaire admin_commune "$A" "Directeur A"; T_A=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP"); ID_A=$COMPTE_ID
compte_temporaire admin_commune "$B" "Directeur B"; T_B=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP"); ID_B=$COMPTE_ID
compte_temporaire super_admin_fnct "" "FNCT de l'import"; T_F=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP"); ID_F=$COMPTE_ID
compte_temporaire gestionnaire_prestataire "$A" "Prestataire de A"; T_P=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP"); ID_P=$COMPTE_ID
[ -n "$T_A" ] && [ -n "$T_B" ] && [ -n "$T_F" ] && [ -n "$T_P" ] || { echo "API injoignable sur $API, ou compte temporaire refusé" >&2; exit 1; }

# Ce que la commune A a déjà, inscrit par la saisie (lot G2a) : de quoi rattacher et rapprocher.
printf '%s' '{"nom":"TEST Boulangerie du Port","categorieActivite":"boulangerie","matriculeFiscal":"7654321B"}' > "$T/b1.json"
printf '%s' '{"nom":"TEST Garage Sud","categorieActivite":"atelier","matriculeFiscal":"1111111C","adresse":"Route de Sfax","activite":"Mécanique"}' > "$T/b2.json"
printf '%s' '{"nom":"TEST Pharmacie de la Gare","categorieActivite":"superette","latitude":36.40000,"longitude":10.10000,"precisionM":5}' > "$T/b3.json"
[ "$(appel POST "/etablissements?communeId=$A" "$T_A" "$T/b1.json")" = 201 ] && E_BOUL=$(val "d['id']")
[ "$(appel POST "/etablissements?communeId=$A" "$T_A" "$T/b2.json")" = 201 ] && E_GARAGE=$(val "d['id']")
[ "$(appel POST "/etablissements?communeId=$A" "$T_A" "$T/b3.json")" = 201 ] && E_PHARMA=$(val "d['id']")
[ -n "${E_BOUL:-}" ] && [ -n "${E_GARAGE:-}" ] && [ -n "${E_PHARMA:-}" ] || { echo "Les établissements de départ n'ont pas pu être inscrits" >&2; exit 1; }

# La liste TCL de la commune, TELLE QU'ELLE EST : séparateur « ; », BOM, en-têtes à elle.
printf '\xef\xbb\xbf' > "$T/tcl.csv"
cat >> "$T/tcl.csv" <<'CSV'
Dénomination;Nature de l'activité;M.F.;Adresse de l'établissement;Lat;Long;Observations
TEST Hôtel des Oliviers;Hôtellerie;1234567A/A/M/000;Avenue de la plage;;;
TEST Café Central;Café;;Place du marché;;;
TEST CAFE   CENTRAL;Café;;Rue de Rome;;;deuxième fiche ?
TEST Boulangerie du Port;Pâtisserie;7654321 b;Quai nord;;;
TEST Garage Sud;Garage;1111111C;Route de Sfax;;;
TEST Parfumerie Belle;Parfumerie;;Rue de la gare;36.400018;10.1;
TEST Kiosque;Café;12-AB;;;;
TEST Bazar;Café;;;10.1;36.4;
TEST Doublon matricule;Hôtellerie;1234567AAM000;;;;
TEST Quincaillerie Ali;Quincaillerie;;Rue des forgerons;;;
TEST Épicerie Fine;Café;;;36.41;10.11;
CSV
CORR='{"nom":"Dénomination","activite":"Nature de l'"'"'activité","matricule_fiscal":"M.F.","adresse":"Adresse de l'"'"'établissement","latitude":"Lat","longitude":"Long"}'

# -----------------------------------------------------------------------------
echo
echo "1. Ce qui est refusé"
corps "$T/c_tcl.json" "$T/tcl.csv" "liste_tcl_2026.csv"
chk "la FNCT n'importe pas : 403, qui dit que c'est la commune" "403|1" \
    "$(appel POST "/etablissements/import/colonnes?communeId=$A" "$T_F" "$T/c_tcl.json")|$(val "1 if 'commune importe' in d['error'] else 0")"
chk "le directeur d'une autre commune : introuvable (404)" 404 "$(appel POST "/etablissements/import/colonnes?communeId=$A" "$T_B" "$T/c_tcl.json")"
chk "un prestataire : 403" 403 "$(appel POST "/etablissements/import/colonnes?communeId=$A" "$T_P" "$T/c_tcl.json")"
printf '\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1rien' > "$T/ancien.xls"; corps "$T/c_xls.json" "$T/ancien.xls" "ancien.xls"
chk "l'ancien format .xls : 400, qui dit d'enregistrer en .xlsx ou en CSV" "400|1" \
    "$(appel POST "/etablissements/import/colonnes?communeId=$A" "$T_A" "$T/c_xls.json")|$(val "1 if '.xlsx' in d['error'] else 0")"
printf 'Nom;Activité\n' > "$T/entete.csv"; corps "$T/c_entete.json" "$T/entete.csv" "entete.csv"
chk "un fichier qui ne porte que ses en-têtes : 400" 400 "$(appel POST "/etablissements/import/colonnes?communeId=$A" "$T_A" "$T/c_entete.json")"
printf '%s' '{"source":"import_tcl","nomFichier":"x.csv","contenu":"pas du base64 !"}' > "$T/c_b64.json"
chk "un contenu qui n'est pas du base64 : 400" 400 "$(appel POST "/etablissements/import/colonnes?communeId=$A" "$T_A" "$T/c_b64.json")"
corps "$T/c_nul.json" "$T/tcl.csv" "liste.csv"
python3 -c "import json;d=json.load(open('$T/c_nul.json'));d['nomFichier']='liste\x00.csv';json.dump(d,open('$T/c_nul.json','w'))"
chk "un nom de fichier qui porte un octet nul : 400, jamais 500" 400 "$(appel POST "/etablissements/import/colonnes?communeId=$A" "$T_A" "$T/c_nul.json")"
corps "$T/i_sansnom.json" "$T/tcl.csv" "liste_tcl_2026.csv" '{"correspondance":{"activite":"Nature de l'"'"'activité"}}'
chk "une correspondance sans raison sociale : 400, qui le dit" "400|1" \
    "$(appel POST "/etablissements/import?communeId=$A" "$T_A" "$T/i_sansnom.json")|$(val "1 if 'Raison sociale' in d['error'] else 0")"
corps "$T/i_absente.json" "$T/tcl.csv" "liste_tcl_2026.csv" '{"correspondance":{"nom":"Raison sociale","activite":"Nature de l'"'"'activité"}}'
chk "… vers une colonne absente du fichier : 400" 400 "$(appel POST "/etablissements/import?communeId=$A" "$T_A" "$T/i_absente.json")"
corps "$T/i_double.json" "$T/tcl.csv" "liste_tcl_2026.csv" '{"correspondance":{"nom":"Dénomination","activite":"Dénomination"}}'
chk "… qui donne la même colonne à deux champs : 400" 400 "$(appel POST "/etablissements/import?communeId=$A" "$T_A" "$T/i_double.json")"
corps "$T/i_od.json" "$T/tcl.csv" "jeu.csv" "{\"source\":\"open_data\",\"correspondance\":$CORR}"
chk "un jeu open data sans sa licence ni son producteur : 400, qui dit pourquoi" "400|1" \
    "$(appel POST "/etablissements/import?communeId=$A" "$T_A" "$T/i_od.json")|$(val "1 if 'licence' in str(d) else 0")"
chk "aucun refus n'a rien écrit : ni import, ni modèle, ni établissement de plus" "0|0|3" \
    "$(sql "SELECT count(*) FROM imports_etablissements WHERE commune_id IN ($ESSAI)")|$(sql "SELECT count(*) FROM modeles_import_etablissements WHERE commune_id IN ($ESSAI)")|$(sql "SELECT count(*) FROM commerces WHERE commune_id = '$A'")"

# -----------------------------------------------------------------------------
echo
echo "2. Les colonnes du fichier, et la correspondance proposée"
chk "les en-têtes de la commune sont lus tels quels, et chaque champ reçoit sa colonne (proposée)" \
    "200|11|7|Dénomination|Nature de l'activité|M.F.|Adresse de l'établissement|Lat|Long|proposee|False" \
    "$(appel POST "/etablissements/import/colonnes?communeId=$A" "$T_A" "$T/c_tcl.json")|$(val "d['lignes']")|$(val "len(d['entetes'])")|$(val "d['correspondance']['nom']")|$(val "d['correspondance']['activite']")|$(val "d['correspondance']['matricule_fiscal']")|$(val "d['correspondance']['adresse']")|$(val "d['correspondance']['latitude']")|$(val "d['correspondance']['longitude']")|$(val "d['provenance']['nom']")|$(val "d['modeleEnregistre']")"
chk "… une colonne que rien ne désigne reste sans champ (« Observations »), et rien n'est écrit" "None|0" \
    "$(val "d['correspondance']['surface_m2']")|$(sql "SELECT count(*) FROM imports_etablissements WHERE commune_id = '$A'")"

# -----------------------------------------------------------------------------
echo
echo "3. L'aperçu : rien n'est écrit"
corps "$T/i_tcl.json" "$T/tcl.csv" "liste_tcl_2026.csv" "{\"correspondance\":$CORR}"
action() { val "next(l['action'] for l in d['lignes'] if l['numero']==$1)"; }
chk "aperçu : 200, rien d'écrit" "200|False|3" "$(appel POST "/etablissements/import?communeId=$A" "$T_A" "$T/i_tcl.json")|$(val "d['ecrit']")|$(sql "SELECT count(*) FROM commerces WHERE commune_id = '$A'")"
chk "une activité sans correspondance attend sa catégorie, jamais devinée (Hôtellerie, Parfumerie, Quincaillerie)" "sans_categorie|sans_categorie|Hôtellerie:1,Parfumerie:1,Quincaillerie:1" \
    "$(action 2)|$(action 11)|$(val "','.join(f\"{a['activite']}:{a['lignes']}\" for a in sorted(d['activitesSansCategorie'], key=lambda a: a['activite']))")"
chk "un libellé identique à celui d'une catégorie vaut correspondance (« Café »)" "creer|cafe|libelle" \
    "$(action 3)|$(val "next(l['categorie_activite'] for l in d['lignes'] if l['numero']==3)")|$(val "next(l['categorie_provenance'] for l in d['lignes'] if l['numero']==3)")"
chk "la même raison sociale, autrement écrite, plus haut dans le fichier : « à vérifier », le doublon nommé avec sa ligne" "a_verifier|meme_nom|3" \
    "$(action 4)|$(val "next(l['doublon']['raison'] for l in d['lignes'] if l['numero']==4)")|$(val "next(l['doublon']['ligne'] for l in d['lignes'] if l['numero']==4)")"
chk "même matricule qu'un inscrit (autrement écrit) : rattaché ; l'adresse se remplit, l'activité qui diffère est montrée, pas écrasée" \
    "rattacher|TEST Boulangerie du Port|adresse,activite|0" \
    "$(action 5)|$(val "next(l['rattache_a']['nom'] for l in d['lignes'] if l['numero']==5)")|$(val "','.join(next(l['remplis'] for l in d['lignes'] if l['numero']==5))")|$(val "len(next(l['differences'] for l in d['lignes'] if l['numero']==5))")"
chk "même matricule, et rien à remplir : inchangé ; l'activité différente est montrée" "inchange|activite|Mécanique|Garage" \
    "$(action 6)|$(val "next(l['differences'][0]['champ'] for l in d['lignes'] if l['numero']==6)")|$(val "next(l['differences'][0]['inscrit'] for l in d['lignes'] if l['numero']==6)")|$(val "next(l['differences'][0]['fichier'] for l in d['lignes'] if l['numero']==6)")"
chk "à 2 m d'un inscrit, sans précision dans le fichier : la position est laissée de côté, donc pas de rapprochement — et c'est dit" "sans_categorie|1" \
    "$(action 7)|$(val "1 if any('précision' in a for a in next(l['avertissements'] for l in d['lignes'] if l['numero']==7)) else 0")"
chk "un matricule mal formé, une position hors de Tunisie, un matricule déjà présent plus haut : erreurs, avec leur raison" "erreur|erreur|erreur|1|1" \
    "$(action 8)|$(action 9)|$(action 10)|$(val "1 if 'Tunisie' in next(l['erreurs'][0] for l in d['lignes'] if l['numero']==9) else 0")|$(val "1 if 'ligne 2' in next(l['erreurs'][0] for l in d['lignes'] if l['numero']==10) else 0")"
chk "le résumé compte chaque ligne une fois" "11|2|1|1|1|3|3" \
    "$(val "sum(d['resume'].values())")|$(val "d['resume']['creer']")|$(val "d['resume']['a_verifier']")|$(val "d['resume']['rattacher']")|$(val "d['resume']['inchange']")|$(val "d['resume']['sans_categorie']")|$(val "d['resume']['erreur']")"

# La précision déclarée pour le fichier : les positions comptent, le voisin à 2 m aussi.
corps "$T/i_prec.json" "$T/tcl.csv" "liste_tcl_2026.csv" "{\"correspondance\":$CORR,\"precisionFichier\":10}"
chk "avec une précision déclarée (10 m), la position de l'épicerie compte : plus d'avertissement" "200|creer|0" \
    "$(appel POST "/etablissements/import?communeId=$A" "$T_A" "$T/i_prec.json")|$(action 12)|$(val "len(next(l['avertissements'] for l in d['lignes'] if l['numero']==12))")"
corps "$T/i_prec_min.json" "$T/tcl.csv" "liste_tcl_2026.csv" "{\"correspondance\":$CORR,\"precisionFichier\":0.04}"
chk "une précision déclarée que la base arrondirait à zéro (0,04 m) : 400 à l'aperçu, jamais un refus muet à la validation" 400 \
    "$(appel POST "/etablissements/import?communeId=$A" "$T_A" "$T/i_prec_min.json")"

# -----------------------------------------------------------------------------
echo
echo "4. La correspondance des activités, gardée par commune"
printf '%s' '{"activite":"Hôtellerie","categorieActivite":"casino"}' > "$T/ca_inconnue.json"
chk "une catégorie inconnue : 400, qui la nomme" "400|1" "$(appel PUT "/etablissements/correspondances-activites?communeId=$A" "$T_A" "$T/ca_inconnue.json")|$(val "1 if 'casino' in d['error'] else 0")"
printf '%s' '{"activite":"Hôtellerie","categorieActivite":"hotel"}' > "$T/ca_hotel.json"
chk "la FNCT ne la pose pas (403) ; le directeur d'une autre commune non plus (404)" "403|404" \
    "$(appel PUT "/etablissements/correspondances-activites?communeId=$A" "$T_F" "$T/ca_hotel.json")|$(appel PUT "/etablissements/correspondances-activites?communeId=$A" "$T_B" "$T/ca_hotel.json")"
chk "le directeur pose « Hôtellerie → Hôtel »" "200|hotel" "$(appel PUT "/etablissements/correspondances-activites?communeId=$A" "$T_A" "$T/ca_hotel.json")|$(val "d['categorie_activite']")"
printf '%s' '{"activite":"Parfumerie","categorieActivite":"superette"}' > "$T/ca_parf.json"
printf '%s' '{"activite":"HOTELLERIE","categorieActivite":"restaurant"}' > "$T/ca_hotel2.json"
appel PUT "/etablissements/correspondances-activites?communeId=$A" "$T_A" "$T/ca_parf.json" >/dev/null
chk "… la même activité autrement écrite corrige la même correspondance (une seule ligne, l'ancienne valeur au journal)" "200|1|restaurant|t" \
    "$(appel PUT "/etablissements/correspondances-activites?communeId=$A" "$T_A" "$T/ca_hotel2.json")|$(sql "SELECT count(*) FROM correspondances_activites WHERE commune_id = '$A' AND activite_forme = 'hotellerie'")|$(sql "SELECT categorie_activite FROM correspondances_activites WHERE commune_id = '$A' AND activite_forme = 'hotellerie'")|$(sql "SELECT count(*) >= 1 FROM audit_log a JOIN correspondances_activites c ON c.id::text = a.record_id::text WHERE a.table_name = 'correspondances_activites' AND a.operation = 'UPDATE' AND c.commune_id = '$A' AND c.activite_forme = 'hotellerie' AND a.old_data->>'categorie_activite' = 'hotel' AND a.new_data->>'categorie_activite' = 'restaurant'")"
appel PUT "/etablissements/correspondances-activites?communeId=$A" "$T_A" "$T/ca_hotel.json" >/dev/null
chk "la FNCT lit les correspondances de A ; le directeur de B n'en voit aucune" "200|2|200|0" \
    "$(appel GET "/etablissements/correspondances-activites?communeId=$A" "$T_F")|$(val "len(d)")|$(appel GET "/etablissements/correspondances-activites?communeId=$A" "$T_B")|$(val "len(d)")"
chk "avec la précision déclarée, la parfumerie à 2 m de la pharmacie inscrite est « à vérifier » : le voisin nommé, avec sa distance" "a_verifier|proche|TEST Pharmacie de la Gare|1" \
    "$(appel POST "/etablissements/import?communeId=$A" "$T_A" "$T/i_prec.json" >/dev/null; action 7)|$(val "next(l['doublon']['raison'] for l in d['lignes'] if l['numero']==7)")|$(val "next(l['doublon']['nom'] for l in d['lignes'] if l['numero']==7)")|$(val "1 if next(l['doublon']['distance_m'] for l in d['lignes'] if l['numero']==7) < 5 else 0")"
chk "l'aperçu relu : l'hôtel se crée, la parfumerie aussi ; la quincaillerie attend toujours" "creer|creer|sans_categorie|hotel|correspondance" \
    "$(appel POST "/etablissements/import?communeId=$A" "$T_A" "$T/i_tcl.json" >/dev/null; action 2)|$(action 7)|$(action 11)|$(val "next(l['categorie_activite'] for l in d['lignes'] if l['numero']==2)")|$(val "next(l['categorie_provenance'] for l in d['lignes'] if l['numero']==2)")"

# -----------------------------------------------------------------------------
echo
echo "5. La validation : les seules lignes valides, en une transaction"
corps "$T/v_tcl.json" "$T/tcl.csv" "liste_tcl_2026.csv" "{\"correspondance\":$CORR,\"valider\":true}"
chk "validé : 201, 4 créés (dont la position de l'épicerie laissée de côté), 1 à vérifier, 1 rattaché" "201|True|4|1|1" \
    "$(appel POST "/etablissements/import?communeId=$A" "$T_A" "$T/v_tcl.json")|$(val "d['ecrit']")|$(val "d['crees']")|$(val "d['aVerifier']")|$(val "d['rattaches']")"
IMP1=$(val "d['importId']")
chk "la commune compte 3 + 5 établissements ; aucun de la ligne en erreur ni de la quincaillerie" "8|0|0" \
    "$(sql "SELECT count(*) FROM commerces WHERE commune_id = '$A'")|$(sql "SELECT count(*) FROM commerces WHERE commune_id = '$A' AND nom IN ('TEST Kiosque', 'TEST Bazar', 'TEST Doublon matricule')")|$(sql "SELECT count(*) FROM commerces WHERE commune_id = '$A' AND nom = 'TEST Quincaillerie Ali'")"
chk "un établissement importé dit sa source, son import et sa ligne ; le matricule est normalisé" "import_tcl|$IMP1|2|1234567AAM000|hotel|actif" \
    "$(sqlt "SELECT source_creation || '|' || import_id || '|' || import_ligne || '|' || matricule_fiscal || '|' || categorie_activite || '|' || statut FROM commerces WHERE commune_id = '$A' AND nom = 'TEST Hôtel des Oliviers'")"
chk "le doublon probable est créé « à vérifier », son motif nomme l'autre fiche et le fichier" "a_verifier|1|1" \
    "$(sql "SELECT statut FROM commerces WHERE commune_id = '$A' AND nom = 'TEST CAFE   CENTRAL'")|$(sql "SELECT (motif_statut LIKE '%TEST Café Central%')::int FROM commerces WHERE commune_id = '$A' AND nom = 'TEST CAFE   CENTRAL'")|$(sql "SELECT (motif_statut LIKE '%liste_tcl_2026.csv%')::int FROM commerces WHERE commune_id = '$A' AND nom = 'TEST CAFE   CENTRAL'")"
chk "le rattaché : son adresse et son activité, vides, sont remplies ; sa source et son matricule n'ont pas bougé ; il n'a pas d'import" "Quainord|Pâtisserie|saisie|7654321B|" \
    "$(sql "SELECT adresse || '|' || activite || '|' || source_creation || '|' || matricule_fiscal || '|' || COALESCE(import_id::text, '') FROM commerces WHERE id = '$E_BOUL'")"
chk "l'inchangé n'a pas été touché : son activité reste « Mécanique »" "Mécanique" "$(sqlt "SELECT activite FROM commerces WHERE id = '$E_GARAGE'")"
chk "sans précision déclarée, la position de l'épicerie n'est pas écrite" "t" "$(sql "SELECT geom IS NULL FROM commerces WHERE commune_id = '$A' AND nom = 'TEST Épicerie Fine'")"
chk "le journal garde l'import : fichier, empreinte, correspondance, comptes" "liste_tcl_2026.csv|true|Dénomination|4|1|1|1|1|3" \
    "$(sqlt "SELECT nom_fichier || '|' || (empreinte_fichier ~ '^[0-9a-f]{64}$') || '|' || (correspondance->>'nom') || '|' || nb_crees || '|' || nb_a_verifier || '|' || nb_rattaches || '|' || nb_inchanges || '|' || nb_sans_categorie || '|' || nb_erreurs FROM imports_etablissements WHERE id = '$IMP1'")"
chk "la correspondance des colonnes est gardée pour l'import suivant de ce type de fichier" "1|Nature de l'activité" \
    "$(sql "SELECT count(*) FROM modeles_import_etablissements WHERE commune_id = '$A' AND source = 'import_tcl'")|$(sqlt "SELECT correspondance->>'activite' FROM modeles_import_etablissements WHERE commune_id = '$A' AND source = 'import_tcl'")"

# -----------------------------------------------------------------------------
echo
echo "6. Le même fichier relancé : aucun double"
chk "les colonnes du même fichier : la correspondance vient du modèle enregistré" "200|enregistree|enregistree|True" \
    "$(appel POST "/etablissements/import/colonnes?communeId=$A" "$T_A" "$T/c_tcl.json")|$(val "d['provenance']['nom']")|$(val "d['provenance']['latitude']")|$(val "d['modeleEnregistre']")"
printf '%s' '{"activite":"Quincaillerie","categorieActivite":"atelier"}' > "$T/ca_quinc.json"
appel PUT "/etablissements/correspondances-activites?communeId=$A" "$T_A" "$T/ca_quinc.json" >/dev/null
chk "relu : les lignes déjà importées sont « inchangées », la quincaillerie se crée ; rien d'autre" "inchange|inchange|inchange|creer|1|0" \
    "$(appel POST "/etablissements/import?communeId=$A" "$T_A" "$T/i_tcl.json" >/dev/null; action 2)|$(action 4)|$(action 5)|$(action 11)|$(val "d['resume']['creer']")|$(val "d['resume']['a_verifier']")"
chk "validé : seule la quincaillerie s'ajoute" "201|1|9" \
    "$(appel POST "/etablissements/import?communeId=$A" "$T_A" "$T/v_tcl.json")|$(val "d['crees']")|$(sql "SELECT count(*) FROM commerces WHERE commune_id = '$A'")"
chk "… et un fichier où rien n'est à écrire est refusé (400), sans import au journal" "400|2" \
    "$(appel POST "/etablissements/import?communeId=$A" "$T_A" "$T/v_tcl.json")|$(sql "SELECT count(*) FROM imports_etablissements WHERE commune_id = '$A'")"

# « Aucune colonne » est un choix gardé : une colonne « Surface » ajoutée au fichier
# n'est pas reprise d'office, puisque la commune n'en avait retenu aucune.
{ head -1 "$T/tcl.csv" | sed 's/;Observations$/;Observations;Surface/'; tail -n +2 "$T/tcl.csv" | sed 's/$/;12/'; } > "$T/tcl_surface.csv"
corps "$T/c_surface.json" "$T/tcl_surface.csv" "liste_tcl_2026_surface.csv"
chk "un champ que la commune a laissé sans colonne le reste à l'import suivant (« Surface » n'est pas reprise d'office)" "200|None|enregistree" \
    "$(appel POST "/etablissements/import/colonnes?communeId=$A" "$T_A" "$T/c_surface.json")|$(val "d['correspondance']['surface_m2']")|$(val "d['provenance']['surface_m2']")"

# La même liste, corrigée d'une case (le matricule du kiosque retiré) et complétée
# d'une ligne : une autre empreinte. Les lignes déjà importées sont retrouvées par
# leur raison sociale, leur activité et leur adresse, pas recréées « à vérifier ».
sed 's/^TEST Kiosque;Café;12-AB;/TEST Kiosque;Café;;/' "$T/tcl.csv" > "$T/tcl_corrige.csv"
printf 'TEST Inconnu;-;;Rue X;;;\n' >> "$T/tcl_corrige.csv"
corps "$T/i_corrige.json" "$T/tcl_corrige.csv" "liste_tcl_2026_corrigee.csv" "{\"correspondance\":$CORR}"
reconnu() { val "next(l['reconnu_par'] for l in d['lignes'] if l['numero']==$1)"; }
chk "la liste corrigée : les lignes importées sans matricule sont retrouvées (inchangées), rien n'est recréé ; le kiosque se crée" \
    "200|inchange|import_precedent|inchange|inchange|inchange|matricule|creer|1" \
    "$(appel POST "/etablissements/import?communeId=$A" "$T_A" "$T/i_corrige.json")|$(action 3)|$(reconnu 3)|$(action 4)|$(action 7)|$(action 11)|$(reconnu 2)|$(action 8)|$(val "d['resume']['creer']")"
chk "… sans adresse ni position, une raison sociale seule ne suffit pas à retrouver : l'épicerie reste un doublon probable" "a_verifier|meme_nom" \
    "$(action 12)|$(val "next(l['doublon']['raison'] for l in d['lignes'] if l['numero']==12)")"
chk "… une activité qui ne dit rien (« - ») est une erreur, pas une activité à faire correspondre" "erreur|0" \
    "$(action 13)|$(val "len([a for a in d['activitesSansCategorie'] if a['activite']=='-'])")"

# Un document administratif commence souvent par un titre, et porte des lignes vides :
# les en-têtes sont trouvés, et chaque ligne garde le numéro que le tableur lui donne.
printf 'Liste des redevables TCL — TEST\n\nRaison sociale;Activité;Adresse\nTEST Titre A;Café;Rue 1\n\nTEST Titre B;Café;Rue 2\n' > "$T/titre.csv"
corps "$T/c_titre.json" "$T/titre.csv" "liste_avec_titre.csv"
chk "un titre au-dessus des en-têtes : les en-têtes sont lus ligne 3, et c'est dit" "200|3|Raison sociale|2|1" \
    "$(appel POST "/etablissements/import/colonnes?communeId=$B" "$T_B" "$T/c_titre.json")|$(val "d['ligneEntetes']")|$(val "d['correspondance']['nom']")|$(val "d['lignes']")|$(val "1 if any('ligne 3' in a for a in d['avertissements']) else 0")"
corps "$T/i_titre.json" "$T/titre.csv" "liste_avec_titre.csv" '{"correspondance":{"nom":"Raison sociale","activite":"Activité","adresse":"Adresse"}}'
chk "… et les lignes gardent leur numéro du tableur, lignes vides comptées (4 et 6)" "200|4,6" \
    "$(appel POST "/etablissements/import?communeId=$B" "$T_B" "$T/i_titre.json")|$(val "','.join(str(l['numero']) for l in d['lignes'])")"

# -----------------------------------------------------------------------------
echo
echo "7. Un classeur Excel, jeu open data"
# Un classeur écrit à la main, comme un tableur l'écrit : deux feuilles, la première
# rangée dans « sheet3.xml » (on la trouve par sa relation, pas par son numéro),
# textes partagés et en ligne, nombres, une ligne vide au milieu.
python3 - "$T/jeu.xlsx" <<'PY'
import sys, zipfile
x = lambda s: s.replace('&', '&amp;').replace('<', '&lt;')
partages = ['nom_etab', 'type', 'lat', 'lon', 'TEST Lycée Ibn Khaldoun', 'École']
def c(ref, v):
    if isinstance(v, (int, float)): return f'<c r="{ref}"><v>{v}</v></c>'
    if v in partages: return f'<c r="{ref}" t="s"><v>{partages.index(v)}</v></c>'
    return f'<c r="{ref}" t="inlineStr"><is><t>{x(v)}</t></is></c>'
lignes = [['nom_etab', 'type', 'lat', 'lon'],
          ['TEST Lycée Ibn Khaldoun', 'École', 36.42, 10.12],
          None,
          ['TEST Restaurant الواحة', 'Restaurant', 36.43, 10.13]]
rows = ''.join(f'<row r="{i+1}">' + ''.join(c(f'{"ABCD"[j]}{i+1}', v) for j, v in enumerate(l)) + '</row>' for i, l in enumerate(lignes) if l)
ns = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
with zipfile.ZipFile(sys.argv[1], 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>')
    z.writestr('xl/workbook.xml', f'<?xml version="1.0"?><workbook {ns}><sheets><sheet name="Etablissements" sheetId="1" r:id="rId7"/><sheet name="Notes" sheetId="2" r:id="rId8"/></sheets></workbook>')
    z.writestr('xl/_rels/workbook.xml.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId8" Target="worksheets/sheet1.xml" Type="ws"/><Relationship Id="rId7" Target="worksheets/sheet3.xml" Type="ws"/></Relationships>')
    z.writestr('xl/sharedStrings.xml', f'<?xml version="1.0"?><sst {ns}>' + ''.join(f'<si><t>{x(s)}</t></si>' for s in partages) + '</sst>')
    z.writestr('xl/worksheets/sheet3.xml', f'<?xml version="1.0"?><worksheet {ns}><sheetData>{rows}</sheetData></worksheet>')
    z.writestr('xl/worksheets/sheet1.xml', f'<?xml version="1.0"?><worksheet {ns}><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>pas celle-ci</t></is></c></row></sheetData></worksheet>')
PY
corps "$T/c_xlsx.json" "$T/jeu.xlsx" "etablissements_opendata.xlsx" '{"source":"open_data"}'
chk "le classeur se lit : la première feuille par sa relation, deux lignes, et l'écran dit qu'une feuille a été laissée" "200|Etablissements|2|nom_etab|lat|1" \
    "$(appel POST "/etablissements/import/colonnes?communeId=$A" "$T_A" "$T/c_xlsx.json")|$(val "d['feuille']")|$(val "d['lignes']")|$(val "d['correspondance']['nom'] or 'aucune'")|$(val "d['correspondance']['latitude']")|$(val "1 if any('première feuille' in a for a in d['avertissements']) else 0")"
CORR_OD='{"nom":"nom_etab","activite":"type","latitude":"lat","longitude":"lon"}'
corps "$T/i_od.json" "$T/jeu.xlsx" "etablissements_opendata.xlsx" "{\"source\":\"open_data\",\"correspondance\":$CORR_OD,\"licence\":\"Licence ouverte TEST\",\"producteur\":\"TEST Institut de la statistique\",\"precisionFichier\":20}"
chk "la ligne vide du classeur est comptée : le restaurant est la ligne 4 du tableur" "200|2,4" \
    "$(appel POST "/etablissements/import?communeId=$A" "$T_A" "$T/i_od.json")|$(val "','.join(str(l['numero']) for l in d['lignes'])")"
# Un classeur écrit par un générateur qui préfixe ses balises (« x:row »), ses textes
# partagés rangés sous un autre nom, trouvés par leur relation.
python3 - "$T/prefixe.xlsx" <<'PY'
import sys, zipfile
ns = 'xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
with zipfile.ZipFile(sys.argv[1], 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('xl/workbook.xml', f'<?xml version="1.0"?><x:workbook {ns}><x:sheets><x:sheet name="Liste" sheetId="1" r:id="R1"/></x:sheets></x:workbook>')
    z.writestr('xl/_rels/workbook.xml.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="R1" Target="/xl/worksheets/feuille.xml" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet"/><Relationship Id="R2" Target="textes_partages.xml" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings"/></Relationships>')
    z.writestr('xl/textes_partages.xml', f'<?xml version="1.0"?><x:sst {ns}><x:si><x:t>nom_etab</x:t></x:si><x:si><x:t>type</x:t></x:si><x:si><x:r><x:t>TEST </x:t></x:r><x:r><x:t>Préfixé</x:t></x:r></x:si></x:sst>')
    z.writestr('xl/worksheets/feuille.xml', f'<?xml version="1.0"?><x:worksheet {ns}><x:sheetData><x:row r="1"><x:c r="A1" t="s"><x:v>0</x:v></x:c><x:c r="B1" t="s"><x:v>1</x:v></x:c></x:row><x:row r="2"><x:c r="A2" t="s"><x:v>2</x:v></x:c><x:c r="B2" t="inlineStr"><x:is><x:t>Café</x:t></x:is></x:c></x:row></x:sheetData></x:worksheet>')
PY
corps "$T/c_prefixe.json" "$T/prefixe.xlsx" "export_prefixe.xlsx" '{"source":"open_data"}'
chk "un classeur aux balises préfixées, textes partagés sous un autre nom : lu (en-têtes et texte mis en forme)" "200|Liste|nom_etab,type|TEST Préfixé" \
    "$(appel POST "/etablissements/import/colonnes?communeId=$B" "$T_B" "$T/c_prefixe.json")|$(val "d['feuille']")|$(val "','.join(d['entetes'])")|$(val "d['exemples'][0][0]")"
corps "$T/v_od.json" "$T/jeu.xlsx" "etablissements_opendata.xlsx" "{\"source\":\"open_data\",\"correspondance\":$CORR_OD,\"licence\":\"Licence ouverte TEST\",\"producteur\":\"TEST Institut de la statistique\",\"urlSource\":\"https://donnees.example.tn/etablissements\",\"precisionFichier\":20,\"valider\":true}"
chk "validé avec sa licence, son producteur et une précision déclarée : 2 créés, « open data », positionnés" "201|2|2|2" \
    "$(appel POST "/etablissements/import?communeId=$A" "$T_A" "$T/v_od.json")|$(val "d['crees']")|$(sql "SELECT count(*) FROM commerces WHERE commune_id = '$A' AND source_creation = 'open_data' AND geom IS NOT NULL AND precision_m = 20")|$(sql "SELECT count(*) FROM commerces WHERE commune_id = '$A' AND nom IN ('TEST Lycée Ibn Khaldoun', 'TEST Restaurant الواحة') AND categorie_activite IN ('ecole', 'restaurant')")"
chk "le journal garde la licence et le producteur, lisibles par la FNCT ; le directeur de B ne voit rien" "200|Licence ouverte TEST|TEST Institut de la statistique|200|0" \
    "$(appel GET "/etablissements/imports?communeId=$A" "$T_F")|$(val "next(i['licence'] for i in d if i['source']=='open_data')")|$(val "next(i['producteur'] for i in d if i['source']=='open_data')")|$(appel GET "/etablissements/imports?communeId=$A" "$T_B")|$(val "len(d)")"
chk "un modèle par type de fichier : TCL et open data, chacun le sien" "2" "$(sql "SELECT count(*) FROM modeles_import_etablissements WHERE commune_id = '$A'")"

# -----------------------------------------------------------------------------
echo
echo "8. Ce que la base tient d'elle-même"
chk "un import validé ne se réécrit pas" "permission denied" \
    "$(en_base admin_commune "$ID_A" "$A" "UPDATE imports_etablissements SET nb_crees = 99 WHERE id = '$IMP1'")"
chk "… même en administrateur" IMPORT_JOURNALISE \
    "$($PSQL -c "BEGIN; UPDATE imports_etablissements SET nb_crees = 99 WHERE id = '$IMP1'; ROLLBACK;" 2>&1 | grep -oE 'IMPORT_[A-Z_]+' | head -1)"
chk "un import qui disparaît (avec sa commune) emporte ses établissements, sans heurter leur gel" "ok" \
    "$($PSQL -c "BEGIN; DELETE FROM imports_etablissements WHERE id = '$IMP1'; ROLLBACK;" 2>&1 | grep -oE 'ERROR|IMPORT_[A-Z_]+' | head -1 | grep . || echo ok)"
chk "un établissement ne change pas d'import" IMPORT_FIGE \
    "$(en_base admin_commune "$ID_A" "$A" "UPDATE commerces SET import_ligne = 3 WHERE commune_id = '$A' AND nom = 'TEST Hôtel des Oliviers'")"
chk "un jeu open data sans licence est refusé par la base" imports_etab_licence \
    "$(en_base admin_commune "$ID_A" "$A" "INSERT INTO imports_etablissements (commune_id, source, nom_fichier, empreinte_fichier, correspondance) VALUES ('$A', 'open_data', 'x.csv', repeat('a', 64), '{}')")"
chk "une correspondance vers une catégorie inconnue est refusée par la base" CATEGORIE_INCONNUE \
    "$(en_base admin_commune "$ID_A" "$A" "INSERT INTO correspondances_activites (commune_id, activite_forme, activite, categorie_activite) VALUES ('$A', 'tabac', 'Tabac', 'casino')")"
chk "une correspondance ne se supprime pas" "permission denied" \
    "$(en_base admin_commune "$ID_A" "$A" "UPDATE correspondances_activites SET deleted_at = now() WHERE commune_id = '$A'")"
chk "la FNCT n'écrit ni import ni correspondance en base" "violates row-level security|violates row-level security" \
    "$(en_base super_admin_fnct "$ID_F" "" "INSERT INTO correspondances_activites (commune_id, activite_forme, activite, categorie_activite) VALUES ('$A', 'tabac', 'Tabac', 'cafe')")|$(en_base super_admin_fnct "$ID_F" "" "INSERT INTO imports_etablissements (commune_id, source, nom_fichier, empreinte_fichier, correspondance) VALUES ('$A', 'import_tcl', 'x.csv', repeat('a', 64), '{}')")"
chk "un prestataire n'en voit aucune ligne" "0|0|0" \
    "$($PSQL -c "BEGIN; SELECT set_config('app.role', 'gestionnaire_prestataire', true), set_config('app.user_id', '$ID_P', true), set_config('app.commune_id', '$A', true); SET LOCAL ROLE siipi_app; SELECT 'n:' || (SELECT count(*) FROM imports_etablissements) || ':' || (SELECT count(*) FROM modeles_import_etablissements) || ':' || (SELECT count(*) FROM correspondances_activites); ROLLBACK;" 2>&1 | grep -oE '^n:[0-9:]+' | cut -d: -f2- | tr ':' '|')"

echo
base_reelle_intacte "pendant la campagne"

# -----------------------------------------------------------------------------
nettoyer
chk "en partant : les communes de test, leurs établissements, imports, modèles et correspondances, et les comptes temporaires sont effacés" "0|0|0|0|0|0" \
    "$(sql "SELECT count(*) FROM communes WHERE id IN ($ESSAI)")|$(sql "SELECT count(*) FROM commerces WHERE commune_id IN ($ESSAI)")|$(sql "SELECT count(*) FROM imports_etablissements WHERE commune_id IN ($ESSAI)")|$(sql "SELECT count(*) FROM modeles_import_etablissements WHERE commune_id IN ($ESSAI)")|$(sql "SELECT count(*) FROM correspondances_activites WHERE commune_id IN ($ESSAI)")|$(sql "SELECT count(*) FROM users WHERE email LIKE 'test.compte.%@siipi.tn'")"
base_reelle_intacte "en partant"

echo
if [ "$fail" -eq 0 ]; then
  printf '\033[32m%s tests réussis, aucun échec.\033[0m\n\n' "$pass"; exit 0
else
  printf '\033[31m%s réussis, %s ÉCHOUÉS.\033[0m\n\n' "$pass" "$fail"; exit 1
fi
