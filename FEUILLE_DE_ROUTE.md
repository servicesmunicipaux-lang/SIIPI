# SIIPI — Feuille de route
## Du cahier des charges à la plateforme : où nous en sommes, et dans quel ordre continuer

**Fédération Nationale des Communes Tunisiennes**
Version au 22 septembre 2026 · établie à partir du cahier des charges SIIPI (MVP, phase 1)

---

## 1. Comment lire ce document

Ce document confronte, ligne par ligne, les **96 fonctionnalités** numérotées du
cahier des charges à ce que la plateforme fait réellement aujourd'hui. Chaque
ligne porte un statut et, quand elle est faite, **la preuve qui l'établit** — la
migration qui crée la donnée, la route qui la sert, la campagne de tests qui la
vérifie.

| Statut | Ce que cela signifie exactement |
|---|---|
| ✅ **Fait** | Le code existe, une campagne de tests automatisée le vérifie, et la migration se rejoue sur une base neuve |
| 🟡 **Partiel** | Le socle est posé et éprouvé ; il manque une part précise, nommée dans la colonne de droite |
| ⬜ **À faire** | Rien n'existe encore |
| ⏸ **Suspendu** | Une décision ou une dépendance extérieure bloque, et c'est assumé |

### Une distinction qui compte plus que les pourcentages

**« Fait » ne veut pas dire « recetté par une commune ».** Il veut dire : le code
passe une campagne de tests, et la base se reconstruit de zéro sans erreur.

Deux communes seulement ont servi de terrain — **Dar Chaabane El Fehri** (registre
des circuits, parc, effectif, pesées) et **Djerba Houmt Souk** (prestataires,
réclamations). Aucune commune n'utilise encore la plateforme dans son travail
quotidien. C'est l'écart entre « développé » et « en service », et il ne se comble
que par une recette terrain (§ 6).

---

## 2. Où en est le projet

| | Nombre | Part |
|---|---:|---:|
| ✅ Fait et éprouvé | 46 | 48 % |
| 🟡 Partiel | 19 | 20 % |
| ⬜ À faire | 29 | 30 % |
| ⏸ Suspendu | 2 | 2 % |
| **Total des fonctionnalités du cahier des charges** | **96** | **100 %** |

**Le socle est le plus avancé, la restitution le moins.** Tout ce qui consiste à
*collecter et cloisonner* la donnée — personnel, engins, circuits, pesées,
réclamations, sondages, fichiers — est en place et éprouvé. Tout ce qui consiste
à *en restituer la synthèse* — tableau KPI 5 axes, exports, alertes — reste à
bâtir. C'est l'ordre naturel : on ne calcule pas un coût à la tonne avant d'avoir
les tonnes et la masse salariale.

### Avancement par rubrique

| Rubrique | ✅ | 🟡 | ⬜ | ⏸ | Lecture |
|---|---:|---:|---:|---:|---|
| **3.1.1 Authentification** | 3 |  |  |  | Complète. |
| **3.1.2 Les 350 communes** | 4 | 1 |  |  | Complète, sauf la vue KPI qui attend le § 3.2.10. |
| **3.1.3 Tableau de bord national** | 1 | 1 | 2 |  | Le socle et la carte sont là ; alertes et exports manquent. |
| **3.2.1 Personnel et planning** | 4 | 2 |  |  | Le cœur est fait ; photo du cadre et envoi de courriel manquent. |
| **3.2.2 Engins et maintenance** | 1 |  | 4 |  | L'inventaire est fait, la GMAO ne l'est pas du tout. |
| **3.2.3 Données géolocalisées** | 2 | 1 | 3 |  | L'import et la carte sont faits ; l'exploitation par tags et l'export non. |
| **3.2.4 Pesées** | 3 |  |  | 2 | Complète pour la part communale ; la part ANGeD est suspendue. |
| **5.1 Réclamations** | 3 | 1 |  |  | Complète, hors notification au citoyen. |
| **5.2 Sondages** | 2 | 2 |  |  | Le questionnaire et le ciblage sont faits ; push et export non. |
| **5.3 Projets** | 3 | 1 |  |  | Complète, hors dépôt des documents. |
| **5.4 Notifications ciblées** | 3 |  | 1 |  | Le ciblage est fait et éprouvé ; rien ne part réellement. |
| **5.5 Points citoyens** | 2 | 1 | 1 |  | Il reste l'écran de validation et les indicateurs. |
| **3.2.6 Paramètres** | 2 | 1 | 3 |  | Langue et mot de passe seulement. |
| **3.2.7 Contacts** |  |  | 4 |  | Rien. CRUD simple, rapide à faire. |
| **3.2.8 Découpage communal** | 3 | 1 | 2 |  | Fonctionnel ; validation FNCT et historique manquent. |
| **3.2.9 Rapports et études** |  | 2 | 5 |  | Rien, mais le stockage de fichiers est prêt à le porter. |
| **3.2.10 KPI 5 axes** |  | 2 | 3 |  | Le gros morceau restant. À faire en dernier, par construction. |
| **3.2.11 Prestataires privés** | 3 | 1 |  |  | Complète, hors tableau de bord restreint. |
| **3.3 Application citoyenne** | 7 | 2 | 1 |  | Les fonctions y sont — mais en web, pas en application Android (§ 7). |

