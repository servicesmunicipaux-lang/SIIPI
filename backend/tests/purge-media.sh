#!/usr/bin/env bash
# =============================================================================
# Conservation des photos (décision FNCT D-FNCT-4) — campagne de vérification.
#
# À 36 mois, une photo est recompressée (JPEG qualité 70, 500 Ko au plus), la
# version compressée reste en ligne, l'original part dans l'archive froide, et
# la FNCT peut en demander la restauration. Rien ne s'efface : ni texte de
# réclamation, ni métadonnée, ni original.
#
# CE QUE CETTE CAMPAGNE VÉRIFIE D'ABORD : ce que la plateforme refuse. Qu'une
# photo soit compressée compte moins que ceci — une archive absente ne reçoit
# rien, l'application ne peut pas « marquer compressée » une photo entière, un
# PDF ne se compresse pas, une commune ne demande pas de restauration, et un
# original qui ne correspond plus à sa fiche n'est jamais restauré.
#
# Elle bâtit ses données (commune, directeur, citoyen, images fabriquées par la
# bibliothèque d'images de l'API) et lance la tâche RESTREINTE À SA COMMUNE :
# sur une base qui porterait des photos réelles de plus de 36 mois, un passage
# national lancé par un test les aurait archivées.
#
#   docker compose exec -T api npm run test:purge-media
# =============================================================================

set -u
API="${API_URL:-http://localhost:4000}"
PSQL="psql -q -tA -h ${PGHOST:-localhost} -p ${PGPORT:-5432} -U ${PGUSER:-siipi_admin} -d ${PGDATABASE:-siipi_national}"
RACINE="$(cd "$(dirname "$0")/.." && pwd)"
COURANT="${SIIPI_FICHIERS_DIR:-/var/siipi/fichiers}"
pass=0; fail=0
T=$(mktemp -d)
ARCH="$T/archive"

tok() {
  curl -s -X POST "$API/auth/login" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"${2:-Siipi2026!}\"}" \
    | python3 -c "import sys,json;print(json.load(sys.stdin).get('token',''))" 2>/dev/null
}
sql()  { $PSQL -c "$1" 2>/dev/null | tr -d ' '; }
code() { curl -s -o "$T/r.json" -w '%{http_code}' "$@"; }
val()  { python3 -c "import json;print(json.load(open('$T/r.json'))$1)" 2>/dev/null || echo erreur; }
chk() {
  if [ "$2" = "$3" ]; then printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1))
  else printf '  \033[31m✗\033[0m %s  (attendu %s, obtenu %s)\n' "$1" "$2" "$3"; fail=$((fail+1)); fi
}
# La tâche, telle qu'on la lance à la main, sur l'archive de la campagne.
medias() {
  ( cd "$RACINE" && SIIPI_ARCHIVE_DIR="$ARCH" npm run -s "medias:$1" -- --commune "$TC" ) > "$T/medias.log" 2>&1
  echo $?
}
# Lire les octets servis : code HTTP ; type, poids et empreinte dans $T/servi*.
lire() {  # $1 = id, $2 = jeton, $3 = suffixe (/original)
  curl -s -o "$T/servi" -D "$T/entetes" -w '%{http_code}' -H "Authorization: Bearer $2" "$API/fichiers/$1${3:-}"
}
type_servi()  { grep -i '^content-type:' "$T/entetes" | tr -d '\r' | awk '{print $2}'; }
poids_servi() { stat -c %s "$T/servi"; }
sha_servi()   { sha256sum "$T/servi" | cut -d' ' -f1; }

