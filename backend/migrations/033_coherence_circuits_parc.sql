-- ============================================================================
-- 033_coherence_circuits_parc.sql
--
-- Le recoupement du registre des circuits et de l'inventaire du parc.
--
-- POURQUOI CETTE MIGRATION EXISTE. En croisant à la main les deux documents de
-- Dar Chaabane — le relevé d'affectation du matériel et l'inventaire du magasin
-- municipal — quatre anomalies sont apparues en quelques minutes :
--
--   • le secteur S05 (Chate2) est servi par le tracteur 02 212 595, que
--     l'inventaire déclare EN PANNE. Soit le secteur n'est plus desservi, soit
--     un autre engin l'a remplacé sans que le relevé soit corrigé. Dans les
--     deux cas, quelqu'un doit le savoir.
--   • l'immatriculation 02-220610, affectée au secteur S01, ne correspond à
--     aucun engin du parc. Le parc porte un 02 220635 : un chiffre a sauté
--     quelque part, et personne ne peut dire lequel des deux documents a tort.
--   • le camion 02 214 147 dessert DEUX secteurs le même jour — Jadid le matin
--     (07:30-12:29), Barnousa l'après-midi (13:21-16:05). Ce n'est pas une
--     erreur, c'est l'organisation réelle ; encore faut-il que la plateforme
--     sache la représenter au lieu de la signaler comme un conflit.
--   • trois engins « à réformer » figurent toujours à l'inventaire et pèsent
--     68 000 TND dans la valeur du parc.
--
-- Aucun de ces rapprochements n'est difficile. Ils sont simplement fastidieux :
-- huit circuits contre vingt-neuf engins, dans deux classeurs séparés, en deux
-- langues. C'est exactement le travail qu'une machine fait bien et qu'un
-- responsable de propreté n'a pas le temps de faire.
--
-- CE QUE CETTE FONCTION N'EST PAS. Elle ne corrige rien et ne décide rien. Elle
-- pose des questions datées, à qui de droit. Une plateforme qui « nettoierait »
-- ces écarts toute seule ferait disparaître le seul signal disponible sur la
-- qualité des données de la commune.
-- ============================================================================