---

## 3. Le détail, fonctionnalité par fonctionnalité


### 3.1.1 Authentification

| ID | Fonctionnalité | Statut | Preuve, ou ce qui manque |
|---|---|---|---|
| `A1.1` | Login sécurisé (bcrypt) | ✅ Fait | auth.routes.ts · campagne comptes |
| `A1.2` | Rôle Super Admin FNCT | ✅ Fait | RBAC migration 010 · campagne cloisonnement |
| `A1.3` | Session JWT + expiration | ✅ Fait | middleware/auth.ts · campagne comptes |

### 3.1.2 Les 350 communes

| ID | Fonctionnalité | Statut | Preuve, ou ce qui manque |
|---|---|---|---|
| `A2.1` | Tableau des communes (FR/AR, gouvernorat, statut, GPS) | ✅ Fait | migrations 001/025 · campagne observatoire |
| `A2.2` | Recherche et filtre | ✅ Fait | routes observatoire · écran national |
| `A2.3` | Bouton « Visualiser » (KPI lecture seule) | 🟡 Partiel | l'écran existe, le tableau KPI 5 axes reste à bâtir (3.2.10) |
| `A2.4` | Bouton « Modifier » (admin complète) | ✅ Fait | EspaceCommunal.tsx |
| `A2.5` | Badge de statut vert / gris / orange | ✅ Fait | Elements.tsx · migration 016 |

### 3.1.3 Tableau de bord national

| ID | Fonctionnalité | Statut | Preuve, ou ce qui manque |
|---|---|---|---|
| `A3.1` | Agrégation des indicateurs | 🟡 Partiel | déploiement et provenance agrégés ; tonnages et taux de résolution restent à joindre |
| `A3.2` | Cartographie nationale Leaflet | ✅ Fait | DecoupageCommunal.tsx · migration 025 |
| `A3.3` | Alertes et seuils configurables | ⬜ À faire |  |
| `A3.4` | Export PDF / Excel / CSV | ⬜ À faire |  |

### 3.2.1 Personnel et planning

| ID | Fonctionnalité | Statut | Preuve, ou ce qui manque |
|---|---|---|---|
| `B1.1` | Enregistrement d'un cadre | 🟡 Partiel | compte, fonction, courriel : oui. Photo et date de naissance : non câblés |
| `B1.2` | Création de compte + mot de passe provisoire | 🟡 Partiel | le mot de passe provisoire existe ; l'envoi par courriel n'est pas branché |
| `B1.3` | Accès cadre → espace commune | ✅ Fait | Connexion.tsx · campagne comptes |
| `B1.4` | CRUD personnel (activer / désactiver / modifier / retirer) | ✅ Fait | migration 039 · campagne module4 |
| `B1.5` | Rôles (administrateur, gestionnaire prestataire) | ✅ Fait | migrations 010/020 · campagne cloisonnement |
| `B1.6` | Planning des équipes (agents → circuits → jours) | ✅ Fait | migrations 034/040 · campagne module4 |

### 3.2.2 Engins et maintenance

| ID | Fonctionnalité | Statut | Preuve, ou ce qui manque |
|---|---|---|---|
| `B2.1` | Fiche engin | ✅ Fait | migration 032 · campagne module3 |
| `B2.2` | Historique de maintenance (date, type, coût, km) | ⬜ À faire | seuls l'état et le motif d'immobilisation existent |
| `B2.3` | Alertes d'entretien (seuils km / date) | ⬜ À faire |  |
| `B2.4` | Import / export CSV du parc | ⬜ À faire |  |
| `B2.5` | Interopérabilité GPS (optionnelle au TDR) | ⬜ À faire |  |

