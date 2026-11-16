#!/usr/bin/env bash
# =============================================================================
# v0.15.97 — jalon G, lot G5a : l'import d'un export Kobo des levées (migration 105).
#
# Elle commence par ce qui est REFUSÉ :
#   - l'import par la FNCT, par un prestataire, par le directeur d'une autre commune ;
#     un ancien classeur .xls ; une correspondance sans la clé de la soumission ;
#   - à la ligne, sans rien deviner : un établissement donné par son nom, un
#     matricule inconnu, un flux à préciser (l'établissement en a deux), un voyage à
#     préciser (le circuit en fait deux), une date future, une date et heure sans
#     fuseau, une date JJ/MM que la colonne ne prouve pas, un nombre dans une date de
#     CSV, un circuit dont le nom désigne deux circuits, une clé deux fois dans le
#     fichier, deux lignes pour la même levée ;
#   - une soumission déjà reçue avec un autre contenu ; une validation sans rien à
#     proposer ; l'aperçu de la base sondé par une autre commune.
# Puis l'aperçu, les propositions écrites (source kobo, ligne du fichier, journal
# figé, correspondance gardée), le fichier rejoué (« déjà reçu »), l'index de
# répétition, l'heure ramenée à Tunis, les classeurs (numéro de série Excel,
# calendrier 1900 et 1904), et la validation des propositions par la commune.
#
#   docker compose exec -T api npm run test:import-levees
# =============================================================================

set -u
cd "$(dirname "$0")/.." || exit 1
API="${API_URL:-http://localhost:4000}"
PSQL="psql -q -tA -h ${PGHOST:-localhost} -p ${PGPORT:-5432} -U ${PGUSER:-siipi_admin} -d ${PGDATABASE:-siipi_national}"
pass=0; fail=0
T=$(mktemp -d)
A=test_implev_a; B=test_implev_b
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
envoi() { # chemin jeton fichier du corps — code HTTP, corps dans $T/r.json
  curl -s -o "$T/r.json" -w '%{http_code}' -X POST "$API$1" -H "Authorization: Bearer $2" \
    -H 'Content-Type: application/json' --data-binary "@$3"
}
val() { python3 -c "import json;d=json.load(open('$T/r.json'));print($1)" 2>/dev/null || echo erreur; }
erreur_contient() { val "1 if '$1' in d.get('error','') else 0"; }
en_base() { # rôle utilisateur commune instruction — le refus de la base, ou « ok »
  $PSQL -c "BEGIN; SELECT set_config('app.role', '$1', true), set_config('app.user_id', '$2', true), set_config('app.commune_id', '$3', true);
            SET LOCAL ROLE siipi_app; $4; ROLLBACK;" 2>&1 \
    | grep -oE '^ERROR: +[A-Z_]+(:|$)|permission denied|violates row-level security' | head -1 \
    | sed -E 's/^ERROR: +//; s/:$//' | grep . || echo ok
}
# corps <sortie> <fichier source> <nomFichier> [JSON en plus] — le corps d'un envoi, le fichier en base64.
corps() {
  python3 - "$@" <<'PY'
import base64, json, sys
sortie, source, nom = sys.argv[1], sys.argv[2], sys.argv[3]
extra = json.loads(sys.argv[4]) if len(sys.argv) > 4 and sys.argv[4] else {}
d = {"nomFichier": nom, "contenu": base64.b64encode(open(source, "rb").read()).decode()}
d.update(extra)
json.dump(d, open(sortie, "w"), ensure_ascii=False)
PY
}
ligne() { # numéro — la ligne de l'aperçu, en « action:premier mot de l'erreur »
  val "next((l['action'] + ':' + (l['erreurs'][0] if l['erreurs'] else '')) for l in d['lignes'] if l['numero']==$1)"
}
version_cv() { sql "SELECT xmin FROM conventions_commerciales WHERE id = '$1'"; }

