#!/usr/bin/env bash
# =============================================================================
# v0.15.96 — jalon G, lot G4b : les avenants et le renouvellement des conventions
# de propreté (SPEC_G § 3.4 ; décisions du 11 novembre 2026 ; migration 104).
#
# Elle commence par ce qui est REFUSÉ :
#   - un avenant rédigé par la FNCT, par le directeur d'une autre commune, par un
#     prestataire ; sur une convention qui n'est pas signée ; hors de la période de
#     la convention ; avec un flux inconnu, dangereux, ou deux fois ;
#   - en base : un avenant né signé, une écriture hors périmètre, une ligne
#     d'avenant rattachée à une autre convention, une ligne ajoutée à un avenant
#     instruit ou signé, un statut posé à la main ;
#   - l'instruction sans flux, avec une version dépassée, ou qui ne suit pas le
#     dernier avenant signé ; la signature datée de demain, d'avant l'instruction,
#     sans pièce, sans base légale ; l'annulation du document d'un avenant, son
#     émission directe ; la modification ou le retrait d'un avenant signé ;
#   - le renouvellement d'un brouillon, d'une convention résiliée, deux fois ; un
#     renouvellement qui ne commence pas le lendemain ; l'instruction d'un
#     renouvellement dont la convention a été résiliée entre-temps.
# Puis le cycle de l'avenant, son numéro sans trou, son document scellé AV-…, les
# termes en vigueur à une date, le renouvellement (termes repris, flux fermé nommé,
# grille nouvelle, document qui cite la convention renouvelée), « à renouveler »,
# M2-2 inchangé, et qui lit quoi. Les dates se comptent depuis le jour.
#
#   docker compose exec -T api npm run test:avenants
# =============================================================================

set -u
cd "$(dirname "$0")/.." || exit 1
API="${API_URL:-http://localhost:4000}"
PSQL="psql -q -tA -h ${PGHOST:-localhost} -p ${PGPORT:-5432} -U ${PGUSER:-siipi_admin} -d ${PGDATABASE:-siipi_national}"
pass=0; fail=0
T=$(mktemp -d)
A=test_aven_a; B=test_aven_b
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
erreur_contient() { val "1 if '$1' in d.get('error','') else 0"; }
en_base() { # rôle utilisateur commune instruction [préambule en administrateur] — le refus de la base, ou « ok »
  $PSQL -c "BEGIN; ${5:+$5;} SELECT set_config('app.role', '$1', true), set_config('app.user_id', '$2', true), set_config('app.commune_id', '$3', true);
            SET LOCAL ROLE siipi_app; $4; ROLLBACK;" 2>&1 \
    | grep -oE '^ERROR: +[A-Z_]+:|permission denied|violates row-level security|violates (check|unique) constraint "[a-z_]+"' | head -1 \
    | sed -E 's/^ERROR: +//; s/:$//; s/violates (check|unique) constraint "([a-z_]+)"/\2/' | grep . || echo ok
}
version_cv() { sql "SELECT xmin FROM conventions_commerciales WHERE id = '$1'"; }
version_av() { sql "SELECT xmin FROM avenants_convention WHERE id = '$1'"; }
corps_av() { # date_effet [lignes JSON] [champs en plus]
  printf '{"dateEffet":"%s","lignes":%s%s}' "$1" "${2:-[]}" "${3:+,$3}"
}

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
# Les flux de test s'inscrivent dans la liste nationale (et l'un s'y ferme) : elle est
# gardée, et rendue ligne entière en partant.
garder_tables_nationales elements_listes_nationales
trap 'rendre_tables_nationales; nettoyer; rm -rf "$T" "$TABLES_NATIONALES_DIR"' EXIT
releve_base_reelle

commune_essai "$A" "TEST commune A des avenants"
commune_essai "$B" "TEST commune B des avenants"
compte_temporaire admin_commune "$A" "Directeur A"; T_A=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP"); ID_A=$COMPTE_ID
compte_temporaire admin_commune "$B" "Directeur B"; T_B=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP"); ID_B=$COMPTE_ID
compte_temporaire super_admin_fnct "" "FNCT des avenants"; T_F=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP"); ID_F=$COMPTE_ID
compte_temporaire gestionnaire_prestataire "$A" "Prestataire de A"; T_P=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP"); ID_P=$COMPTE_ID
[ -n "$T_A" ] && [ -n "$T_B" ] && [ -n "$T_F" ] && [ -n "$T_P" ] || { echo "API injoignable sur $API, ou compte temporaire refusé" >&2; exit 1; }

# Les dates se comptent depuis le jour de Tunis.
JOUR=$(sql "SELECT app.jour_tunis()")
HIER=$(sql "SELECT app.jour_tunis() - 1")
DEMAIN=$(sql "SELECT app.jour_tunis() + 1")
J3=$(sql "SELECT app.jour_tunis() + 3")
J4=$(sql "SELECT app.jour_tunis() + 4")
J5=$(sql "SELECT app.jour_tunis() + 5")
J19=$(sql "SELECT app.jour_tunis() + 19")
J20=$(sql "SELECT app.jour_tunis() + 20")
ANC=$(sql "SELECT extract(year FROM app.jour_tunis())::int")
DEBUT=$(sql "SELECT app.jour_tunis() - 30")
VEILLE_DEBUT=$(sql "SELECT app.jour_tunis() - 31")
FIN=$(sql "SELECT ((app.jour_tunis() - 30) + interval '1 year')::date - 1")
APRES_FIN=$(sql "SELECT ((app.jour_tunis() - 30) + interval '1 year')::date")
LENDEMAIN_R=$(sql "SELECT ((app.jour_tunis() - 30) + interval '1 year')::date + 1")
FIN_R=$(sql "SELECT ((((app.jour_tunis() - 30) + interval '1 year')::date) + interval '1 year')::date - 1")
# Une convention qui finit dans 34 jours : « à renouveler ».
# Une convention déjà expirée (signée après coup) : aucun avenant ne s'y écrit.
DEBUT_E=$(sql "SELECT app.jour_tunis() - 400")
FIN_E=$(sql "SELECT ((app.jour_tunis() - 400) + interval '1 year')::date - 1")
DEBUT_X=$(sql "SELECT app.jour_tunis() - 330")
FIN_X=$(sql "SELECT ((app.jour_tunis() - 330) + interval '1 year')::date - 1")
GRILLE_DEBUT="$((ANC - 2))-01-01"

