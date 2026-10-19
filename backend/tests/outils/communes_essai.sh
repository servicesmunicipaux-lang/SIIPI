# shellcheck shell=bash
# ---------------------------------------------------------------------------
# Les communes de test d'une campagne : les poser, puis les effacer avec tout
# ce qu'elles portent (JC-011, docs/recette/JOURNAL_DES_CORRECTIONS.md).
#
# POURQUOI. Une campagne qui travaille dans ses communes de test doit, en
# partant, effacer tout ce qu'elle y a posé — et rien d'autre. Écrire à la
# main l'ordre des suppressions pour chaque campagne, c'est oublier une table :
# `notifications` effaçait ses notifications par leur titre, et laissait
# celles de décision. Ici, chaque table qui porte commune_id est vidée de ses
# lignes des communes de test, en plusieurs passes (une clé étrangère qui
# refuse au premier passage cède au suivant, quand la ligne qui la tenait est
# partie), puis les communes elles-mêmes. Rien n'est effacé hors de ces
# communes : la clause porte toujours sur leurs identifiants.
#
# Les identifiants des communes de test commencent par « test » : c'est ce que
# tests/outils/base_reelle.sh laisse de côté.
#
# Ce fichier n'est pas une campagne : il est rangé sous tests/outils/ pour que
# le recomptage de CLAUDE.md § 7 (tests/*.sh) ne le compte pas.
#
# Usage, après avoir défini PSQL :
#   . "$(dirname "$0")/outils/communes_essai.sh"
#   commune_essai test_x "TEST commune de la campagne"
#   effacer_communes_essai "'test_x','test_y'"     # dans le nettoyage
# ---------------------------------------------------------------------------

commune_essai() {  # $1 = identifiant (« test… »), $2 = nom
  case "$1" in test*) ;; *) echo "Une commune de test commence par « test » : « $1 »." >&2; exit 1 ;; esac
  $PSQL -c "INSERT INTO communes (id, name, name_ar, gouvernorat, population)
            VALUES ('$1', '${2//\'/\'\'}', 'TEST', 'TEST', 5000);" >/dev/null 2>&1 \
    || { echo "Impossible de poser la commune de test « $1 »." >&2; exit 1; }
}

effacer_communes_essai() {  # $1 = liste SQL d'identifiants, chacun « test… »
  case "$1" in *"'test"*) ;; *) echo "effacer_communes_essai : liste sans commune de test ($1)." >&2; return 1 ;; esac
  local tables passe t
  tables=$($PSQL -c "SELECT c.table_schema || '.' || c.table_name
                       FROM information_schema.columns c
                       JOIN information_schema.tables tb USING (table_schema, table_name)
                      WHERE c.table_schema IN ('public', 'wapla') AND c.column_name = 'commune_id'
                        AND tb.table_type = 'BASE TABLE'" 2>/dev/null)
  for passe in 1 2 3 4 5 6; do
    for t in $tables; do
      $PSQL -c "DELETE FROM $t WHERE commune_id::text IN ($1);" >/dev/null 2>&1
    done
  done
  $PSQL -c "DELETE FROM communes WHERE id IN ($1);" >/dev/null 2>&1
  return 0
}