. tests/outils/communes_essai.sh
. tests/outils/comptes_temporaires.sh
. tests/outils/base_reelle.sh
. tests/outils/tables_nationales.sh
. tests/outils/convention_signee.sh
nettoyer() {
  effacer_conventions_essai "$ESSAI"
  effacer_communes_essai "$ESSAI"
  retirer_comptes_temporaires
}
nettoyer
garder_tables_nationales elements_listes_nationales
trap 'rendre_tables_nationales; nettoyer; rm -rf "$T" "$TABLES_NATIONALES_DIR"' EXIT
releve_base_reelle

commune_essai "$A" "TEST commune A de l'import des levées"
commune_essai "$B" "TEST commune B de l'import des levées"
compte_temporaire admin_commune "$A" "Directeur A"; T_A=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP"); ID_A=$COMPTE_ID
compte_temporaire admin_commune "$B" "Directeur B"; T_B=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP"); ID_B=$COMPTE_ID
compte_temporaire super_admin_fnct "" "FNCT"; T_F=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP")
compte_temporaire gestionnaire_prestataire "$A" "Prestataire"; T_P=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP")
[ -n "$T_A" ] && [ -n "$T_B" ] && [ -n "$T_F" ] && [ -n "$T_P" ] || { echo "API injoignable sur $API, ou compte temporaire refusé" >&2; exit 1; }

JOUR=$(sql "SELECT app.jour_tunis()")
HIER=$(sql "SELECT app.jour_tunis() - 1")
AVANT_HIER=$(sql "SELECT app.jour_tunis() - 2")
J3=$(sql "SELECT app.jour_tunis() - 3")
DEMAIN=$(sql "SELECT app.jour_tunis() + 1")
D0=$(sql "SELECT app.jour_tunis() - 25")
DEBUT=$(sql "SELECT app.jour_tunis() - 30")
FIN=$(sql "SELECT ((app.jour_tunis() - 30) + interval '1 year')::date - 1")
ANC=$(sql "SELECT extract(year FROM app.jour_tunis())::int")
GRILLE_DEBUT="$((ANC - 2))-01-01"

$PSQL -c "INSERT INTO elements_listes_nationales (liste, code, libelle_fr, libelle_ar, date_effet, dangereux, provisoire, reference) VALUES
            ('flux_assimiles', 'test_cartons', 'TEST Cartons', 'كرتون', DATE '2000-01-01', false, true, 'TEST import des levées'),
            ('flux_assimiles', 'test_verre', 'TEST Verre', 'بلور', DATE '2000-01-01', false, true, 'TEST import des levées')" >/dev/null
etab() { appel POST "/etablissements?communeId=$A" "$T_A" "$1" >/dev/null; val "d['id']"; }
E1=$(etab '{"nom":"TEST Café Kobo","categorieActivite":"cafe","matriculeFiscal":"7654331K"}')
E2=$(etab '{"nom":"TEST Hôtel Kobo","categorieActivite":"hotel","matriculeFiscal":"7654332L"}')
for e in "$E1" "$E2"; do case "$e" in *-*-*-*-*) ;; *) echo "Un établissement de départ n'a pas pu être inscrit" >&2; exit 1 ;; esac; done
appel POST "/grilles-tarifaires?communeId=$A" "$T_A" \
  "{\"intitule\":\"TEST Grille Kobo\",\"referenceArrete\":\"TEST-ARRETE-KOBO\",\"dateArrete\":\"$GRILLE_DEBUT\",\"dateEffet\":\"$GRILLE_DEBUT\",\"lignes\":[{\"categorie\":\"cafe\",\"mode\":\"reel_levee\",\"tarif\":2},{\"categorie\":\"hotel\",\"mode\":\"reel_levee\",\"tarif\":3}]}" >/dev/null
G_A=$(val "d['id']")
appel POST "/grilles-tarifaires/$G_A/approbation" "$T_A" \
  "{\"dateApprobation\":\"$GRILLE_DEBUT\",\"reference\":\"TEST visa de la tutelle\",\"version\":\"$(sql "SELECT xmin FROM grilles_tarifaires WHERE id = '$G_A'")\"}" >/dev/null
