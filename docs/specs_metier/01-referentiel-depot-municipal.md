# Référentiel officiel du dépôt municipal (المستودع البلدي) — extraction pour SIIPI

**Source** : présentation officielle « إدارة وصيانة الأسطول البلدي » (Gestion et maintenance de la
flotte municipale), 119 diapositives, déposée le 29/09/2026.
Texte intégral extrait dans `sources/referentiel-mestoudaa-119-diapositives.txt` — la référence
fait foi, ce document n'en est que la lecture orientée développement.

Ce fichier existe pour une raison : **aucun gabarit, aucune règle, aucun seuil codé dans SIIPI ne
doit être inventé.** Chaque élément ci-dessous porte le numéro de diapositive dont il provient.

---

## 1. Ce que le référentiel impose et que SIIPI ne fait pas encore

### 1.1 Le carnet de bord (دفتر الجولان) — diapo 38

Document de base de chaque véhicule, **rempli au début et à la fin de chaque utilisation**. Le
référentiel en tire explicitement trois usages : connaître l'échéance d'entretien, suivre la
consommation de carburant, établir les responsabilités en cas d'incident.

C'est la pièce que la méthodologie PCGD reproche aux communes de ne pas tenir, et sans laquelle
aucun coût par engin n'est calculable. **C'est le premier manque à combler.**

### 1.2 Le quota mensuel de carburant par engin — diapos 43, 44

Le référentiel impose au responsable de l'exploitation de suivre **la quantité mensuelle allouée à
chaque véhicule (quota)**, et d'extraire le ratio de consommation mensuel :

```
consommation mensuelle / (kilomètres parcourus ou heures de fonctionnement)
```

Le tableau semestriel officiel (diapo 44) compare, par matricule et par mois : quota, consommation
totale en litres, km ou heures, moyenne. L'exemple de la diapo 45 ajoute une colonne
`Diff. de Consommation` (écart au quota) et un ratio par séance de travail.

**Règle métier à retenir** : une hausse de consommation est traitée par le référentiel comme un
**indicateur d'avarie** (diapo 42), pas comme un abus. SIIPI signale l'écart ; il ne l'interprète pas.

### 1.3 Le journal de mouvement des engins — diapo 52

Le référentiel donne un exemple réel, déjà exactement au format dont SIIPI a besoin. Colonnes :

| Champ | Correspondance SIIPI |
| :--- | :--- |
| حصة العمل (séance : matinale / après-midi) | séance de la tournée |
| تاريخ العمل | date |
| الرقم المنجمي | matricule engin |
| اسم و لقب السائق | chauffeur |
| منطقة التدخل | zone / circuit |
| ساعة الخروج / ساعة الدخول | heure de sortie / de retour |
| العداد عند الخروج / عند الدخول | compteur sortie / retour |
| ساعة إفراغ الحمولة | heure de déchargement |
| عدد الوصل | numéro du bon de pesée |
| الحمولة (طن) | tonnage |
| المسافة المقطوعة | distance parcourue |
| عدد ساعات العمل | heures de travail |

**Conséquence** : le modèle de tournée de SIIPI doit porter le compteur à la sortie et au retour, et
le numéro de bon de pesée. La distance n'est pas à estimer : elle se déduit des deux compteurs.

### 1.4 Le dossier de déclassement (طرح المعدات) — diapos 83 à 85

Ce n'est **pas un formulaire, c'est une procédure**. Le prompt v0.16 la traite comme une « fiche de
déclassement » à générer ; le référentiel en fait un dossier avec conditions, pièces et circuit.

**Conditions de proposition au déclassement (diapo 83)** :

- **Cumul des dépenses ≥ 80 % du prix d'acquisition** (vérifié sur la facture d'acquisition et
  l'inventaire des dépenses depuis l'acquisition) — c'est un **seuil calculable par SIIPI**
  dès lors que les coûts de maintenance sont saisis par engin ;
