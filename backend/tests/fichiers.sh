#!/usr/bin/env bash
# =============================================================================
# Stockage des fichiers — campagne de vérification.
#
# CE QUE CETTE CAMPAGNE VÉRIFIE D'ABORD. Comme au module 4, elle commence par
# ce que la plateforme REFUSE. Un stockage de fichiers est la porte la plus
# large d'une application web : ce qui compte n'est pas qu'une photo entre,
# c'est qu'un exécutable renommé « photo.jpg » n'entre pas, qu'un SVG porteur
# de script n'entre pas, et qu'une photo de téléphone n'emporte pas dans la
# base les coordonnées du domicile de celui qui l'a prise.
#
#   docker compose exec -T api npm run test:fichiers
# =============================================================================

set -u
API="${API_URL:-http://localhost:4000}"
PSQL="psql -q -tA -h ${PGHOST:-localhost} -p ${PGPORT:-5432} -U ${PGUSER:-siipi_admin} -d ${PGDATABASE:-siipi_national}"
pass=0; fail=0
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT

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

COMMUNE=$(sql "SELECT id FROM communes WHERE name ILIKE '%Chaâbane%' OR name ILIKE '%Chaabane%' OR id LIKE '%dar_chaabane%' ORDER BY length(name) LIMIT 1")
[ -n "$COMMUNE" ] || { echo "Dar Chaabane absente. Lancer : npm run seed" >&2; exit 1; }
AUTRE=$(sql "SELECT id FROM communes WHERE id <> '$COMMUNE' AND activee ORDER BY id LIMIT 1")

DIR_EMAIL=$(sql "SELECT email FROM users WHERE role='admin_commune' AND commune_id='$COMMUNE' AND deleted_at IS NULL AND is_active AND NOT mot_de_passe_provisoire ORDER BY created_at LIMIT 1")
[ -n "$DIR_EMAIL" ] || DIR_EMAIL=$(sql "SELECT email FROM users WHERE role='admin_commune' AND deleted_at IS NULL AND is_active AND NOT mot_de_passe_provisoire ORDER BY created_at LIMIT 1")
T_DIR=$(tok "$DIR_EMAIL")
[ -n "$T_DIR" ] || { echo "API injoignable sur $API" >&2; exit 1; }
COMMUNE_DIR=$(sql "SELECT commune_id FROM users WHERE email='$DIR_EMAIL'")

nettoyer() { $PSQL -c "DELETE FROM fichiers WHERE nom_original LIKE 'TEST-F%';" >/dev/null 2>&1; }
nettoyer

# --- Les pièces à conviction, fabriquées ici pour ne dépendre d'aucun dépôt ---
python3 - "$T" <<'PY'
import base64, json, struct, sys, zlib
d = sys.argv[1]

def jpeg_avec_gps(lat=36.8065, lng=10.1815, marque=b'ACME Phone', auteur=b'Nacer B.'):
    """Un JPEG minuscule mais VALIDE, porteur d'un APP1/EXIF avec position."""
    def rat(v):
        d_, r = int(abs(v)), (abs(v) % 1) * 60
        m, s = int(r), (r % 1) * 60
        return struct.pack('>IIIIII', d_, 1, m, 1, int(s*100), 100)

    # L'EXIF est écrit à la main : deux répertoires, l'IFD0 puis celui du GPS
    # à sa suite, avec les offsets calculés. Dépendre de piexif obligerait à
    # installer un paquet Python dans le conteneur de l'API pour lancer une
    # campagne de tests — et ce fixture-ci porte exactement ce qu'on veut
    # éprouver : une position, un modèle d'appareil, un nom de propriétaire.
    entetes = [(0x010F, 2, len(marque)+1, b'', marque+b'\x00'),
               (0x0110, 2, 7, b'', b'X1 Pro\x00'),
               (0x013B, 2, len(auteur)+1, b'', auteur+b'\x00')]
    n0 = len(entetes) + 1                      # + le pointeur GPS
    taille_ifd0 = 2 + 12*n0 + 4
    donnees0 = b''.join(e[4] for e in entetes)
    offset_gps = 8 + taille_ifd0 + len(donnees0)

    out = struct.pack('>H', n0); donnees = b''
    for tag, typ, n, val, brut in entetes:
        off = 8 + taille_ifd0 + len(donnees)
        out += struct.pack('>HHII', tag, typ, n, off); donnees += brut
    out += struct.pack('>HHII', 0x8825, 4, 1, offset_gps)
    out += struct.pack('>I', 0) + donnees
    ifd0 = out

    # IFD GPS, avec ses rationnels placés juste après lui.
    ge = [(1, 2, 2, b'N\x00\x00\x00', None), (2, 5, 3, b'', rat(lat)),
          (3, 2, 2, b'E\x00\x00\x00', None), (4, 5, 3, b'', rat(lng))]
    taille_gps = 2 + 12*len(ge) + 4
    out = struct.pack('>H', len(ge)); donnees = b''
    for tag, typ, n, val, brut in ge:
        if brut is None:
            out += struct.pack('>HHI', tag, typ, n) + val
        else:
            off = offset_gps + taille_gps + len(donnees)
            out += struct.pack('>HHII', tag, typ, n, off); donnees += brut
    gps_ifd = out + struct.pack('>I', 0) + donnees

    tiff = b'MM\x00\x2a' + struct.pack('>I', 8) + ifd0 + gps_ifd
    exif = b'Exif\x00\x00' + tiff
    app1 = b'\xff\xe1' + struct.pack('>H', len(exif) + 2) + exif
    # Un JPEG 1x1 gris, le plus court qui se décode.
    corps = base64.b64decode(
        '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a'
        'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA'
        'AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==')
    return corps[:2] + app1 + corps[2:]