[ "$(sql "SELECT date_approbation_tutelle IS NOT NULL FROM grilles_tarifaires WHERE id = '$G_A'")" = t ] || { echo "La grille n'a pas pu être approuvée" >&2; exit 1; }
signer_convention() { # établissement lignes(JSON)
  local id
  appel POST "/conventions?communeId=$A" "$T_A" "{\"commerceId\":\"$1\",\"dateDebut\":\"$DEBUT\",\"dateFin\":\"$FIN\",\"lignes\":$2}" >/dev/null
  id=$(val "d['id']")
  appel POST "/conventions/$id/instruire" "$T_A" "{\"version\":\"$(version_cv "$id")\"}" >/dev/null
  appel POST "/conventions/$id/signer" "$T_A" "{\"version\":\"$(version_cv "$id")\",\"dateSignature\":\"$JOUR\",\"referenceSignature\":\"TEST dossier de départ\"}" >/dev/null
  [ "$(val "d['statut']")" = signee ] && echo "$id"
}
CV1=$(signer_convention "$E1" '[{"fluxCode":"test_cartons","leveesParSemaine":6},{"fluxCode":"test_verre","leveesParSemaine":2}]')
CV2=$(signer_convention "$E2" '[{"fluxCode":"test_cartons","leveesParSemaine":6}]')
for c in "$CV1" "$CV2"; do case "$c" in *-*-*-*-*) ;; *) echo "Une convention de départ n'a pas pu être signée" >&2; exit 1 ;; esac; done
circuit() { # code nom voyages
  sql "INSERT INTO circuits (commune_id, nom, code, jours_passage, actif, date_debut, voyages_par_jour)
       VALUES ('$A', '$2', NULLIF('$1', ''), ARRAY[1,2,3,4,5,6,7]::smallint[], true, app.jour_tunis() - 60, $3) RETURNING id" | head -1
}
C1=$(circuit TIMP1 "TEST circuit Kobo" 2)
C2=$(circuit TIMP2 "TEST même nom" 1)
C3=$(circuit "" "TEST même nom" 1)
point() { sql "INSERT INTO points_collecte (circuit_id, commune_id, ordre, nom, type, geom) VALUES ('$1', '$A', 1, 'TEST arrêt', 'point_de_collecte', ST_SetSRID(ST_MakePoint(10.0, 36.0), 4326)) RETURNING id" | head -1; }
P1=$(point "$C1"); P2=$(point "$C2")
for x in "$C1" "$C2" "$C3" "$P1" "$P2"; do case "$x" in *-*-*-*-*) ;; *) echo "Un circuit ou un point n'a pas pu être posé" >&2; exit 1 ;; esac; done
appel POST "/dessertes?communeId=$A" "$T_A" "{\"commerceId\":\"$E1\",\"pointId\":\"$P1\",\"dateDebut\":\"$D0\"}" >/dev/null
appel POST "/dessertes?communeId=$A" "$T_A" "{\"commerceId\":\"$E2\",\"pointId\":\"$P2\",\"dateDebut\":\"$D0\"}" >/dev/null
[ "$(sql "SELECT count(*) FROM dessertes_commerces WHERE commune_id = '$A'")" = 2 ] || { echo "Les dessertes de départ n'ont pas pu être posées" >&2; exit 1; }