$PSQL -c "INSERT INTO elements_listes_nationales (liste, code, libelle_fr, libelle_ar, date_effet, dangereux, provisoire, reference) VALUES
            ('flux_assimiles', 'test_cartons', 'TEST Cartons', 'كرتون', DATE '2000-01-01', false, true, 'TEST avenants'),
            ('flux_assimiles', 'test_verre', 'TEST Verre', 'بلور', DATE '2000-01-01', false, true, 'TEST avenants'),
            ('flux_assimiles', 'test_plastique', 'TEST Plastique', 'بلاستيك', DATE '2000-01-01', false, true, 'TEST avenants'),
            ('flux_assimiles', 'test_huiles', 'TEST Huiles usagées', 'زيوت مستعملة', DATE '2000-01-01', true, true, 'TEST avenants')" >/dev/null
etab() { appel POST "/etablissements?communeId=$1" "$2" "$3" >/dev/null; val "d['id']"; }
E_CAFE=$(etab "$A" "$T_A" '{"nom":"TEST Café des Avenants","categorieActivite":"cafe","matriculeFiscal":"7654322C"}')
E_HOTEL=$(etab "$A" "$T_A" '{"nom":"TEST Hôtel des Avenants","categorieActivite":"hotel"}')
E_BOUL=$(etab "$A" "$T_A" '{"nom":"TEST Boulangerie des Avenants","categorieActivite":"boulangerie"}')
E_ECOLE=$(etab "$A" "$T_A" '{"nom":"TEST École des Avenants","categorieActivite":"ecole"}')
E_B=$(etab "$B" "$T_B" '{"nom":"TEST Café de B","categorieActivite":"cafe"}')
for e in "$E_CAFE" "$E_HOTEL" "$E_BOUL" "$E_ECOLE" "$E_B"; do
  case "$e" in *-*-*-*-*) ;; *) echo "Un établissement de départ n'a pas pu être inscrit" >&2; exit 1 ;; esac
done
appel POST "/grilles-tarifaires?communeId=$A" "$T_A" \
  "{\"intitule\":\"TEST Grille $ANC\",\"referenceArrete\":\"TEST-ARRETE-$ANC\",\"dateArrete\":\"$GRILLE_DEBUT\",\"dateEffet\":\"$GRILLE_DEBUT\",\"lignes\":[{\"categorie\":\"cafe\",\"mode\":\"forfait_annuel\",\"tarif\":120},{\"categorie\":\"hotel\",\"mode\":\"reel_levee\",\"tarif\":3.5},{\"categorie\":\"boulangerie\",\"mode\":\"forfait_mensuel\",\"tarif\":15},{\"categorie\":\"ecole\",\"mode\":\"forfait_annuel\",\"tarif\":50}]}" >/dev/null
G_A=$(val "d['id']")
appel POST "/grilles-tarifaires/$G_A/approbation" "$T_A" \
  "{\"dateApprobation\":\"$GRILLE_DEBUT\",\"reference\":\"TEST visa de la tutelle\",\"version\":\"$(sql "SELECT xmin FROM grilles_tarifaires WHERE id = '$G_A'")\"}" >/dev/null
[ "$(sql "SELECT date_approbation_tutelle IS NOT NULL FROM grilles_tarifaires WHERE id = '$G_A'")" = t ] || { echo "La grille de A n'a pas pu être approuvée" >&2; exit 1; }
CARTONS='{"fluxCode":"test_cartons","leveesParSemaine":3,"volumeLitres":240}'
CARTONS2='{"fluxCode":"test_cartons","leveesParSemaine":2,"volumeLitres":240}'
VERRE='{"fluxCode":"test_verre","leveesParSemaine":1}'
PLASTIQUE='{"fluxCode":"test_plastique","leveesParSemaine":1,"volumeLitres":120}'
CARTONS5='{"fluxCode":"test_cartons","leveesParSemaine":5}'
# Un conteneur de la commune A, pour une ligne qui le vise (il sera retiré).
K=TEST-AV-K1
$PSQL -c "INSERT INTO conteneurs (id, code, commune_id, type) VALUES ('$K', '$K', '$A', 'carton')" >/dev/null
[ "$(sql "SELECT count(*) FROM conteneurs WHERE id = '$K' AND deleted_at IS NULL")" = 1 ] || { echo "Le conteneur de départ n'a pas pu être posé" >&2; exit 1; }
CARTONS_K="{\"fluxCode\":\"test_cartons\",\"leveesParSemaine\":2,\"conteneurId\":\"$K\"}"

# Une convention signée, bâtie comme la commune la bâtit : brouillon, instruction, signature.
signer_convention() { # établissement début fin — l'identifiant, ou rien
  local id
  appel POST "/conventions?communeId=$A" "$T_A" "{\"commerceId\":\"$1\",\"dateDebut\":\"$2\",\"dateFin\":\"$3\",\"lignes\":[$CARTONS]}" >/dev/null
  id=$(val "d['id']")
  appel POST "/conventions/$id/instruire" "$T_A" "{\"version\":\"$(version_cv "$id")\"}" >/dev/null
  appel POST "/conventions/$id/signer" "$T_A" "{\"version\":\"$(version_cv "$id")\",\"dateSignature\":\"$JOUR\",\"referenceSignature\":\"TEST dossier de départ\"}" >/dev/null
  [ "$(val "d['statut']")" = signee ] && echo "$id"
}
CV=$(signer_convention "$E_CAFE" "$DEBUT" "$FIN")
CV_H=$(signer_convention "$E_HOTEL" "$DEBUT" "$FIN")
CV_X=$(signer_convention "$E_BOUL" "$DEBUT_X" "$FIN_X")
for c in "$CV" "$CV_H" "$CV_X"; do
  case "$c" in *-*-*-*-*) ;; *) echo "Une convention signée de départ n'a pas pu être bâtie" >&2; exit 1 ;; esac
done
# M2-2 lu avant le premier avenant : il ne doit plus bouger.
M22_AVANT=$(appel GET "/kpi/5-axes?communeId=$A&annee=$ANC" "$T_A" >/dev/null; val "next(i['detail']['sous_convention'] for i in d['indicateurs'] if i['code']=='M2-2')")
NUM_CV=$(sql "SELECT d.numero_affiche FROM conventions_commerciales c JOIN documents_emis d ON d.id = c.document_id WHERE c.id = '$CV'")
V_CV_DEPART=$(version_cv "$CV")
# Un brouillon de l'hôtel (pour les refus), qui chevauche sans gêner : un brouillon ne s'oppose à rien.
appel POST "/conventions?communeId=$A" "$T_A" "{\"commerceId\":\"$E_HOTEL\",\"dateDebut\":\"$DEBUT\",\"dateFin\":\"$FIN\",\"lignes\":[$CARTONS]}" >/dev/null
CV_BROU=$(val "d['id']")
case "$CV_BROU" in *-*-*-*-*) ;; *) echo "Le brouillon de départ n'a pas pu être rédigé" >&2; exit 1 ;; esac