TC=test_purge_media
COMMUNE_DIR="$TC"
CIT_EMAIL="test-purge-media-citoyen@example.test"
CIT_MDP="TEST-Citoyen-$$"
. "$(dirname "$0")/outils/directeur_temporaire.sh"
nettoyer() {
  $PSQL -c "DELETE FROM demandes_restauration WHERE commune_id = '$TC';" \
        -c "DELETE FROM passages_conservation_medias WHERE perimetre = '$TC';" \
        -c "DELETE FROM tickets WHERE ticket_number LIKE 'TEST-P-%';" \
        -c "DELETE FROM fichiers WHERE commune_id = '$TC';" \
        -c "DELETE FROM citoyens WHERE user_id IN (SELECT id FROM users WHERE email = '$CIT_EMAIL');" \
        -c "DELETE FROM users WHERE email = '$CIT_EMAIL';" >/dev/null 2>&1
  rm -rf "${COURANT:?}/$TC"
}
fin() {
  nettoyer
  retirer_directeur_temporaire
  $PSQL -c "DELETE FROM communes WHERE id = '$TC';" >/dev/null 2>&1
  rm -rf "$T"
}
nettoyer
$PSQL -c "DELETE FROM communes WHERE id = '$TC';" >/dev/null 2>&1
$PSQL -c "INSERT INTO communes (id, name, name_ar, gouvernorat, population) VALUES ('$TC', 'TEST commune de la conservation', 'TEST', 'TEST', 5000);" >/dev/null
directeur_temporaire "$TC"
trap fin EXIT
T_DIR=$(tok "$DIR_EMAIL" "$DIR_MDP")
T_FNCT=$(tok admin.national@siipi.tn)
[ -n "$T_DIR" ] && [ -n "$T_FNCT" ] || { echo "API injoignable sur $API, ou compte FNCT absent." >&2; exit 1; }

code -X POST "$API/citizens/register" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$CIT_EMAIL\",\"password\":\"$CIT_MDP\",\"fullName\":\"TEST-P Citoyen\"}" >/dev/null
T_CIT=$(tok "$CIT_EMAIL" "$CIT_MDP")
CIT_ID=$(sql "SELECT c.id FROM users u JOIN citoyens c ON c.user_id = u.id WHERE u.email = '$CIT_EMAIL'")
[ -n "$T_CIT" ] && [ -n "$CIT_ID" ] || { echo "Le citoyen d'essai n'a pas pu être créé." >&2; exit 1; }
code -X POST "$API/citoyen/adresse" -H "Authorization: Bearer $T_CIT" -H 'Content-Type: application/json' \
  -d "{\"communeId\":\"$TC\",\"adresse\":\"TEST-P, rue de test\"}" >/dev/null
[ "$(sql "SELECT commune_id FROM citoyens WHERE id = '$CIT_ID'")" = "$TC" ] \
  || { echo "Le citoyen d'essai n'a pas pu déclarer son adresse." >&2; exit 1; }

