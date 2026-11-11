#!/usr/bin/env bash
# =============================================================================
# v0.15.95 — jalon G, lot G4a : les conventions de propreté (SPEC_G § 1, § 3.4,
# § 8 ; décisions du 4 et du 11 novembre 2026 ; migration 103).
#
# Elle commence par ce qui est REFUSÉ :
#   - une convention rédigée par la FNCT, par le directeur d'une autre commune, par
#     un prestataire ; plus d'un an ; une fin avant le début ; un flux inconnu, un
#     flux dangereux, un flux deux fois ; un établissement fermé ; un octet nul ;
#   - en base : une ligne nouvelle au registre d'avant G4, une convention née
#     signée, une écriture de la FNCT ; l'ancien registre en écriture ;
#   - l'instruction sans grille approuvée, sans tarif pour la catégorie, sans flux,
#     avec une version dépassée, ou qui chevauche une convention signée ;
#   - la modification, le retrait, une ligne ajoutée après l'instruction ;
#   - la signature datée de demain, sans pièce, par la FNCT, d'une autre commune,
#     sans base légale en vigueur ; l'annulation du document d'une convention ;
#   - la modification d'une convention signée ; une résiliation hors période.
# Puis le cycle (brouillon, instruite, reprise, signée, résiliée), le document
# scellé CV-…, M2-2, la base légale pré-remplie et l'abrogation, et qui lit quoi.
#
#   docker compose exec -T api npm run test:conventions
# =============================================================================

set -u
cd "$(dirname "$0")/.." || exit 1
API="${API_URL:-http://localhost:4000}"
PSQL="psql -q -tA -h ${PGHOST:-localhost} -p ${PGPORT:-5432} -U ${PGUSER:-siipi_admin} -d ${PGDATABASE:-siipi_national}"
pass=0; fail=0
T=$(mktemp -d)
A=test_conv_a; B=test_conv_b
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
version() { sql "SELECT xmin FROM conventions_commerciales WHERE id = '$1'"; }
corps() { # établissement début fin [lignes JSON] [champs en plus]
  printf '{"commerceId":"%s","dateDebut":"%s","dateFin":"%s","lignes":%s%s}' "$1" "$2" "$3" "${4:-[]}" "${5:+,$5}"
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
# Les flux de test s'inscrivent dans la liste nationale : elle est gardée, et rendue
# ligne entière en partant.
garder_tables_nationales elements_listes_nationales
trap 'rendre_tables_nationales; nettoyer; rm -rf "$T" "$TABLES_NATIONALES_DIR"' EXIT
releve_base_reelle

commune_essai "$A" "TEST commune A des conventions"
commune_essai "$B" "TEST commune B des conventions"
compte_temporaire admin_commune "$A" "Directeur A"; T_A=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP"); ID_A=$COMPTE_ID
compte_temporaire admin_commune "$B" "Directeur B"; T_B=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP")
compte_temporaire super_admin_fnct "" "FNCT des conventions"; T_F=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP"); ID_F=$COMPTE_ID
compte_temporaire gestionnaire_prestataire "$A" "Prestataire de A"; T_P=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP"); ID_P=$COMPTE_ID
[ -n "$T_A" ] && [ -n "$T_B" ] && [ -n "$T_F" ] && [ -n "$T_P" ] || { echo "API injoignable sur $API, ou compte temporaire refusé" >&2; exit 1; }

JOUR=$(sql "SELECT app.jour_tunis()")
DEMAIN=$(sql "SELECT app.jour_tunis() + 1")
ANC=$(sql "SELECT extract(year FROM app.jour_tunis())::int")
SUIV=$((ANC + 1))

# Deux flux de la liste nationale : un ordinaire, un dangereux ; un troisième pour une seconde ligne.
$PSQL -c "INSERT INTO elements_listes_nationales (liste, code, libelle_fr, libelle_ar, date_effet, dangereux, provisoire, reference) VALUES
            ('flux_assimiles', 'test_cartons', 'TEST Cartons', 'كرتون', DATE '2000-01-01', false, true, 'TEST conventions'),
            ('flux_assimiles', 'test_verre', 'TEST Verre', 'بلور', DATE '2000-01-01', false, true, 'TEST conventions'),
            ('flux_assimiles', 'test_huiles', 'TEST Huiles usagées', 'زيوت مستعملة', DATE '2000-01-01', true, true, 'TEST conventions')" >/dev/null
# Les établissements de A : un café, un hôtel, une boulangerie (sans tarif), un fermé.
etab() { appel POST "/etablissements?communeId=$1" "$2" "$3" >/dev/null; val "d['id']"; }
E_CAFE=$(etab "$A" "$T_A" '{"nom":"TEST Café des Arts","categorieActivite":"cafe","matriculeFiscal":"7654321C"}')
E_HOTEL=$(etab "$A" "$T_A" '{"nom":"TEST Hôtel Zitouna","categorieActivite":"hotel"}')
E_BOUL=$(etab "$A" "$T_A" '{"nom":"TEST Boulangerie Nour","categorieActivite":"boulangerie"}')
E_FERME=$(etab "$A" "$T_A" '{"nom":"TEST Ancien kiosque","categorieActivite":"cafe"}')
appel POST "/etablissements/$E_FERME/statut" "$T_A" "{\"statut\":\"ferme\",\"date\":\"$JOUR\",\"motif\":\"TEST fermeture constatée\"}" >/dev/null
E_B=$(etab "$B" "$T_B" '{"nom":"TEST Café de B","categorieActivite":"cafe"}')
for e in "$E_CAFE" "$E_HOTEL" "$E_BOUL" "$E_FERME" "$E_B"; do
  case "$e" in *-*-*-*-*) ;; *) echo "Un établissement de départ n'a pas pu être inscrit" >&2; exit 1 ;; esac