# -----------------------------------------------------------------------------
echo
echo "1. Ce qui est refusé à la rédaction d'un avenant"
chk "la FNCT ne rédige pas d'avenant : 403, qui dit que c'est la commune" "403|1" \
    "$(appel POST "/conventions/$CV/avenants" "$T_F" "$(corps_av "$J5" "[$CARTONS2]")")|$(erreur_contient 'modifie par avenant')"
chk "le directeur d'une autre commune : introuvable (404)" 404 "$(appel POST "/conventions/$CV/avenants" "$T_B" "$(corps_av "$J5" "[$CARTONS2]")")"
chk "un prestataire : 403" 403 "$(appel POST "/conventions/$CV/avenants" "$T_P" "$(corps_av "$J5" "[$CARTONS2]")")"
chk "une convention qui n'existe pas : 404" 404 "$(appel POST "/conventions/11111111-1111-4111-8111-111111111111/avenants" "$T_A" "$(corps_av "$J5" "[$CARTONS2]")")"
chk "sur une convention brouillon : 409, qui dit qu'un avenant modifie une convention signée" "409|1" \
    "$(appel POST "/conventions/$CV_BROU/avenants" "$T_A" "$(corps_av "$J5" "[$CARTONS2]")")|$(erreur_contient 'convention signée')"
chk "avant le début de la convention, ou après sa fin : 400, qui donne la période" "400|1|400" \
    "$(appel POST "/conventions/$CV/avenants" "$T_A" "$(corps_av "$VEILLE_DEBUT" "[$CARTONS2]")")|$(erreur_contient 'période')|$(appel POST "/conventions/$CV/avenants" "$T_A" "$(corps_av "$APRES_FIN" "[$CARTONS2]")")"
chk "un flux inconnu (400, nommé), un flux dangereux (400, sa filière), un flux deux fois (400)" "400|1|400|1|400" \
    "$(appel POST "/conventions/$CV/avenants" "$T_A" "$(corps_av "$J5" '[{"fluxCode":"test_plutonium","leveesParSemaine":1}]')")|$(erreur_contient test_plutonium)|$(appel POST "/conventions/$CV/avenants" "$T_A" "$(corps_av "$J5" '[{"fluxCode":"test_huiles","leveesParSemaine":1}]')")|$(erreur_contient filière)|$(appel POST "/conventions/$CV/avenants" "$T_A" "$(corps_av "$J5" "[$CARTONS2,$CARTONS2]")")"
chk "une observation qui porte un octet nul, une date illisible : 400, jamais 500" "400|400" \
    "$(appel POST "/conventions/$CV/avenants" "$T_A" "$(corps_av "$J5" '[]' '"observation":"TEST\u0000nul"')")|$(appel POST "/conventions/$CV/avenants" "$T_A" "$(corps_av "abc" '[]')")"
chk "en base : un avenant né signé" AVENANT_NAISSANCE \
    "$(en_base admin_commune "$ID_A" "$A" "INSERT INTO avenants_convention (convention_id, commune_id, statut, date_effet) VALUES ('$CV', '$A', 'signe', DATE '$J5')")"
chk "… une écriture de la FNCT, ou du directeur de B, hors périmètre avant tout autre contrôle" "AVENANT_HORS_PERIMETRE|AVENANT_HORS_PERIMETRE" \
    "$(en_base super_admin_fnct "$ID_F" "" "INSERT INTO avenants_convention (convention_id, commune_id, statut, date_effet) VALUES ('$CV', '$A', 'brouillon', DATE '$J5')")|$(en_base admin_commune "$ID_B" "$B" "INSERT INTO avenants_convention (convention_id, commune_id, statut, date_effet) VALUES ('$CV', '$A', 'brouillon', DATE '$J5')")"
chk "… une ligne d'origine ajoutée à une convention signée" CONVENTION_FIGEE \
    "$(en_base admin_commune "$ID_A" "$A" "INSERT INTO lignes_convention (convention_id, commune_id, flux_code, levees_par_semaine) VALUES ('$CV', '$A', 'test_verre', 2)")"
chk "aucun avenant n'a été écrit par ces refus" 0 "$(sql "SELECT count(*) FROM avenants_convention WHERE commune_id IN ($ESSAI)")"

# -----------------------------------------------------------------------------
echo
echo "2. Le brouillon d'avenant, puis l'instruction"
chk "le directeur rédige l'avenant : brouillon, sans numéro, la liste complète des déchets couverts" "201|brouillon|None|2" \
    "$(appel POST "/conventions/$CV/avenants" "$T_A" "$(corps_av "$J5" "[$CARTONS2,$VERRE]" '"observation":"TEST verre ajouté"')")|$(val "d['statut']")|$(val "d['numero']")|$(val "len(d['lignes'])")"
AV1=$(val "d['id']")
V_LUE=$(val "d['version']")
chk "… la convention elle-même n'a pas bougé : même version, mêmes termes d'origine" "$V_CV_DEPART|1|3" \
    "$(version_cv "$CV")|$(sql "SELECT count(*) FROM lignes_convention WHERE convention_id = '$CV' AND avenant_id IS NULL AND deleted_at IS NULL")|$(sql "SELECT levees_par_semaine FROM lignes_convention WHERE convention_id = '$CV' AND avenant_id IS NULL AND deleted_at IS NULL")"
chk "… le brouillon se remplace avec la version lue (trois flux) ; une version dépassée : 409, rien n'est écrit" "200|3|409|3" \
    "$(appel PUT "/conventions/avenants/$AV1" "$T_A" "{\"version\":\"$V_LUE\",\"dateEffet\":\"$J5\",\"lignes\":[$CARTONS2,$VERRE,$PLASTIQUE]}")|$(val "len(d['lignes'])")|$(appel PUT "/conventions/avenants/$AV1" "$T_A" "{\"version\":\"$V_LUE\",\"dateEffet\":\"$J5\",\"lignes\":[]}")|$(sql "SELECT count(*) FROM lignes_convention WHERE avenant_id = '$AV1' AND deleted_at IS NULL")"
