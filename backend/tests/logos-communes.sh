#!/usr/bin/env bash
# =============================================================================
# Jalon D, lot D1 — le logo des communes (migration 083).
# docs/specs_metier/SPEC_D_pret_a_presenter.md, D1.
#
# La commune dépose son logo elle-même, depuis son portail ; la FNCT le dépose
# en secours, depuis l'annuaire national ; il s'affiche en tête du portail.
#
# Elle commence par ce que la plateforme REFUSE : un dépôt sans compte, d'un
# prestataire ou d'un citoyen ; le logo d'une autre commune ; un fichier qui
# n'est pas une image (un PDF renommé .png, un texte) ; plus de 1 Mo ; un SVG
# actif, sous chacune de ses formes (script, gestionnaire on…, javascript:,
# objet étranger, entités, lien extérieur, feuille de style qui charge une
# adresse, animation d'un lien) ; et, en base : un SVG pour un autre usage, un
# PDF pour un logo, un logo de plus de 1 Mo, deux logos en vigueur, un logo
# réécrit, un logo d'une commune réelle effacé. Puis le parcours : le dépôt,
# les métadonnées retirées, le logo servi sous sa politique de sécurité, le
# remplacement qui garde l'ancien dans l'historique, le secours de la FNCT, le
# retrait, le journal d'audit.
#
# Tout se passe dans deux communes de test, avec des comptes temporaires ; la
# campagne prouve en partant qu'aucune commune réelle n'a reçu de ligne.
#
#   docker compose exec -T api npm run test:logos-communes
# =============================================================================

set -u
cd "$(dirname "$0")/.." || exit 1
API="${API_URL:-http://localhost:4000}"
PSQL="psql -q -tA -h ${PGHOST:-localhost} -p ${PGPORT:-5432} -U ${PGUSER:-siipi_admin} -d ${PGDATABASE:-siipi_national}"
pass=0; fail=0
T=$(mktemp -d)

tok() {
  curl -s -X POST "$API/auth/login" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"${2:-Siipi2026!}\"}" \
    | python3 -c "import sys,json;print(json.load(sys.stdin).get('token',''))" 2>/dev/null
}
sql()  { $PSQL -c "$1" 2>/dev/null | tr -d ' '; }
val()  { python3 -c "import json;d=json.load(open('$T/r.json'));print($1)" 2>/dev/null || echo erreur; }
chk() {
  if [ "$2" = "$3" ]; then printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1))
  else printf '  \033[31m✗\033[0m %s  (attendu %s, obtenu %s)\n' "$1" "$2" "$3"; fail=$((fail+1)); fi
}
# deposer <commune> <fichier> <jeton> : le code HTTP, la réponse dans $T/r.json.
deposer() {
  python3 -c "import base64,json,sys;print(json.dumps({'nomFichier':sys.argv[1].rsplit('/',1)[-1],'contenu':base64.b64encode(open(sys.argv[1],'rb').read()).decode()}))" "$2" > "$T/corps.json"
  curl -s -o "$T/r.json" -w '%{http_code}' -X POST "$API/communes/$1/logo" -H "Authorization: Bearer $3" \
       -H 'Content-Type: application/json' --data-binary "@$T/corps.json"
}
# lire_logo <commune> <jeton> : le code, les octets dans $T/logo.bin, les en-têtes dans $T/entetes.txt.
lire_logo() {
  curl -s -o "$T/logo.bin" -D "$T/entetes.txt" -w '%{http_code}' "$API/communes/$1/logo" -H "Authorization: Bearer $2"
}
entete() { grep -i "^$1:" "$T/entetes.txt" | head -1 | cut -d' ' -f2- | tr -d '\r'; }
logos() { sql "SELECT count(*) || '|' || count(*) FILTER (WHERE retire_le IS NULL) FROM logos_communes WHERE commune_id = '$1'"; }