# L'export Kobo : une soumission par ligne, la clé en « _uuid », l'index de répétition en « _index ».
cat > "$T/kobo.csv" <<CSV
date_levee;heure;matricule;flux;voyage;circuit;_uuid;_index
$HIER;08:15;7654331K;test_cartons;1;TIMP1;u-0001;
$HIER;08:16;7654331K;;1;TIMP1;u-0002;
$HIER;;7654332L;TEST Cartons;;;u-0003;
$HIER;;7654331K;test_verre;;TIMP1;u-0004;
$HIER;;TEST Café Kobo;test_cartons;1;;u-0005;
$HIER;;9999999Z;test_cartons;1;;u-0006;
$DEMAIN;;7654332L;test_cartons;;;u-0007;
$HIER;;7654331K;test_cartons;1;TIMP1;u-0001;
$HIER;;7654331K;test_cartons;1;TIMP1;u-0008;
${HIER}T09:30:00;;7654332L;test_cartons;;;u-0009;
${AVANT_HIER}T23:30:00.000Z;;7654331K;test_verre;2;TIMP1;u-0010;
$HIER;;7654332L;test_cartons;;TEST même nom;u-0011;
$HIER;;7654331K;test_cartons;2;TIMP1;u-0012;1
$AVANT_HIER;;7654332L;test_cartons;;;u-0012;2
CSV
CORR='{"date":"date_levee","heure":"heure","etablissement":"matricule","flux":"flux","voyage":"voyage","circuit":"circuit","cle":"_uuid","repetition":"_index"}'
corps "$T/c.json" "$T/kobo.csv" "kobo_levees.csv"
corps "$T/v0.json" "$T/kobo.csv" "kobo_levees.csv" "{\"correspondance\":$CORR}"
corps "$T/v1.json" "$T/kobo.csv" "kobo_levees.csv" "{\"correspondance\":$CORR,\"valider\":true}"

# -----------------------------------------------------------------------------
echo
echo "1. Ce qui est refusé"
chk "la FNCT n'importe pas : 403 ; un prestataire non plus : 403" "403|403" \
  "$(envoi "/levees/import?communeId=$A" "$T_F" "$T/v0.json")|$(envoi "/levees/import?communeId=$A" "$T_P" "$T/v0.json")"
chk "le directeur de B, dans A : introuvable (404)" 404 "$(envoi "/levees/import?communeId=$A" "$T_B" "$T/v0.json")"
printf '\320\317\021\340\241\261\032\341ancien' > "$T/ancien.xls"
corps "$T/xls.json" "$T/ancien.xls" "ancien.xls"
chk "un ancien classeur .xls : 400, qui dit de l'enregistrer en .xlsx" "400|1" \
  "$(envoi "/levees/import/colonnes?communeId=$A" "$T_A" "$T/xls.json")|$(erreur_contient '.xlsx')"
corps "$T/sans_cle.json" "$T/kobo.csv" "kobo_levees.csv" '{"correspondance":{"date":"date_levee","etablissement":"matricule","cle":null}}'
chk "une correspondance sans la clé de la soumission : 400" "400|1" \
  "$(envoi "/levees/import?communeId=$A" "$T_A" "$T/sans_cle.json")|$(erreur_contient 'Clé de la soumission')"
chk "en base, l'aperçu de la base ne se sonde pas depuis une autre commune" LEVEE_HORS_PERIMETRE \
  "$(en_base admin_commune "$ID_B" "$B" "SELECT * FROM app.examiner_levees('$A', '[]'::jsonb)")"

# -----------------------------------------------------------------------------
echo
echo "2. La correspondance proposée, puis l'aperçu"
chk "les colonnes de Kobo reconnues (date, matricule, clé) ; « _index », position dans l'export, jamais proposé" "200|date_levee|matricule|_uuid|None|14" \
  "$(envoi "/levees/import/colonnes?communeId=$A" "$T_A" "$T/c.json")|$(val "d['correspondance']['date']")|$(val "d['correspondance']['etablissement']")|$(val "d['correspondance']['cle']")|$(val "d['correspondance']['repetition']")|$(val "d['lignes']")"
chk "l'aperçu : 5 à proposer, 9 erreurs, rien d'écrit" "200|5|9|0|False|0" \
  "$(envoi "/levees/import?communeId=$A" "$T_A" "$T/v0.json")|$(val "d['resume']['proposer']")|$(val "d['resume']['erreur']")|$(val "d['resume']['deja_recue']")|$(val "d['ecrit']")|$(sql "SELECT count(*) FROM levees WHERE commune_id = '$A'")"