done
# La grille de A : approuvée, en vigueur depuis le 1er janvier, un café au forfait et un hôtel à la levée.
appel POST "/grilles-tarifaires?communeId=$A" "$T_A" \
  "{\"intitule\":\"TEST Grille $ANC\",\"referenceArrete\":\"TEST-ARRETE-$ANC\",\"dateArrete\":\"$ANC-01-01\",\"dateEffet\":\"$ANC-01-01\",\"lignes\":[{\"categorie\":\"cafe\",\"mode\":\"forfait_annuel\",\"tarif\":120},{\"categorie\":\"hotel\",\"mode\":\"reel_levee\",\"tarif\":3.5}]}" >/dev/null
G_A=$(val "d['id']")
appel POST "/grilles-tarifaires/$G_A/approbation" "$T_A" \
  "{\"dateApprobation\":\"$ANC-01-01\",\"reference\":\"TEST visa de la tutelle\",\"version\":\"$(sql "SELECT xmin FROM grilles_tarifaires WHERE id = '$G_A'")\"}" >/dev/null
[ "$(sql "SELECT date_approbation_tutelle IS NOT NULL FROM grilles_tarifaires WHERE id = '$G_A'")" = t ] || { echo "La grille de A n'a pas pu être approuvée" >&2; exit 1; }
LIGNE_CARTONS='{"fluxCode":"test_cartons","leveesParSemaine":3,"volumeLitres":240}'

# -----------------------------------------------------------------------------
echo
echo "1. Ce qui est refusé à la rédaction"
chk "la FNCT ne rédige pas : 403, qui dit que c'est la commune" "403|1" \
    "$(appel POST "/conventions?communeId=$A" "$T_F" "$(corps "$E_CAFE" "$ANC-01-01" "$ANC-12-31")")|$(erreur_contient 'commune passe ses conventions')"
