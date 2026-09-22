-- ===========================================================================
-- Migration 038 — Correction du rôle de l'engin d'appui
--
-- La migration 031 a décrit les deux engins d'un circuit comme travaillant en
-- parallèle : l'engin de collecte ramasserait, l'engin d'appui évacuerait vers
-- le centre de transfert. C'est faux, et la correction vient du terrain :
--
--   « L'engin de collecte ramasse ; et le même engin évacue vers le centre de
--     transfert. L'engin d'appui qui remplace en cas de panne du premier. »
--
-- La conséquence n'est pas cosmétique. Décrits comme complémentaires, les deux
-- engins auraient été comptés comme deux moyens simultanément engagés sur la
-- tournée : le coût du circuit doublé, la charge du parc surévaluée, et un
-- circuit sans engin d'appui vu comme incomplet alors qu'il est simplement
-- sans solution de repli. Décrit comme remplaçant, l'engin d'appui devient ce
-- qu'il est réellement — une réserve mobilisée le jour où le premier tombe en
-- panne, donc une information de continuité de service, pas de production.
--
-- Rien n'est migré : aucune donnée n'était fausse, seule sa lecture l'était.
-- Cette migration ne touche donc que les commentaires de colonnes — la seule
-- documentation que lira l'administrateur qui inspectera la base dans dix ans.
-- ===========================================================================

COMMENT ON COLUMN circuits.vehicule_code IS
  'Engin de collecte (BB1, TA1, CB01…). Il ramasse ET évacue lui-même vers le centre de transfert : c''est le moyen qui assure la tournée de bout en bout.';

COMMENT ON COLUMN circuits.engin_appui_code IS
  'Engin de remplacement (BT1, Ta01, PU01…), mobilisé en cas de panne de l''engin de collecte. Il ne travaille pas en parallèle : le renseigner, c''est déclarer par quoi le circuit peut être assuré sans interruption, non ajouter un second moyen à la tournée.';

COMMENT ON COLUMN circuits.engin_appui_immat IS
  'Immatriculation de l''engin de remplacement. Vide ne signifie pas « pas d''appui » mais « appui non identifié » : à traiter comme une lacune de saisie, jamais comme un circuit sans solution de repli.';