A=test_logos_a
B=test_logos_b
ESSAI_C="'$A','$B'"
DOSSIER="${SIIPI_FICHIERS_DIR:-/var/siipi/fichiers}"
. tests/outils/comptes_temporaires.sh
. tests/outils/communes_essai.sh
. tests/outils/base_reelle.sh
nettoyer_c() {
  effacer_communes_essai "$ESSAI_C"
  retirer_comptes_temporaires
  effacer_communes_essai "$ESSAI_C"
  rm -rf "$DOSSIER/$A" "$DOSSIER/$B"
}
nettoyer_c
trap 'nettoyer_c; rm -rf "$T"' EXIT
releve_base_reelle

commune_essai "$A" "TEST Commune A des logos"
commune_essai "$B" "TEST Commune B des logos"
# Un gouvernorat réel, lu en base, pour le nom arabe de l'en-tête.
G=$($PSQL -c "SELECT gouvernorat FROM gouvernorats_noms ORDER BY gouvernorat LIMIT 1" 2>/dev/null)
G_AR=$($PSQL -c "SELECT nom_ar FROM gouvernorats_noms WHERE gouvernorat = '$G'" 2>/dev/null)
$PSQL -c "UPDATE communes SET gouvernorat = '$G' WHERE id = '$A';" >/dev/null
compte_temporaire admin_commune "$A" "Directeur A des logos"; T_A=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP")
compte_temporaire admin_commune "$B" "Directeur B des logos"; T_B=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP")
compte_temporaire gestionnaire_prestataire "$A" "Prestataire des logos"; T_P=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP")
compte_temporaire citoyen "$A" "Citoyen des logos"; T_C=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP")
compte_temporaire super_admin_fnct "" "Agent FNCT des logos"; T_F=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP")
[ -n "$T_A" ] && [ -n "$T_B" ] && [ -n "$T_P" ] && [ -n "$T_C" ] && [ -n "$T_F" ] \
  || { echo "API injoignable sur $API, ou comptes temporaires refusés" >&2; exit 1; }

# Les fichiers d'essai : un PNG porteur d'un commentaire (tEXt) à retirer, un
# SVG statique, des SVG actifs, un PDF renommé, un texte, une image trop lourde.
python3 - "$T" <<'PYEOF'
import struct, sys, zlib
d = sys.argv[1]
def morceau(t, x):
    return struct.pack('>I', len(x)) + t + x + struct.pack('>I', zlib.crc32(t + x) & 0xffffffff)
def png(texte=None, remplissage=0):
    entete = struct.pack('>IIBBBBB', 2, 2, 8, 2, 0, 0, 0)
    pixels = zlib.compress(b'\x00\x0f\x76\x6e\x0f\x76\x6e' * 2)
    corps = b'\x89PNG\r\n\x1a\n' + morceau(b'IHDR', entete)
    if texte:
        corps += morceau(b'tEXt', b'Comment\x00' + texte)
    corps += morceau(b'IDAT', pixels) + morceau(b'IEND', b'')
    return corps + b'\x00' * remplissage
open(f'{d}/logo.png', 'wb').write(png(b'TEST-METADONNEE-A-RETIRER'))
open(f'{d}/lourd.png', 'wb').write(png(remplissage=1024 * 1024 + 10))
open(f'{d}/faux.png', 'wb').write(b'%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n')
open(f'{d}/texte.png', 'wb').write('Ceci est un texte, pas une image.\n'.encode() * 3)
statique = ('<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 10 10">'
            '<defs><linearGradient id="g"><stop offset="0" stop-color="#0f766e"/></linearGradient></defs>'
            '<circle cx="5" cy="5" r="4" fill="url(#g)"/><use xlink:href="#g"/><text x="1" y="9">Monastir</text></svg>')