- pannes répétées et rapprochées ;
- coût estimatif de réparation excessif au regard du gain attendu ;
- qualité de service dégradée par des défaillances d'entretien ;
- mauvais usage de l'engin.

**Pièces obligatoires du dossier (diapo 83)** :

1. copie de la facture d'acquisition ;
2. inventaire des dépenses de l'engin depuis son acquisition ;
3. **rapport de rendement : nombre de jours d'immobilisation dans l'année contre nombre de jours
   travaillés** ;
4. coût estimatif de la réparation.

**Circuit (diapo 83)** : rapport détaillé → accord de l'administration communale → convocation des
Domaines de l'État (أملاك الدولة) et de l'Agence de contrôle technique (وكالة الفحص الفني) pour
constat et avis → publicité légale → adjudication (pli fermé ou enchère publique).
Le référentiel note que l'absence d'un agent titulaire de la régie des recettes est la cause
principale des blocages.

**Liste de proposition au déclassement (diapo 85)** — colonnes : type d'engin, marque/modèle,
matricule, **âge de l'engin en années décimales**, date de proposition, motif.

### 1.5 Le tableau de maintenance préventive périodique — diapo 28

Treize opérations types, chacune avec : dernier relevé effectué, périodicité, relevé de la prochaine
opération, atelier concerné — **indexées en km OU en heures** :

1. contrôle du niveau de liquide de refroidissement
2. contrôle du niveau d'huile moteur
3. contrôle du niveau d'huile hydraulique
4. contrôle de l'huile de boîte de vitesses
5. contrôle du niveau d'électrolyte de batterie
6. vidange moteur
7. vidange hydraulique
8. vidange boîte de vitesses
9. remplacement du liquide de refroidissement
10. remplacement du filtre à huile moteur
11. remplacement du ou des filtres hydrauliques
12. remplacement du ou des filtres à air
13. remplacement du filtre d'huile de boîte

> **Avertissement du référentiel, à reproduire dans l'interface** : « ce tableau ne peut pas être
> retenu officiellement pour tous les engins — chaque engin a ses propres opérations en plus de
> celles-ci ». Le responsable doit construire un plan par engin à partir de la documentation du
> constructeur.

**Conséquence de conception** : `plans_entretien` porte des seuils **par engin**, pas un plan
standard appliqué à la flotte. Les treize lignes ci-dessus sont un gabarit de départ proposé à la
création d'un engin, jamais un plan imposé.

### 1.6 Maintenance préventive conditionnelle — diapos 62, 63, 65

Déclenchée par un indicateur (analyse d'huile, mesure de vibration, température) et non par une
échéance. Le référentiel donne un chiffrage réel sur un moteur CAT 3126 :

| Scénario à 10 000 heures | Coût |
| :--- | :--- |
| Révision **avec** analyses d'huile tous les 250 h (1 000 DT d'analyses) | **12 000 DT** |
| Révision **sans** analyse | **35 000 à 50 000 DT** |

C'est l'argument chiffré le plus fort du référentiel pour justifier la GMAO auprès d'un SG.

### 1.7 Valeur vénale — diapo 105

Règle officielle pour l'assurance du parc : **décote de 10 % la première année sur le prix
d'acquisition, puis 10 % chaque année sur la valeur de l'année précédente** (dégressif).

> ⚠️ **À ne pas confondre avec l'amortissement comptable** du coût complet PCGD, qui est linéaire
> (prix d'acquisition / durée d'utilisation). Les deux coexistent et servent deux finalités
> différentes : assurance d'un côté, comptabilité analytique de l'autre. SIIPI doit les nommer
> distinctement et ne jamais substituer l'une à l'autre.

Chaque commune doit produire, en début d'exercice, la liste détaillée des engins avec leur valeur
vénale, pour l'appel d'offres d'assurance.

---

## 2. Inventaire des documents officiels du référentiel

Deux familles, que le référentiel distingue et que SIIPI doit distinguer aussi :
**الوثائق القانونية المعتمدة** (documents réglementaires opposables) et
**وثائق المتابعة** (documents de suivi interne).

