"""Témoin indépendant du calcul d'une campagne de pesée (jalon G, lot G5b).

Il ne lit que le jeu fictif (tests/donnees/campagne-pesee-fictive.json) et la
méthode décidée le 12/11/2026 (G5, n° 9 et 10), précisée à la conception — jamais
le code testé :

  * Établissements. Ce qui vaut pour un établissement : sa catégorie, son unité et
    sa valeur d'échelle à l'OUVERTURE de la campagne (l'instantané), et celles que
    porte chacune de ses pesées (figées au jour de sa saisie ; dans le jeu, les
    clés « categorie » et « valeur » d'une pesée, sinon celles de l'inscription).
      - Plus d'une catégorie parmi elles : écarté « categorie_modifiee » des trois
        indicateurs, rangé sous la plus petite (ordre alphabétique) des catégories
        de ses PESÉES — l'instantané n'en décide pas.
      - Les pesées d'un même jour s'additionnent : un jour, un poids, une durée
        (deux bacs pesés le même jour ne font pas deux jours de production).
      - kg/jour = somme des poids des jours / somme des durées des jours.
        kg/jour/unité = kg/jour / valeur d'échelle. Sans unité : écarté
        « sans_unite » ; plus d'une valeur d'échelle parmi l'instantané et les
        pesées : écarté « echelle_modifiee » (un changement fait après
        l'ouverture se voit même si toutes les pesées sont saisies après lui).
      - Poids d'une levée, par volume de contenant : la moyenne des poids des
        pesées de ce volume (le poids observé, pas ramené à un contenant plein) ;
        sans aucune pesée qui porte un volume : écarté « sans_volume ».
      - kg/m³ = somme des poids / somme des volumes de déchets (volume / 1000 ×
        remplissage / 100), sur les pesées qui portent volume ET remplissage ;
        sans aucune : écarté « sans_volume_ou_remplissage ».
      - Groupes : (catégorie, unité) pour le ratio par unité ; (catégorie, volume)
        pour le poids d'une levée ; catégorie pour kg/m³. Seuil atteint si n ≥ seuil.
  * Ménages. Les pesées d'un même jour s'additionnent (une durée par jour). Le
    premier JOUR pesé de chaque ménage, toutes ses pesées, n'est jamais compté :
    il porte le stock d'avant la campagne. kg par habitant et par jour = somme des
    poids des jours suivants / (habitants × somme de leurs durées). Un ménage
    inscrit et jamais pesé est écarté « aucune_pesee » ; un ménage pesé un seul
    jour, « une_seule_pesee ». Une tranche de moins de 5 ménages est masquée
    (aucun quartile rendu).
  * Quartiles : 1er quartile, médiane, 3e quartile par interpolation linéaire
    (méthode « 7 », celle de percentile_cont), sur les valeurs non arrondies.

Sortie, triée :
  R|objet|groupe|sous_groupe|indicateur|n|q1|médiane|q3|seuil   (seuil : oui, non, visible ou masque)
  E|objet|groupe|indicateur|raison|nombre                         (les écartés)
Les quartiles sont écrits avec dix chiffres significatifs : la campagne les
compare en écart relatif.
"""
import json
import sys


def quantile(valeurs, p):
    v = sorted(valeurs)
    if not v:
        return None
    h = (len(v) - 1) * p
    bas = int(h)
    haut = min(bas + 1, len(v) - 1)
    return v[bas] + (h - bas) * (v[haut] - v[bas])


def chiffres(x):
    return "" if x is None else f"{x:.10g}"


def fmt_volume(v):
    return f"{v:g}"


def par_jour(pesees):
    """Un jour, un poids (la somme) et une durée (celle du jour)."""
    jours = {}
    for p in pesees:
        j = jours.setdefault(p["jour"], {"poids": 0.0, "duree": p["duree"]})
        j["poids"] += p["poids"]
    return jours