open(f'{d}/statique.svg', 'w', encoding='utf-8').write(statique)
actifs = {
    'script': '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    'onload': '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><circle r="1"/></svg>',
    'javascript': '<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)"><circle r="1"/></a></svg>',
    'foreignobject': '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div>x</div></foreignObject></svg>',
    'entite': '<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg xmlns="http://www.w3.org/2000/svg"><text>&x;</text></svg>',
    'lien': '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://exemple.test/pixel.png"/></svg>',
    'style': '<svg xmlns="http://www.w3.org/2000/svg"><style>@import "https://exemple.test/x.css";</style></svg>',
    'animation': '<svg xmlns="http://www.w3.org/2000/svg"><a><set attributeName="href" to="#x"/></a></svg>',
}
for nom, texte in actifs.items():
    open(f'{d}/actif-{nom}.svg', 'w', encoding='utf-8').write(texte)
PYEOF

echo
echo "1. Ce qui est refusé"
chk "sans compte : 401" 401 "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/communes/$A/logo" -H 'Content-Type: application/json' -d '{"nomFichier":"x.png","contenu":"AA=="}')"
chk "un prestataire, un citoyen : 403" "403|403" "$(deposer "$A" "$T/logo.png" "$T_P")|$(deposer "$A" "$T/logo.png" "$T_C")"
chk "le directeur d'une autre commune : introuvable (404), et rien n'est inscrit" "404|0|0" "$(deposer "$B" "$T/logo.png" "$T_A")|$(logos "$B")"
chk "un PDF renommé .png : 415, ce n'est pas une image" "415|1" "$(deposer "$A" "$T/faux.png" "$T_A")|$(val "int(\"n'est pas une image\" in d['error'])")"
chk "un texte : 415" 415 "$(deposer "$A" "$T/texte.png" "$T_A")"
chk "plus de 1 Mo : 413, et le message dit le plafond" "413|1" "$(deposer "$A" "$T/lourd.png" "$T_A")|$(val "int('1 Mo' in d['error'])")"
for cas in "script:un script" "onload:gestionnaire d'événement" "javascript:adresse exécutable" "foreignobject:objet étranger" \
           "entite:déclare un type ou des entités" "lien:adresse extérieure" "style:charge une adresse extérieure" "animation:anime un lien"; do
  chk "un SVG actif (${cas%%:*}) : refusé, en disant pourquoi" "415|1" \
      "$(deposer "$A" "$T/actif-${cas%%:*}.svg" "$T_A")|$(val "int(\"${cas#*:}\" in d['error'])")"
done
chk "après tous ces refus, aucun logo inscrit, aucun fichier" "0|0|0" "$(logos "$A")|$(sql "SELECT count(*) FROM fichiers WHERE commune_id = '$A'")"
chk "et le dépôt de fichiers ordinaire refuse toujours le SVG" 415 \
    "$(python3 -c "import base64,json;print(json.dumps({'nomFichier':'x.svg','contenu':base64.b64encode(open('$T/statique.svg','rb').read()).decode()}))" > "$T/c2.json"; \
       curl -s -o /dev/null -w '%{http_code}' -X POST "$API/fichiers?communeId=$A" -H "Authorization: Bearer $T_A" -H 'Content-Type: application/json' --data-binary "@$T/c2.json")"

echo
echo "2. La base refuse aussi (migration 083)"
refus_sql() { $PSQL -c "$1" 2>&1 | grep -c "$2" | head -1; }
ID_A=$(sql "SELECT id FROM users WHERE email LIKE 'test.compte.%' AND commune_id = '$A' AND role = 'admin_commune'")
fichier_sql() {  # $1 = type, $2 = usage, $3 = taille
  echo "INSERT INTO fichiers (id, commune_id, nom_original, type_mime, taille_octets, sha256, chemin_relatif, usage, televerse_par, visibilite)
        VALUES (gen_random_uuid(), '$A', 'x', '$1', $3, 'x', 'x', '$2', '$ID_A', 'publique')"
}
chk "un SVG pour un autre usage : refusé" 1 "$(refus_sql "$(fichier_sql image/svg+xml constat_terrain 100)" fichiers_type_autorise)"
chk "un PDF comme logo : refusé" 1 "$(refus_sql "$(fichier_sql application/pdf logo_commune 100)" fichiers_type_autorise)"
chk "un logo de plus de 1 Mo : refusé" 1 "$(refus_sql "$(fichier_sql image/png logo_commune 2000000)" fichiers_taille_plausible)"

