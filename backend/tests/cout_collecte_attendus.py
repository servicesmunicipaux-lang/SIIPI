#!/usr/bin/env python3
"""Valeurs attendues du coût de collecte (lot C).

Script INDÉPENDANT : il ne lit que le scénario JSON donné en argument (ce que la
campagne `cout-collecte` a bâti) et la méthode décidée le 26/10/2026. Il ne lit
jamais le code testé (migration 090) : c'est ce qui en fait un témoin.

La méthode, pour une période de J jours (fraction annuelle = J / 365) :
  - un engin de circuit et sa remorque attelée sont une unité ;
  - amortissement : rien pour un don ; sinon la valeur réelle des membres (hors
    don), ou à défaut le prix du guide de la classe ; ÷ max(durée de référence,
    âge) × J/365 ;
  - entretien : si l'unité a jamais eu une intervention, la somme de celles de la
    période (absente si l'une n'a pas de coût) ; sinon
    prix × (taux neuf + (taux fin de vie − taux neuf) × min(âge, 10)/10) × J/365,
    le prix étant la valeur réelle de tous les membres (dons compris), ou le prix
    du guide ;
  - carburant : les pleins de la période ; sinon consommation par séance (guide) ×
    séances (jours de passage) × prix du gasoil ; absent sans prix du gasoil ;
  - chaque composante d'une unité se dit au millime, puis se ventile sur ses
    circuits au prorata des kilomètres du carnet de bord de la période, sinon des
    voyages attendus ;
  - personnel : masse salariale annuelle × J/365 × jours pointés sur le circuit ÷
    jours pointés dans la commune ; sans pointage, × équipiers du circuit ÷ effectif ;
  - redevance : tonnes pesées du circuit × taux ; absente sans pesée ;
  - total : la somme, seulement si rien ne manque ; à la tonne pesée, seulement si
    tous les voyages attendus sont pesés.
Arrondis au millième, moitié vers le haut (en décimal).

    python3 cout_collecte_attendus.py scenario.json
"""
import json
import sys
from decimal import ROUND_HALF_UP, Decimal

# classe -> [(borne basse, incluse ?, borne haute incluse, prix, consommation par séance)]
GUIDE = {
    'benne_tasseuse': [(Decimal(7), True, Decimal(8), 187000, 18), (Decimal(8), False, Decimal(12), 270000, 22),
                       (Decimal(12), False, Decimal(16), 380000, 32), (Decimal(16), False, Decimal(22), 420000, None)],
    'benne_basculante': [(None, False, Decimal('6.5'), 85000, 15), (Decimal('6.5'), False, None, None, 20)],
    'tracteur_remorque_agricole': [(None, False, None, 60000, 10)],
    'pick_up': [(None, False, None, 65000, 10)],
    'ampli_roll': [(None, False, None, 500000, 35)],
}
MILLE = Decimal('0.001')


def q(x):
    return None if x is None else Decimal(x).quantize(MILLE, ROUND_HALF_UP)


def f(x):
    return None if x is None else float(q(x))


def guide(classe, volume):
    v = Decimal(str(volume))
    for bas, inclus, haut, prix, conso in GUIDE.get(classe, []):
        if (bas is None or v > bas or (inclus and v == bas)) and (haut is None or v <= haut):
            return prix, conso
    return None, None


def unite(s, u):
    fraction = Decimal(s['jours']) / 365
    p = s['parametres']
    membres = u['membres']
    prix_guide, conso = guide(u['classe'], u['volume'])
    if all(x['don'] for x in membres):
        valeur, prov = Decimal(0), 'don'
    elif all(x['valeur'] is not None or x['don'] for x in membres):
        valeur, prov = sum((Decimal(x['valeur']) for x in membres if not x['don']), Decimal(0)), 'reel'
    elif prix_guide is not None:
        valeur, prov = Decimal(prix_guide), 'prix_guide'
    else:
        valeur, prov = None, None
    duree = max(Decimal(p['duree']), Decimal(u['age']))
    amort = Decimal(0) if prov == 'don' else (valeur / duree * fraction if valeur is not None else None)

    if u['interventions_jamais'] > 0:
        couts = u['interventions_periode']
        entretien = None if any(c is None for c in couts) else sum((Decimal(str(c)) for c in couts), Decimal(0))
        eprov = None if entretien is None else 'reel'
    else:
        prix = (sum((Decimal(x['valeur']) for x in membres), Decimal(0))
                if all(x['valeur'] is not None for x in membres) else (Decimal(prix_guide) if prix_guide else None))
        taux = Decimal(p['taux_neuf']) + (Decimal(p['taux_fin']) - Decimal(p['taux_neuf'])) * min(Decimal(u['age']), Decimal(10)) / 10
        entretien = prix * taux / 100 * fraction if prix is not None else None
        eprov = None if entretien is None else 'ratio_guide'

    if u['pleins_periode']:
        carburant, cprov = sum((Decimal(str(x)) for x in u['pleins_periode']), Decimal(0)), 'reel'
    elif u['seances'] == 0:
        carburant, cprov = Decimal(0), 'sans_activite'
    elif conso is not None and p.get('prix_gasoil') is not None:
        carburant, cprov = Decimal(conso) * u['seances'] * Decimal(str(p['prix_gasoil'])), 'ratio_guide'
    else:
        carburant, cprov = None, None
    return {'valeur_tnd': q(valeur), 'valeur_provenance': prov, 'duree_ans': duree,
            'amortissement_tnd': q(amort), 'amortissement_provenance': prov if amort is not None else None,
            'entretien_tnd': q(entretien), 'entretien_provenance': eprov,
            'carburant_tnd': q(carburant), 'carburant_provenance': cprov}