def main(chemin):
    jeu = json.load(open(chemin, encoding="utf-8"))
    seuil = jeu["seuil"]
    masque = jeu["masque_menages"]
    sortie = []
    ecartes = {}

    def ecarte(objet, groupe, indicateur, raison):
        cle = (objet, groupe, indicateur, raison)
        ecartes[cle] = ecartes.get(cle, 0) + 1

    groupes = {}

    def ajoute(objet, groupe, sous_groupe, indicateur, valeur):
        groupes.setdefault((objet, groupe, sous_groupe, indicateur), []).append(valeur)

    par_etab = {}
    for p in jeu["pesees"]:
        par_etab.setdefault(p["etab"], []).append(p)

    for e in jeu["etablissements"]:
        ps = par_etab.get(e["cle"], [])
        if not ps:
            continue
        categories_pesees = {p.get("categorie", e["categorie"]) for p in ps}
        if len(categories_pesees | {e["categorie"]}) > 1:
            groupe = min(categories_pesees)
            for indicateur in ("kg_jour_unite", "kg_levee", "kg_m3"):
                ecarte("etablissements", groupe, indicateur, "categorie_modifiee")
            continue
        cat = e["categorie"]

        jours = par_jour(ps)
        kg_jour = sum(j["poids"] for j in jours.values()) / sum(j["duree"] for j in jours.values())
        valeurs = {e["valeur"]} | {p.get("valeur", e["valeur"]) for p in ps}
        if e["unite"] is None:
            ecarte("etablissements", cat, "kg_jour_unite", "sans_unite")
        elif len(valeurs) > 1:
            ecarte("etablissements", cat, "kg_jour_unite", "echelle_modifiee")
        else:
            ajoute("etablissements", cat, e["unite"], "kg_jour_unite", kg_jour / e["valeur"])

        avec_volume = [p for p in ps if p.get("volume")]
        if not avec_volume:
            ecarte("etablissements", cat, "kg_levee", "sans_volume")
        for v in sorted({p["volume"] for p in avec_volume}):
            de_v = [p for p in avec_volume if p["volume"] == v]
            ajoute("etablissements", cat, fmt_volume(v), "kg_levee", sum(p["poids"] for p in de_v) / len(de_v))

        complets = [p for p in avec_volume if p.get("remplissage")]
        if not complets:
            ecarte("etablissements", cat, "kg_m3", "sans_volume_ou_remplissage")
        else:
            ajoute("etablissements", cat, "", "kg_m3",
                   sum(p["poids"] for p in complets) / sum(p["volume"] / 1000 * p["remplissage"] / 100 for p in complets))

    for m in jeu["menages"]:
        jours = par_jour(m["pesees"])
        if not jours:
            ecarte("menages", m["tranche"], "kg_hab_jour", "aucune_pesee")
            continue
        premier = min(jours)
        suivants = [j for k, j in jours.items() if k != premier]
        if not suivants:
            ecarte("menages", m["tranche"], "kg_hab_jour", "une_seule_pesee")
            continue
        ajoute("menages", m["tranche"], "", "kg_hab_jour",
               sum(j["poids"] for j in suivants) / (m["habitants"] * sum(j["duree"] for j in suivants)))

    for (objet, groupe, sous_groupe, indicateur), vals in groupes.items():
        n = len(vals)
        if objet == "menages" and n < masque:
            sortie.append("|".join(["R", objet, groupe, sous_groupe, indicateur, str(n), "", "", "", "masque"]))
            continue
        etat = ("oui" if n >= seuil else "non") if objet == "etablissements" else "visible"
        sortie.append("|".join(["R", objet, groupe, sous_groupe, indicateur, str(n),
                                chiffres(quantile(vals, 0.25)), chiffres(quantile(vals, 0.5)), chiffres(quantile(vals, 0.75)), etat]))
    for (objet, groupe, indicateur, raison), nombre in ecartes.items():
        sortie.append("|".join(["E", objet, groupe, indicateur, raison, str(nombre)]))
    print("\n".join(sorted(sortie)))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "tests/donnees/campagne-pesee-fictive.json")