chk "… les lignes remplacées restent en base, retirées (rien ne s'efface)" 2 "$(sql "SELECT count(*) FROM lignes_convention WHERE avenant_id = '$AV1' AND deleted_at IS NOT NULL")"
chk "instruire avec une version dépassée : 409" 409 "$(appel POST "/conventions/avenants/$AV1/instruire" "$T_A" "{\"version\":\"$V_LUE\"}")"
appel POST "/conventions/$CV/avenants" "$T_A" "$(corps_av "$J5")" >/dev/null; AV_VIDE=$(val "d['id']")
chk "un avenant sans aucun flux ne s'instruit pas : 409" "409|1" \
    "$(appel POST "/conventions/avenants/$AV_VIDE/instruire" "$T_A" "{\"version\":\"$(version_av "$AV_VIDE")\"}")|$(erreur_contient 'au moins un flux')"
chk "l'avenant s'instruit" "200|instruit" "$(appel POST "/conventions/avenants/$AV1/instruire" "$T_A" "{\"version\":\"$(version_av "$AV1")\"}")|$(val "d['statut']")"
chk "instruit, il ne se modifie plus (409) ni ne se retire (409)" "409|409" \
    "$(appel PUT "/conventions/avenants/$AV1" "$T_A" "{\"version\":\"$(version_av "$AV1")\",\"dateEffet\":\"$J5\",\"lignes\":[$CARTONS2]}")|$(appel DELETE "/conventions/avenants/$AV1?version=$(version_av "$AV1")" "$T_A")"
chk "… et la base refuse une ligne de plus, une date changée, un statut posé à la main" "AVENANT_FIGE|AVENANT_FIGE|permission denied" \
    "$(en_base admin_commune "$ID_A" "$A" "INSERT INTO lignes_convention (convention_id, commune_id, avenant_id, flux_code, levees_par_semaine) VALUES ('$CV', '$A', '$AV1', 'test_cartons', 1)")|$(en_base admin_commune "$ID_A" "$A" "UPDATE avenants_convention SET date_effet = DATE '$J4' WHERE id = '$AV1'")|$(en_base admin_commune "$ID_A" "$A" "UPDATE avenants_convention SET statut = 'signe' WHERE id = '$AV1'")"
chk "… une ligne d'avenant rattachée à une autre convention : refusée" CONVENTION_AUTRE \
    "$(en_base admin_commune "$ID_A" "$A" "INSERT INTO lignes_convention (convention_id, commune_id, avenant_id, flux_code, levees_par_semaine) VALUES ('$CV_H', '$A', '$AV_VIDE', 'test_cartons', 1)")"
chk "reprise en brouillon, puis de nouveau instruit" "200|brouillon|200|instruit" \
    "$(appel POST "/conventions/avenants/$AV1/reprendre" "$T_A" "{\"version\":\"$(version_av "$AV1")\"}")|$(val "d['statut']")|$(appel POST "/conventions/avenants/$AV1/instruire" "$T_A" "{\"version\":\"$(version_av "$AV1")\"}")|$(val "d['statut']")"

# -----------------------------------------------------------------------------
echo
echo "3. La signature : le numéro et le document scellé AV-…"
chk "une signature datée de demain, d'avant l'instruction, ou sans pièce : 400" "400|400|400" \
    "$(appel POST "/conventions/avenants/$AV1/signer" "$T_A" "{\"version\":\"$(version_av "$AV1")\",\"dateSignature\":\"$DEMAIN\",\"referenceSignature\":\"TEST avenant 1\"}")|$(appel POST "/conventions/avenants/$AV1/signer" "$T_A" "{\"version\":\"$(version_av "$AV1")\",\"dateSignature\":\"$HIER\",\"referenceSignature\":\"TEST avenant 1\"}")|$(appel POST "/conventions/avenants/$AV1/signer" "$T_A" "{\"version\":\"$(version_av "$AV1")\",\"dateSignature\":\"$JOUR\",\"referenceSignature\":\"x\"}")"
chk "… par la FNCT (403), par le directeur d'une autre commune (404)" "403|404" \
    "$(appel POST "/conventions/avenants/$AV1/signer" "$T_F" "{\"version\":\"$(version_av "$AV1")\",\"dateSignature\":\"$JOUR\",\"referenceSignature\":\"TEST avenant 1\"}")|$(appel POST "/conventions/avenants/$AV1/signer" "$T_B" "{\"version\":\"$(version_av "$AV1")\",\"dateSignature\":\"$JOUR\",\"referenceSignature\":\"TEST avenant 1\"}")"
SANS_BASE="UPDATE elements_listes_nationales SET retire_le = now(), motif_retrait = 'TEST retrait de la campagne' WHERE liste = 'base_legale_assimiles' AND retire_le IS NULL"
chk "sans base légale en vigueur le jour de la signature : refusée par la base" BASE_LEGALE_ABSENTE \
    "$(en_base admin_commune "$ID_A" "$A" "SELECT app.signer_avenant('$AV1', '$(version_av "$AV1")', DATE '$JOUR', 'TEST avenant 1')" "$SANS_BASE")"
# Le brouillon vide est retiré avant la signature : il n'a consommé aucun numéro.
chk "un brouillon d'avenant se retire avec sa version : il reste en base, retiré" "204|1" \
    "$(appel DELETE "/conventions/avenants/$AV_VIDE?version=$(version_av "$AV_VIDE")" "$T_A")|$(sql "SELECT count(*) FROM avenants_convention WHERE id = '$AV_VIDE' AND deleted_at IS NOT NULL")"
chk "le directeur signe : avenant n° 1, document AV- numéro 1 de l'exercice" "200|signe|1|AV-$ANC-00001" \
    "$(appel POST "/conventions/avenants/$AV1/signer" "$T_A" "{\"version\":\"$(version_av "$AV1")\",\"dateSignature\":\"$JOUR\",\"referenceSignature\":\"TEST avenant 1\"}")|$(val "d['statut']")|$(val "d['numero']")|$(val "d['numero_document']")"