chk "le directeur d'une autre commune : introuvable (404)" 404 "$(appel POST "/conventions?communeId=$A" "$T_B" "$(corps "$E_CAFE" "$ANC-01-01" "$ANC-12-31")")"
chk "… ni pour l'établissement de A rangé dans sa propre commune (404)" 404 "$(appel POST "/conventions?communeId=$B" "$T_B" "$(corps "$E_CAFE" "$ANC-01-01" "$ANC-12-31")")"
chk "un prestataire : 403" 403 "$(appel POST "/conventions?communeId=$A" "$T_P" "$(corps "$E_CAFE" "$ANC-01-01" "$ANC-12-31")")"
chk "plus d'un an : 400 (une convention est annuelle)" 400 "$(appel POST "/conventions?communeId=$A" "$T_A" "$(corps "$E_CAFE" "$ANC-01-01" "$SUIV-01-01")")"
chk "une fin avant le début : 400" 400 "$(appel POST "/conventions?communeId=$A" "$T_A" "$(corps "$E_CAFE" "$ANC-06-01" "$ANC-05-31")")"
chk "un flux inconnu : 400, qui le nomme" "400|1" \
    "$(appel POST "/conventions?communeId=$A" "$T_A" "$(corps "$E_CAFE" "$ANC-01-01" "$ANC-12-31" '[{"fluxCode":"test_plutonium","leveesParSemaine":1}]')")|$(erreur_contient test_plutonium)"
chk "un flux dangereux : 400, qui dit qu'il va vers sa filière" "400|1" \
    "$(appel POST "/conventions?communeId=$A" "$T_A" "$(corps "$E_CAFE" "$ANC-01-01" "$ANC-12-31" '[{"fluxCode":"test_huiles","leveesParSemaine":1}]')")|$(erreur_contient filière)"
chk "le même flux deux fois : 400" 400 \
    "$(appel POST "/conventions?communeId=$A" "$T_A" "$(corps "$E_CAFE" "$ANC-01-01" "$ANC-12-31" "[$LIGNE_CARTONS,$LIGNE_CARTONS]")")"
chk "22 levées par semaine : 400" 400 \
    "$(appel POST "/conventions?communeId=$A" "$T_A" "$(corps "$E_CAFE" "$ANC-01-01" "$ANC-12-31" '[{"fluxCode":"test_cartons","leveesParSemaine":22}]')")"
chk "un établissement fermé : 409, qui dit de le rouvrir" "409|1" \
    "$(appel POST "/conventions?communeId=$A" "$T_A" "$(corps "$E_FERME" "$ANC-01-01" "$ANC-12-31")")|$(erreur_contient rouvrez)"
chk "une observation qui porte un octet nul : 400, jamais 500" 400 \
    "$(appel POST "/conventions?communeId=$A" "$T_A" "$(corps "$E_CAFE" "$ANC-01-01" "$ANC-12-31" '[]' '"observation":"TEST\u0000nul"')")"
chk "l'ancien registre ne s'écrit plus : ni ajout, ni retrait (404)" "404|404" \
    "$(appel POST "/registres/conventions?communeId=$A" "$T_A" "{\"commerceId\":\"$E_CAFE\",\"type\":\"collecte\",\"dateDebut\":\"$ANC-01-01\"}")|$(appel DELETE "/registres/conventions/00000000-0000-0000-0000-000000000000" "$T_A")"
chk "la base refuse une ligne nouvelle au registre d'avant G4" REGISTRE_FERME \
    "$(en_base admin_commune "$ID_A" "$A" "INSERT INTO conventions_commerciales (commune_id, commerce_id, nature, type, date_debut) VALUES ('$A', '$E_CAFE', 'registre', 'collecte', DATE '$ANC-01-01')")"
chk "… une convention née signée" CONVENTION_NAISSANCE \
    "$(en_base admin_commune "$ID_A" "$A" "INSERT INTO conventions_commerciales (commune_id, commerce_id, nature, statut, type, exercice, date_debut, date_fin) VALUES ('$A', '$E_CAFE', 'convention', 'signee', 'collecte', $ANC, DATE '$ANC-01-01', DATE '$ANC-12-31')")"
chk "… et une écriture de la FNCT" "violates row-level security" \
    "$(en_base super_admin_fnct "$ID_F" "" "INSERT INTO conventions_commerciales (commune_id, commerce_id, nature, statut, type, exercice, date_debut, date_fin) VALUES ('$A', '$E_CAFE', 'convention', 'brouillon', 'collecte', $ANC, DATE '$ANC-01-01', DATE '$ANC-12-31')")"
