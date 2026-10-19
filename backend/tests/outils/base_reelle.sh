# shellcheck shell=bash
# ---------------------------------------------------------------------------
# Les données des communes réelles, relevées avant une campagne et comparées
# pendant et après elle (JC-012, docs/recette/JOURNAL_DES_CORRECTIONS.md).
#
# POURQUOI. Des campagnes laissaient à La Marsa des réclamations d'essai, des
# notifications, un score, des paramètres, un engin déplacé, des notes et un
# taux sur la fiche de la commune — cumulés à chaque passage, et lus ensuite
# comme vrais par les indicateurs. Une campagne travaille dans ses communes de
# test ; ce fichier prouve qu'elle n'a rien laissé ailleurs.
#
# CE QUI EST RELEVÉ : chaque table qui porte commune_id, sur les seules lignes
# d'une commune réelle (ni de test — identifiant « test… » —, ni de
# démonstration, ni sans commune), et la fiche de chaque commune réelle. Une
# ligne ajoutée, modifiée ou retirée change l'empreinte, dates comprises. Sont
# laissés de côté les journaux en ajout seul (audit_log, access_log), qui
# consignent des gestes qui ont eu lieu, et les comptes (users), dont une
# connexion change la date de dernière connexion.
#
# Ce fichier n'est pas une campagne : il est rangé sous tests/outils/ pour que
# le recomptage de CLAUDE.md § 7 (tests/*.sh) ne le compte pas.
#
# Usage, après avoir défini PSQL et chk() :
#   . "$(dirname "$0")/outils/base_reelle.sh"
#   releve_base_reelle                       # avant le premier geste
#   base_reelle_intacte "pendant la campagne"
#   base_reelle_intacte "en partant"
# ---------------------------------------------------------------------------

BASE_REELLE_SQL=$(mktemp)
cat > "$BASE_REELLE_SQL" <<'SQL'
\set QUIET on
\pset tuples_only on
\pset format unaligned
BEGIN READ ONLY;
SELECT format(
  'SELECT %L || '':'' || count(*) || '':'' || coalesce(md5(string_agg(md5(t::text), '','' ORDER BY md5(t::text))), ''-'')
     FROM %I.%I t
    WHERE t.commune_id IS NOT NULL AND t.commune_id::text NOT LIKE ''test%%''
      AND t.commune_id::text NOT IN (SELECT id FROM public.communes WHERE est_demo)',
  c.table_schema || '.' || c.table_name, c.table_schema, c.table_name)
  FROM information_schema.columns c
  JOIN information_schema.tables tb USING (table_schema, table_name)
 WHERE c.table_schema IN ('public', 'wapla') AND c.column_name = 'commune_id' AND tb.table_type = 'BASE TABLE'
   AND c.table_name NOT IN ('audit_log', 'access_log', 'users')
 ORDER BY 1
\gexec
SELECT 'public.communes:' || count(*) || ':' || md5(string_agg(md5(c::text), ',' ORDER BY c.id))
  FROM public.communes c WHERE c.id NOT LIKE 'test%' AND NOT c.est_demo;
ROLLBACK;
SQL

declare -A BASE_REELLE_AVANT

empreinte_base_reelle() {  # une ligne « table:nombre:md5 » par table
  $PSQL -q -f "$BASE_REELLE_SQL" 2>/dev/null | grep ':' | sort
}

releve_base_reelle() {
  local l
  BASE_REELLE_AVANT=()
  while IFS= read -r l; do BASE_REELLE_AVANT[${l%%:*}]=${l#*:}; done < <(empreinte_base_reelle)
}

base_reelle_intacte() {  # $1 = moment ; le contrôle nomme les tables qui ont bougé
  local l t changees=""
  declare -A vues=()
  while IFS= read -r l; do
    t=${l%%:*}; vues[$t]=1
    [ "${BASE_REELLE_AVANT[$t]:-absente}" = "${l#*:}" ] || changees="$changees ${t#public.}"
  done < <(empreinte_base_reelle)
  for t in "${!BASE_REELLE_AVANT[@]}"; do [ -n "${vues[$t]:-}" ] || changees="$changees ${t#public.}"; done
  changees="${changees# }"
  chk "$1 : aucune ligne ajoutée, modifiée ou retirée dans une commune réelle (${#BASE_REELLE_AVANT[@]} tables relevées)" \
      "aucune" "${changees:-aucune}"
}
