# shellcheck shell=bash
# ---------------------------------------------------------------------------
# Le découpage des communes réelles, relevé avant une campagne et comparé
# pendant et après elle (JC-010, docs/recette/JOURNAL_DES_CORRECTIONS.md).
#
# POURQUOI. Toute correction directe de la FNCT — un secteur posé ou retiré,
# une limite redessinée — passe par app.avant_correction_fnct et
# app.apres_correction_fnct : elle fige l'état présent en « version 1 » si la
# commune n'en a aucune, puis inscrit la correction en version suivante. Une
# campagne qui faisait ce geste dans une commune réelle (Houmt Souk, Midoun) y
# laissait des versions validées qui n'avaient jamais eu lieu, et un secteur
# « supprimé » de plus dans la liste de ce que la commune a retiré. Les
# campagnes travaillent désormais dans leurs communes de test ; ce fichier
# prouve qu'elles n'ont rien laissé ailleurs.
#
# CE QUI EST RELEVÉ, hors des communes de test : les secteurs (y compris
# retirés), les versions du découpage, et la limite de chaque commune (tracé,
# provenance, superficie, date). L'empreinte change si une ligne est ajoutée,
# modifiée ou retirée — même effacée ensuite, quand le contrôle tombe pendant
# que la campagne a ses lignes en base.
#
# Ce fichier n'est pas une campagne : il est rangé sous tests/outils/ pour que
# le recomptage de CLAUDE.md § 7 (tests/*.sh) ne le compte pas.
#
# Usage, après avoir défini sql() et chk() :
#   COMMUNES_ESSAI="'test_a','test_b'"      # les communes de la campagne
#   . "$(dirname "$0")/outils/communes_reelles.sh"
#   releve_communes_reelles                 # avant le premier geste
#   communes_reelles_intactes "pendant la campagne"
#   communes_reelles_intactes "en partant"
# ---------------------------------------------------------------------------

declare -A DECOUPAGE_REEL_AVANT

empreinte_decoupage_reel() {  # $1 = secteurs | versions | limites
  case "$1" in
    secteurs) sql "SELECT count(*)||':'||coalesce(md5(string_agg(id::text||'|'||coalesce(name,'')||'|'||coalesce(code,'')||'|'
                                 ||coalesce(md5(ST_AsBinary(geom)),'')||'|'||coalesce(deleted_at::text,''), ',' ORDER BY id)), '-')
                     FROM zones_collecte WHERE commune_id NOT IN ($COMMUNES_ESSAI)" ;;
    versions) sql "SELECT count(*)||':'||coalesce(md5(string_agg(id::text||'|'||coalesce(numero::text,'')||'|'||statut||'|'||origine,
                                 ',' ORDER BY id)), '-')
                     FROM versions_decoupage WHERE commune_id NOT IN ($COMMUNES_ESSAI)" ;;
    limites)  sql "SELECT count(*)||':'||coalesce(md5(string_agg(id||'|'||coalesce(boundary_source,'')||'|'
                                 ||coalesce(md5(ST_AsBinary(boundary_geom)),'')||'|'||coalesce(area_km2::text,'')||'|'
                                 ||coalesce(boundary_maj_le::text,''), ',' ORDER BY id)), '-')
                     FROM communes WHERE id NOT IN ($COMMUNES_ESSAI)" ;;
  esac
}

releve_communes_reelles() {
  local t
  for t in secteurs versions limites; do DECOUPAGE_REEL_AVANT[$t]=$(empreinte_decoupage_reel "$t"); done
}

communes_reelles_intactes() {  # $1 = moment
  chk "$1 : aucun secteur ajouté, modifié ou retiré dans une commune réelle" \
      "${DECOUPAGE_REEL_AVANT[secteurs]}" "$(empreinte_decoupage_reel secteurs)"
  chk "$1 : aucune version de découpage ajoutée, modifiée ou retirée dans une commune réelle" \
      "${DECOUPAGE_REEL_AVANT[versions]}" "$(empreinte_decoupage_reel versions)"
  chk "$1 : aucune limite communale réelle redessinée (tracé, provenance, superficie, date)" \
      "${DECOUPAGE_REEL_AVANT[limites]}" "$(empreinte_decoupage_reel limites)"
}