chk "ligne 2 : proposée ; ligne 4 : le flux libellé « TEST Cartons » reconnu, le voyage 1 du circuit d'un seul voyage" "proposer:|proposer:|test_cartons|1" \
  "$(ligne 2)|$(ligne 4)|$(val "next(l['flux_code'] for l in d['lignes'] if l['numero']==4)")|$(val "next(l['voyage'] for l in d['lignes'] if l['numero']==4)")"
chk "ligne 3 : deux flux sous convention, il faut le préciser" 1 "$(val "1 if 'précisez lequel' in next(l['erreurs'][0] for l in d['lignes'] if l['numero']==3) else 0")"
chk "ligne 5 : un voyage à préciser (le circuit en fait deux)" 1 "$(val "1 if 'précisez celui' in next(l['erreurs'][0] for l in d['lignes'] if l['numero']==5) else 0")"
chk "ligne 6 : un nom ne désigne pas un établissement" 1 "$(val "1 if 'pas à son nom' in next(l['erreurs'][0] for l in d['lignes'] if l['numero']==6) else 0")"
chk "ligne 7 : un matricule inconnu" 1 "$(val "1 if 'matricule fiscal 9999999Z' in next(l['erreurs'][0] for l in d['lignes'] if l['numero']==7) else 0")"
chk "ligne 8 : une levée de demain" 1 "$(val "1 if 'pas encore arrivé' in next(l['erreurs'][0] for l in d['lignes'] if l['numero']==8) else 0")"
chk "ligne 9 : la même clé que la ligne 2" 1 "$(val "1 if 'même clé que la ligne 2' in next(l['erreurs'][0] for l in d['lignes'] if l['numero']==9) else 0")"
chk "ligne 10 : la même levée que la ligne 2, sous une autre clé" 1 "$(val "1 if 'même levée que la ligne 2' in next(l['erreurs'][0] for l in d['lignes'] if l['numero']==10) else 0")"
chk "ligne 11 : une date et heure sans fuseau" 1 "$(val "1 if 'sans fuseau' in next(l['erreurs'][0] for l in d['lignes'] if l['numero']==11) else 0")"
chk "ligne 12 : 23 h 30 en temps universel, c'est 00 h 30 le lendemain à Tunis" "proposer:|$HIER|00:30" \
  "$(ligne 12)|$(val "next(l['date'] for l in d['lignes'] if l['numero']==12)")|$(val "next(l['heure'] for l in d['lignes'] if l['numero']==12)")"
chk "ligne 13 : un nom de circuit qui en désigne deux" 1 "$(val "1 if 'désigne 2 circuits' in next(l['erreurs'][0] for l in d['lignes'] if l['numero']==13) else 0")"
chk "lignes 14 et 15 : une soumission, deux levées, distinguées par l'index de répétition" "proposer:|proposer:" "$(ligne 14)|$(ligne 15)"

# -----------------------------------------------------------------------------
echo
echo "3. Les propositions écrites"
chk "la validation : 201, 5 propositions" "201|True|5" \
  "$(envoi "/levees/import?communeId=$A" "$T_A" "$T/v1.json")|$(val "d['ecrit']")|$(val "d['proposees']")"
IMP=$(val "d['importId']")
chk "en base : 5 levées proposées, source kobo, rattachées à l'import et à leur ligne" "5|5|5|2,4,12,14,15" \
  "$(sql "SELECT count(*) FROM levees WHERE commune_id = '$A' AND statut = 'proposee'")|$(sql "SELECT count(*) FROM levees WHERE commune_id = '$A' AND source = 'kobo'")|$(sql "SELECT count(*) FROM levees WHERE import_id = '$IMP'")|$(sql "SELECT string_agg(import_ligne::text, ',' ORDER BY import_ligne) FROM levees WHERE import_id = '$IMP'")"
