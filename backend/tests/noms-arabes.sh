#!/usr/bin/env bash
# =============================================================================
# v0.15.77 — les noms arabes de douze communes, corrigés par décision (D-NOMS-AR-1).
# DECISIONS_2026-10-20.md § 6 et complément du 25/10/2026 ; migration 086 ;
# docs/specs_metier/sources/sig/NOMS_ARABES_A_VALIDER.md.
#
# Elle commence par ce que la base REFUSE : une correction de nom sans ancien nom,
# ou dont l'ancien et le nouveau sont les mêmes. Puis :
#   - sur la base des campagnes (neuve, chargée par le seed) : les douze communes du
#     groupe A portent leur nouveau nom, chaque correction garde l'ancien, et AUCUN
#     autre nom ne diffère du référentiel ; des noms gardés (groupe C) et en attente
#     (groupe B) n'ont pas bougé ;
#   - sur une base jetable qui porte encore les anciens noms (le cas d'une base déjà en
#     service) : la migration corrige, trace chaque changement au journal d'audit,
#     laisse intact un nom que la FNCT aurait déjà changé, et se rejoue sans doublon ;
#   - la route de l'observatoire rend l'ancien et le nouveau nom.
#
#   docker compose exec -T api npm run test:noms-arabes
# =============================================================================

set -u
cd "$(dirname "$0")/.." || exit 1
PSQL="psql -q -tA -h ${PGHOST:-localhost} -p ${PGPORT:-5432} -U ${PGUSER:-siipi_admin} -d ${PGDATABASE:-siipi_national}"
API="${API_URL:-http://localhost:4000}"
pass=0; fail=0
T=$(mktemp -d)
BASE=siipi_essai_noms_arabes
COMMUNE=test_noms_arabes
. tests/outils/instance_essai.sh
. tests/outils/communes_essai.sh
. tests/outils/comptes_temporaires.sh
fin() { retirer_bases_essai; retirer_comptes_temporaires; effacer_communes_essai "'$COMMUNE'"; rm -rf "$T"; }
trap fin EXIT

chk() {
  if [ "$2" = "$3" ]; then printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1))
  else printf '  \033[31m✗\033[0m %s  (attendu %s, obtenu %s)\n' "$1" "$2" "$3"; fail=$((fail+1)); fi
}
sql() { $PSQL -c "$1" 2>&1; }

# Les douze corrections décidées le 25/10/2026 (groupe A) : identifiant, ancien nom, nouveau nom.
A="nabeul_tazarka|تزغران|تازركة
nabeul_tazghrane_boukrim_zaouiet_el_mgaiez|تزغران بوكريم|تزغران بوكريم زاوية المقايز
tunis_tunis_capitale|بلدية تونس|تونس
tunis_sidi_bou_said|سيدي بو سعيد|سيدي بوسعيد
monastir_bembla_el_mnara|بمبلة المنارة|بنبلة المنارة
monastir_el_masdour_menzel_harb|المسدور منزل حرب|المصدور منزل حرب
monastir_cherahil|شراحيل|الشراحيل
mahdia_tlelsa|تلايلسة|التلالسة
kairouan_el_alaa|العلاء|العلا
kairouan_nasrallah|نصرالله|نصر الله
medenine_ben_guerdane|بنقردان|بن قردان
tataouine_bir_lahmar|بئر لحمر|بئر الأحمر"

echo "1. Ce que la base refuse"
commune_essai "$COMMUNE" "TEST commune des noms arabes"
chk "une correction de nom sans ancien nom" 1 \
    "$(sql "INSERT INTO corrections_referentiel (decision, nature, commune_id, source, decidee_le, nouveau_nom) VALUES ('TEST', 'nom_arabe', '$COMMUNE', 'source de test', CURRENT_DATE, 'جديد')" | grep -c corrections_nom_complet)"
chk "une correction dont l'ancien et le nouveau nom sont les mêmes" 1 \
    "$(sql "INSERT INTO corrections_referentiel (decision, nature, commune_id, source, decidee_le, ancien_nom, nouveau_nom) VALUES ('TEST', 'nom_arabe', '$COMMUNE', 'source de test', CURRENT_DATE, 'نفس', 'نفس')" | grep -c corrections_nom_complet)"