DOC1=$(val "d['document_id']")
chk "le document cite la convention et son numéro, la liste complète des déchets couverts, la base légale du jour, et aucun tarif" "1|1|1|1|0" \
    "$(sql "SELECT (contenu->>'convention' = '$NUM_CV' AND contenu->>'avenant' = '1')::int FROM documents_emis WHERE id = '$DOC1'")|$(sql "SELECT (contenu->>'flux' LIKE '%TEST Cartons%2 levée(s) par semaine%' AND contenu->>'flux' LIKE '%TEST Verre%' AND contenu->>'flux' LIKE '%TEST Plastique%')::int FROM documents_emis WHERE id = '$DOC1'")|$(sql "SELECT (contenu->>'base_legale' LIKE '%96-41%(JORT du 10/06/1996)%')::int FROM documents_emis WHERE id = '$DOC1'")|$(sql "SELECT (contenu->>'date_effet' = '$J5' AND contenu->>'date_fin' = '$FIN' AND contenu->>'etablissement' = 'TEST Café des Avenants')::int FROM documents_emis WHERE id = '$DOC1'")|$(sql "SELECT (contenu ? 'tarif' OR contenu::text ILIKE '%montant%')::int FROM documents_emis WHERE id = '$DOC1'")"
$PSQL -c "SELECT contenu FROM documents_emis WHERE id = '$DOC1'" > "$T/contenu.json"
chk "… ses clés sont celles du gabarit, toutes les requises présentes" 1 \
    "$(appel GET /documents/gabarits "$T_A" >/dev/null; python3 -c "
import json
g=json.load(open('$T/r.json'))
gab=[x for x in g if x['type']=='avenant_convention'][0]
champs={c['cle'] for c in gab['champs']}
requis={c['cle'] for c in gab['champs'] if c.get('requis')}
cles=set(json.load(open('$T/contenu.json')).keys())
print(int(len(requis) >= 9 and requis <= cles <= champs))" 2>/dev/null || echo erreur)"
chk "le document s'imprime (A4 bilingue), avec son numéro" "200|1" \
    "$(curl -s -o "$T/doc.html" -w '%{http_code}' "$API/documents/$DOC1/impression" -H "Authorization: Bearer $T_A")|$(grep -c "AV-$ANC-00001" "$T/doc.html" | awk '{print ($1>0)}')"
CONTENU_SQL=$(sed "s/'/''/g" "$T/contenu.json")
chk "son document ne s'annule pas (en base, et par l'API : 409, qui dit qu'un nouvel avenant le corrige) ni ne s'émet directement (en base, et par l'API : 400)" "DOCUMENT_CONVENTION|409|1|DOCUMENT_CONVENTION|400|1|emis" \
    "$(en_base admin_commune "$ID_A" "$A" "SELECT app.annuler_document('$DOC1', 'TEST annulation refusée')")|$(appel POST "/documents/$DOC1/annuler" "$T_A" '{"motif":"TEST annulation refusée"}')|$(erreur_contient 'nouvel avenant')|$(en_base admin_commune "$ID_A" "$A" "SELECT app.emettre_document('$A', 'avenant_convention', '$CONTENU_SQL'::jsonb, 'avenant', '$AV1')")|$(appel POST "/documents?communeId=$A" "$T_A" "{\"type\":\"avenant_convention\",\"contenu\":$(cat "$T/contenu.json")}")|$(erreur_contient 'naît de sa signature')|$(sql "SELECT statut FROM documents_emis WHERE id = '$DOC1'")"
chk "signé, il ne se modifie plus (409), ne se retire pas (409), et la base refuse une ligne de plus ou une observation réécrite" "409|409|AVENANT_FIGE|AVENANT_FIGE" \
    "$(appel PUT "/conventions/avenants/$AV1" "$T_A" "{\"version\":\"$(version_av "$AV1")\",\"dateEffet\":\"$J5\",\"lignes\":[$CARTONS2]}")|$(appel DELETE "/conventions/avenants/$AV1?version=$(version_av "$AV1")" "$T_A")|$(en_base admin_commune "$ID_A" "$A" "INSERT INTO lignes_convention (convention_id, commune_id, avenant_id, flux_code, levees_par_semaine) VALUES ('$CV', '$A', '$AV1', 'test_cartons', 1)")|$(en_base admin_commune "$ID_A" "$A" "UPDATE avenants_convention SET observation = 'TEST réécrite' WHERE id = '$AV1'")"
chk "les termes en vigueur : d'origine la veille de la date d'effet, ceux de l'avenant dès ce jour-là" "1|3|3" \
    "$(sql "SELECT count(*) FROM app.termes_convention('$CV', DATE '$J4')")|$(sql "SELECT levees_par_semaine FROM app.termes_convention('$CV', DATE '$J4')")|$(sql "SELECT count(*) FROM app.termes_convention('$CV', DATE '$J5')")"
chk "… et l'écran les lit aujourd'hui tels qu'ils sont : ceux d'origine, l'avenant signé à côté" "200|1|None|1|1" \
    "$(appel GET "/conventions/$CV" "$T_A")|$(val "len(d['termes_en_vigueur'])")|$(val "d['termes_en_vigueur'][0]['avenant_id']")|$(val "len(d['avenants'])")|$(val "d['avenants_signes']")"

# -----------------------------------------------------------------------------
echo
echo "4. L'ordre des avenants et leur numéro"
appel POST "/conventions/$CV/avenants" "$T_A" "$(corps_av "$J5" "[$CARTONS5,$PLASTIQUE]")" >/dev/null; AV2=$(val "d['id']")
chk "un second avenant qui prend effet le même jour que le premier ne s'instruit pas : 409, qui nomme l'avenant n° 1" "409|1" \
    "$(appel POST "/conventions/avenants/$AV2/instruire" "$T_A" "{\"version\":\"$(version_av "$AV2")\"}")|$(erreur_contient 'avenant n° 1')"
chk "… ni la veille : 409" 409 \
    "$(appel PUT "/conventions/avenants/$AV2" "$T_A" "{\"version\":\"$(version_av "$AV2")\",\"dateEffet\":\"$J3\",\"lignes\":[$CARTONS5,$PLASTIQUE]}" >/dev/null; appel POST "/conventions/avenants/$AV2/instruire" "$T_A" "{\"version\":\"$(version_av "$AV2")\"}")"