chk "la ligne 12 garde son jour et son heure de Tunis" "$HIER|00:30:00" \
  "$(sql "SELECT date_levee || '|' || heure_levee FROM levees WHERE import_id = '$IMP' AND import_ligne = 12")"
chk "le journal de l'import : figé, avec ses comptes" "5|0|9|IMPORT_JOURNALISE" \
  "$(sql "SELECT nb_proposees || '|' || nb_deja_recues || '|' || nb_erreurs FROM imports_levees WHERE id = '$IMP'")|$($PSQL -c "UPDATE imports_levees SET nb_erreurs = 0 WHERE id = '$IMP'" 2>&1 | grep -oE 'IMPORT_JOURNALISE' | head -1)"
chk "la correspondance est gardée pour l'import suivant" "200|enregistree|enregistree|True" \
  "$(envoi "/levees/import/colonnes?communeId=$A" "$T_A" "$T/c.json")|$(val "d['provenance']['date']")|$(val "d['provenance']['repetition']")|$(val "d['modeleEnregistre']")"
chk "le journal se lit (commune et FNCT)" "200|1|200" \
  "$(appel GET "/levees/imports?communeId=$A" "$T_A")|$(val "len(d)")|$(appel GET "/levees/imports?communeId=$A" "$T_F")"

echo
echo "4. Le fichier rejoué, la soumission modifiée"
chk "le même fichier : 5 « déjà reçues », rien à proposer" "200|5|0" \
  "$(envoi "/levees/import?communeId=$A" "$T_A" "$T/v0.json")|$(val "d['resume']['deja_recue']")|$(val "d['resume']['proposer']")"
chk "… et sa validation ne crée rien : 400, qui le dit" "400|1|5" \
  "$(envoi "/levees/import?communeId=$A" "$T_A" "$T/v1.json")|$(erreur_contient 'Rien à proposer')|$(sql "SELECT count(*) FROM levees WHERE commune_id = '$A'")"
printf 'date_levee;matricule;flux;voyage;circuit;_uuid\n%s;7654331K;test_cartons;2;TIMP1;u-0001\n' "$HIER" > "$T/modifie.csv"
corps "$T/m.json" "$T/modifie.csv" "kobo_modifie.csv" '{"correspondance":{"date":"date_levee","etablissement":"matricule","flux":"flux","voyage":"voyage","circuit":"circuit","cle":"_uuid"}}'
chk "une soumission déjà reçue avec un autre contenu (autre voyage) : erreur, jamais une seconde proposition" 1 \
  "$(envoi "/levees/import?communeId=$A" "$T_A" "$T/m.json" >/dev/null; val "1 if 'autre contenu' in d['lignes'][0]['erreurs'][0] else 0")"
printf 'date_levee;matricule;flux;voyage;circuit;_uuid\n%s;7654331K;test_verre;1;TIMP1;u-0001\n' "$HIER" > "$T/autre_flux.csv"
corps "$T/af.json" "$T/autre_flux.csv" "kobo_autre_flux.csv" '{"correspondance":{"date":"date_levee","etablissement":"matricule","flux":"flux","voyage":"voyage","circuit":"circuit","cle":"_uuid"},"valider":true}'
chk "… ou corrigée dans Kobo vers un autre flux : erreur, rien à proposer, rien de créé" "400|5" \
  "$(envoi "/levees/import?communeId=$A" "$T_A" "$T/af.json")|$(sql "SELECT count(*) FROM levees WHERE commune_id = '$A'")"
printf 'meta/instanceID;meta/rootUuid;_uuid;date_levee;matricule\nuuid:i-1;uuid:r-1;u-9001;%s;7654332L\n' "$J3" > "$T/cles.csv"
corps "$T/cl.json" "$T/cles.csv" "kobo_cles.csv"
corps "$T/cl2.json" "$T/cles.csv" "kobo_cles.csv" '{"correspondance":{"date":"date_levee","etablissement":"matricule","cle":"_uuid"}}'
chk "sans modèle gardé (commune B), la clé proposée est meta/rootUuid, même quand d'autres identifiants la précèdent ; une autre clé retenue est signalée" "200|meta/rootUuid|1" \
  "$(envoi "/levees/import/colonnes?communeId=$B" "$T_B" "$T/cl.json")|$(val "d['correspondance']['cle']")|$(envoi "/levees/import?communeId=$A" "$T_A" "$T/cl2.json" >/dev/null; val "1 if any('meta/rootUuid' in a for a in d['avertissements']) else 0")"