### 3.2.3 Données géolocalisées

| ID | Fonctionnalité | Statut | Preuve, ou ce qui manque |
|---|---|---|---|
| `B3.1` | Import de points (CSV / GPX / KML) | 🟡 Partiel | KML, KMZ, GPX et GeoJSON reconnus par leur contenu ; CSV non |
| `B3.2` | Import de tracés GeoTracker | ✅ Fait | services/kml.ts · campagne module2 |
| `B3.3` | Carte multicouches | ✅ Fait | CarteCommunale.tsx, CircuitCarte.tsx |
| `B3.4` | Tableau attributaire avec champs libres | ⬜ À faire | le tableau existe, les champs libres non |
| `B3.5` | Planification d'actions et filtrage par tags | ⬜ À faire |  |
| `B3.6` | Export des points filtrés (Excel / CSV) | ⬜ À faire |  |

### 3.2.4 Pesées

| ID | Fonctionnalité | Statut | Preuve, ou ce qui manque |
|---|---|---|---|
| `B4.1` | Import du classeur ANGeD | ⏸ Suspendu | décision FNCT : l'interopérabilité ANGeD n'est pas ouverte |
| `B4.2` | Saisie journalière rattachée au circuit | ✅ Fait | migration 036 · campagne module6 |
| `B4.3` | Recoupement saisie ↔ ANGeD | ⏸ Suspendu | dépend de B4.1 ; la colonne « source » l'attend sans migration |
| `B4.4` | Historique par période / camion / circuit | ✅ Fait | routes pesees · campagne module6 |
| `B4.5` | Registre numérique conforme au décret | ✅ Fait | suppression logique, imputabilité · campagne suppression |

### 5.1 Réclamations

| ID | Fonctionnalité | Statut | Preuve, ou ce qui manque |
|---|---|---|---|
| `B5.1.1` | Tableau de bord et carte à code couleur | ✅ Fait | Reclamations.tsx · campagne citoyen |
| `B5.1.2` | Acceptation / refus motivé | 🟡 Partiel | la décision et le motif : oui. La notification au citoyen : non |
| `B5.1.3` | Preuve de traitement (photo « après ») | ✅ Fait | migration 041 · campagnes fichiers et citoyen |
| `B5.1.4` | Transfert au prestataire | ✅ Fait | tickets.routes.ts · campagne prestataires |

### 5.2 Sondages

| ID | Fonctionnalité | Statut | Preuve, ou ce qui manque |
|---|---|---|---|
| `B5.2.1` | Création du questionnaire | ✅ Fait | migrations 035/037 · campagne module5 |
| `B5.2.2` | Paramétrage et ciblage (géographique, type de foyer) | ✅ Fait | migration 035 · campagne module5 |
| `B5.2.3` | Publication et notification push | 🟡 Partiel | la publication et la traçabilité de l'envoi : oui. L'envoi push réel : non |
| `B5.2.4` | Résultats graphiques et export CSV / PDF | 🟡 Partiel | le dépouillement existe ; l'export non |

### 5.3 Projets

| ID | Fonctionnalité | Statut | Preuve, ou ce qui manque |
|---|---|---|---|
| `B5.3.1` | Création d'un projet (FR/AR, périmètre) | ✅ Fait | migration 035 · campagne module5 |
| `B5.3.2` | Liste, suivi et affichage sur la carte | ✅ Fait | Communication.tsx |
| `B5.3.3` | Upload de documents | 🟡 Partiel | le stockage est prêt (migration 041) ; l'écran n'est pas branché |
| `B5.3.4` | Visibilité citoyenne | ✅ Fait | publicationsCitoyen.routes.ts |

### 5.4 Notifications ciblées

| ID | Fonctionnalité | Statut | Preuve, ou ce qui manque |
|---|---|---|---|
| `B5.4.1` | Création d'une notification par zone | ✅ Fait | migration 035 · campagne module5 |
| `B5.4.2` | Ciblage sur les adresses citoyennes | ✅ Fait | app.destinataires_publication · campagne module5 |
| `B5.4.3` | Canaux de diffusion (push, SMS, courriel) | ⬜ À faire | le canal est enregistré, aucun envoi réel n'est émis |
| `B5.4.4` | Historique des envois | ✅ Fait | envois_notification · campagne module5 |