CREATE OR REPLACE FUNCTION app.incoherences_commune(p_commune text)
  RETURNS TABLE (
    gravite     text,   -- bloquant | avertissement | information
    domaine     text,   -- circuits | parc
    sujet       text,   -- ce dont on parle, en clair
    sujet_id    text,
    constat     text,   -- ce qui a été vu
    quoi_faire  text    -- ce qu'il y a à faire, pas une injonction
  )
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  -- 1. Un circuit confié à un engin qui ne roule pas.
  --    Bloquant : la tournée est censée passer aujourd'hui.
  SELECT 'bloquant', 'circuits', c.nom, c.id::text,
         format('L''engin %s (%s) est déclaré %s à l''inventaire.',
                v.registration, v.marque,
                CASE v.etat WHEN 'en_panne' THEN 'en panne'
                            WHEN 'a_reformer' THEN 'en panne, à réformer'
                            ELSE 'réformé' END),
         'Vérifier quel engin assure réellement ce circuit, ou suspendre le circuit.'
    FROM circuits c
    JOIN vehicules v ON v.id = c.vehicule_id
   WHERE c.commune_id = p_commune AND c.deleted_at IS NULL AND c.actif
     AND v.deleted_at IS NULL AND v.etat <> 'en_service'

  UNION ALL

  -- 2. Une immatriculation citée par un circuit, introuvable au parc.
  --    Un chiffre a sauté dans l'un des deux documents ; on ne sait pas lequel.
  SELECT 'avertissement', 'circuits', c.nom, c.id::text,
         format('L''immatriculation « %s » ne correspond à aucun engin du parc.', c.vehicule_immat),
         'Corriger la fiche du circuit, ou ajouter l''engin manquant au parc.'
    FROM circuits c
   WHERE c.commune_id = p_commune AND c.deleted_at IS NULL
     AND c.vehicule_immat IS NOT NULL AND btrim(c.vehicule_immat) <> ''
     AND NOT EXISTS (
       SELECT 1 FROM vehicules v
        WHERE v.commune_id = c.commune_id AND v.deleted_at IS NULL
          -- Comparaison sur les seuls chiffres : « 02-214147 », « 02 214 147 »
          -- et « 02214147 » désignent le même engin, et trois services les
          -- écrivent de trois façons.
          AND regexp_replace(v.registration, '\D', '', 'g')
              = regexp_replace(c.vehicule_immat, '\D', '', 'g'))

  UNION ALL

  -- 3. Un circuit actif sans aucun arrêt enregistré.
  --    Ni carte, ni ordre de passage, ni horaire pour le citoyen.
  SELECT 'avertissement', 'circuits', c.nom, c.id::text,
         'Aucun point de collecte n''est enregistré sur ce circuit.',
         'Importer un relevé, ou saisir les arrêts un par un.'
    FROM circuits c
   WHERE c.commune_id = p_commune AND c.deleted_at IS NULL AND c.actif
     AND NOT EXISTS (SELECT 1 FROM points_collecte p
                      WHERE p.circuit_id = c.id AND p.deleted_at IS NULL)

  UNION ALL

  -- 4. Un engin immobilisé sans motif écrit.
  --    Sans motif, personne ne sait à qui s'adresser — donc personne n'agit.
  SELECT 'avertissement', 'parc', v.registration, v.id,
         format('%s immobilisé sans motif écrit.', v.marque),
         'Écrire ce qui bloque : pièce attendue, marché en cours, atelier.'
    FROM vehicules v
   WHERE v.commune_id = p_commune AND v.deleted_at IS NULL
     AND v.etat IN ('en_panne', 'a_reformer')
     AND (v.motif_immobilisation IS NULL OR btrim(v.motif_immobilisation) = '')

  UNION ALL

  -- 5. Un engin immobilisé dont on ignore depuis quand.
  --    Trois semaines ou deux ans n'appellent pas la même décision.
  SELECT 'information', 'parc', v.registration, v.id,
         'Immobilisé depuis une date inconnue.',
         'Renseigner la date : trois semaines et deux ans n''appellent pas la même décision.'
    FROM vehicules v
   WHERE v.commune_id = p_commune AND v.deleted_at IS NULL
     AND v.etat IN ('en_panne', 'a_reformer') AND v.etat_depuis IS NULL

  UNION ALL

  -- 6. Un engin en état de marche que personne n'a affecté.
  --    Les remorques sont écartées : elles n'ont pas de circuit propre.
  SELECT 'information', 'parc', v.registration, v.id,
         format('%s %s en service, affecté à aucun circuit.', v.marque, v.type),
         'Affecter l''engin à un circuit, ou vérifier qu''il sert ailleurs.'
    FROM vehicules v
   WHERE v.commune_id = p_commune AND v.deleted_at IS NULL
     AND v.etat = 'en_service'
     AND v.categorie IS DISTINCT FROM 'remorque'
     AND NOT EXISTS (SELECT 1 FROM circuits c
                      WHERE c.deleted_at IS NULL AND c.actif
                        AND (c.vehicule_id = v.id
                             OR regexp_replace(COALESCE(c.vehicule_immat, ''), '\D', '', 'g')
                                = regexp_replace(v.registration, '\D', '', 'g')))

  UNION ALL

  -- 7. Un circuit actif sans exécutant NI engin.
  --    On ne saura pas qui l'a fait ni avec quoi.
  SELECT 'avertissement', 'circuits', c.nom, c.id::text,
         'Ni exécutant ni engin renseignés.',
         'Désigner la régie ou un prestataire, et l''engin affecté.'
    FROM circuits c
   WHERE c.commune_id = p_commune AND c.deleted_at IS NULL AND c.actif
     AND c.prestataire_id IS NULL AND c.vehicule_id IS NULL
     AND (c.vehicule_code IS NULL OR btrim(c.vehicule_code) = '')

  ORDER BY 1, 2, 3
$$;

COMMENT ON FUNCTION app.incoherences_commune(text) IS
  'Recoupe le registre des circuits et l''inventaire du parc. Ne corrige rien : pose des questions à qui de droit. Une plateforme qui nettoierait ces écarts seule ferait disparaître le seul signal disponible sur la qualité des données.';

GRANT EXECUTE ON FUNCTION app.incoherences_commune(text) TO siipi_app;
