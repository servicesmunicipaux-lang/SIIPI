# shellcheck shell=bash
# ---------------------------------------------------------------------------
# Une fausse campagne, pour la campagne `refus-production` (chantier P, P1).
#
# Elle fait ce que ferait n'importe quelle campagne : elle écrit dans la base
# que le lanceur lui a donnée. Si le lanceur l'a laissée partir, la table
# `sonde_lanceur` existe ensuite dans cette base ; s'il l'a refusée, rien n'y a
# bougé. Elle n'écrit que dans une base d'essai (siipi_essai_…), effacée par
# la campagne qui l'a lancée : lancée à la main sur une autre base, elle refuse.
#
# Ce fichier n'est pas une campagne : il est rangé sous tests/outils/ pour que
# le recomptage de CLAUDE.md § 7 (tests/*.sh) ne le compte pas.
#
#   PGDATABASE=siipi_essai_x sh tests/executer.sh outils/sonde_lanceur
# ---------------------------------------------------------------------------
case "${PGDATABASE:-}" in
  siipi_essai_*) ;;
  *) echo "La sonde n'écrit que dans une base d'essai (siipi_essai_…), pas dans « ${PGDATABASE:-?} »." >&2; exit 1 ;;
esac
psql -q -tAX -c "CREATE TABLE IF NOT EXISTS sonde_lanceur (lancee_le timestamptz DEFAULT now()); INSERT INTO sonde_lanceur DEFAULT VALUES;" || exit 1
echo "SONDE : partie sur ${PGDATABASE}"