echo
echo "3. Le dépôt, et le logo servi"
chk "le directeur dépose un PNG : 201, rien à remplacer" "201|False|image/png" "$(deposer "$A" "$T/logo.png" "$T_A")|$(val "d['remplace']")|$(val "d['type']")"
chk "un logo en vigueur" "1|1" "$(logos "$A")"
chk "servi : 200, son type, nosniff, une politique de sécurité fermée" "200|image/png|nosniff|1" \
    "$(lire_logo "$A" "$T_A")|$(entete content-type)|$(entete x-content-type-options)|$(entete content-security-policy | grep -c "default-src 'none'")"
chk "les métadonnées du PNG (commentaire tEXt) sont retirées" 0 "$(grep -c 'TEST-METADONNEE' "$T/logo.bin")"
ETAG=$(entete etag)
chk "relu avec son empreinte : 304" 304 "$(curl -s -o /dev/null -w '%{http_code}' "$API/communes/$A/logo" -H "Authorization: Bearer $T_A" -H "If-None-Match: $ETAG")"
chk "le logo d'une commune se lit de tout compte (citoyen, autre commune) : c'est son identité" "200|200" \
    "$(lire_logo "$A" "$T_C")|$(lire_logo "$A" "$T_B")"
chk "une commune sans logo : 404 (l'écran affiche les initiales)" 404 "$(lire_logo "$B" "$T_B")"

echo
echo "4. Le remplacement garde l'ancien (règle 1.4)"
chk "un SVG statique remplace le PNG : 201, l'ancien est retiré" "201|True|image/svg+xml" \
    "$(deposer "$A" "$T/statique.svg" "$T_A")|$(val "d['remplace']")|$(val "d['type']")"
chk "deux logos dans l'historique, un seul en vigueur" "2|1" "$(logos "$A")"
chk "servi en SVG, sous la politique de sécurité fermée (sandbox)" "200|image/svg+xml|1" \
    "$(lire_logo "$A" "$T_A")|$(entete content-type)|$(entete content-security-policy | grep -c 'sandbox')"
chk "l'historique : le plus récent d'abord, en vigueur ; le PNG retiré" "200|2|True|False" \
    "$(curl -s -o "$T/r.json" -w '%{http_code}' "$API/communes/$A/logos" -H "Authorization: Bearer $T_A")|$(val "len(d)")|$(val "d[0]['en_vigueur']")|$(val "d[1]['en_vigueur']")"
L1=$(sql "SELECT id FROM logos_communes WHERE commune_id = '$A' AND retire_le IS NULL")
chk "deux logos en vigueur : refusé par la base" 1 \
    "$(refus_sql "INSERT INTO logos_communes (commune_id, fichier_id) SELECT '$A', fichier_id FROM logos_communes WHERE id = '$L1'" logos_communes_en_vigueur)"
chk "un logo déposé ne se réécrit pas" 1 \
    "$(refus_sql "UPDATE logos_communes SET fichier_id = (SELECT fichier_id FROM logos_communes WHERE commune_id = '$A' AND retire_le IS NOT NULL) WHERE id = '$L1'" LOGO_HISTORIQUE)"
chk "un logo retiré ne revient pas" 1 \
    "$(refus_sql "UPDATE logos_communes SET retire_le = NULL WHERE commune_id = '$A' AND retire_le IS NOT NULL" LOGO_HISTORIQUE)"