$PSQL -c "INSERT INTO elements_listes_nationales (liste, code, libelle_fr, libelle_ar, date_effet, dangereux, provisoire, reference)
          VALUES ('flux_assimiles', 'test_verre_bis', 'TEST Verre', 'بلور ثان', DATE '2000-01-01', false, true, 'TEST import des levées')" >/dev/null
printf 'date_levee;heure;matricule;flux;_uuid\n%s;;7654332L;TEST Verre;h-1\n%s;23:30:00.000Z;7654332L;test_cartons;h-2\n%s;09:15:00.000+01:00;7654332L;test_cartons;h-3\n' "$J3" "$J3" "$J3" > "$T/heures.csv"
corps "$T/he.json" "$T/heures.csv" "kobo_heures.csv" '{"correspondance":{"date":"date_levee","heure":"heure","etablissement":"matricule","flux":"flux","cle":"_uuid"}}'
chk "un libellé qui désigne deux flux : il faut le code ; une heure à fuseau qui change de jour à Tunis : refusée ; à +01:00, gardée" "1|1|09:15" \
  "$(envoi "/levees/import?communeId=$A" "$T_A" "$T/he.json" >/dev/null; val "1 if 'désigne 2 flux' in d['lignes'][0]['erreurs'][0] else 0")|$(val "1 if 'autre jour' in d['lignes'][1]['erreurs'][0] else 0")|$(val "d['lignes'][2]['heure']")"

echo
echo "5. Les dates d'un fichier, sans rien deviner"
printf 'date_levee;matricule;flux;_uuid\n05/06/2025;7654332L;test_cartons;d-1\n07/08/2025;7654332L;test_cartons;d-2\n' > "$T/ambigu.csv"
corps "$T/amb.json" "$T/ambigu.csv" "ambigu.csv" '{"correspondance":{"date":"date_levee","etablissement":"matricule","flux":"flux","cle":"_uuid"}}'
chk "des dates JJ/MM que la colonne ne prouve pas : refusées, toutes" "200|2|1" \
  "$(envoi "/levees/import?communeId=$A" "$T_A" "$T/amb.json")|$(val "d['resume']['erreur']")|$(val "1 if all('aussi bien' in l['erreurs'][0] for l in d['lignes']) else 0")"
printf 'date_levee;matricule;flux;_uuid\n25/06/2025;7654332L;test_cartons;d-3\n46000;7654332L;test_cartons;d-4\n' > "$T/prouve.csv"
corps "$T/pr.json" "$T/prouve.csv" "prouve.csv" '{"correspondance":{"date":"date_levee","etablissement":"matricule","flux":"flux","cle":"_uuid"}}'
chk "un jour au-delà de 12 prouve JJ/MM (la date se lit : hors desserte) ; un nombre n'est pas une date dans un CSV" "2025-06-25|1|1" \
  "$(envoi "/levees/import?communeId=$A" "$T_A" "$T/pr.json" >/dev/null; val "d['lignes'][0]['date']")|$(val "1 if 'aucun circuit' in d['lignes'][0]['erreurs'][0] else 0")|$(val "1 if 'pas une date' in d['lignes'][1]['erreurs'][0] else 0")"
