# shellcheck shell=bash
# ---------------------------------------------------------------------------
# Les tables nationales qu'une campagne modifie, gardées avant elle et rendues
# en partant, ligne entière — dates et auteurs compris (JC-013,
# docs/recette/JOURNAL_DES_CORRECTIONS.md).
#
# POURQUOI. Une table nationale (paramètres nationaux, paramètres des
# indicateurs, réglages WaPla, districts) ne porte pas de commune : une
# campagne ne peut pas travailler dans une copie de test, elle doit modifier la
# vraie, puis la rendre. Elles rendaient la valeur, pas la date ni l'auteur :
# « modifié le 19/10/2026 par — », un paramètre qui paraît réglé le jour des
# campagnes, des districts qui paraissent redéfinis. Rendre la valeur par une
# écriture de l'API remet la date à maintenant ; la ligne entière ne se rend
# qu'en base.
#
# COMMENT. Les lignes sont gardées en JSON avant le premier geste, puis
# rendues par la clé primaire : une ligne ajoutée par la campagne est retirée,
# une ligne retirée revient, chaque colonne reprend sa valeur — y compris
# l'auteur, que l'effacement d'un compte temporaire aurait remis à vide. Les
# tables se gardent parent avant enfant (districts_fnct, puis
# gouvernorats_district) : elles sont rendues dans cet ordre.
#
# Ce fichier n'est pas une campagne : il est rangé sous tests/outils/ pour que
# le recomptage de CLAUDE.md § 7 (tests/*.sh) ne le compte pas.
#
# Usage, après avoir défini PSQL et chk() :
#   . "$(dirname "$0")/outils/tables_nationales.sh"
#   garder_tables_nationales parametres_nationaux     # avant le premier geste
#   ...
#   rendre_tables_nationales_en_sortie                # une fois tous les pièges posés
#   rendre_tables_nationales
#   tables_nationales_rendues "en partant"            # avant le bilan
# ---------------------------------------------------------------------------

TABLES_NATIONALES=""
TABLES_NATIONALES_DIR=$(mktemp -d)

# Une empreinte de la table entière, dans l'ordre de ses lignes : deux tables
# égales ligne pour ligne, colonne pour colonne, ont la même.
_empreinte_table_nationale() {  # $1 = table
  $PSQL -c "SELECT count(*) || ':' || coalesce(md5(string_agg(md5(t::text), ',' ORDER BY md5(t::text))), '-') FROM $1 t" 2>/dev/null | tr -d ' '
}

garder_tables_nationales() {  # $@ = tables, parent avant enfant
  local t
  for t in "$@"; do
    if ! $PSQL -c "SELECT coalesce(json_agg(t), '[]') FROM $t t" > "$TABLES_NATIONALES_DIR/$t.json" 2>/dev/null \
       || [ ! -s "$TABLES_NATIONALES_DIR/$t.json" ]; then
      echo "La table nationale $t n'a pas pu être gardée : la campagne ne la touchera pas sans pouvoir la rendre." >&2
      exit 1
    fi
    _empreinte_table_nationale "$t" > "$TABLES_NATIONALES_DIR/$t.empreinte"
    TABLES_NATIONALES="$TABLES_NATIONALES $t"
  done
}

rendre_tables_nationales() {
  local t
  for t in $TABLES_NATIONALES; do
    # Le JSON gardé entre dans le corps du bloc entre $json$ : aucune
    # apostrophe ni barre oblique à échapper.
    $PSQL >/dev/null 2>&1 <<SQL
DO \$rendre\$
DECLARE
  gardees json := \$json\$$(cat "$TABLES_NATIONALES_DIR/$t.json")\$json\$;
  cles text; colonnes text; mises_a_jour text;
BEGIN
  SELECT string_agg(quote_ident(a.attname), ',' ORDER BY a.attnum) INTO cles
    FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
   WHERE i.indrelid = '$t'::regclass AND i.indisprimary;
  SELECT string_agg(quote_ident(attname), ',' ORDER BY attnum),
         string_agg(format('%1\$I = EXCLUDED.%1\$I', attname), ',' ORDER BY attnum)
    INTO colonnes, mises_a_jour
    FROM pg_attribute
   WHERE attrelid = '$t'::regclass AND attnum > 0 AND NOT attisdropped AND attgenerated = '';
  EXECUTE format('DELETE FROM %s WHERE (%s) NOT IN (SELECT %s FROM json_populate_recordset(NULL::%s, \$1))',
                 '$t', cles, cles, '$t') USING gardees;
  EXECUTE format('INSERT INTO %s (%s) SELECT %s FROM json_populate_recordset(NULL::%s, \$1) ON CONFLICT (%s) DO UPDATE SET %s',
                 '$t', colonnes, colonnes, '$t', cles, mises_a_jour) USING gardees;
END
\$rendre\$;
SQL
  done
  return 0
}

# Le nettoyage de la campagne peut réécrire une valeur après le bilan (un
# UPDATE de remise en état) : les tables sont rendues une dernière fois, après
# tout ce que la campagne fait déjà en sortant.
rendre_tables_nationales_en_sortie() {
  local actuel
  actuel=$(trap -p EXIT | sed -E "s/^trap -- '(.*)' EXIT$/\1/")
  trap "${actuel:+$actuel; }rendre_tables_nationales; rm -rf \"\$TABLES_NATIONALES_DIR\"" EXIT
}

tables_nationales_rendues() {  # $1 = moment
  local t ecarts=""
  for t in $TABLES_NATIONALES; do
    [ "$(_empreinte_table_nationale "$t")" = "$(cat "$TABLES_NATIONALES_DIR/$t.empreinte")" ] || ecarts="$ecarts $t"
  done
  chk "$1 : les tables nationales touchées sont rendues ligne pour ligne, dates et auteurs compris ($(echo $TABLES_NATIONALES | tr ' ' ','))" \
      "" "$(echo $ecarts)"
}