chk "un ancien nom sur une correction qui n'est pas de nom" 1 \
    "$(sql "INSERT INTO corrections_referentiel (decision, nature, commune_id, source, decidee_le, ancien_nom, nouveau_nom) VALUES ('TEST', 'creee', '$COMMUNE', 'source de test', CURRENT_DATE, 'أ', 'ب')" | grep -c corrections_nom_complet)"

echo "2. La base des campagnes (neuve, chargée par le seed)"
N=0
while IFS='|' read -r id ancien nouveau; do
  [ "$(sql "SELECT name_ar FROM communes WHERE id = '$id'")" = "$nouveau" ] && N=$((N+1))
done <<< "$A"
chk "les douze communes du groupe A portent leur nouveau nom" 12 "$N"
N=0
while IFS='|' read -r id ancien nouveau; do
  [ "$(sql "SELECT ancien_nom || '>' || nouveau_nom FROM corrections_referentiel WHERE decision = 'D-NOMS-AR-1' AND commune_id = '$id' AND nature = 'nom_arabe'")" = "$ancien>$nouveau" ] && N=$((N+1))
done <<< "$A"
chk "… et chaque correction garde l'ancien nom à côté du nouveau" 12 "$N"
chk "… douze corrections de nom, pas une de plus" 12 "$(sql "SELECT count(*) FROM corrections_referentiel WHERE decision = 'D-NOMS-AR-1'")"
# Le référentiel (le fichier du seed) est la référence : aucun autre nom ne doit en différer.
python3 - seed/data/communes_350.json > "$T/referentiel.tsv" <<'EOF'
import json, sys
for c in json.load(open(sys.argv[1], encoding='utf-8')):
    print(f"{c['id']}\t{c['nameAr']}")
EOF
sql "SELECT id || E'\t' || name_ar FROM communes WHERE id IN ($(cut -f1 "$T/referentiel.tsv" | sed "s/.*/'&'/" | paste -sd,))" | sort > "$T/base.tsv"
chk "aucun autre nom arabe ne diffère du référentiel" 0 "$(sort "$T/referentiel.tsv" | comm -3 - "$T/base.tsv" | wc -l)"
chk "des noms gardés (groupe C) n'ont pas bougé : Ras Jebel, Ennadhour, Bechri, Bechni" \
    "رأس الجبل|الناظور سيدي علي بلعابد|بشري جرسين البليدات|بشني فطناسة" \
    "$(sql "SELECT string_agg(name_ar, '|' ORDER BY array_position(ARRAY['bizerte_ras_jebel','sfax_ennadhour_sidi_ali_belabed','kebili_bechri_jersine_el_blidet','kebili_bechni_fatnassa'], id)) FROM communes WHERE id IN ('bizerte_ras_jebel','sfax_ennadhour_sidi_ali_belabed','kebili_bechri_jersine_el_blidet','kebili_bechni_fatnassa')")"
chk "des noms en attente (groupe B) n'ont pas bougé : Bahra, Zelba, Saïda" "بحرة|زلبة|سعيدة" \
    "$(sql "SELECT string_agg(name_ar, '|' ORDER BY array_position(ARRAY['le_kef_bahra','mahdia_zelba','sidi_bouzid_saida'], id)) FROM communes WHERE id IN ('le_kef_bahra','mahdia_zelba','sidi_bouzid_saida')")"