chk "après lui, il s'instruit et se signe : avenant n° 2, AV- numéro 2 (le brouillon retiré n'a laissé aucun trou)" "200|2|AV-$ANC-00002" \
    "$(appel PUT "/conventions/avenants/$AV2" "$T_A" "{\"version\":\"$(version_av "$AV2")\",\"dateEffet\":\"$J20\",\"lignes\":[$CARTONS5,$PLASTIQUE]}" >/dev/null; appel POST "/conventions/avenants/$AV2/instruire" "$T_A" "{\"version\":\"$(version_av "$AV2")\"}" >/dev/null; appel POST "/conventions/avenants/$AV2/signer" "$T_A" "{\"version\":\"$(version_av "$AV2")\",\"dateSignature\":\"$JOUR\",\"referenceSignature\":\"TEST avenant 2\"}")|$(val "d['numero']")|$(val "d['numero_document']")"
chk "les termes du 19e jour sont ceux de l'avenant n° 1, ceux du 20e ceux de l'avenant n° 2" "3|2|1" \
    "$(sql "SELECT count(*) FROM app.termes_convention('$CV', DATE '$J19')")|$(sql "SELECT count(*) FROM app.termes_convention('$CV', DATE '$J20')")|$(sql "SELECT count(*) FROM app.termes_convention('$CV', DATE '$J20') t JOIN avenants_convention a ON a.id = t.avenant_id WHERE a.numero = 2 AND t.flux_code = 'test_cartons' AND t.levees_par_semaine = 5")"
chk "M2-2 lu avant les avenants : les trois établissements sous convention" 3 "$M22_AVANT"
chk "M2-2 n'a pas bougé : un établissement sous une seule convention, quel que soit le nombre de ses avenants" "$M22_AVANT" \
    "$(appel GET "/kpi/5-axes?communeId=$A&annee=$ANC" "$T_A" >/dev/null; val "next(i['detail']['sous_convention'] for i in d['indicateurs'] if i['code']=='M2-2')")"
chk "… et la vue des conventions comptées n'a qu'une ligne pour le café" 1 "$(sql "SELECT count(*) FROM conventions_comptees WHERE commerce_id = '$E_CAFE'")"

# -----------------------------------------------------------------------------
echo
echo "5. Le renouvellement"
chk "un brouillon ne se renouvelle pas : 409, qui dit qu'une convention signée se renouvelle" "409|1" \
    "$(appel POST "/conventions/$CV_BROU/renouveler" "$T_A" "{\"version\":\"$(version_cv "$CV_BROU")\"}")|$(erreur_contient 'signée, non résiliée')"
chk "… ni par la FNCT (403), ni par le directeur d'une autre commune (404), ni avec une version dépassée (409)" "403|404|409" \
    "$(appel POST "/conventions/$CV/renouveler" "$T_F" "{\"version\":\"$(version_cv "$CV")\"}")|$(appel POST "/conventions/$CV/renouveler" "$T_B" "{\"version\":\"$(version_cv "$CV")\"}")|$(appel POST "/conventions/$CV/renouveler" "$T_A" '{"version":"1"}')"
chk "en base : un renouvellement qui ne commence pas le lendemain, ou d'un brouillon" "RENOUVELLEMENT_DATES|RENOUVELLEMENT_PRECEDENTE" \
    "$(en_base admin_commune "$ID_A" "$A" "INSERT INTO conventions_commerciales (commune_id, commerce_id, nature, statut, type, exercice, date_debut, date_fin, convention_precedente_id) VALUES ('$A', '$E_CAFE', 'convention', 'brouillon', 'collecte', extract(year FROM DATE '$APRES_FIN' + 1), DATE '$APRES_FIN' + 1, DATE '$FIN_R', '$CV')")|$(en_base admin_commune "$ID_A" "$A" "INSERT INTO conventions_commerciales (commune_id, commerce_id, nature, statut, type, exercice, date_debut, date_fin, convention_precedente_id) VALUES ('$A', '$E_HOTEL', 'convention', 'brouillon', 'collecte', extract(year FROM DATE '$APRES_FIN'), DATE '$APRES_FIN', DATE '$FIN_R', '$CV_BROU')")"
# Le flux plastique se ferme dans la liste nationale : le renouvellement ne le reprend pas, et le dit.
$PSQL -c "UPDATE elements_listes_nationales SET date_fin = DATE '$JOUR', reference_fin = 'TEST fermeture du flux plastique' WHERE liste = 'flux_assimiles' AND code = 'test_plastique' AND retire_le IS NULL" >/dev/null
chk "le directeur renouvelle : un brouillon du lendemain de la fin, pour un an, relié à la convention" "201|brouillon|$APRES_FIN|$FIN_R|$CV|$NUM_CV" \
    "$(appel POST "/conventions/$CV/renouveler" "$T_A" "{\"version\":\"$(version_cv "$CV")\"}")|$(val "d['statut']")|$(val "d['date_debut']")|$(val "d['date_fin']")|$(val "d['convention_precedente_id']")|$(val "d['numero_precedente']")"
R=$(val "d['id']")
chk "… il reprend les termes en vigueur à la fin (l'avenant n° 2 : 5 levées, ni l'origine ni le jour : 3), sauf le flux fermé, qu'il nomme" "test_cartons:5|test_plastique:flux" \
    "$(val "','.join(l['flux_code'] + ':' + str(l['levees_par_semaine']) for l in d['lignes'])")|$(val "','.join(x['flux_code'] + ':' + x['motif'] for x in d['non_reprises'])")"
chk "un second renouvellement : 409" "409|1" \
    "$(appel POST "/conventions/$CV/renouveler" "$T_A" "{\"version\":\"$(version_cv "$CV")\"}")|$(erreur_contient 'déjà son renouvellement')"
chk "la liste dit le lien dans les deux sens, et la convention renouvelée n'est plus « à renouveler »" "$R|brouillon|False|$CV" \
    "$(appel GET "/conventions?communeId=$A" "$T_A" >/dev/null; val "next(c['renouvellement_id'] for c in d if c['id']=='$CV')")|$(val "next(c['statut_renouvellement'] for c in d if c['id']=='$CV')")|$(val "next(c['a_renouveler'] for c in d if c['id']=='$CV')")|$(val "next(c['convention_precedente_id'] for c in d if c['id']=='$R')")"
chk "le brouillon de renouvellement garde son début : changé, 400 ; la fin se corrige" "400|1|200" \
    "$(appel PUT "/conventions/$R" "$T_A" "{\"version\":\"$(version_cv "$R")\",\"dateDebut\":\"$LENDEMAIN_R\",\"dateFin\":\"$FIN_R\",\"lignes\":[$CARTONS]}")|$(erreur_contient lendemain)|$(appel PUT "/conventions/$R" "$T_A" "{\"version\":\"$(version_cv "$R")\",\"dateDebut\":\"$APRES_FIN\",\"dateFin\":\"$FIN_R\",\"lignes\":[$CARTONS]}")"