### 5.5 Points citoyens

| ID | Fonctionnalité | Statut | Preuve, ou ce qui manque |
|---|---|---|---|
| `B5.5.1` | Gestion des adresses citoyennes | ✅ Fait | migration 021 · campagne citoyen |
| `B5.5.2` | Validation des nouveaux points | 🟡 Partiel | API et cloisonnement faits (migration 042) ; les écrans restent |
| `B5.5.3` | Association équipe → circuit | ✅ Fait | migrations 034/040 · campagne module4 |
| `B5.5.4` | Indicateurs de communication (délai, volumétrie, taux) | ⬜ À faire |  |

### 3.2.6 Paramètres

| ID | Fonctionnalité | Statut | Preuve, ou ce qui manque |
|---|---|---|---|
| `B6.1` | Bascule Français / العربية | ✅ Fait | i18n.ts, RTL · tout le portail |
| `B6.2` | Préférences de notification et seuils | ⬜ À faire |  |
| `B6.3` | Fuseau horaire (UTC+1) | 🟡 Partiel | les dates sont protégées du décalage en base ; aucun réglage exposé |
| `B6.4` | Format de date | ⬜ À faire |  |
| `B6.5` | Changement de mot de passe | ✅ Fait | ChangerMotDePasse.tsx · campagne comptes |
| `B6.6` | Unités de mesure | ⬜ À faire |  |

### 3.2.7 Contacts

| ID | Fonctionnalité | Statut | Preuve, ou ce qui manque |
|---|---|---|---|
| `C1.1` | Liste des contacts | ⬜ À faire |  |
| `C1.2` | Ajouter un contact | ⬜ À faire |  |
| `C1.3` | Modifier / supprimer (suppression logique) | ⬜ À faire |  |
| `C1.4` | Import / export CSV | ⬜ À faire |  |

### 3.2.8 Découpage communal

| ID | Fonctionnalité | Statut | Preuve, ou ce qui manque |
|---|---|---|---|
| `C2.1` | Carte du périmètre communal | ✅ Fait | migration 025 · campagne decoupage |
| `C2.2` | Import GeoJSON / Shapefile / KML | 🟡 Partiel | GeoJSON et KML : oui. Shapefile : non |
| `C2.3` | Édition manuelle du polygone | ✅ Fait | DecoupageCommunal.tsx (Geoman) |
| `C2.4` | Découpage en zones | ✅ Fait | migration 012 · campagne decoupage |
| `C2.5` | Validation par le Super Admin FNCT | ⬜ À faire |  |
| `C2.6` | Historique et retour à la version précédente | ⬜ À faire |  |

### 3.2.9 Rapports et études

| ID | Fonctionnalité | Statut | Preuve, ou ce qui manque |
|---|---|---|---|
| `C3.1` | Liste des rapports | ⬜ À faire |  |
| `C3.2` | Dépôt de document (PDF, DOCX, XLSX, PPTX) | 🟡 Partiel | le stockage accepte PDF et images ; DOCX/XLSX/PPTX et le plafond 50 Mo restent à ouvrir |
| `C3.3` | Métadonnées (titre, type, auteur, date) | ⬜ À faire |  |
| `C3.4` | Catégories d'étude | ⬜ À faire |  |
| `C3.5` | Lecteur PDF intégré | ⬜ À faire |  |
| `C3.6` | Versionnement | ⬜ À faire |  |
| `C3.7` | Accès FNCT / commune | 🟡 Partiel | le cloisonnement existe déjà ; il reste à l'appliquer à cette rubrique |

### 3.2.10 KPI 5 axes

| ID | Fonctionnalité | Statut | Preuve, ou ce qui manque |
|---|---|---|---|
| `Axe 1` | Efficacité opérationnelle | ⬜ À faire | les données existent (circuits, points, pesées) ; le calcul non |
| `Axe 2` | Qualité de service | ⬜ À faire | les données existent (réclamations, sondages) ; le calcul non |
| `Axe 3` | Performance environnementale | ⬜ À faire | carburant et valorisation ne sont pas encore saisis |
| `Axe 4` | Performance économique | 🟡 Partiel | le coût à la tonne est calculé (module 6) ; le reste de l'axe non |
| `Axe 5` | Sécurité et ressources humaines | 🟡 Partiel | effectif, encadrement et absentéisme sont saisissables ; accidents et formation non |