chk "aucune convention n'a été écrite par ces refus" 0 "$(sql "SELECT count(*) FROM conventions_commerciales WHERE commune_id IN ($ESSAI)")"

# -----------------------------------------------------------------------------
echo
echo "2. Le brouillon, puis l'instruction"
chk "le directeur rédige un brouillon : un café, du 1er janvier au 31 décembre, des cartons trois fois par semaine" "201|brouillon|brouillon|$ANC|1|3|240" \
    "$(appel POST "/conventions?communeId=$A" "$T_A" "$(corps "$E_CAFE" "$ANC-01-01" "$ANC-12-31" "[$LIGNE_CARTONS]")")|$(val "d['statut']")|$(val "d['etat']")|$(val "d['exercice']")|$(val "len(d['lignes'])")|$(val "d['lignes'][0]['levees_par_semaine']")|$(val "f\"{d['lignes'][0]['volume_litres']:g}\"")"
CV=$(val "d['id']")
V_LUE=$(val "d['version']")
chk "… le brouillon se remplace avec la version lue : deux flux" "200|2" \
    "$(appel PUT "/conventions/$CV" "$T_A" "{\"version\":\"$V_LUE\",\"dateDebut\":\"$ANC-01-01\",\"dateFin\":\"$ANC-12-31\",\"lignes\":[$LIGNE_CARTONS,{\"fluxCode\":\"test_verre\",\"leveesParSemaine\":1}]}")|$(val "len(d['lignes'])")"
chk "… une version dépassée est refusée (409), rien n'est écrit" "409|1|2" \
    "$(appel PUT "/conventions/$CV" "$T_A" "{\"version\":\"$V_LUE\",\"dateDebut\":\"$ANC-01-01\",\"dateFin\":\"$ANC-12-31\",\"lignes\":[]}")|$(erreur_contient changé)|$(sql "SELECT count(*) FROM lignes_convention WHERE convention_id = '$CV' AND deleted_at IS NULL")"
chk "… les lignes remplacées restent en base, retirées (rien ne s'efface)" 1 "$(sql "SELECT count(*) FROM lignes_convention WHERE convention_id = '$CV' AND deleted_at IS NOT NULL")"
chk "instruire avec une version dépassée : 409" 409 "$(appel POST "/conventions/$CV/instruire" "$T_A" "{\"version\":\"$V_LUE\"}")"
# Les conditions de l'instruction, chacune refusée en mots.
appel POST "/conventions?communeId=$A" "$T_A" "$(corps "$E_BOUL" "$ANC-01-01" "$ANC-12-31" "[$LIGNE_CARTONS]")" >/dev/null; CV_BOUL=$(val "d['id']")
chk "sans tarif pour la catégorie (une boulangerie) : 409, qui nomme la catégorie" "409|1" \
    "$(appel POST "/conventions/$CV_BOUL/instruire" "$T_A" "{\"version\":\"$(version "$CV_BOUL")\"}")|$(erreur_contient boulangerie)"
appel POST "/conventions?communeId=$A" "$T_A" "$(corps "$E_HOTEL" "$((ANC - 1))-06-01" "$ANC-05-31" "[$LIGNE_CARTONS]")" >/dev/null; CV_AVANT=$(val "d['id']")
chk "sans grille approuvée à la date de début : 409, qui dit quoi faire" "409|1" \
    "$(appel POST "/conventions/$CV_AVANT/instruire" "$T_A" "{\"version\":\"$(version "$CV_AVANT")\"}")|$(erreur_contient approuver)"
appel POST "/conventions?communeId=$A" "$T_A" "$(corps "$E_HOTEL" "$ANC-01-01" "$ANC-12-31")" >/dev/null; CV_HOTEL=$(val "d['id']")
chk "sans aucun flux : 409" "409|1" \
    "$(appel POST "/conventions/$CV_HOTEL/instruire" "$T_A" "{\"version\":\"$(version "$CV_HOTEL")\"}")|$(erreur_contient flux)"