# Une grille nouvelle s'applique au début du renouvellement : la première se clôt, la
# seconde (le café à 150 DT) s'approuve.
appel POST "/grilles-tarifaires/$G_A/cloture" "$T_A" "{\"dateFin\":\"$APRES_FIN\",\"reference\":\"TEST arrêté suivant\"}" >/dev/null
appel POST "/grilles-tarifaires?communeId=$A" "$T_A" \
  "{\"intitule\":\"TEST Grille suivante\",\"referenceArrete\":\"TEST-ARRETE-SUIVANT\",\"dateArrete\":\"$JOUR\",\"dateEffet\":\"$APRES_FIN\",\"lignes\":[{\"categorie\":\"cafe\",\"mode\":\"forfait_annuel\",\"tarif\":150}]}" >/dev/null
G_2=$(val "d['id']")
appel POST "/grilles-tarifaires/$G_2/approbation" "$T_A" \
  "{\"dateApprobation\":\"$JOUR\",\"reference\":\"TEST visa de la tutelle 2\",\"version\":\"$(sql "SELECT xmin FROM grilles_tarifaires WHERE id = '$G_2'")\"}" >/dev/null
chk "la grille nouvelle est approuvée, et s'applique au début du renouvellement" "$G_2" "$(sql "SELECT string_agg(id::text, ',') FROM grilles_tarifaires WHERE commune_id = '$A' AND deleted_at IS NULL AND date_approbation_tutelle IS NOT NULL AND date_effet <= DATE '$APRES_FIN' AND (date_fin IS NULL OR date_fin > DATE '$APRES_FIN')")"
chk "le renouvellement s'instruit avec la grille en vigueur à son début : un tarif nouveau" "200|instruite|150|TEST Grille suivante" \
    "$(appel POST "/conventions/$R/instruire" "$T_A" "{\"version\":\"$(version_cv "$R")\"}")|$(val "d['statut']")|$(val "f\"{d['tarif']:g}\"")|$(val "d['grille']")"
chk "il se signe : son document cite la convention renouvelée, et son tarif nouveau" "200|signee|1|1" \
    "$(appel POST "/conventions/$R/signer" "$T_A" "{\"version\":\"$(version_cv "$R")\",\"dateSignature\":\"$JOUR\",\"referenceSignature\":\"TEST renouvellement\"}")|$(val "d['statut']")|$(sql "SELECT (d.contenu->>'renouvellement_de' LIKE '%$NUM_CV%')::int FROM conventions_commerciales c JOIN documents_emis d ON d.id = c.document_id WHERE c.id = '$R'")|$(sql "SELECT (d.contenu->>'tarif' LIKE '%150,000 DT par an%')::int FROM conventions_commerciales c JOIN documents_emis d ON d.id = c.document_id WHERE c.id = '$R'")"
# Une convention résiliée entre la rédaction de son renouvellement et son instruction.
appel POST "/conventions/$CV_H/renouveler" "$T_A" "{\"version\":\"$(version_cv "$CV_H")\"}" >/dev/null; R_H=$(val "d['id']")
case "$R_H" in *-*-*-*-*) ;; *) R_H=absent ;; esac
appel POST "/conventions/$CV_H/resilier" "$T_A" "{\"version\":\"$(version_cv "$CV_H")\",\"dateResiliation\":\"$J20\",\"motif\":\"TEST cessation annoncée\",\"reference\":\"TEST courrier 47\"}" >/dev/null
chk "le renouvellement d'une convention résiliée depuis ne s'instruit pas : 409, qui dit de rédiger une convention nouvelle" "resiliee|409|1" \
    "$(sql "SELECT statut FROM conventions_commerciales WHERE id = '$CV_H'")|$(appel POST "/conventions/$R_H/instruire" "$T_A" "{\"version\":\"$(version_cv "$R_H")\"}")|$(erreur_contient 'convention nouvelle')"
chk "… il se retire, et une convention résiliée ne se renouvelle plus (409)" "204|409" \
    "$(appel DELETE "/conventions/$R_H?version=$(version_cv "$R_H")" "$T_A")|$(appel POST "/conventions/$CV_H/renouveler" "$T_A" "{\"version\":\"$(version_cv "$CV_H")\"}")"
chk "… et un avenant ne s'écrit plus sur elle : 409" 409 "$(appel POST "/conventions/$CV_H/avenants" "$T_A" "$(corps_av "$J5" "[$CARTONS2]")")"
chk "les termes ne valent que dans la période effective : rien la veille du début, rien à compter de la résiliation, rien pour un brouillon" "0|1|0|0" \
    "$(sql "SELECT count(*) FROM app.termes_convention('$CV', DATE '$VEILLE_DEBUT')")|$(sql "SELECT count(*) FROM app.termes_convention('$CV_H', DATE '$J19')")|$(sql "SELECT count(*) FROM app.termes_convention('$CV_H', DATE '$J20')")|$(sql "SELECT count(*) FROM app.termes_convention('$CV_BROU', DATE '$JOUR')")"
chk "« à renouveler » : la convention qui finit dans 34 jours sans renouvellement, et elle seule" "True|False|False" \
    "$(appel GET "/conventions?communeId=$A" "$T_A" >/dev/null; val "next(c['a_renouveler'] for c in d if c['id']=='$CV_X')")|$(val "next(c['a_renouveler'] for c in d if c['id']=='$CV')")|$(val "next(c['a_renouveler'] for c in d if c['id']=='$CV_H')")"
# Sur la boulangerie : un avenant signé qui vise le conteneur, un second en brouillon ;
# le conteneur est retiré ; puis le renouvellement.
appel POST "/conventions/$CV_X/avenants" "$T_A" "$(corps_av "$J5" "[$CARTONS_K]")" >/dev/null; AVX=$(val "d['id']")
appel POST "/conventions/avenants/$AVX/instruire" "$T_A" "{\"version\":\"$(version_av "$AVX")\"}" >/dev/null
appel POST "/conventions/avenants/$AVX/signer" "$T_A" "{\"version\":\"$(version_av "$AVX")\",\"dateSignature\":\"$JOUR\",\"referenceSignature\":\"TEST avenant du conteneur\"}" >/dev/null
appel POST "/conventions/$CV_X/avenants" "$T_A" "$(corps_av "$J20" "[$CARTONS_K]")" >/dev/null; AVX2=$(val "d['id']")
chk "l'avenant qui vise le conteneur est signé, un second attend en brouillon" "signe|brouillon" \
    "$(sql "SELECT statut FROM avenants_convention WHERE id = '$AVX'")|$(sql "SELECT statut FROM avenants_convention WHERE id = '$AVX2'")"