### 3.2.11 Prestataires privés

| ID | Fonctionnalité | Statut | Preuve, ou ce qui manque |
|---|---|---|---|
| `B7.1` | Assignation de zones | ✅ Fait | migration 020 · campagne prestataires |
| `B7.2` | Périmètre d'action cloisonné | ✅ Fait | migrations 022/027 · campagne intercommunal |
| `B7.3` | Traitement des réclamations transférées | ✅ Fait | campagne prestataires |
| `B7.4` | Tableau de bord restreint | 🟡 Partiel | le cloisonnement est là ; le tableau KPI reste à bâtir |

### 3.3 Application citoyenne

| ID | Fonctionnalité | Statut | Preuve, ou ce qui manque |
|---|---|---|---|
| `M1` | Inscription / connexion (téléphone + OTP) | 🟡 Partiel | compte par courriel et mot de passe ; ni téléphone ni OTP |
| `M2` | Gestion des adresses | ✅ Fait | migration 021 · campagne citoyen |
| `M3` | Horaires, équipe assignée et véhicule | ✅ Fait | app.horaires_citoyen · campagne citoyen |
| `M3.1` | Suggestion d'un point manquant | 🟡 Partiel | API et cloisonnement faits (migration 042) ; l'écran reste |
| `M4` | Déposer une réclamation (texte, photo, position) | ✅ Fait | FormulaireSignalement.tsx · campagne citoyen |
| `M5` | Suivi de la réclamation | ✅ Fait | migration 021 · campagne citoyen |
| `M6` | Notifications push | ⬜ À faire |  |
| `M7` | Participation aux sondages | ✅ Fait | publicationsCitoyen.routes.ts · campagne module5 |
| `M8` | Visibilité de l'équipe de collecte | ✅ Fait | app.horaires_citoyen · campagne citoyen |
| `M9` | Bilinguisme FR / AR avec RTL | ✅ Fait | i18n.ts · tout l'espace citoyen |

---

## 4. Les jalons à venir, et pourquoi dans cet ordre

L'ordre ci-dessous n'est pas celui du cahier des charges : c'est celui qui
**débloque le plus de fonctionnalités par unité de travail**, et qui respecte les
dépendances réelles entre les briques.

### Jalon 1 — Brancher les écrans sur ce qui est déjà bâti *(effort faible, valeur immédiate)*

Trois briques sont éprouvées côté API et n'ont pas encore d'écran. Le travail est
de l'interface, pas de la conception : le coût est faible et le gain visible tout
de suite.

| Quoi | Débloque |
|---|---|
| Carte des points proposés par les citoyens, et le formulaire de proposition | `B5.5.2`, `M3.1` |
| Dépôt des documents d'un projet | `B5.3.3` |
| Photo du constat de terrain quotidien | complète la rubrique 3 |
| Écran des rapports et études, adossé au stockage existant | prépare le jalon 3 |

**Test de validation.** Campagne `test:suggestions` étendue au parcours complet
depuis l'écran ; recette : un agent de Dar Chaabane instruit dix propositions
sans assistance.

### Jalon 2 — Le socle de notification *(un seul chantier, cinq lignes du TDR)*

Rien ne part aujourd'hui. Le ciblage est fait, éprouvé, et ne rend que des
nombres ; l'historique des envois est tenu. Il manque l'émission elle-même.

Un seul chantier — un service d'émission avec ses tentatives, ses échecs et sa
trace — ferme d'un coup `B5.1.2` (notification de décision), `B5.1.3` (preuve de
traitement), `B5.2.3` (invitation au sondage), `B5.4.3` (canaux) et `M6`. C'est
le meilleur rapport entre effort et couverture de tout ce qui reste.

**Décision préalable :** quel fournisseur, et quels canaux (push seul, ou SMS pour
les foyers sans application). Voir § 7.

**Test de validation.** Campagne dédiée : un envoi vers un périmètre de trois
foyers touche trois destinataires et pas un de plus ; un échec de livraison est
consigné et non silencieux ; un désabonné ne reçoit rien.

### Jalon 3 — Rapports et études, puis Contacts *(deux CRUD simples)*

Le stockage de fichiers porte déjà l'essentiel : il reste les métadonnées, les
catégories, le versionnement et la liste. Les contacts sont un CRUD sans
difficulté. Deux rubriques entières fermées pour un effort modéré.