chk "le café s'instruit : la grille en vigueur, son mode et son tarif sont retenus" "200|instruite|forfait_annuel|120|TEST Grille $ANC" \
    "$(appel POST "/conventions/$CV/instruire" "$T_A" "{\"version\":\"$(version "$CV")\"}")|$(val "d['statut']")|$(val "d['mode_tarification']")|$(val "f\"{d['tarif']:g}\"")|$(val "d['grille']")"
chk "instruite, elle ne se modifie plus (409) ni ne se retire (409)" "409|409" \
    "$(appel PUT "/conventions/$CV" "$T_A" "{\"version\":\"$(version "$CV")\",\"dateDebut\":\"$ANC-01-01\",\"dateFin\":\"$ANC-12-31\",\"lignes\":[$LIGNE_CARTONS]}")|$(appel DELETE "/conventions/$CV?version=$(version "$CV")" "$T_A")"
chk "… et la base refuse qu'on lui ajoute une ligne" CONVENTION_FIGEE \
    "$(en_base admin_commune "$ID_A" "$A" "INSERT INTO lignes_convention (convention_id, commune_id, flux_code, levees_par_semaine) VALUES ('$CV', '$A', 'test_verre', 2)")"
chk "… ou qu'on change sa date" CONVENTION_FIGEE \
    "$(en_base admin_commune "$ID_A" "$A" "UPDATE conventions_commerciales SET date_fin = DATE '$ANC-11-30' WHERE id = '$CV'")"
chk "… ou qu'on pose son statut à la main" "permission denied" \
    "$(en_base admin_commune "$ID_A" "$A" "UPDATE conventions_commerciales SET statut = 'signee' WHERE id = '$CV'")"
chk "reprise en brouillon : la grille et le tarif s'effacent avec l'instruction" "200|brouillon|None|None" \
    "$(appel POST "/conventions/$CV/reprendre" "$T_A" "{\"version\":\"$(version "$CV")\"}")|$(val "d['statut']")|$(val "d['grille_id']")|$(val "d['tarif']")"
chk "… puis de nouveau instruite" "200|instruite" "$(appel POST "/conventions/$CV/instruire" "$T_A" "{\"version\":\"$(version "$CV")\"}")|$(val "d['statut']")"

# -----------------------------------------------------------------------------
echo
echo "3. La signature : le document scellé"
M22_AVANT=$(appel GET "/kpi/5-axes?communeId=$A&annee=$ANC" "$T_A" >/dev/null; val "next((i['detail'] or {}).get('sous_convention') for i in d['indicateurs'] if i['code']=='M2-2')")
chk "instruite, elle ne compte pas encore pour M2-2 (aucune sous convention)" 0 "$M22_AVANT"
chk "une signature datée de demain : 400" 400 \
    "$(appel POST "/conventions/$CV/signer" "$T_A" "{\"version\":\"$(version "$CV")\",\"dateSignature\":\"$DEMAIN\",\"referenceSignature\":\"TEST dossier 12\"}")"
chk "… sans pièce : 400" 400 \
    "$(appel POST "/conventions/$CV/signer" "$T_A" "{\"version\":\"$(version "$CV")\",\"dateSignature\":\"$JOUR\",\"referenceSignature\":\"x\"}")"
chk "… par la FNCT (403), par le directeur d'une autre commune (404)" "403|404" \
    "$(appel POST "/conventions/$CV/signer" "$T_F" "{\"version\":\"$(version "$CV")\",\"dateSignature\":\"$JOUR\",\"referenceSignature\":\"TEST dossier 12\"}")|$(appel POST "/conventions/$CV/signer" "$T_B" "{\"version\":\"$(version "$CV")\",\"dateSignature\":\"$JOUR\",\"referenceSignature\":\"TEST dossier 12\"}")"
