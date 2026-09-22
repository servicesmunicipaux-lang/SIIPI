-- ============================================================================
-- 032_module3_parc_materiel.sql
--
-- Module 3 — Le parc matériel, d'après « قائمة وسائل النظافة » : la liste de
-- la situation des moyens de propreté de Dar Chaabane El Fehri, arrêtée au
-- 19 avril 2024 par le chef du magasin municipal.
--
-- CE QUE LE FICHIER DIT, ET QUE LA BASE NE SAVAIT PAS DIRE.
--
-- 29 engins recensés. Seize en service. Treize immobilisés — dix en panne,
-- trois en panne et destinés à la réforme. Quarante-cinq pour cent du parc à
-- l'arrêt : c'est le premier chiffre qu'un directeur de propreté cherche, et
-- la table « vehicules » était incapable de le produire.
--
-- Elle connaissait un « status » : en tournée, au dépôt, à la décharge, en
-- maintenance. C'est une POSITION, pas un ÉTAT. Un engin en panne depuis
-- huit mois est « au dépôt », exactement comme celui qui rentre d'une tournée
-- et repart demain. Les deux se lisaient de la même façon, et la moitié
-- immobilisée du parc disparaissait dans le décompte.
--
-- On sépare donc les deux notions, et on ne les confondra plus :
--   status  → où il est aujourd'hui (existant, inchangé)
--   etat    → s'il peut servir (nouveau)
--
-- TROIS DISTINCTIONS QUE LE REGISTRE FAIT ET QU'IL FAUT GARDER.
--
--   1. « معطب » (en panne) et « معطب للتفويت » (en panne, à réformer) ne sont
--      pas la même chose. Le premier reviendra, le second non. Un parc de 29
--      dont 13 sont à l'arrêt se lit tout autrement si trois d'entre eux sont
--      déjà sortis de l'inventaire dans l'esprit du magasinier.
--
--   2. LE MOTIF est ce qui rend le chiffre actionnable : « en attente de
--      pièces via le marché », « en maintenance interne au magasin », « déposé
--      chez le constructeur ». Un parc immobilisé faute de marché conclu n'est
--      pas un parc mal entretenu — ce sont deux problèmes différents, qui se
--      règlent auprès de deux interlocuteurs différents.
--
--   3. LA REMORQUE EST UN ENGIN, mais ne roule pas seule. Le registre des
--      circuits dit « جرار + مجرورة 4 م³ » : l'unité de travail est l'attelage.
--      Six remorques figurent au parc sans qu'on sache laquelle va avec quel
--      tracteur ; la colonne d'attelage le permettra.
--
-- CE QUE L'ON NE FABRIQUE PAS.
--
-- Le fichier est un instantané : il dit qu'un engin est en panne, jamais
-- depuis quand. « etat_depuis » reste donc vide à l'import, et la date de
-- l'inventaire est conservée à part. Inventer une ancienneté de panne serait
-- fabriquer le chiffre le plus sensible du module — celui qu'on opposera un
-- jour à un garage ou à un fournisseur.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Le registre du magasin municipal
-- ---------------------------------------------------------------------------

ALTER TABLE vehicules
  ADD COLUMN IF NOT EXISTS categorie                 TEXT,
  ADD COLUMN IF NOT EXISTS marque                    TEXT,
  ADD COLUMN IF NOT EXISTS date_premiere_circulation DATE,
  ADD COLUMN IF NOT EXISTS valeur_achat_tnd          NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS charge_utile_t            NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS domaine_emploi            TEXT,
  ADD COLUMN IF NOT EXISTS etat                      TEXT NOT NULL DEFAULT 'en_service',
  ADD COLUMN IF NOT EXISTS etat_depuis               DATE,
  ADD COLUMN IF NOT EXISTS motif_immobilisation      TEXT,
  ADD COLUMN IF NOT EXISTS inventaire_le             DATE,
  ADD COLUMN IF NOT EXISTS attele_a                  TEXT REFERENCES vehicules(id) ON DELETE SET NULL;

ALTER TABLE vehicules DROP CONSTRAINT IF EXISTS vehicules_etat_valide;
ALTER TABLE vehicules ADD  CONSTRAINT vehicules_etat_valide
  CHECK (etat IN ('en_service', 'en_panne', 'a_reformer', 'reforme'));

ALTER TABLE vehicules DROP CONSTRAINT IF EXISTS vehicules_categorie_valide;
ALTER TABLE vehicules ADD  CONSTRAINT vehicules_categorie_valide
  CHECK (categorie IS NULL OR categorie IN ('poids_lourd', 'engin_lourd', 'tracteur', 'remorque'));

COMMENT ON COLUMN vehicules.etat IS
  'S''il peut servir : en_service | en_panne | a_reformer | reforme. À ne pas confondre avec « status », qui dit où il se trouve. Un engin en panne depuis huit mois est « au dépôt » comme celui qui repart demain.';
COMMENT ON COLUMN vehicules.etat_depuis IS
  'Depuis quand il est dans cet état. Vide tant que la commune ne l''a pas renseigné : l''inventaire ne le dit pas, et l''inventer fabriquerait le chiffre le plus sensible du module.';