# --- Les images, fabriquées par la bibliothèque même de l'API ----------------
# Du bruit : une photo de téléphone ne se compresse pas mieux, et c'est ce qui
# fait dépasser les 500 Ko à la qualité 70 — donc ce qui éprouve la réduction.
( cd "$RACINE" && node -e '
const sharp = require("sharp"); const d = process.argv[1];
const bruit = (l, h) => sharp({ create: { width: l, height: h, channels: 3, background: "#808080",
  noise: { type: "gaussian", mean: 128, sigma: 60 } } });
(async () => {
  await bruit(2400, 1800).jpeg({ quality: 92 }).toFile(d + "/lourde.jpg");
  await bruit(2400, 1800).jpeg({ quality: 92 }).toFile(d + "/lourde30.jpg");
  await sharp({ create: { width: 800, height: 600, channels: 4,
    background: { r: 0, g: 120, b: 200, alpha: 0.5 } } }).png().toFile(d + "/capture.png");
  await bruit(600, 400).jpeg({ quality: 80 }).toFile(d + "/rapport.jpg");
})().catch((e) => { console.error(e); process.exit(1); });' "$T" ) \
  || { echo "Les images d'essai n'ont pas pu être fabriquées (bibliothèque sharp absente ?)." >&2; exit 1; }
printf '%%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%%%EOF\n' > "$T/doc.pdf"
for f in lourde.jpg lourde30.jpg capture.png rapport.jpg doc.pdf; do base64 -w0 "$T/$f" > "$T/$f.b64"; done

depot() {  # $1 = fichier, $2 = nom, $3 = usage, $4 = jeton ; rend l'identifiant
  python3 -c "
import json,sys
print(json.dumps({'nomFichier': sys.argv[2], 'contenu': open(sys.argv[1]).read(), 'usage': sys.argv[3]}))" \
    "$T/$1.b64" "$2" "$3" > "$T/corps.json"
  curl -s -o "$T/r.json" -X POST -H "Authorization: Bearer ${4:-$T_DIR}" -H 'Content-Type: application/json' \
       --data-binary "@$T/corps.json" "$API/fichiers?communeId=$TC"
  val "['id']"
}

P37=$(depot lourde.jpg 'TEST-P-reclamation.jpg' reclamation "$T_CIT")
P30=$(depot lourde30.jpg 'TEST-P-constat.jpg' constat_terrain)
PNG37=$(depot capture.png 'TEST-P-capture.png' incident)
RAP37=$(depot rapport.jpg 'TEST-P-rapport.jpg' rapport_etude)
PDF37=$(depot doc.pdf 'TEST-P-doc.pdf' autre)
for x in "$P37" "$P30" "$PNG37" "$RAP37" "$PDF37"; do
  echo "$x" | grep -Eq '^[0-9a-f-]{36}$' || { echo "Un dépôt d'essai a échoué ($x)." >&2; exit 1; }
done
TICKET=$(sql "INSERT INTO tickets (ticket_number, commune_id, category, title, description, citizen_id, status, photo_url)
              VALUES ('TEST-P-'||substr(md5(random()::text),1,8), '$TC', 'point_noir', 'TEST-P réclamation',
                      'TEST-P Dépôt sauvage devant l''école, depuis trois jours.', '$CIT_ID', 'recu', '/fichiers/$P37')
              RETURNING id")
[ -n "$TICKET" ] || { echo "La réclamation d'essai n'a pas pu être ouverte." >&2; exit 1; }
# Le temps passe : 37 mois pour les unes, 30 pour l'autre.
$PSQL -c "UPDATE fichiers SET created_at = now() - interval '37 months' WHERE id IN ('$P37', '$PNG37', '$RAP37', '$PDF37');" \
      -c "UPDATE fichiers SET created_at = now() - interval '30 months' WHERE id = '$P30';" \
      -c "UPDATE tickets  SET created_at = now() - interval '37 months' WHERE id = '$TICKET';" >/dev/null

fiche()  { $PSQL -c "SELECT concat_ws('|', nom_original, type_mime, taille_octets, sha256, created_at, usage,
                                       televerse_par, visibilite, destinataire_citoyen_id, commune_id, deleted_at)
                      FROM fichiers WHERE id = '$1'"; }
billet() { $PSQL -c "SELECT concat_ws('|', ticket_number, title, description, status, category, created_at,
                                       photo_url, citizen_id, commune_id)
                      FROM tickets WHERE id = '$TICKET'"; }
FICHE_P37_AVANT=$(fiche "$P37"); FICHE_PNG_AVANT=$(fiche "$PNG37"); BILLET_AVANT=$(billet)
SHA_P37=$(sql "SELECT sha256 FROM fichiers WHERE id = '$P37'")
SHA_P30=$(sql "SELECT sha256 FROM fichiers WHERE id = '$P30'")
CHEMIN_P37=$(sql "SELECT chemin_relatif FROM fichiers WHERE id = '$P37'")
CHEMIN_PNG=$(sql "SELECT chemin_relatif FROM fichiers WHERE id = '$PNG37'")
chk "la photo d'essai pèse plus de 500 Ko" t \
    "$([ "$(sql "SELECT taille_octets FROM fichiers WHERE id = '$P37'")" -gt 512000 ] && echo t || echo f)"

# -----------------------------------------------------------------------------
echo
echo "1. Ce que la plateforme REFUSE"
chk "une restauration sans jeton est refusée" 401 \
    "$(code -X POST -H 'Content-Type: application/json' -d '{"motif":"TEST-P motif suffisant"}' "$API/fichiers/$P37/restauration")"
chk "un directeur de commune ne demande pas de restauration" 403 \
    "$(code -X POST -H "Authorization: Bearer $T_DIR" -H 'Content-Type: application/json' \
         -d '{"motif":"TEST-P motif suffisant"}' "$API/fichiers/$P37/restauration")"
chk "un citoyen non plus" 403 \
    "$(code -X POST -H "Authorization: Bearer $T_CIT" -H 'Content-Type: application/json' \
         -d '{"motif":"TEST-P motif suffisant"}' "$API/fichiers/$P37/restauration")"
chk "l'état de la conservation est réservé à la FNCT" 403 \
    "$(code -H "Authorization: Bearer $T_DIR" "$API/fichiers/conservation")"
chk "la FNCT ne restaure pas une photo encore entière" 409 \
    "$(code -X POST -H "Authorization: Bearer $T_FNCT" -H 'Content-Type: application/json' \
         -d '{"motif":"TEST-P motif suffisant"}' "$API/fichiers/$P30/restauration")"
chk "ni sans motif" 400 \
    "$(code -X POST -H "Authorization: Bearer $T_FNCT" -H 'Content-Type: application/json' \
         -d '{"motif":"court"}' "$API/fichiers/$P37/restauration")"
chk "ni un fichier qui n'existe pas" 404 \
    "$(code -X POST -H "Authorization: Bearer $T_FNCT" -H 'Content-Type: application/json' \
         -d '{"motif":"TEST-P motif suffisant"}' "$API/fichiers/00000000-0000-0000-0000-000000000000/restauration")"
chk "pas d'« original » à lire d'une photo entière" 409 "$(code -H "Authorization: Bearer $T_FNCT" "$API/fichiers/$P30/original")"
chk "la base réserve la demande à la FNCT, même hors de l'API" t \
    "$($PSQL -c "SET app.role = 'admin_commune'; SELECT app.demander_restauration('$P37', 'TEST-P motif suffisant');" 2>&1 \
       | grep -q 'RESTAURATION_RESERVEE_FNCT' && echo t || echo f)"
chk "l'application ne peut pas « marquer compressée » une photo" t \
    "$($PSQL -c "SET ROLE siipi_app; UPDATE fichiers SET compressee_le = now() WHERE id = '$P30';" 2>&1 \
       | grep -q 'permission denied' && echo t || echo f)"
chk "ni écrire elle-même une demande de restauration" t \
    "$($PSQL -c "SET ROLE siipi_app; INSERT INTO demandes_restauration (fichier_id, commune_id, motif, echeance) VALUES ('$P37', '$TC', 'TEST-P motif suffisant', now() + interval '1 day');" 2>&1 \
       | grep -q 'permission denied' && echo t || echo f)"
chk "la base refuse une compression à moitié renseignée" t \
    "$($PSQL -c "UPDATE fichiers SET compressee_le = now() WHERE id = '$P30';" 2>&1 \
       | grep -q 'fichiers_compression_complete' && echo t || echo f)"
chk "la base refuse de compresser un PDF" t \
    "$($PSQL -c "UPDATE fichiers SET compressee_le = now(), chemin_compresse = 'x', taille_compressee_octets = 1,
                       sha256_compresse = 'x', chemin_archive = 'x' WHERE id = '$PDF37';" 2>&1 \
       | grep -q 'fichiers_compression_image' && echo t || echo f)"

echo
echo "2. Sans archive froide, le passage ne touche à rien"
chk "le passage est refusé (code de sortie 1)" 1 "$(medias compresser)"
chk "il dit pourquoi" t "$(grep -q 'Archive froide non initialisée' "$T/medias.log" && echo t || echo f)"
chk "il est consigné, refusé, motif à l'appui" "refuse|true|2" \
    "$(sql "SELECT statut || '|' || (motif_refus IS NOT NULL) || '|' || photos_eligibles FROM passages_conservation_medias
             WHERE perimetre = '$TC' ORDER BY id DESC LIMIT 1")"
chk "aucune photo n'est compressée" 0 "$(sql "SELECT count(*) FROM fichiers WHERE commune_id = '$TC' AND compressee_le IS NOT NULL")"
chk "l'original est toujours sur le volume courant" t "$([ -f "$COURANT/$CHEMIN_P37" ] && echo t || echo f)"

echo
echo "3. Le passage : la photo de 37 mois est compressée, celle de 30 mois non"
chk "l'archive s'initialise" 0 "$(medias archive:initialiser)"
chk "le passage aboutit" 0 "$(medias compresser)"
chk "il compte deux photos à l'âge, et les compresse" "termine|2|2" \
    "$(sql "SELECT statut || '|' || photos_eligibles || '|' || photos_compressees FROM passages_conservation_medias
             WHERE perimetre = '$TC' ORDER BY id DESC LIMIT 1")"
chk "et libère de la place" t \
    "$(sql "SELECT octets_apres < octets_avant FROM passages_conservation_medias WHERE perimetre = '$TC' ORDER BY id DESC LIMIT 1")"
chk "la photo de 37 mois est marquée compressée" t "$(sql "SELECT compressee_le IS NOT NULL FROM fichiers WHERE id = '$P37'")"
chk "la photo de 30 mois n'est pas touchée" f "$(sql "SELECT compressee_le IS NOT NULL FROM fichiers WHERE id = '$P30'")"
chk "une image de rapport n'est pas une photo : intacte" f "$(sql "SELECT compressee_le IS NOT NULL FROM fichiers WHERE id = '$RAP37'")"
chk "un PDF non plus" f "$(sql "SELECT compressee_le IS NOT NULL FROM fichiers WHERE id = '$PDF37'")"
chk "le citoyen consulte toujours sa photo" 200 "$(lire "$P37" "$T_CIT")"
chk "servie en JPEG" image/jpeg "$(type_servi)"
chk "de 500 Ko au plus" t "$([ "$(poids_servi)" -le 512000 ] && echo t || echo f)"
chk "et c'est bien la version compressée" "$(sql "SELECT sha256_compresse FROM fichiers WHERE id = '$P37'")" "$(sha_servi)"
chk "la photo de 30 mois est servie entière" "$SHA_P30" "$( lire "$P30" "$T_DIR" >/dev/null; sha_servi)"
chk "le PNG est servi en JPEG compressé" image/jpeg "$( lire "$PNG37" "$T_DIR" >/dev/null; type_servi)"
chk "l'original est dans l'archive froide, identique" "$SHA_P37" "$(sha256sum "$ARCH/$CHEMIN_P37" 2>/dev/null | cut -d' ' -f1)"
chk "et n'est plus sur le volume courant" f "$([ -f "$COURANT/$CHEMIN_P37" ] && echo t || echo f)"
chk "un second passage ne trouve plus rien" "termine|0|0" \
    "$(medias compresser >/dev/null; sql "SELECT statut || '|' || photos_eligibles || '|' || photos_compressees
             FROM passages_conservation_medias WHERE perimetre = '$TC' ORDER BY id DESC LIMIT 1")"

echo
echo "4. Rien ne s'efface : fiche, réclamation, original"
chk "la fiche de la photo est intacte (nom, type, taille, empreinte, date, déposant, visibilité)" \
    "$FICHE_P37_AVANT" "$(fiche "$P37")"
chk "celle du PNG aussi — son type reste image/png" "$FICHE_PNG_AVANT" "$(fiche "$PNG37")"
chk "le texte de la réclamation est intact" "$BILLET_AVANT" "$(billet)"
chk "aucune fiche n'a disparu" 5 "$(sql "SELECT count(*) FROM fichiers WHERE commune_id = '$TC' AND deleted_at IS NULL")"

echo
echo "5. Le journal d'audit trace la compression"
chk "la compression de la photo est au journal" 1 \
    "$(sql "SELECT count(*) FROM audit_log WHERE table_name = 'fichiers' AND record_id = '$P37'
             AND operation = 'UPDATE' AND 'compressee_le' = ANY(changed_fields)")"
chk "au nom de la tâche, pas d'un utilisateur" "tache_conservation_medias|true" \
    "$(sql "SELECT changed_by_role || '|' || (changed_by IS NULL) FROM audit_log WHERE table_name = 'fichiers'
             AND record_id = '$P37' AND 'compressee_le' = ANY(changed_fields)")"
chk "le journal garde la fiche d'avant, inchangée" "TEST-P-reclamation.jpg|$SHA_P37" \
    "$(sql "SELECT (old_data->>'nom_original') || '|' || (old_data->>'sha256') FROM audit_log WHERE table_name = 'fichiers'
             AND record_id = '$P37' AND 'compressee_le' = ANY(changed_fields)")"

echo
echo "6. La restauration froide"
chk "l'original n'est pas lisible avant restauration" 409 "$(code -H "Authorization: Bearer $T_FNCT" "$API/fichiers/$P37/original")"
chk "la FNCT demande la restauration" 201 \
    "$(code -X POST -H "Authorization: Bearer $T_FNCT" -H 'Content-Type: application/json' \
         -d '{"motif":"TEST-P contestation du prestataire devant le conseil"}' "$API/fichiers/$P37/restauration")"
DEMANDE=$(val "['id']")
chk "l'échéance est à 48 heures" 172800 \
    "$(sql "SELECT extract(epoch FROM echeance - demandee_le)::int FROM demandes_restauration WHERE id = '$DEMANDE'")"
chk "une seconde demande pour la même photo est refusée" 409 \
    "$(code -X POST -H "Authorization: Bearer $T_FNCT" -H 'Content-Type: application/json' \
         -d '{"motif":"TEST-P contestation du prestataire devant le conseil"}' "$API/fichiers/$P37/restauration")"
code -X POST -H "Authorization: Bearer $T_FNCT" -H 'Content-Type: application/json' \
     -d '{"motif":"TEST-P vérification de la capture d’écran"}' "$API/fichiers/$PNG37/restauration" >/dev/null
DEMANDE_PNG=$(val "['id']")
# Une demande vieille de trois jours, jamais servie : elle doit se voir en retard.
$PSQL -c "UPDATE demandes_restauration SET demandee_le = now() - interval '3 days',
                                         echeance = now() - interval '1 day' WHERE id = '$DEMANDE_PNG';" >/dev/null
chk "la FNCT voit les demandes, et le retard" "False|True" \
    "$(code -H "Authorization: Bearer $T_FNCT" "$API/fichiers/conservation" >/dev/null
       python3 -c "
import json
r = {x['id']: x['en_retard'] for x in json.load(open('$T/r.json'))['demandes']}
print(str(r.get('$DEMANDE')) + '|' + str(r.get('$DEMANDE_PNG')))")"
# L'original du PNG s'altère dans l'archive : il ne doit pas être restauré.
chmod u+w "$ARCH/$CHEMIN_PNG" && printf 'ALTERE' >> "$ARCH/$CHEMIN_PNG"
chk "la tâche sert les demandes, et signale celle qu'elle n'a pas pu servir (code 1)" 1 "$(medias restaurer)"
chk "la photo est restaurée" "restauree|true" \
    "$(sql "SELECT d.statut || '|' || (f.original_restaure_le IS NOT NULL) FROM demandes_restauration d
             JOIN fichiers f ON f.id = d.fichier_id WHERE d.id = '$DEMANDE'")"
chk "la FNCT lit l'original, identique à celui du dépôt" "200|$SHA_P37" \
    "$(c=$(lire "$P37" "$T_FNCT" /original); echo "$c|$(sha_servi)")"
chk "un directeur ne lit pas l'original" 403 "$(code -H "Authorization: Bearer $T_DIR" "$API/fichiers/$P37/original")"
chk "le citoyen voit toujours la version compressée" "$(sql "SELECT sha256_compresse FROM fichiers WHERE id = '$P37'")" \
    "$( lire "$P37" "$T_CIT" >/dev/null; sha_servi)"
chk "l'original reste dans l'archive froide" "$SHA_P37" "$(sha256sum "$ARCH/$CHEMIN_P37" | cut -d' ' -f1)"
chk "un original altéré n'est jamais restauré : la demande reste ouverte, l'écart nommé" "demandee|empreinte_differente|false" \
    "$(sql "SELECT d.statut || '|' || d.derniere_erreur || '|' || (f.original_restaure_le IS NOT NULL)
             FROM demandes_restauration d JOIN fichiers f ON f.id = d.fichier_id WHERE d.id = '$DEMANDE_PNG'")"
chk "une photo restaurée ne se redemande pas" 409 \
    "$(code -X POST -H "Authorization: Bearer $T_FNCT" -H 'Content-Type: application/json' \
         -d '{"motif":"TEST-P contestation du prestataire devant le conseil"}' "$API/fichiers/$P37/restauration")"

echo
echo "7. Le journal d'audit trace la restauration"
chk "la demande est au journal, au nom de la FNCT" "INSERT|super_admin_fnct" \
    "$(sql "SELECT operation || '|' || changed_by_role FROM audit_log WHERE table_name = 'demandes_restauration'
             AND record_id = '$DEMANDE' AND operation = 'INSERT'")"
chk "la restauration aussi, au nom de la tâche" "tache_conservation_medias" \
    "$(sql "SELECT changed_by_role FROM audit_log WHERE table_name = 'demandes_restauration'
             AND record_id = '$DEMANDE' AND operation = 'UPDATE' AND new_data->>'statut' = 'restauree'")"
chk "et la fiche restaurée" 1 \
    "$(sql "SELECT count(*) FROM audit_log WHERE table_name = 'fichiers' AND record_id = '$P37'
             AND 'original_restaure_le' = ANY(changed_fields)")"

echo
echo "----------------------------------------------------------------"
printf '  %s réussis, %s échecs\n' "$pass" "$fail"
[ "$fail" -eq 0 ] || exit 1