# Sans aucun texte de la base légale en vigueur le jour de la signature (tous retirés
# le temps d'une transaction annulée), la signature est refusée.
SANS_BASE="UPDATE elements_listes_nationales SET retire_le = now(), motif_retrait = 'TEST retrait de la campagne' WHERE liste = 'base_legale_assimiles' AND retire_le IS NULL"
chk "sans base légale en vigueur le jour de la signature : refusée par la base" BASE_LEGALE_ABSENTE \
    "$(en_base admin_commune "$ID_A" "$A" "SELECT app.signer_convention('$CV', '$(version "$CV")', DATE '$JOUR', 'TEST dossier 12')" "$SANS_BASE")"
chk "le directeur signe : document scellé CV-, numéro 1 de l'exercice, la convention signée et active" "200|signee|active|CV-$ANC-00001" \
    "$(appel POST "/conventions/$CV/signer" "$T_A" "{\"version\":\"$(version "$CV")\",\"dateSignature\":\"$JOUR\",\"referenceSignature\":\"TEST dossier 12\"}")|$(val "d['statut']")|$(val "d['etat']")|$(val "d['numero_document']")"
DOC=$(val "d['document_id']")
chk "le document recopie la base légale du jour (la loi n° 96-41 et sa date au JORT, sans le décret-loi n° 4 en attente ni la note de travail de la FNCT), le tarif et les flux" "1|0|1|1|1|0" \
    "$(sql "SELECT (contenu->>'base_legale' LIKE '%96-41%(JORT du 10/06/1996)%')::int FROM documents_emis WHERE id = '$DOC'")|$(sql "SELECT (contenu->>'base_legale' LIKE '%Décret-loi n° 4%')::int FROM documents_emis WHERE id = '$DOC'")|$(sql "SELECT (contenu->>'tarif' LIKE '%120,000 DT par an%')::int FROM documents_emis WHERE id = '$DOC'")|$(sql "SELECT (contenu->>'flux' LIKE '%TEST Cartons%3 levée(s) par semaine%240,0 L%')::int FROM documents_emis WHERE id = '$DOC'")|$(sql "SELECT (contenu->>'etablissement' = 'TEST Café des Arts' AND contenu->>'matricule_fiscal' = '7654321C')::int FROM documents_emis WHERE id = '$DOC'")|$(sql "SELECT (contenu->>'base_legale' LIKE '%vérifier%')::int FROM documents_emis WHERE id = '$DOC'")"
chk "… ses clés sont celles du gabarit, et aucun montant dû n'y figure" "1|0" \
    "$(appel GET /documents/gabarits "$T_A" >/dev/null; python3 -c "
import json,subprocess
g=json.load(open('$T/r.json'))
champs={c['cle'] for x in (g if isinstance(g,list) else g.get('gabarits',[])) if x['type']=='convention_proprete' for c in x['champs']}
cles=set(json.loads(subprocess.check_output(['sh','-c','''$PSQL -c \"SELECT contenu FROM documents_emis WHERE id = '$DOC'\"''']).decode()).keys())
print(int(bool(champs) and cles <= champs))")|$(sql "SELECT (contenu::text ILIKE '%montant%')::int FROM documents_emis WHERE id = '$DOC'")"
chk "le document s'imprime (A4 bilingue), avec son numéro" "200|1" \
    "$(curl -s -o "$T/doc.html" -w '%{http_code}' "$API/documents/$DOC/impression" -H "Authorization: Bearer $T_A")|$(grep -c "CV-$ANC-00001" "$T/doc.html" | awk '{print ($1>0)}')"
chk "signée, elle compte pour M2-2 : 1 établissement sous convention" 1 \
    "$(appel GET "/kpi/5-axes?communeId=$A&annee=$ANC" "$T_A" >/dev/null; val "next(i['detail']['sous_convention'] for i in d['indicateurs'] if i['code']=='M2-2')")"
chk "signée, elle ne se modifie plus : en base non plus" CONVENTION_FIGEE \
    "$(en_base admin_commune "$ID_A" "$A" "UPDATE conventions_commerciales SET observation = 'TEST réécrite' WHERE id = '$CV'")"