# Le logo d'une commune RÉELLE, posé et effacé dans une transaction qui ne
# s'achève pas : l'effacement est refusé, et rien ne reste (contrôle en partant).
REELLE=$(sql "SELECT id FROM communes WHERE id NOT LIKE 'test%' AND NOT est_demo AND deleted_at IS NULL ORDER BY id LIMIT 1")
chk "le logo d'une commune réelle ne s'efface pas" 1 \
    "$($PSQL -c "BEGIN;
                 INSERT INTO fichiers (id, commune_id, nom_original, type_mime, taille_octets, sha256, chemin_relatif, usage, visibilite)
                   VALUES ('00000000-0000-4000-8000-000000000083', '$REELLE', 'x', 'image/png', 10, 'x', 'x', 'logo_commune', 'publique');
                 INSERT INTO logos_communes (commune_id, fichier_id) VALUES ('$REELLE', '00000000-0000-4000-8000-000000000083');
                 DELETE FROM logos_communes WHERE commune_id = '$REELLE';
                 ROLLBACK;" 2>&1 | grep -c "LOGO_HISTORIQUE: un logo ne s'efface pas" | head -1)"

echo
echo "5. Le secours de la FNCT, le retrait, le journal"
chk "la FNCT dépose le logo de la commune B : 201" 201 "$(deposer "$B" "$T/logo.png" "$T_F")"
chk "le directeur de B le voit" 200 "$(lire_logo "$B" "$T_B")"
chk "le directeur de A retire son logo : 204, puis 404 à la lecture" "204|404" \
    "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/communes/$A/logo/retrait" -H "Authorization: Bearer $T_A")|$(lire_logo "$A" "$T_A")"
chk "les deux logos restent dans l'historique, aucun en vigueur" "2|0" "$(logos "$A")"
chk "retirer sans logo en vigueur : 404" 404 "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/communes/$A/logo/retrait" -H "Authorization: Bearer $T_A")"
chk "dépôts et retraits au journal d'audit (2 dépôts, 2 retraits)" "2|2" \
    "$(sql "SELECT count(*) FILTER (WHERE operation = 'INSERT') || '|' || count(*) FILTER (WHERE operation = 'UPDATE') FROM audit_log WHERE table_name = 'logos_communes' AND commune_id = '$A'")"

echo
echo "6. L'ancienne adresse libre, et l'en-tête de la commune"
curl -s -o /dev/null -X PATCH "$API/communes/$A" -H "Authorization: Bearer $T_A" -H 'Content-Type: application/json' -d '{"logoUrl":"https://exemple.test/logo.png"}'
chk "PATCH /communes/:id n'écrit plus d'adresse de logo (logo_url reste vide)" "" "$(sql "SELECT COALESCE(logo_url, '') FROM communes WHERE id = '$A'")"
chk "GET /communes/:id rend le nom arabe du gouvernorat" "200|$G_AR" \
    "$(curl -s -o "$T/r.json" -w '%{http_code}' "$API/communes/$A" -H "Authorization: Bearer $T_A")|$(val "d['gouvernorat_ar']")"

echo
echo "Aucune commune réelle n'a reçu de ligne"
base_reelle_intacte "pendant la campagne"
nettoyer_c
chk "ses communes de test, leurs logos et leurs fichiers, et ses comptes temporaires sont effacés" "0|0|0|0" \
    "$(sql "SELECT count(*) FROM communes WHERE id IN ($ESSAI_C)")|$(sql "SELECT count(*) FROM logos_communes WHERE commune_id IN ($ESSAI_C)")|$(sql "SELECT count(*) FROM fichiers WHERE commune_id IN ($ESSAI_C)")|$(sql "SELECT count(*) FROM users WHERE email LIKE 'test.compte.%@siipi.tn'")"
base_reelle_intacte "en partant"

echo
echo "----------------------------------------------------------------"
printf '  %s réussis, %s échecs\n' "$pass" "$fail"
[ "$fail" -eq 0 ] || exit 1