$PSQL -c "UPDATE conteneurs SET deleted_at = now() WHERE id = '$K'" >/dev/null
chk "le conteneur retiré : une ligne nouvelle ne le vise plus (400, « en service »), et le brouillon qui le visait ne s'instruit plus (409, qui le nomme)" "400|1|409|1" \
    "$(appel POST "/conventions/$CV_X/avenants" "$T_A" "$(corps_av "$J20" "[$CARTONS_K]")")|$(erreur_contient 'en service')|$(appel POST "/conventions/avenants/$AVX2/instruire" "$T_A" "{\"version\":\"$(version_av "$AVX2")\"}")|$(erreur_contient "$K")"
appel DELETE "/conventions/avenants/$AVX2?version=$(version_av "$AVX2")" "$T_A" >/dev/null
chk "le renouvellement de la boulangerie reprend la ligne sans son conteneur retiré, et le dit" "201|test_cartons:2:None|test_cartons:conteneur" \
    "$(appel POST "/conventions/$CV_X/renouveler" "$T_A" "{\"version\":\"$(version_cv "$CV_X")\"}")|$(val "','.join(l['flux_code'] + ':' + str(l['levees_par_semaine']) + ':' + str(l['conteneur_id']) for l in d['lignes'])")|$(val "','.join(x['flux_code'] + ':' + x['motif'] for x in d['non_reprises'])")"
chk "… renouvelée, elle n'est plus « à renouveler »" False \
    "$(appel GET "/conventions?communeId=$A" "$T_A" >/dev/null; val "next(c['a_renouveler'] for c in d if c['id']=='$CV_X')")"
chk "… et un avenant attend que son renouvellement en préparation soit retiré : 409, qui le dit" "409|1" \
    "$(appel POST "/conventions/$CV_X/avenants" "$T_A" "$(corps_av "$J20" "[$CARTONS2]")")|$(erreur_contient 'renouvellement de cette convention est en préparation')"
CV_E=$(signer_convention "$E_ECOLE" "$DEBUT_E" "$FIN_E")
chk "une convention expirée (signée après coup) ne reçoit pas d'avenant : 409, qui le dit" "signee|409|1" \
    "$(sql "SELECT statut FROM conventions_commerciales WHERE id = '${CV_E:-absente}'")|$(appel POST "/conventions/${CV_E:-absente}/avenants" "$T_A" "$(corps_av "$FIN_E" "[$CARTONS2]")")|$(erreur_contient expirée)"
chk "la convention renouvelée résiliée depuis : le renouvellement le constate, il n'est pas touché" "200|True|signee" \
    "$(appel POST "/conventions/$CV/resilier" "$T_A" "{\"version\":\"$(version_cv "$CV")\",\"dateResiliation\":\"$J20\",\"motif\":\"TEST cessation annoncée\",\"reference\":\"TEST courrier 48\"}")|$(appel GET "/conventions?communeId=$A" "$T_A" >/dev/null; val "next(c['precedente_resiliee'] for c in d if c['id']=='$R')")|$(sql "SELECT statut FROM conventions_commerciales WHERE id = '$R'")"

# -----------------------------------------------------------------------------
echo
echo "6. Qui lit quoi"
chk "la FNCT lit la convention et ses avenants, sans geste (403 à l'instruction d'un avenant)" "200|2|403" \
    "$(appel GET "/conventions/$CV" "$T_F")|$(val "len(d['avenants'])")|$(appel POST "/conventions/avenants/$AV1/reprendre" "$T_F" "{\"version\":\"$(version_av "$AV1")\"}")"
chk "le directeur de B ne voit ni l'avenant ni la convention (404)" "404|404" \
    "$(appel GET "/conventions/avenants/$AV1" "$T_B")|$(appel GET "/conventions/$CV" "$T_B")"
chk "un prestataire n'y a pas accès (403), et la base ne lui montre aucun avenant ni aucune ligne" "403|0|0" \
    "$(appel GET "/conventions/avenants/$AV1" "$T_P")|$($PSQL -c "BEGIN; SELECT set_config('app.role', 'gestionnaire_prestataire', true), set_config('app.user_id', '$ID_P', true), set_config('app.commune_id', '$A', true); SET LOCAL ROLE siipi_app; SELECT 'n:' || (SELECT count(*) FROM avenants_convention) || ':' || (SELECT count(*) FROM lignes_convention); ROLLBACK;" 2>&1 | grep -oE '^n:[0-9:]+' | cut -d: -f2- | tr ':' '|')"
chk "l'application ne peut ni effacer un avenant, ni écrire sa ligne d'un autre droit que les siens" "permission denied|permission denied" \
    "$(en_base admin_commune "$ID_A" "$A" "DELETE FROM avenants_convention WHERE id = '$AV1'")|$(en_base admin_commune "$ID_A" "$A" "UPDATE avenants_convention SET numero = 9 WHERE id = '$AV1'")"

echo
base_reelle_intacte "pendant la campagne"

# -----------------------------------------------------------------------------
rendre_tables_nationales
nettoyer
chk "en partant : communes, conventions, avenants, documents et grilles de test effacés, comptes temporaires aussi" "0|0|0|0|0|0" \
    "$(sql "SELECT count(*) FROM communes WHERE id IN ($ESSAI)")|$(sql "SELECT count(*) FROM conventions_commerciales WHERE commune_id IN ($ESSAI)")|$(sql "SELECT count(*) FROM avenants_convention WHERE commune_id IN ($ESSAI)")|$(sql "SELECT count(*) FROM documents_emis WHERE commune_id IN ($ESSAI)")|$(sql "SELECT count(*) FROM grilles_tarifaires WHERE commune_id IN ($ESSAI)")|$(sql "SELECT count(*) FROM users WHERE email LIKE 'test.compte.%@siipi.tn'")"
base_reelle_intacte "en partant"
tables_nationales_rendues "en partant"

echo
if [ "$fail" -eq 0 ]; then
  printf '\033[32m%s tests réussis, aucun échec.\033[0m\n\n' "$pass"; exit 0
else
  printf '\033[31m%s réussis, %s ÉCHOUÉS.\033[0m\n\n' "$pass" "$fail"; exit 1
fi