chk "… et son document ne s'annule pas : on résilie la convention" DOCUMENT_CONVENTION \
    "$(en_base admin_commune "$ID_A" "$A" "SELECT app.annuler_document('$DOC', 'TEST annulation refusée')")"
chk "… ni ne se retire (409)" 409 "$(appel DELETE "/conventions/$CV?version=$(version "$CV")" "$T_A")"
# Une seconde convention du même café qui recouvre la première ne s'instruit pas.
appel POST "/conventions?communeId=$A" "$T_A" "$(corps "$E_CAFE" "$ANC-12-30" "$SUIV-12-29" "[$LIGNE_CARTONS]")" >/dev/null; CV2=$(val "d['id']")
chk "une convention du même établissement qui chevauche une convention signée : 409, qui donne ses dates" "409|1" \
    "$(appel POST "/conventions/$CV2/instruire" "$T_A" "{\"version\":\"$(version "$CV2")\"}")|$(erreur_contient résiliez)"

# -----------------------------------------------------------------------------
echo
echo "4. La résiliation"
chk "une résiliation avant la signature : 400" 400 \
    "$(appel POST "/conventions/$CV/resilier" "$T_A" "{\"version\":\"$(version "$CV")\",\"dateResiliation\":\"$ANC-01-01\",\"motif\":\"TEST cessation\",\"reference\":\"TEST courrier\"}")"
chk "… après la fin de la convention : 400" 400 \
    "$(appel POST "/conventions/$CV/resilier" "$T_A" "{\"version\":\"$(version "$CV")\",\"dateResiliation\":\"$SUIV-01-01\",\"motif\":\"TEST cessation\",\"reference\":\"TEST courrier\"}")"
chk "… sans motif : 400" 400 \
    "$(appel POST "/conventions/$CV/resilier" "$T_A" "{\"version\":\"$(version "$CV")\",\"dateResiliation\":\"$ANC-12-30\",\"motif\":\"x\",\"reference\":\"TEST courrier\"}")"
chk "résiliée à compter du 30 décembre : elle couvre jusqu'à la veille, son document reste tel quel" "200|resiliee|$ANC-12-29|emis" \
    "$(appel POST "/conventions/$CV/resilier" "$T_A" "{\"version\":\"$(version "$CV")\",\"dateResiliation\":\"$ANC-12-30\",\"motif\":\"TEST cessation d'activité annoncée\",\"reference\":\"TEST courrier 45\"}")|$(val "d['statut']")|$(sql "SELECT date_fin FROM conventions_comptees WHERE id = '$CV'")|$(sql "SELECT statut FROM documents_emis WHERE id = '$DOC'")"
chk "la convention qui commence le jour de la résiliation ne chevauche plus : elle s'instruit" "200|instruite" \
    "$(appel POST "/conventions/$CV2/instruire" "$T_A" "{\"version\":\"$(version "$CV2")\"}")|$(val "d['statut']")"
chk "résiliée, elle ne se résilie pas deux fois (409)" 409 \
    "$(appel POST "/conventions/$CV/resilier" "$T_A" "{\"version\":\"$(version "$CV")\",\"dateResiliation\":\"$ANC-12-30\",\"motif\":\"TEST encore\",\"reference\":\"TEST courrier\"}")"

# -----------------------------------------------------------------------------
echo
echo "5. Le brouillon retiré, la base légale et qui lit quoi"
chk "un brouillon se retire avec sa version : il reste en base, retiré" "204|1|0" \
    "$(appel DELETE "/conventions/$CV_BOUL?version=$(version "$CV_BOUL")" "$T_A")|$(sql "SELECT count(*) FROM conventions_commerciales WHERE id = '$CV_BOUL' AND deleted_at IS NOT NULL")|$(appel GET "/conventions?communeId=$A" "$T_A" >/dev/null; val "len([c for c in d if c['id']=='$CV_BOUL'])")"