echo "3. Une base déjà en service, qui porte encore les anciens noms"
base_essai "$BASE"
VALEURS=$(while IFS='|' read -r id ancien nouveau; do printf "('%s', 'TEST %s', '%s', 'TEST', 1000)," "$id" "$id" "$ancien"; done <<< "$A")
psql_essai "$BASE" "INSERT INTO communes (id, name, name_ar, gouvernorat, population) VALUES ${VALEURS%,}" >/dev/null
# Une commune dont la FNCT a déjà changé le nom : la migration ne la réécrit pas.
psql_essai "$BASE" "UPDATE communes SET name_ar = 'اسم غيرته الجامعة' WHERE id = 'kairouan_el_alaa'" >/dev/null
psql_essai "$BASE" "INSERT INTO communes (id, name, name_ar, gouvernorat, population) VALUES ('bizerte_ras_jebel', 'Ras Jebel', 'رأس الجبل', 'TEST', 1000)" >/dev/null
AUDIT_AVANT=$(psql_essai "$BASE" "SELECT count(*) FROM audit_log WHERE table_name = 'communes' AND operation = 'UPDATE'")
rejouer() {
  psql_essai "$BASE" "DELETE FROM schema_migrations WHERE filename = '086_noms_arabes.sql'" >/dev/null
  DATABASE_URL="$(url_essai "$BASE")" npm run -s migrate > "$T/migrate.log" 2>&1
  echo $?
}
chk "la migration 086 passe sur cette base" 0 "$(rejouer)"
chk "onze noms corrigés ; celui que la FNCT avait déjà changé est intact" "11|اسم غيرته الجامعة" \
    "$(psql_essai "$BASE" "SELECT count(*) FROM corrections_referentiel WHERE decision = 'D-NOMS-AR-1'")|$(psql_essai "$BASE" "SELECT name_ar FROM communes WHERE id = 'kairouan_el_alaa'")"
chk "… Tazarka porte « تازركة », l'ancien nom est gardé dans sa correction" "تازركة|تزغران" \
    "$(psql_essai "$BASE" "SELECT name_ar FROM communes WHERE id = 'nabeul_tazarka'")|$(psql_essai "$BASE" "SELECT ancien_nom FROM corrections_referentiel WHERE commune_id = 'nabeul_tazarka'")"
chk "… chaque correction est au journal d'audit, ancien et nouveau nom" "11|1" \
    "$(( $(psql_essai "$BASE" "SELECT count(*) FROM audit_log WHERE table_name = 'communes' AND operation = 'UPDATE'") - AUDIT_AVANT ))|$(psql_essai "$BASE" "SELECT count(*) FROM audit_log WHERE table_name = 'communes' AND record_id = 'nabeul_tazarka' AND old_data->>'name_ar' = 'تزغران' AND new_data->>'name_ar' = 'تازركة'")"
chk "… un nom gardé (Ras Jebel) n'est pas touché" "رأس الجبل" "$(psql_essai "$BASE" "SELECT name_ar FROM communes WHERE id = 'bizerte_ras_jebel'")"
chk "rejouée, la migration ne double rien" "0|11" "$(rejouer)|$(psql_essai "$BASE" "SELECT count(*) FROM corrections_referentiel WHERE decision = 'D-NOMS-AR-1'")"

echo "4. Ce que l'observatoire montre"
compte_temporaire super_admin_fnct "" "Agent FNCT des noms arabes"
JETON=$(curl -s -X POST "$API/auth/login" -H 'Content-Type: application/json' -d "{\"email\":\"$COMPTE_EMAIL\",\"password\":\"$COMPTE_MDP\"}" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("token",""))')
curl -s "$API/observatoire/corrections-referentiel" -H "Authorization: Bearer $JETON" > "$T/r.json"
chk "les douze corrections de nom, avec l'ancien et le nouveau" "12|تزغران>تازركة" \
    "$(python3 -c "import json;d=json.load(open('$T/r.json'));print(sum(1 for x in d if x['nature']=='nom_arabe'))")|$(python3 -c "import json;d=[x for x in json.load(open('$T/r.json')) if x['nature']=='nom_arabe' and x['commune']=='Tazarka'];print(d[0]['ancien_nom']+'>'+d[0]['nouveau_nom'] if d else 'absente')")"

echo "5. En partant"
retirer_bases_essai; retirer_comptes_temporaires; effacer_communes_essai "'$COMMUNE'"
chk "la base d'essai, le compte et la commune de test sont retirés" "0|0" \
    "$(psql_essai postgres "SELECT count(*) FROM pg_database WHERE datname = '$BASE'")|$(sql "SELECT count(*) FROM communes WHERE id = '$COMMUNE'")"

echo
if [ "$fail" -eq 0 ]; then
  printf '\033[32m%s tests réussis, aucun échec.\033[0m\n\n' "$pass"; exit 0
else
  printf '\033[31m%s réussis, %s ÉCHOUÉS.\033[0m\n\n' "$pass" "$fail"; exit 1
fi