# Deux classeurs : la même date en numéro de série, calendrier 1900 puis 1904.
classeur() { # sortie calendrier1904(0|1)
  python3 - "$1" "$2" "$J3" <<'PY'
import sys, zipfile, datetime
sortie, c1904, jour = sys.argv[1], sys.argv[2] == '1', sys.argv[3]
d = datetime.date.fromisoformat(jour)
origine = datetime.date(1904, 1, 1) if c1904 else datetime.date(1899, 12, 30)
serie = (d - origine).days + 0.25
ns = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
t = lambda r, v: f'<c r="{r}" t="inlineStr"><is><t>{v}</t></is></c>'
rows = ('<row r="1">' + t('A1', 'date_levee') + t('B1', 'matricule') + t('C1', 'flux') + t('D1', '_uuid') + '</row>'
        + f'<row r="2"><c r="A2"><v>{serie}</v></c>' + t('B2', '7654332L') + t('C2', 'test_cartons') + t('D2', 'x-1904' if c1904 else 'x-1900') + '</row>')
pr = '<workbookPr date1904="1"/>' if c1904 else ''
with zipfile.ZipFile(sortie, 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>')
    z.writestr('xl/workbook.xml', f'<?xml version="1.0"?><workbook {ns}>{pr}<sheets><sheet name="Levees" sheetId="1" r:id="rId1"/></sheets></workbook>')
    z.writestr('xl/_rels/workbook.xml.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml" Type="ws"/></Relationships>')
    z.writestr('xl/worksheets/sheet1.xml', f'<?xml version="1.0"?><worksheet {ns}><sheetData>{rows}</sheetData></worksheet>')
PY
}
classeur "$T/l1900.xlsx" 0; classeur "$T/l1904.xlsx" 1
CORR_X='{"date":"date_levee","etablissement":"matricule","flux":"flux","cle":"_uuid"}'
corps "$T/x0.json" "$T/l1900.xlsx" "kobo.xlsx" "{\"correspondance\":$CORR_X}"
corps "$T/x4.json" "$T/l1904.xlsx" "kobo_mac.xlsx" "{\"correspondance\":$CORR_X}"
chk "un classeur : le numéro de série devient le jour et l'heure, calendrier 1900 comme 1904" "proposer|$J3|06:00|proposer|$J3|06:00" \
  "$(envoi "/levees/import?communeId=$A" "$T_A" "$T/x0.json" >/dev/null; val "d['lignes'][0]['action']")|$(val "d['lignes'][0]['date']")|$(val "d['lignes'][0]['heure']")|$(envoi "/levees/import?communeId=$A" "$T_A" "$T/x4.json" >/dev/null; val "d['lignes'][0]['action']")|$(val "d['lignes'][0]['date']")|$(val "d['lignes'][0]['heure']")"

echo
echo "6. La commune instruit les propositions de l'import"
IDS=$(sql "SELECT string_agg('\"' || id || '\"', ',') FROM levees WHERE import_id = '$IMP'")
chk "le directeur valide les cinq : validées, toujours rattachées à l'import" "200|5|5" \
  "$(appel POST /levees/valider "$T_A" "{\"ids\":[$IDS]}")|$(val "d['validees']")|$(sql "SELECT count(*) FROM levees WHERE import_id = '$IMP' AND statut = 'validee'")"

# -----------------------------------------------------------------------------
echo
base_reelle_intacte "pendant la campagne"
rendre_tables_nationales
nettoyer
chk "en partant : communes, levées, imports et comptes de test effacés" "0|0|0|0" \
  "$(sql "SELECT count(*) FROM communes WHERE id IN ($ESSAI)")|$(sql "SELECT count(*) FROM levees WHERE commune_id IN ($ESSAI)")|$(sql "SELECT count(*) FROM imports_levees WHERE commune_id IN ($ESSAI)")|$(sql "SELECT count(*) FROM users WHERE email LIKE 'test.compte.%@siipi.tn'")"
base_reelle_intacte "en partant"
tables_nationales_rendues "en partant"

echo
if [ "$fail" -eq 0 ]; then
  printf '\033[32m%s tests réussis, aucun échec.\033[0m\n\n' "$pass"; exit 0
else
  printf '\033[31m%s réussis, %s ÉCHOUÉS.\033[0m\n\n' "$pass" "$fail"; exit 1
fi