def attendus(s):
    fraction = Decimal(s['jours']) / 365
    unites = {nom: unite(s, u) for nom, u in s['unites'].items()}
    masse = Decimal(s['masse_an']) * fraction if s.get('masse_an') is not None else None
    res = {'engins': {n: {k: (float(v) if isinstance(v, Decimal) else v) for k, v in u.items()} for n, u in unites.items()},
           'circuits': {}}
    for c in s['circuits']:
        u = unites.get(c['unite']) if c['unite'] else None
        if u is not None:
            freres = [x for x in s['circuits'] if x['unite'] == c['unite']]
            km_total = sum(x['km'] for x in freres)
            voy_total = sum(x['voyages_attendus'] for x in freres)
            part = (Decimal(c['km']) / km_total if km_total > 0
                    else (Decimal(c['voyages_attendus']) / voy_total if voy_total > 0 else Decimal(0)))
            cle = 'km' if km_total > 0 else 'voyages'
            ventile = {k: (q(u[k] * part) if u[k] is not None else None) for k in ('carburant_tnd', 'entretien_tnd', 'amortissement_tnd')}
        else:
            cle = None
            ventile = {'carburant_tnd': None, 'entretien_tnd': None, 'amortissement_tnd': None}
        if masse is None:
            personnel = None
        elif s['jours_pointes_commune'] > 0:
            personnel = q(masse * c['jours_pointes'] / s['jours_pointes_commune'])
        elif s['effectif'] > 0:
            personnel = q(masse * c['equipiers'] / s['effectif'])
        else:
            personnel = None
        redevance = (q(sum((Decimal(kg) / 1000 * Decimal(str(s['taux_redevance'])) for kg in c['pesees_kg']), Decimal(0)))
                     if c['pesees_kg'] else None)
        manque = [m for m, absent in (
            ('personnel', personnel is None), ('engin', u is None),
            ('carburant', u is not None and ventile['carburant_tnd'] is None),
            ('entretien', u is not None and ventile['entretien_tnd'] is None),
            ('amortissement', u is not None and ventile['amortissement_tnd'] is None),
            ('redevance', redevance is None)) if absent]
        total = (personnel + ventile['carburant_tnd'] + ventile['entretien_tnd'] + ventile['amortissement_tnd'] + redevance
                 if not manque else None)
        pese = q(sum((Decimal(kg) for kg in c['pesees_kg']), Decimal(0)) / 1000)
        tout_pese = c['voyages_attendus'] > 0 and len(c['pesees_kg']) == c['voyages_attendus']
        res['circuits'][c['nom']] = {
            'personnel_tnd': f(personnel), 'redevance_tnd': f(redevance),
            **{k: f(v) for k, v in ventile.items()},
            'carburant_provenance': u['carburant_provenance'] if ventile['carburant_tnd'] is not None else None,
            'entretien_provenance': u['entretien_provenance'] if ventile['entretien_tnd'] is not None else None,
            'amortissement_provenance': u['amortissement_provenance'] if ventile['amortissement_tnd'] is not None else None,
            'total_tnd': f(total),
            'cout_tonne': f(total / pese) if total is not None and tout_pese and pese > 0 else None,
            'cle_engin': cle, 'manque': manque,
        }
    return res


if __name__ == '__main__':
    print(json.dumps(attendus(json.load(open(sys.argv[1], encoding='utf-8'))), ensure_ascii=False, sort_keys=True))