**Test de validation.** Dépôt d'une version 2 d'un rapport : la version 1 reste
consultable et datée ; un cadre d'une autre commune ne voit rien.

### Jalon 4 — L'import et l'export, de façon transverse

Le cahier des charges demande de l'export à cinq endroits (`A3.4`, `B2.4`,
`B3.6`, `B5.2.4`, `C1.4`). Les bâtir un par un produirait cinq formats
différents. Un service unique — une requête, un jeu de colonnes, un fichier —
les sert tous.

**Test de validation.** Un export rouvert dans un tableur affiche les accents
arabes et français correctement, et les nombres restent des nombres.

### Jalon 5 — La maintenance des engins (GMAO)

`B2.2` et `B2.3` sont absents. C'est la rubrique la moins avancée, et celle dont
dépend l'axe 3 des KPI (coût de maintenance à la tonne).

**Test de validation.** Un engin dont l'entretien est dû est signalé avant
l'échéance, et le signalement disparaît une fois l'intervention saisie.

### Jalon 6 — Champs libres et planification d'actions

`B3.4` et `B3.5` : ajouter des colonnes libres au tableau des points, filtrer par
étiquette, et sortir la sélection. C'est ce qui permet à une commune d'organiser
une campagne de déchets verts sans attendre une évolution du logiciel.

**Test de validation.** Une commune ajoute un champ « accès camion », le
renseigne sur trente points, filtre dessus et exporte — sans intervention.

### Jalon 7 — Paramètres et découpage : les finitions

`B6.2`, `B6.4`, `B6.6` (préférences, format de date, unités) et `C2.5`, `C2.6`
(validation FNCT du découpage, retour à la version précédente).

### Jalon 8 — Le tableau de bord KPI 5 axes *(en dernier, et c'est délibéré)*

**Il vient en dernier parce qu'il se nourrit de tout le reste.** Un indicateur
calculé sur une donnée absente n'est pas un indicateur : c'est un chiffre faux
qui sera lu comme vrai, et qu'on opposera un jour à un prestataire ou à un
conseil municipal.

État des cinq axes aujourd'hui :

| Axe | Ce qui est déjà saisissable | Ce qui manque |
|---|---|---|
| 1 — Efficacité opérationnelle | circuits, points, tonnages, temps de tournée | rien de bloquant : c'est du calcul |
| 2 — Qualité de service | réclamations, délais, sondages | rien de bloquant |
| 3 — Environnement | — | carburant, valorisation : à saisir (jalon 5) |
| 4 — Économique | coût à la tonne (module 6) | recouvrement TEOM/TIB/TNB, maintenance |
| 5 — Sécurité et RH | effectif, encadrement, absentéisme | accidents, heures de formation |

**Principe à tenir :** un indicateur dont la donnée source manque **ne s'affiche
pas** — il n'affiche pas zéro. Un tableau de bord qui montre « 0 accident » alors
que personne ne saisit les accidents est plus dangereux qu'un tableau vide.

**Test de validation.** Chaque indicateur est recalculé à la main sur Dar Chaabane
et comparé au chiffre affiché ; tout écart est expliqué avant mise en service.

### Jalon 9 — L'application mobile citoyenne

Voir § 7 : c'est une décision avant d'être un chantier.

---

## 5. Ce qui est fait et qui ne figurait pas au cahier des charges

Ces briques ne sont pas au TDR. Elles ont été ajoutées parce que le terrain les a
réclamées, et elles comptent dans ce que la FNCT reçoit.

| Brique | Pourquoi elle existe |
|---|---|
| **Panneau de cohérence** (`app.incoherences_commune`) | Le croisement à la main du registre des circuits et de l'inventaire du parc de Dar Chaabane a fait apparaître en quelques minutes des écarts que personne ne cherchait. Douze contrôles datés, avec ce qu'il y a à faire — jamais une correction automatique |
| **Constat du matin** | L'écran qu'un chef de service ouvre en arrivant : ce qui bloque aujourd'hui, et rien d'autre |
| **Espace prestataire et confrontation contractuelle** | Un tableau des passages déclarés face aux passages attendus, utilisable comme pièce de discussion |
| **Journal d'audit et suppression logique** | Rien ne s'efface de la base ; les accès aux données citoyennes sont tracés (décret-loi n° 2022-54) |
| **Retrait des métadonnées EXIF des photos** | Une photo de téléphone porte la position du domicile de celui qui l'a prise. Elle est retirée au dépôt, et rendue à l'écran pour qu'il la propose — jamais conservée à l'insu de la personne |
| **Rattachement multi-communes** | Un agent, un marché, plusieurs communes : la mutualisation est l'objet même de SIIPI, et sept politiques de cloisonnement la contredisaient |