COMMENT ON COLUMN vehicules.motif_immobilisation IS
  'Ce qui bloque, tel que le magasin l''écrit. C''est ce qui rend le chiffre actionnable : un parc immobilisé faute de marché conclu n''est pas un parc mal entretenu.';
COMMENT ON COLUMN vehicules.inventaire_le IS
  'Date de l''inventaire dont provient cette ligne. Un état du parc sans date ne vaut rien six mois plus tard.';
COMMENT ON COLUMN vehicules.attele_a IS
  'Tracteur auquel cette remorque est attelée. L''unité de travail est l''attelage — le registre des circuits dit « جرار + مجرورة 4 م³ », pas « tracteur ».';

-- ---------------------------------------------------------------------------
-- 2. Les types réellement présents au parc
--
-- La contrainte n'admettait que quatre types, choisis avant d'avoir vu un
-- inventaire. Le parc de Dar Chaabane en compte dix, dont des engins de
-- terrassement qui n'ont rien d'un camion de collecte mais qui relèvent du
-- même magasin et du même budget.
-- ---------------------------------------------------------------------------

ALTER TABLE vehicules DROP CONSTRAINT IF EXISTS vehicules_type_check;
ALTER TABLE vehicules DROP CONSTRAINT IF EXISTS vehicules_type_valide;
ALTER TABLE vehicules ADD  CONSTRAINT vehicules_type_valide CHECK (type IN (
  'benne_tasseuse',        -- شاحنة ضاغطة
  'camion',                -- شاحنة
  'camion_ampliroll',
  'camion_remorque',       -- شاحنة بمقطورة
  'balayeuse',             -- شاحنة الكنس الآلي
  'tracteur',              -- جرار
  'tracteur_remorque',
  'remorque',              -- مجرورة
  'chargeuse_pelleteuse',  -- جرافة مجهزة بمجرفة
  'chargeuse',             -- آلة شحن
  'mini_chargeuse',        -- آلة شحن صغيرة الحجم
  'niveleuse',             -- آلة ماسحة
  'autre'
));

CREATE INDEX IF NOT EXISTS idx_vehicules_etat
  ON vehicules (commune_id, etat) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 3. L'état du parc, en une requête
--
-- Le taux de disponibilité est rapporté aux engins qui ROULENT : compter les
-- remorques parmi les immobilisables ferait mentir le taux dans les deux sens,
-- puisqu'une remorque n'a pas de moteur à tomber en panne et qu'elle suit
-- l'état de son tracteur.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.etat_du_parc(p_commune text DEFAULT NULL)
  RETURNS TABLE (
    commune_id        text,
    total             bigint,
    en_service        bigint,
    en_panne          bigint,
    a_reformer        bigint,
    reforme           bigint,
    remorques         bigint,
    taux_disponibilite double precision,
    age_moyen_annees   double precision,
    valeur_parc_tnd    numeric,
    immobilises_sans_motif bigint,
    inventaire_le      date
  )
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  SELECT v.commune_id,
         count(*)::bigint,
         count(*) FILTER (WHERE v.etat = 'en_service')::bigint,
         count(*) FILTER (WHERE v.etat = 'en_panne')::bigint,
         count(*) FILTER (WHERE v.etat = 'a_reformer')::bigint,
         count(*) FILTER (WHERE v.etat = 'reforme')::bigint,
         count(*) FILTER (WHERE v.categorie = 'remorque')::bigint,
         CASE WHEN count(*) FILTER (WHERE v.categorie IS DISTINCT FROM 'remorque'
                                      AND v.etat <> 'reforme') = 0 THEN NULL
              ELSE round(
                (count(*) FILTER (WHERE v.etat = 'en_service'
                                    AND v.categorie IS DISTINCT FROM 'remorque')::numeric
                 / count(*) FILTER (WHERE v.categorie IS DISTINCT FROM 'remorque'
                                      AND v.etat <> 'reforme')) * 100, 1)::double precision END,
         round(avg(EXTRACT(year FROM age(CURRENT_DATE, v.date_premiere_circulation)))
               FILTER (WHERE v.date_premiere_circulation IS NOT NULL), 1)::double precision,
         sum(v.valeur_achat_tnd),
         -- Un engin immobilisé dont personne n'a écrit pourquoi est un engin
         -- que personne ne réparera : le compter, c'est rendre l'oubli visible.
         count(*) FILTER (WHERE v.etat IN ('en_panne', 'a_reformer')
                            AND (v.motif_immobilisation IS NULL
                                 OR btrim(v.motif_immobilisation) = ''))::bigint,
         -- Date du dernier inventaire connu. Un état du parc qu'on lit sans
         -- savoir de quand il date se prend pour l'état d'aujourd'hui, et l'on
         -- décide sur des pannes réparées depuis six mois.
         max(v.inventaire_le)
    FROM vehicules v
   WHERE v.deleted_at IS NULL
     AND (p_commune IS NULL OR v.commune_id = p_commune)
     AND (app.is_fnct() OR app.can_read_commune(v.commune_id))
   GROUP BY v.commune_id
$$;

COMMENT ON FUNCTION app.etat_du_parc(text) IS
  'État du parc matériel. Le taux de disponibilité écarte les remorques, qui n''ont pas de moteur à tomber en panne et suivent l''état de leur tracteur.';

GRANT EXECUTE ON FUNCTION app.etat_du_parc(text) TO siipi_app;
