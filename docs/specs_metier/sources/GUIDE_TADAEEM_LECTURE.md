# Guide TADAEEM — note de lecture

**Le document.** *Guide d'optimisation de la collecte des déchets ménagers et assimilés en Tunisie*, projet USAID
TADAEEM (Deloitte Consulting), contenu sous la responsabilité du ministère des Affaires locales et de l'Environnement
(MALE). Année non indiquée. Copie : `guide_tadaeem_collecte_dma.pdf`
(SHA-256 `df2f20932e12a6230767360ddc8959ab0cf2972e04bab27137a42c8ee02fd6f3`).

**Son statut.** Décision du 25/10/2026 : **la référence métier officielle de SIIPI** pour la suite du plan — densités
(17.2), typologie des engins (lot T), coût de collecte, indicateurs du § 1.2.7. Le code applique ses formules sans le citer
en commentaire ; les documents, le CHANGELOG et la colonne `source` des référentiels le citent.

**Ce que cette note fait.** Elle constate les endroits où le guide se contredit, ou contredit l'usage, et ce qui a été
décidé. Comme la plateforme, elle ne corrige rien en silence : une valeur que le guide donne deux fois différemment se
tranche par une décision écrite, pas par le choix de celle qui arrange.

## Ce qui sert SIIPI

| Partie du guide | Ce qu'elle donne | Lot |
|---|---|---|
| Tableau 10 | Matériels de collecte et volumes : benne tasseuse 12–22 m³ et 7–8 m³, benne basculante 6 m³ (PTAC 3,5 t), pick-up 2,5 m³ | T |
| Tableaux 2 et 11, Annexe 14 | Densités des DMA par équipement | 17.2 |
| § 1.2.3 | Méthode sans pont-bascule : quantité = densité × volume ; volume = longueur × largeur × hauteur de la benne | T, 17.2 |
| § 1.2.7 | Cinq indicateurs : taux de collecte, de couverture, de remplissage, points noirs, coût unitaire | K |
| Tableaux 3 et 4, consommation par séance, Tableau 5, § 2.4.4, Annexe 14 | Prix et amortissement, exploitation, salaires, carburant, frais généraux | C |
| Tableaux 15 et 16 | Budget de fonctionnement, dépenses budgétaires du service | C |

## Contradictions constatées

| # | Sujet | Ce que dit le guide | Décision |
|---|---|---|---|
| G1 | Densité des poubelles et conteneurs, de la benne basculante (Cbb) et du tracteur à remorque agricole (Tag) | 0,2 t/m³ au Tableau 2 et à l'Annexe 14 ; 0,25 t/m³ au Tableau 11 | **Fourchette 0,20 – 0,25** (25/10/2026) |
| G2 | Classes des bennes tasseuses | Tableaux 2 et 11 : « > 7 m³ » et « = 7 m³ » ; Tableau 10 : classes 7–8 m³ et 12–22 m³ | **0,35 de 7 à 8 m³, 0,5 au-delà, aucune densité sous 7 m³** (25/10/2026) |
| G3 | Engins sans densité | Pick-up, ampli-roll et caisson, remorque seule : absents des tableaux de densité | **Aucune estimation** : « non renseigné » (25/10/2026) |
| G4 | Capacité des bennes tasseuses (Tableau 13) | 3,5 t et 2,45 t, soit 7 m³ × 0,5 et 7 m³ × 0,35 : la classe « > 7 m³ » calculée sur 7 m³ ; unité écrite « Tonne/m3 » pour des tonnes | Sans effet : SIIPI calcule avec le volume de chaque engin |
| G5 | Densité en pré-collecte (§ 2.1.2) | « 0.2 kg/m3 » | Lire t/m³ (coquille) |
| G6 | Coût unitaire (§ 1.2.7) | « Coût unitaire = Quantité collectée / coût total » | Formule inversée : SIIPI calcule coût ÷ tonnage (lot K) |
| G7 | Charges salariales | 14,5 % des salaires nets (Tableau 4) ; 32 % (Annexe 14) ; salaire de 10 500 DT dit « net » (Tableau 4) et « brut, charges sociales comprises » (§ 2.4.4) | À trancher au lot C |
| G8 | Durée d'amortissement selon l'âge | § 2.4.4 : âge < 10 ans → 10 ans, âge > 10 ans → l'âge ; Annexe 14 : l'inverse | À trancher au lot C |
| G9 | Frais généraux | 20 % des frais d'exploitation (Tableau 4) ; « 20 à 30 % » (§ 2.4.4) | À trancher au lot C ; les clés de répartition réelles passent avant tout forfait |
| G10 | Lubrifiants | Libellé « 6 % de la consommation de gasoil », valeur 10 % | À trancher au lot C |
| G11 | Prix du gasoil | 1,825 DT/l, valeur figée | Jamais une constante : paramètre national daté (17.3) |
| G12 | « Tableau 14 » | Avantages et inconvénients des conteneurs, pas un tableau de coût | Les données de coût sont listées ci-dessus |