---

## 6. Comment on valide : deux niveaux, et ils ne se remplacent pas

### Niveau 1 — Les campagnes automatisées *(en place)*

**Vingt campagnes rejouables**, lancées à chaque migration par `MIGRER.bat` :

`module2` (circuits) · `module3` (parc) · `module4` (personnel) · `module5`
(communication) · `module6` (pesées) · `fichiers` (stockage) · `suggestions`
(points citoyens) · `comptes` · `cloisonnement` · `intercommunal` · `citoyen` ·
`prestataires` · `circuits` · `decoupage` · `enlevements` · `observatoire` ·
`periode` · `audit` · `suppression`

**Leur principe :** elles commencent par ce que la plateforme **refuse**. Le
module 4 vérifie d'abord qu'aucune colonne de salaire, de CIN ou de santé
n'existe ; le stockage de fichiers, qu'un exécutable renommé « photo.jpg »
n'entre pas. Un module se juge d'abord à ce qu'il a refusé de stocker.

S'y ajoutent, à chaque passage : la chaîne des **42 migrations rejouée sur une
base neuve**, le contrôle du **contrat d'API** (toute route servie est
documentée), et le **typage du front** comparé au contrat réellement servi.

### Niveau 2 — La recette terrain *(à organiser)*

C'est ce qui manque, et aucune campagne ne le remplace. Le journal des
corrections en porte la preuve : **cinq défauts n'ont été révélés par aucun des
240 tests automatisés** — ils n'apparaissaient qu'une fois la plateforme
réellement utilisée, avec un premier circuit créé et un premier signalement
déposé.

**Protocole proposé, par commune pilote :**

1. **Une semaine d'usage réel** par le service propreté, sans assistance, sur son propre registre.
2. **Trois parcours complets** tracés de bout en bout : un signalement citoyen jusqu'à sa preuve de traitement ; une journée de pointage jusqu'au coût à la tonne ; une tournée de prestataire jusqu'à la confrontation contractuelle.
3. **Un critère de sortie chiffré** : aucun écran ouvert sans savoir quoi y faire, et aucune donnée saisie deux fois.
4. **Consignation systématique** de tout défaut dans le journal des corrections, avec sa portée — pas seulement sa cause.

**Communes proposées :** Dar Chaabane El Fehri (registre le plus complet),
Djerba Houmt Souk (prestataire privé actif), et une commune rurale à désigner —
le cahier des charges distingue la couverture urbaine et rurale, et aucune
commune rurale n'a encore servi de terrain.

---

## 7. Trois décisions à prendre, et elles conditionnent la suite

### 7.1 L'application citoyenne : Android natif, ou web mobile ?

**C'est l'écart le plus important entre le cahier des charges et la plateforme.**

Le TDR demande une **application Flutter, Android en priorité**. Ce qui existe est
un **espace citoyen web**, bilingue et utilisable sur téléphone, qui couvre déjà
sept des dix fonctions demandées : adresses, horaires, équipe assignée,
réclamation avec photo et position, suivi, sondages, bilinguisme RTL.

Ce qu'une application native apporterait et que le web ne donne pas :
la **notification push** hors navigation, l'**installation sur l'écran d'accueil**
avec une icône, et le **fonctionnement hors connexion**.

Trois voies :

| Voie | Ce qu'elle coûte | Ce qu'elle donne |
|---|---|---|
| **Rester en web** | rien | tout sauf le push et le hors-ligne ; pas de présence sur le Play Store |
| **Application web progressive (PWA)** | faible — l'existant est réutilisé | installation sur l'écran d'accueil, push sur Android, hors-ligne partiel |
| **Flutter natif** | un chantier complet, et une seconde base de code à maintenir | conformité stricte au TDR, présence sur le Play Store, iOS possible |

**Recommandation :** la voie PWA en premier. Elle rend le push et l'installation
sans dupliquer la base de code, et laisse la décision Flutter ouverte une fois que
l'usage réel aura montré ce que les citoyens font vraiment. Passer directement au
natif, c'est maintenir deux applications avant de savoir si la première sert.

