-- 024_nomenclature_ddc.sql
--
-- « Gravats » devient « DDC » : déchets de démolition et construction.
--
-- Ce n'est pas un changement de libellé, c'est un changement de nomenclature.
-- « Gravats » désigne au sens strict les seuls débris pierreux ; la filière
-- tunisienne couvre aussi bétons, plâtres, bois de coffrage et terres
-- d'excavation, et la désigne par DDC. Un système national qui nomme ses
-- flux autrement que sa réglementation ne peut pas échanger ses données avec
-- l'ANGeD : le jour où il faudra consolider les tonnages par filière, il
-- manquera la correspondance.
--
-- Le code stocké change donc, et pas seulement l'étiquette affichée. Une
-- étiquette se traduit ; un code de nomenclature, non.

-- La contrainte CHECK doit tomber AVANT la mise à jour des lignes, sinon
-- l'UPDATE viole la contrainte encore en vigueur.
ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_category_check;

UPDATE tickets SET category = 'ddc' WHERE category = 'gravats';

ALTER TABLE tickets
  ADD CONSTRAINT tickets_category_check
  CHECK (category IN ('point_noir', 'conteneur_plein', 'conteneur_deteriore',
                      'encombrants', 'dechets_verts', 'ddc', 'autre'));

COMMENT ON COLUMN tickets.category IS
  'Nature du signalement. ddc = déchets de démolition et construction (nomenclature tunisienne). Un signalement ddc désigne un dépôt constaté sur la voie publique ; une demande d''enlèvement de ses propres DDC passe par demandes_enlevement.';

-- Les demandes d'enlèvement et l'annuaire des collecteurs (migration 023)
-- emploient déjà « ddc ». Cette reprise ne concerne donc que les bases où la
-- 023 aurait été appliquée dans sa version initiale, qui disait
-- « construction ».
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_name = 'demandes_enlevement') THEN

    ALTER TABLE demandes_enlevement DROP CONSTRAINT IF EXISTS demandes_enlevement_type_dechet_check;
    UPDATE demandes_enlevement SET type_dechet = 'ddc' WHERE type_dechet = 'construction';
    ALTER TABLE demandes_enlevement
      ADD CONSTRAINT demandes_enlevement_type_dechet_check
      CHECK (type_dechet IN ('vert', 'ddc', 'encombrant', 'metal', 'autre'));

    ALTER TABLE collecteurs_agrees DROP CONSTRAINT IF EXISTS collecteurs_types_valides;
    UPDATE collecteurs_agrees
       SET types_dechets = array_replace(types_dechets, 'construction', 'ddc')
     WHERE 'construction' = ANY (types_dechets);
    ALTER TABLE collecteurs_agrees
      ADD CONSTRAINT collecteurs_types_valides
      CHECK (types_dechets <@ ARRAY['vert', 'ddc', 'encombrant', 'metal', 'autre']::text[]);
  END IF;
END $$;