### 2.1 Documents réglementaires (opposables)

| # | Document (ar) | Traduction | Émetteur | Diapo | Dans le prompt v0.16 ? |
| :-- | :--- | :--- | :--- | :-- | :--- |
| D1 | بطاقة الشاحنة أو الوسيلة | Fiche véhicule (identité, garantie, accidents, réparations) | Chef de dépôt | 15-18 | non |
| D2 | قائمة معدات البلدية | Inventaire du parc communal | Chef de dépôt | 14 | non |
| D3 | إذن بمأمورية لاستعمال عربة | **Ordre de mission** | Chef de dépôt | 36 | **oui** |
| D4 | الترخيص في استعمال سيارة مصلحة | Autorisation d'usage d'un véhicule de service | Président + contrôleur des dépenses | 37 | non |
| D5 | دفتر الجولان | **Carnet de bord** | Chauffeur | 38 | non |
| D6 | بطاقة انجاز اشغال | Fiche de travaux demandés (lien dépôt ↔ services) | Service demandeur | 39 | non |
| D7 | وصل تسليم محروقات | **Bon de sortie carburant** (gasoil / essence, numéroté) | Dépôt | 43 | **oui** |
| D8 | بطاقة مراقبة حالة المعدات | Fiche de contrôle d'état de l'engin | Contrôleur + chauffeur | 48 | non |
| D9 | بطاقة إعلام بعطب | Fiche de déclaration de panne | Chauffeur | 49 | non |
| D10 | بطاقة معاينة قبل الإصلاح | Fiche de constat avant réparation | Chef d'atelier | 23 | non |
| D11 | إذن بالأشغال الصيانة | **Bon de travail maintenance** | Chef d'atelier | 24 | **oui** |
| D12 | وصل إخراج المواد | Bon de sortie de magasin (pièces) | Magasinier | 25 | hors périmètre (voir §4) |
| D13 | جدول المتابعة للصيانة الوقائية | Plan de maintenance préventive par engin | Chargé de maintenance | 28 | non |
| D14 | ملف طرح المعدات | **Dossier de déclassement** | Chef de dépôt | 83-85 | **oui** (sous-estimé) |
| D15 | جدول تطابق زيوت التشحيم | Table de correspondance des huiles | Chef de dépôt | 19 | non |
| D16 | قاعدة بيانات المصافي | Base des filtres (références d'origine / locales) | Chef de dépôt | 20 | non |
| D17 | قاعدة بيانات الإطارات والبطاريات | Base pneumatiques et batteries | Chef de dépôt | 21 | non |

### 2.2 Documents de suivi

| # | Document | Périodicité | Diapo |
| :-- | :--- | :--- | :-- |
| S1 | كشف في الإصلاحات — état des réparations du jour | quotidien, chef d'atelier → chef de dépôt | 26 |
| S2 | متابعة الإصلاحات بورشة — suivi des réparations par atelier | hebdomadaire | 27 |
| S3 | جرد للمعدات حسب المصالح — inventaire des engins par service | permanent | 40 |
| S4 | جدول استهلاك الوقود للسداسية — consommation semestrielle par engin | semestriel | 44 |
| S5 | متابعة حركة الآليات — journal de mouvement | quotidien | 52 |
| S6 | مراقبة المعدات اليومية — contrôle technique quotidien | quotidien | 51 |
| S7 | قائمة valeur vénale — liste pour l'assurance | annuel | 105-106 |

### 2.3 En-tête officiel commun

Tous les documents réglementaires portent le même bandeau, dans cet ordre (diapos 14, 15, 23, 24, 25, 43) :

```
الجمهورية التونسية                                    رقم : ..........
وزارة الشؤون المحلية و البيئة                          التاريخ : ..........
بلدية ...........................
إدارة المعدات و الورشات
```

soit : République Tunisienne → Ministère des Affaires Locales et de l'Environnement → Commune →
Direction des Équipements et Ateliers, avec **numéro** et **date** en haut à droite.

> Le nom du ministère cité est celui en vigueur à la rédaction du référentiel. Il doit être un
> **paramètre communal** (Jalon 10.3), pas une constante : les intitulés de tutelle changent.

---

## 3. Rôles et responsabilités

| Rôle (ar) | Rôle (fr) | Qualification exigée | Diapo |
| :--- | :--- | :--- | :-- |
| رئيس المستودع | Chef de dépôt | Ingénieur mécanique (ou technicien principal pour les petites communes) | 12-13 |
| المسؤول عن ورشات الصيانة | Responsable des ateliers de maintenance | Certificat d'aptitude professionnelle de la spécialité | 22 |
| المراقب الفني | Contrôleur technique | — | 46, 51 |
| السائق | Chauffeur | — | 47 |
| حافظ المغزاة | Magasinier | — | 25 |

**Rôle du chauffeur (diapo 47)**, en trois temps — à reprendre tel quel dans la fiche mobile :

- *avant la mission* : contrôle général (éclairage, eau, huile moteur, freins, pression des pneus)
  sur la base de la fiche de contrôle, et signature ;
- *pendant* : signaler tout bruit, vibration ou comportement anormal ;
- *après* : consigner ses observations sur la fiche de travaux.

**Organigramme type d'une commune moyenne ou petite (diapo 8)** : Dépôt municipal → {Section
administrative et financière · Service exploitation (programmation, contrôle technique et suivi) ·
Service ateliers et maintenance (ateliers de réparation, maintenance) · Service magasins} ; ateliers
: mécanique, forge, lavage-graissage, peinture, diagnostic.