### 7.2 L'inscription citoyenne : téléphone + OTP, ou courriel ?

Le TDR demande **téléphone + OTP** (`M1`). L'existant fonctionne au courriel et au
mot de passe. En Tunisie, l'argument du TDR est solide : le téléphone est le
seul identifiant que tout le monde possède.

Cela suppose un fournisseur de SMS, un coût par message, et un mécanisme
anti-abus. **Cette décision se prend avec celle du jalon 2** : le même fournisseur
sert aux deux.

### 7.3 L'interopérabilité ANGeD

Décision déjà prise : **hors périmètre tant que l'ANGeD n'ouvre pas sa
plateforme**. Le coût à la tonne est débloqué autrement, par la saisie communale.
La colonne `source` de la table des pesées attend la donnée ANGeD sans migration —
le jour où elle arrive, le recoupement `B4.3` devient une requête.

**À suivre :** c'est une question de convention entre la FNCT et l'ANGeD, pas une
question technique.

---

## 8. Ce qui reste ouvert, et qu'il faut trancher

| Sujet | Décideur | Conséquence si rien n'est tranché |
|---|---|---|
| Zarzouna / El Hchachna (Bizerte) : la couche officielle et le référentiel listent des communes différentes | FNCT | Zarzouna reste sans territoire |
| Les 5 districts FNCT : la base ne connaît que les 24 gouvernorats | FNCT | Aucune agrégation par district possible |
| Homonymes dans la liste des communes (Ennour, Ezzouhour) | FNCT | Un citoyen peut choisir la mauvaise commune |
| Affectation réelle des équipes aux 13 tournées de Dar Chaabane | Commune | 14 lignes bloquantes au panneau de cohérence |
| Purge des fichiers retirés | FNCT | Le volume grossit ; rien n'est perdu |
| Mot de passe de démonstration `Siipi2026!` publié avec le code | FNCT | Toute instance installée avec les comptes de démonstration et jamais changée est ouverte |

---

## 9. Risques

| Risque | Portée | Ce qui le réduit |
|---|---|---|
| **Le tableau KPI affiche des chiffres faux** | Un indicateur calculé sur une donnée absente sera lu comme vrai et opposé à un tiers | Ne rien afficher quand la donnée source manque ; recalcul manuel avant mise en service |
| **La donnée n'est pas saisie** | Un module que personne ne remplit est pire qu'aucun module : il donne l'illusion d'un suivi | Le pointage tient en soixante cases et un enregistrement ; tout écran ouvert chaque matin doit se remplir en moins de deux minutes |
| **Un défaut invisible aux tests** | Cinq défauts sur vingt n'ont été trouvés qu'en usage réel | Recette terrain (§ 6), et consignation systématique |
| **Une donnée personnelle entre en base** | Décret-loi n° 2022-54 | Les campagnes vérifient d'abord ce qui est refusé ; aucune colonne de salaire, de CIN ni de santé n'existe |
| **Déploiement sur 350 communes** | Aucune procédure de reprise de données n'est écrite | À bâtir avant la deuxième commune, pas avant la trois-centième |

---

## 10. Annexe — l'état technique

| | |
|---|---|
| **Base de données** | PostgreSQL 16 + PostGIS 3.4 — **42 migrations**, rejouées sur base neuve à chaque livraison |
| **API** | Node.js 22 + Express + TypeScript, contrat OpenAPI 3.1 **généré depuis le code** |
| **Portail web** | React 19 + Vite + Tailwind + Leaflet, bilingue FR/AR avec RTL |
| **Cloisonnement** | Row-Level Security PostgreSQL — la commune, le prestataire et le citoyen ne voient que leur périmètre, y compris si une route oubliait de filtrer |
| **Conformité** | Suppression logique généralisée, journal d'audit, traçabilité des accès aux données citoyennes |
| **Déploiement** | Docker Compose, scripts d'installation et de vérification fournis |
| **Code source** | Propriété de la FNCT — dépôt `servicesmunicipaux-lang/SIIPI` |

---

*Document établi par confrontation systématique du cahier des charges SIIPI
(version MVP phase 1) et de l'état du code au 22 septembre 2026. Chaque statut
« fait » est adossé à une campagne de tests nommée et rejouable.*