open(f'{d}/gps.jpg','wb').write(jpeg_avec_gps())
open(f'{d}/faux.jpg','wb').write(b'MZ\x90\x00' + b'\x00'*300)
open(f'{d}/carte.svg','wb').write(b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')
open(f'{d}/gros.jpg','wb').write(b'\xff\xd8\xff\xe0' + b'\x00' * (9*1024*1024))
open(f'{d}/doc.pdf','wb').write(b'%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n')

for nom in ['gps.jpg','faux.jpg','carte.svg','gros.jpg','doc.pdf']:
    b = open(f'{d}/{nom}','rb').read()
    open(f'{d}/{nom}.b64','w').write(base64.b64encode(b).decode())
PY

depot() {  # $1 = fichier b64, $2 = nom, $3 = usage, $4 = jeton, $5 = commune
  python3 -c "
import json,sys
print(json.dumps({'nomFichier': sys.argv[2], 'contenu': open(sys.argv[1]).read(), 'usage': sys.argv[3]}))" \
    "$T/$1.b64" "$2" "$3" > "$T/corps.json"
  code -X POST -H "Authorization: Bearer ${4:-$T_DIR}" -H 'Content-Type: application/json' \
       --data-binary "@$T/corps.json" "$API/fichiers?communeId=${5:-$COMMUNE_DIR}"
}

# -----------------------------------------------------------------------------
echo
echo "1. Ce que le stockage REFUSE"
chk "un exécutable renommé « .jpg » est refusé" 415 "$(depot faux.jpg 'TEST-F-faux.jpg' reclamation)"
chk "un SVG porteur de script est refusé" 415 "$(depot carte.svg 'TEST-F-carte.svg' reclamation)"
chk "un fichier de 9 Mo dépasse le plafond" 413 "$(depot gros.jpg 'TEST-F-gros.jpg' reclamation)"
chk "et le message dit la taille et le plafond" 1 \
    "$(python3 -c "
import json; e=json.load(open('$T/r.json')).get('error','')
print(1 if 'Mo' in e and 'maximum' in e else 0)" 2>/dev/null || echo erreur)"
CODE=$(code -X POST -H "Authorization: Bearer $T_DIR" -H 'Content-Type: application/json' \
       -d '{"nomFichier":"TEST-F-vide.jpg","contenu":"","usage":"reclamation"}' "$API/fichiers?communeId=$COMMUNE_DIR")
chk "un contenu vide est refusé" 400 "$CODE"
chk "sans jeton, rien n'entre" 401 \
    "$(code -X POST -H 'Content-Type: application/json' -d '{}' "$API/fichiers?communeId=$COMMUNE_DIR")"

# -----------------------------------------------------------------------------
echo
echo "2. Une photo entre, et ses métadonnées n'entrent pas"
ENVOYE=$(wc -c < "$T/gps.jpg" | tr -d ' ')
chk "la photo est acceptée" 201 "$(depot gps.jpg 'TEST-F-photo.jpg' reclamation)"
FICHIER=$(val "['id']")
chk "le type retenu est celui des octets" "image/jpeg" "$(val "['type_mime']")"
chk "la position de la photo est RENDUE à l'appelant" 1 \
    "$(python3 -c "
import json
p = json.load(open('$T/r.json')).get('positionPhoto')
print(1 if p and abs(p['lat']-36.8065) < 0.01 and abs(p['lng']-10.1815) < 0.01 else 0)" 2>/dev/null || echo erreur)"
# Rendue, mais nulle part conservée : c'est toute la différence entre une
# donnée fournie et une donnée prélevée.
# Par SEGMENT du nom de colonne, coupé sur « _ » — un LIKE '%lat%' tenait
# aussi « chemin_relatif », qui n'a rien d'une coordonnée : ce faux positif
# aurait fait échouer la campagne à chaque exécution, sans lien avec ce
# qu'elle prétend vérifier.
chk "et elle n'est stockée dans aucune colonne" 0 \
    "$(sql "SELECT count(*) FROM information_schema.columns
             WHERE table_name='fichiers'
               AND EXISTS (SELECT 1 FROM unnest(string_to_array(column_name, '_')) AS seg
                            WHERE seg IN ('lat','lng','gps','position'))")"
chk "le fichier stocké est plus léger que l'envoyé" 1 \
    "$(python3 -c "print(1 if $(sql "SELECT taille_octets FROM fichiers WHERE id='$FICHIER'") < $ENVOYE else 0)")"
curl -s -H "Authorization: Bearer $T_DIR" "$API/fichiers/$FICHIER" -o "$T/relu.bin"
chk "« Exif » ne se retrouve pas dans les octets servis" 0 "$(grep -c 'Exif' "$T/relu.bin" || true)"
chk "ni le nom du propriétaire de l'appareil" 0 "$(grep -c 'Nacer B.' "$T/relu.bin" || true)"
chk "l'image reste un JPEG" "ffd8ff" "$(head -c 3 "$T/relu.bin" | od -An -tx1 | tr -d ' \n')"
chk "servie avec son vrai type" "image/jpeg" \
    "$(curl -s -D- -o /dev/null -H "Authorization: Bearer $T_DIR" "$API/fichiers/$FICHIER" | grep -i '^content-type:' | tr -d '\r' | awk '{print $2}')"
chk "et avec « nosniff »" 1 \
    "$(curl -s -D- -o /dev/null -H "Authorization: Bearer $T_DIR" "$API/fichiers/$FICHIER" | grep -ci 'x-content-type-options: nosniff' || true)"
ETAG=$(curl -s -D- -o /dev/null -H "Authorization: Bearer $T_DIR" "$API/fichiers/$FICHIER" | grep -i '^etag:' | tr -d '\r' | awk '{print $2}')
chk "relue à l'identique, elle n'est pas retransmise" 304 \
    "$(code -H "Authorization: Bearer $T_DIR" -H "If-None-Match: $ETAG" "$API/fichiers/$FICHIER")"
chk "un PDF est accepté" 201 "$(depot doc.pdf 'TEST-F-doc.pdf' document_projet)"

# -----------------------------------------------------------------------------
echo
echo "3. Cloisonnement"
chk "« occupation » n'est pas pris pour un identifiant" 200 \
    "$(code -H "Authorization: Bearer $T_DIR" "$API/fichiers/occupation?communeId=$COMMUNE_DIR")"
chk "un identifiant inconnu rend 404" 404 \
    "$(code -H "Authorization: Bearer $T_DIR" "$API/fichiers/00000000-0000-0000-0000-000000000000")"
chk "un identifiant mal formé rend 400, pas 500" 400 \
    "$(code -H "Authorization: Bearer $T_DIR" "$API/fichiers/pas-un-uuid")"

AUTRE_EMAIL=$(sql "SELECT email FROM users WHERE role='admin_commune' AND commune_id <> '$COMMUNE_DIR' AND deleted_at IS NULL AND is_active AND NOT mot_de_passe_provisoire ORDER BY created_at LIMIT 1")
if [ -n "$AUTRE_EMAIL" ]; then
  T_AUTRE=$(tok "$AUTRE_EMAIL")
  # INTROUVABLE et non « refusé » : un refus renseignerait sur son existence.
  chk "l'administrateur d'une autre commune ne la trouve pas" 404 \
      "$(code -H "Authorization: Bearer $T_AUTRE" "$API/fichiers/$FICHIER")"
fi

# -----------------------------------------------------------------------------
echo
echo "4. Le citoyen : sa photo, et la preuve qu'on lui doit"
CIT_EMAIL=$(sql "SELECT u.email FROM users u JOIN citoyens c ON c.user_id=u.id WHERE u.role='citoyen' AND u.commune_id='$COMMUNE_DIR' AND u.deleted_at IS NULL AND u.is_active ORDER BY u.created_at LIMIT 1")
CIT_ID=$(sql "SELECT c.id FROM users u JOIN citoyens c ON c.user_id=u.id WHERE u.email='$CIT_EMAIL'")
if [ -n "$CIT_EMAIL" ]; then
  T_CIT=$(tok "$CIT_EMAIL")
  if [ -n "$T_CIT" ]; then
    chk "un citoyen dépose une photo pour sa commune" 201 \
        "$(depot gps.jpg 'TEST-F-citoyen.jpg' reclamation "$T_CIT" "$COMMUNE_DIR")"
    SIENNE=$(val "['id']")
    chk "il relit la sienne" 200 "$(code -H "Authorization: Bearer $T_CIT" "$API/fichiers/$SIENNE")"
    chk "il ne voit pas celle de la commune" 404 "$(code -H "Authorization: Bearer $T_CIT" "$API/fichiers/$FICHIER")"
    chk "et ne peut pas rendre la sienne publique" 403 \
        "$(code -X PATCH -H "Authorization: Bearer $T_CIT" -H 'Content-Type: application/json' \
           -d '{"visibilite":"publique"}' "$API/fichiers/$SIENNE")"

    # La preuve de traitement : déposée par la commune, lisible par LUI SEUL.
    python3 -c "
import json
print(json.dumps({'nomFichier':'TEST-F-preuve.jpg','contenu':open('$T/gps.jpg.b64').read(),
                  'usage':'preuve_traitement','destinataireCitoyenId':'$CIT_ID'}))" > "$T/corps.json"
    chk "la commune dépose la preuve de traitement" 201 \
        "$(code -X POST -H "Authorization: Bearer $T_DIR" -H 'Content-Type: application/json' \
           --data-binary "@$T/corps.json" "$API/fichiers?communeId=$COMMUNE_DIR")"
    PREUVE=$(val "['id']")
    chk "elle est bien adressée à ce citoyen" "citoyen" "$(val "['visibilite']")"
    chk "le citoyen concerné la voit" 200 "$(code -H "Authorization: Bearer $T_CIT" "$API/fichiers/$PREUVE")"

    # B5.1.3 de bout en bout. Le point vérifié ici est celui qui ne se voit
    # nulle part à l'écran : une photo déposée sans destinataire est, par
    # défaut, invisible du citoyen. C'est en CLÔTURANT la réclamation que
    # l'API l'ouvre à son auteur — seul endroit où l'on sache à qui l'ouvrir.
    # Si cette ouverture manquait, le citoyen recevrait une notification
    # renvoyant vers une image qu'il n'a pas le droit de voir.
    TICKET=$(sql "INSERT INTO tickets (ticket_number, commune_id, category, title, citizen_id, status)
                  VALUES ('TEST-F-'||substr(md5(random()::text),1,8), '$COMMUNE_DIR', 'depot_sauvage',
                          'TEST-F réclamation', '$CIT_ID', 'recu') RETURNING id")
    if [ -n "$TICKET" ]; then
      chk "une preuve déposée sans destinataire reste au service" 201 \
          "$(depot gps.jpg 'TEST-F-preuve2.jpg' preuve_traitement)"
      PREUVE2=$(val "['id']")
      chk "et le citoyen ne la voit pas encore" 404 \
          "$(code -H "Authorization: Bearer $T_CIT" "$API/fichiers/$PREUVE2")"
      chk "la réclamation est close avec la preuve" 200 \
          "$(code -X PATCH -H "Authorization: Bearer $T_DIR" -H 'Content-Type: application/json' \
             -d "{\"status\":\"resolu\",\"resolvedPhotoUrl\":\"/fichiers/$PREUVE2\"}" \
             "$API/tickets/$TICKET/treat")"
      chk "la clôture a ouvert la photo à son auteur" "citoyen" \
          "$(sql "SELECT visibilite FROM fichiers WHERE id='$PREUVE2'")"
      chk "et à lui seul" "$CIT_ID" \
          "$(sql "SELECT destinataire_citoyen_id FROM fichiers WHERE id='$PREUVE2'")"
      chk "le citoyen la voit désormais" 200 \
          "$(code -H "Authorization: Bearer $T_CIT" "$API/fichiers/$PREUVE2")"
      $PSQL -c "DELETE FROM tickets WHERE id='$TICKET';" >/dev/null 2>&1
    fi
  fi
fi

# -----------------------------------------------------------------------------
echo
echo "5. Retrait"
CHEMIN=$(sql "SELECT chemin_relatif FROM fichiers WHERE id='$FICHIER'")
chk "la commune retire le fichier" 204 \
    "$(code -X DELETE -H "Authorization: Bearer $T_DIR" "$API/fichiers/$FICHIER")"
chk "il devient introuvable" 404 "$(code -H "Authorization: Bearer $T_DIR" "$API/fichiers/$FICHIER")"
# Les octets restent : effacer relève d'une purge datée, pas du geste d'un
# utilisateur. Mieux vaut un disque qui grossit qu'une pièce qui s'évapore.
chk "les octets, eux, sont toujours sur le volume" 1 \
    "$([ -f "${SIIPI_FICHIERS_DIR:-/var/siipi/fichiers}/$CHEMIN" ] && echo 1 || echo 0)"
chk "le retirer une seconde fois rend 404" 404 \
    "$(code -X DELETE -H "Authorization: Bearer $T_DIR" "$API/fichiers/$FICHIER")"

nettoyer
echo
echo "----------------------------------------------------------------"
printf '  %s réussis, %s échecs\n' "$pass" "$fail"
[ "$fail" -eq 0 ] || exit 1