chk "la base légale porte les quatre textes connus ; le décret-loi n° 4 attend sa date, la loi organique n° 2018-29 son abrogation" "4|1|1" \
    "$(sql "SELECT count(*) FROM elements_listes_nationales WHERE liste = 'base_legale_assimiles' AND code IN ('loi_1996_41', 'code_fiscalite_locale', 'lo_2018_29', 'dl_2026_4') AND retire_le IS NULL")|$(sql "SELECT count(*) FROM elements_listes_nationales WHERE code = 'dl_2026_4' AND date_effet IS NULL")|$(sql "SELECT count(*) FROM elements_listes_nationales lo JOIN elements_listes_nationales dl ON dl.id = lo.abroge_par WHERE lo.code = 'lo_2018_29' AND dl.code = 'dl_2026_4'")"
chk "la date d'application du décret-loi fixée (transaction annulée) : la loi organique prend fin le même jour, avec sa pièce" "2027-03-01|1" \
    "$($PSQL -c "BEGIN; UPDATE elements_listes_nationales SET date_effet = DATE '2027-03-01', reference_effet = 'TEST proclamation des résultats' WHERE liste = 'base_legale_assimiles' AND code = 'dl_2026_4'; SELECT 'fin:' || date_fin || ':' || (reference_fin LIKE 'Abrogé par Décret-loi n° 4%')::int FROM elements_listes_nationales WHERE code = 'lo_2018_29'; ROLLBACK;" 2>&1 | grep -oE 'fin:[0-9-]+:[01]' | cut -d: -f2- | tr ':' '|')"
chk "la FNCT lit les conventions de A, sans geste (403 à l'instruction)" "200|4|403" \
    "$(appel GET "/conventions?communeId=$A" "$T_F")|$(val "len(d)")|$(appel POST "/conventions/$CV2/reprendre" "$T_F" "{\"version\":\"$(version "$CV2")\"}")"
chk "le directeur de B ne voit aucune convention de A, ni par la liste ni par son identifiant" "0|404" \
    "$(appel GET "/conventions?communeId=$A" "$T_B" >/dev/null; val "len(d)")|$(appel GET "/conventions/$CV" "$T_B")"
chk "un prestataire n'y a pas accès (403), et la base ne lui en montre aucune ligne" "403|0|0" \
    "$(appel GET "/conventions?communeId=$A" "$T_P")|$($PSQL -c "BEGIN; SELECT set_config('app.role', 'gestionnaire_prestataire', true), set_config('app.user_id', '$ID_P', true), set_config('app.commune_id', '$A', true); SET LOCAL ROLE siipi_app; SELECT 'n:' || (SELECT count(*) FROM conventions_commerciales) || ':' || (SELECT count(*) FROM lignes_convention); ROLLBACK;" 2>&1 | grep -oE '^n:[0-9:]+' | cut -d: -f2- | tr ':' '|')"
chk "l'ancien registre se lit encore, et dit qui compte aujourd'hui" "200|1" \
    "$(appel GET "/registres/conventions?communeId=$A" "$T_A")|$(val "len([c for c in d if c['id']=='$CV' and c['active']])")"

echo
base_reelle_intacte "pendant la campagne"

# -----------------------------------------------------------------------------
rendre_tables_nationales
nettoyer
chk "en partant : communes, conventions, documents et grilles de test effacés, comptes temporaires aussi" "0|0|0|0|0" \
    "$(sql "SELECT count(*) FROM communes WHERE id IN ($ESSAI)")|$(sql "SELECT count(*) FROM conventions_commerciales WHERE commune_id IN ($ESSAI)")|$(sql "SELECT count(*) FROM documents_emis WHERE commune_id IN ($ESSAI)")|$(sql "SELECT count(*) FROM grilles_tarifaires WHERE commune_id IN ($ESSAI)")|$(sql "SELECT count(*) FROM users WHERE email LIKE 'test.compte.%@siipi.tn'")"
base_reelle_intacte "en partant"
tables_nationales_rendues "en partant"

echo
if [ "$fail" -eq 0 ]; then
  printf '\033[32m%s tests réussis, aucun échec.\033[0m\n\n' "$pass"; exit 0
else
  printf '\033[31m%s réussis, %s ÉCHOUÉS.\033[0m\n\n' "$pass" "$fail"; exit 1
fi