---

## 4. Points où le référentiel et le périmètre SIIPI divergent

Ces divergences sont **des choix, pas des oublis** — elles doivent rester écrites.

| Le référentiel prévoit | SIIPI v0.16 | Raison |
| :--- | :--- | :--- |
| Gestion complète du magasin : réception, inscription au registre, stockage, sortie, seuils mini/maxi, valorisation (diapos 87-88) | **Exclu** | Périmètre GMAO arrêté : pas de gestion de stock au détail. Seul le **bon de sortie de magasin (D12)** pourrait être conservé comme pièce du bon de travail, sans tenue de stock. |
| Fonction financière : préparation du budget, ouverture des plis, passation et suivi des marchés (diapo 88) | **Exclu** | Ligne rouge 5 : pas de facturation ni de comptabilité. SIIPI fournit les assiettes, pas l'exécution budgétaire. |
| Partenariat intercommunal pour les acquisitions groupées, prévu par le chapitre 9 du Code des collectivités locales (diapo 61) | **Reporté** | Rejoint l'axe « mutualisation » — à traiter avec le prêt d'engins, pas avant. |
| GPS de contrôle des engins, explicitement recommandé (diapos 11, 50) | **Inclus** | Le référentiel en fait une obligation de modernisation, et le limite aux **engins**, ce qui confirme la ligne rouge 3. |

---

## 5. Ce que ce référentiel ne contient pas

À réunir avant de spécifier les lots concernés :

- **le texte des articles 13.1 et 14** du cadre prospectif WAMA-Net / ANGeD (secteur informel) ;
- **les gabarits sous forme de fichiers** : les documents ci-dessus n'existent ici que reproduits
  dans des diapositives. Les mises en page devront être reconstruites à partir des champs listés,
  puis **validées par un chef de dépôt en exercice** avant d'être considérées comme officielles ;
- **la documentation des API GPS** des opérateurs (Orange, Ooredoo, prestataires locaux) ;
- les périodicités constructeur par engin, qui relèvent de chaque commune (diapo 28).

Le fichier `Maquette Timesheet.xlsx` déposé dans le même dossier est **sans rapport avec la GMAO** :
c'est une feuille de temps de personnel pour le projet « Ettamkeen El Mahalli », modèle
administratif de suivi d'imputation d'agents sur financements. Il ne fait pas partie de ce
référentiel et n'est pas utilisé ici.