-- ---------------------------------------------------------------------------
-- Le contrôle de cohérence « circuit confié à un engin en panne » tirait la
-- même conclusion erronée : il demandait de vérifier quel engin assurait la
-- tournée, alors que la commune a précisément déclaré ce remplaçant. Il le
-- nomme désormais — et quand il n'y en a aucun, il le dit, ce qui est
-- l'information réellement utile un matin de panne.
--
-- Fonction réémise à l'identique pour le reste (migration 035).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.incoherences_registres(p_commune text)
  RETURNS TABLE (
    gravite     text,
    domaine     text,   -- circuits | parc | personnel
    sujet       text,
    sujet_id    text,
    constat     text,
    quoi_faire  text
  )
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  -- 1. Un circuit confié à un engin qui ne roule pas.
  --    L'engin d'appui existe exactement pour ce cas : il ne double pas la
  --    tournée, il remplace l'engin de collecte en panne. La question posée
  --    n'est donc pas « que faire ? » mais « le remplaçant déclaré a-t-il
  --    bien pris le relais ? » — et s'il n'y en a pas, c'est cela le vrai
  --    constat : le circuit n'a pas de solution de repli.
  SELECT 'bloquant', 'circuits', c.nom, c.id::text,
         format('L''engin %s (%s) est déclaré %s à l''inventaire.',
                v.registration, v.marque,
                CASE v.etat WHEN 'en_panne' THEN 'en panne'
                            WHEN 'a_reformer' THEN 'en panne, à réformer'
                            ELSE 'réformé' END),
         CASE
           WHEN c.engin_appui_code IS NOT NULL AND btrim(c.engin_appui_code) <> ''
             THEN format('L''engin d''appui déclaré pour ce circuit est %s : confirmer qu''il a bien pris le relais, ou suspendre le circuit.', c.engin_appui_code)
           ELSE 'Aucun engin d''appui n''est déclaré pour ce circuit. Indiquer quel engin le remplace, ou suspendre le circuit.'
         END
    FROM circuits c
    JOIN vehicules v ON v.id = c.vehicule_id
   WHERE c.commune_id = p_commune AND c.deleted_at IS NULL AND c.actif
     AND v.deleted_at IS NULL AND v.etat <> 'en_service'

  UNION ALL

  -- 2. Une immatriculation citée par un circuit, introuvable au parc.
  SELECT 'avertissement', 'circuits', c.nom, c.id::text,
         format('L''immatriculation %s ne correspond à aucun engin du parc.', c.vehicule_immat),
         'Corriger l''immatriculation au registre des circuits, ou inscrire l''engin à l''inventaire.'
    FROM circuits c
   WHERE c.commune_id = p_commune AND c.deleted_at IS NULL AND c.actif
     AND c.vehicule_immat IS NOT NULL AND btrim(c.vehicule_immat) <> ''
     AND c.vehicule_id IS NULL
     AND NOT EXISTS (
       SELECT 1 FROM vehicules v
        WHERE v.commune_id = p_commune AND v.deleted_at IS NULL
          AND regexp_replace(v.registration, '\D', '', 'g')
              = regexp_replace(c.vehicule_immat, '\D', '', 'g'))

  UNION ALL

  -- 3. Un circuit actif sans aucun arrêt enregistré.
  SELECT 'information', 'circuits', c.nom, c.id::text,
         'Aucun point de collecte enregistré.',
         'Importer la trace et les points, ou saisir au moins les arrêts principaux.'
    FROM circuits c
   WHERE c.commune_id = p_commune AND c.deleted_at IS NULL AND c.actif
     AND NOT EXISTS (SELECT 1 FROM points_collecte pc WHERE pc.circuit_id = c.id)

  UNION ALL

  -- 4. Un engin immobilisé sans motif écrit.
  SELECT 'avertissement', 'parc', v.registration, v.id::text,
         'Engin immobilisé sans motif renseigné.',
         'Indiquer la panne ou la raison de l''immobilisation.'
    FROM vehicules v
   WHERE v.commune_id = p_commune AND v.deleted_at IS NULL
     AND v.etat IN ('en_panne', 'a_reformer')
     AND (v.motif_immobilisation IS NULL OR btrim(v.motif_immobilisation) = '')

  UNION ALL

  -- 5. Un engin immobilisé dont on ignore depuis quand.
  SELECT 'information', 'parc', v.registration, v.id::text,
         'Engin immobilisé sans date de début.',
         'Dater l''immobilisation : sans cela, la durée d''arrêt ne peut pas être suivie.'
    FROM vehicules v
   WHERE v.commune_id = p_commune AND v.deleted_at IS NULL
     AND v.etat IN ('en_panne', 'a_reformer') AND v.etat_depuis IS NULL

  UNION ALL

  -- 6. Un engin en état de marche que personne n'a affecté.
  SELECT 'information', 'parc', v.registration, v.id::text,
         'Engin en service affecté à aucun circuit.',
         'Affecter l''engin, ou noter son emploi réel (réserve, appui, atelier).'
    FROM vehicules v
   WHERE v.commune_id = p_commune AND v.deleted_at IS NULL
     AND v.etat = 'en_service' AND v.type <> 'remorque'
     AND NOT EXISTS (SELECT 1 FROM circuits c
                      WHERE c.deleted_at IS NULL AND c.actif
                        AND (c.vehicule_id = v.id
                             OR regexp_replace(COALESCE(c.vehicule_immat, ''), '\D', '', 'g')
                                = regexp_replace(v.registration, '\D', '', 'g')))

  UNION ALL

  -- 7. Un circuit actif sans exécutant NI engin.
  SELECT 'avertissement', 'circuits', c.nom, c.id::text,
         'Ni exécutant ni engin renseignés.',
         'Désigner la régie ou un prestataire, et l''engin affecté.'
    FROM circuits c
   WHERE c.commune_id = p_commune AND c.deleted_at IS NULL AND c.actif
     AND c.prestataire_id IS NULL AND c.vehicule_id IS NULL
     AND (c.vehicule_code IS NULL OR btrim(c.vehicule_code) = '')

  UNION ALL

  -- 8. Un circuit en régie sans personne affectée.
  --    Bloquant : la tournée est censée partir, et le registre ne dit pas
  --    qui la fait. C'est l'écart que le dossier de Dar Chaabane laisse
  --    ouvert — deux feuilles du registre annoncent 48 et 39 agents, la
  --    paie en compte 60. Aucun des trois chiffres ne dit QUI fait QUOI.
  SELECT 'bloquant', 'personnel', c.nom, c.id::text,
         'Circuit en régie sans aucun agent affecté.',
         'Affecter l''équipe, ou indiquer le prestataire qui exécute le circuit.'
    FROM circuits c
   WHERE c.commune_id = p_commune AND c.deleted_at IS NULL AND c.actif
     AND c.prestataire_id IS NULL
     AND NOT EXISTS (SELECT 1 FROM circuit_equipe ce
                      WHERE ce.circuit_id = c.id AND ce.date_fin IS NULL)

  UNION ALL

  -- 9. Un circuit motorisé sans chauffeur désigné.
  SELECT 'avertissement', 'personnel', c.nom, c.id::text,
         'Équipe affectée, mais aucun chauffeur désigné.',
         'Désigner le chauffeur : c''est lui qui répond de l''engin.'
    FROM circuits c
   WHERE c.commune_id = p_commune AND c.deleted_at IS NULL AND c.actif
     AND c.prestataire_id IS NULL
     AND (c.vehicule_id IS NOT NULL
          OR (c.vehicule_immat IS NOT NULL AND btrim(c.vehicule_immat) <> ''))
     AND EXISTS (SELECT 1 FROM circuit_equipe ce
                  WHERE ce.circuit_id = c.id AND ce.date_fin IS NULL)
     AND NOT EXISTS (SELECT 1 FROM circuit_equipe ce
                      WHERE ce.circuit_id = c.id AND ce.date_fin IS NULL
                        AND ce.role = 'chauffeur')

  UNION ALL

  -- 10. L'équipe affectée ne correspond pas à la taille annoncée à la fiche.
  --     Information seulement : la fiche peut être en retard sur le terrain,
  --     ou l'inverse. On ne préjuge pas de laquelle des deux a raison.
  SELECT 'information', 'personnel', c.nom, c.id::text,
         format('Fiche : équipe de %s. Affectés : %s.', c.taille_equipe, e.n),
         'Mettre la fiche à jour, ou compléter l''équipe.'
    FROM circuits c
    JOIN LATERAL (SELECT count(*) AS n FROM circuit_equipe ce
                   WHERE ce.circuit_id = c.id AND ce.date_fin IS NULL) e ON true
   WHERE c.commune_id = p_commune AND c.deleted_at IS NULL AND c.actif
     AND c.taille_equipe IS NOT NULL AND c.taille_equipe > 0
     AND e.n > 0 AND e.n <> c.taille_equipe

  UNION ALL

  -- 11. Deux circuits dont les HORAIRES se chevauchent pour le même agent.
  --     Un agent peut servir deux secteurs le même jour — matin puis
  --     après-midi, comme le camion 02 214 147. Il ne peut pas être aux deux
  --     endroits à la même heure.
  SELECT 'bloquant', 'personnel', p.nom_complet, p.id::text,
         format('Affecté à « %s » (%s-%s) et à « %s » (%s-%s) : les horaires se chevauchent.',
                c1.nom, c1.heure_depart, c1.heure_fin,
                c2.nom, c2.heure_depart, c2.heure_fin),
         'Corriger l''une des deux affectations, ou ajuster les horaires des circuits.'
    FROM circuit_equipe a
    JOIN circuit_equipe b ON b.personnel_id = a.personnel_id AND b.circuit_id > a.circuit_id
                         AND b.date_fin IS NULL
    JOIN circuits  c1 ON c1.id = a.circuit_id
    JOIN circuits  c2 ON c2.id = b.circuit_id
    JOIN personnel p  ON p.id  = a.personnel_id
   WHERE a.date_fin IS NULL
     AND p.commune_id = p_commune AND p.deleted_at IS NULL AND p.actif
     AND c1.deleted_at IS NULL AND c1.actif
     AND c2.deleted_at IS NULL AND c2.actif
     AND c1.heure_depart IS NOT NULL AND c1.heure_fin IS NOT NULL
     AND c2.heure_depart IS NOT NULL AND c2.heure_fin IS NOT NULL
     AND c1.jours_passage && c2.jours_passage
     AND (c1.heure_depart, c1.heure_fin) OVERLAPS (c2.heure_depart, c2.heure_fin)

  UNION ALL

  -- 12. Un chauffeur affecté qui n'a pas de permis enregistré.
  SELECT 'information', 'personnel', p.nom_complet, p.id::text,
         'Désigné chauffeur, aucune catégorie de permis enregistrée.',
         'Saisir les catégories détenues : c''est ce qui dit qui peut conduire quel engin.'
    FROM personnel p
   WHERE p.commune_id = p_commune AND p.deleted_at IS NULL AND p.actif
     AND (p.permis IS NULL OR cardinality(p.permis) = 0)
     AND EXISTS (SELECT 1 FROM circuit_equipe ce
                  WHERE ce.personnel_id = p.id AND ce.date_fin IS NULL
                    AND ce.role = 'chauffeur')

  ORDER BY 1, 2, 3
$$;

COMMENT ON FUNCTION app.incoherences_registres(text) IS
  'Les douze contrôles qui recoupent les registres : circuits, parc, personnel. Appelée par app.incoherences_commune, jamais directement par l''API.';

GRANT EXECUTE ON FUNCTION app.incoherences_registres(text) TO siipi_app;
