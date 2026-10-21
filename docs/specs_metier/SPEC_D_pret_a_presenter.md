# SIIPI — Jalon D : « prête à présenter »
## Préparer la présentation au staff de la FNCT et au ministère de l'Intérieur

**FNCT · 20 octobre 2026 · décidé par Nacer · statut : spécification, rien n'est codé**

---

## 0. Le but

Dans **2 à 3 semaines**, Nacer présente SIIPI au staff de la FNCT et au ministère de l'Intérieur. La présentation est faite de **diapositives avec captures d'écran** (pas de démonstration en direct). Elle doit aussi obtenir l'appui du ministère pour débloquer l'**interopérabilité des pesées avec l'ANGeD**.

Ce jalon passe **avant** l'essai réel avec les communes : SIIPI ne sort devant une commune que lorsque Nacer la juge prête. Il passe aussi avant le chantier P (mise en production), qui attend de toute façon la réponse de la DSI.

**Ce que la présentation doit montrer** (choix de Nacer) :
1. la vue nationale pour le ministère ;
2. la journée d'un directeur de la propreté ;
3. l'argument pesées et ANGeD : ce que SIIPI fait des pesées aujourd'hui, et ce que l'interopérabilité ajouterait ;
4. le service aux citoyens ;
5. le rôle de SIIPI pour **capitaliser les données** de la gestion des déchets.

**Données montrées : uniquement les communes réelles déjà chargées** (Dar Chaâbane El Fehri, Djerba Houmt Souk, Midoun, Ajim, M'hamdia). Pas de base de démonstration nationale, pas de commune fictive dans les captures. La vue nationale dit honnêtement « N communes sur 350 » : c'est un déploiement pilote, et la présentation le dit ainsi.

Les règles d'or s'appliquent entièrement : une donnée manquante n'est pas un zéro, même pour embellir une capture.

---

## D1 — Logos des communes

- La colonne `communes.logo_url` existe (migration 001) mais rien ne l'alimente. Le logo devient un **fichier déposé** par le service de fichiers existant (nouvel usage `logo_commune` : PNG, JPEG, SVG nettoyé ou WebP ; taille plafonnée ; métadonnées EXIF retirées comme pour les photos).
- **Qui dépose** : la commune, depuis son espace (Paramètres de la commune) ; **la FNCT en secours**, pour n'importe quelle commune. Le remplacement d'un logo garde l'ancien dans l'historique (règle 1.4) ; dépôt et retrait au journal d'audit.
- **Où il s'affiche** : en-tête du portail communal, page d'accueil (D2), espace citoyen de la commune, fiche de la commune dans l'annuaire national, en-tête des documents à numérotation scellée (16.2) et des exports PDF.
- **Sans logo** : un emblème neutre avec les initiales de la commune — jamais une image vide ou cassée.
- Test de sortie : une commune ne dépose pas le logo d'une autre ; un fichier qui n'est pas une image est refusé ; un SVG contenant du script est refusé ; le logo apparaît partout où il est attendu, en français et en arabe.

## D2 — Page d'accueil du portail communal

- À l'ouverture du portail : **le logo et le nom de la commune**, puis une **synthèse** en deux blocs :
  - **« Ce qui va bien »** : les indicateurs calculés et au-dessus de l'objectif, les registres tenus ce mois-ci ;
  - **« Ce qui demande une action »** : le contenu de « À vérifier », les indicateurs « non renseignés » avec leur lien « ce qui manque », les entretiens dus.
- Elle remplace l'écran d'arrivée actuel et intègre le constat du matin. Chaque élément mène, en un clic, à l'écran où l'on agit.
- Une commune vide (aucune donnée) voit un **parcours de démarrage** (« Ma commune dans SIIPI »), pas un tableau de zéros.

## D3 — UI/UX des trois écrans prioritaires

Les trois écrans que Nacer juge les moins attractifs : **indicateurs et graphiques**, **tableau de bord national FNCT**, **accueil de la commune** (D2).

- **Principes** : une hiérarchie claire (le chiffre important en premier, gros et lisible) ; moins de texte, plus de repères visuels ; des couleurs cohérentes d'un écran à l'autre, jamais seules porteuses de sens ; lisible sur téléphone ; arabe de droite à gauche vérifié écran par écran.
- **Indicateurs** : cartes plus lisibles (valeur, tendance, badge de source), graphiques épurés, panneau de détail plus aéré.
- **National** : en tête, le déploiement (communes actives, qui saisit) ; puis la carte des gouvernorats et districts ; le réel et l'estimé toujours distingués ; « N communes sur 350 » visible.
- **Méthode** : Claude Code peut s'appuyer sur la compétence `frontend-design` pour la direction visuelle. Chaque écran repris est montré à Nacer (capture avant/après) avant d'être considéré comme fini.
- **Ce qui ne change pas** : les calculs, les règles d'or, le cloisonnement. D3 est un travail d'affichage, pas de fond.

## D4 — Bibliothèque nationale des données

Pour montrer le rôle de SIIPI dans la **capitalisation des données** de la gestion des déchets.

- Un écran **« Bibliothèque des données »** dans l'observatoire national : un catalogue de tout ce que SIIPI réunit, par commune, gouvernorat et district :
  - documents : PCGD, études, rapports (avec leur année, leur auteur, leur statut) ;
  - références : caractérisations des déchets (avec leur niveau de source), populations (avec leur nature « estimée ») ;
  - séries : pesées (période couverte, nombre de mois, pesé ou estimé), circuits et points relevés, réclamations ;
  - pour chaque élément : **sa provenance, sa date, et sa complétude** (« 3 communes sur 350 ont un PCGD dans SIIPI »).
- **Lecture** : la FNCT. Pas de nouveau rôle pour le ministère à ce stade ; la présentation le montre depuis le compte FNCT.
- **Lecture seule** : la bibliothèque ne crée aucune donnée, elle rend visible ce qui existe déjà et ce qui manque.
- Export du catalogue (Excel) par le service d'export existant.

## D5 — Les captures d'écran de la présentation

- Un script (navigateur sans interface, à installer dans l'environnement de développement s'il n'y est pas) produit les captures des écrans choisis, **en français et en arabe**, à une taille adaptée aux diapositives, sur la **base principale** (communes réelles uniquement).
- Une liste d'écrans par partie de la présentation (§ 0, points 1 à 5), tenue dans `docs/presentation/CAPTURES.md`, et les images dans `docs/presentation/captures/`.
- **Contrôles** : aucune capture ne montre de donnée personnelle réelle (nom d'agent, de citoyen, téléphone) ; aucune ne montre la commune de démonstration ni une donnée simulée ; chaque capture est rejouable par la même commande après une correction d'écran.
- Les diapositives elles-mêmes sont préparées à part, avec Nacer.

## Ordre

**D1 → D2 → D3 → D4 → D5.** D1 et D2 donnent le visage de la commune ; D3 reprend les écrans que montreront les captures ; D4 porte le message « capitaliser » ; D5 se fait en dernier, sur des écrans finis.

Ensuite : retrait des versions fantômes, chantier P, 17.4, noms arabes, 17.2 (ordre du registre du 20 octobre).
