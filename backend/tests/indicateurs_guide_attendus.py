#!/usr/bin/env python3
"""Valeurs attendues des indicateurs du guide de référence (lot K).

Script INDÉPENDANT : il ne lit que le scénario JSON donné en argument (ce que la
campagne `indicateurs-guide` a bâti) et la méthode décidée le 26/10/2026. Il ne lit
jamais le code testé (migration 089) : c'est ce qui en fait un témoin.

La méthode, pour un mois :
  - produit = kg/hab/j × population × jours du mois (jusqu'à aujourd'hui) ;
  - un voyage est attendu un jour de passage (jour ISO 1 = lundi), pour chacun de
    ses voyages du jour, à partir de la date de début du circuit, en régie ;
  - TAUX_COLLECTE = pesé ménager ÷ produit, seulement si TOUS les voyages attendus
    sont pesés ;
  - TAUX_COLLECTE_ESTIME = (volume × densité × voyages) ÷ produit, en fourchette,
    seulement si AUCUN voyage n'est pesé, chaque circuit ménager estimable, aucun
    circuit ménager confié à un prestataire ;
  - TAUX_REMPLISSAGE = pesé ÷ (volume × densité haute) à pesé ÷ (volume × densité
    basse), sur les voyages pesés d'un engin dont la benne est connue ;
  - TAUX_COUVERTURE = population des secteurs desservis ÷ population, si chaque
    secteur a sa population et qu'au moins un est desservi ;
  - POINTS_NOIRS = points relevés avant la fin du mois et non résorbés à cette date,
    s'il y en a au moins un relevé.
Les pourcentages s'arrondissent au dixième, moitié vers le haut (en décimal).

    python3 indicateurs_guide_attendus.py scenario.json
"""
import calendar
import datetime as dt
import json
import sys
from decimal import ROUND_HALF_UP, Decimal

DENSITES = {
    'benne_tasseuse': lambda v: (Decimal('0.35'), Decimal('0.35')) if 7 <= v <= 8 else (Decimal('0.5'), Decimal('0.5')) if v > 8 else None,
    'tracteur_remorque_agricole': lambda v: (Decimal('0.20'), Decimal('0.25')),
    'benne_basculante': lambda v: (Decimal('0.20'), Decimal('0.25')),
    'pick_up': lambda v: (Decimal('0.20'), Decimal('0.25')),
    'ampli_roll': lambda v: (Decimal('0.20'), Decimal('0.25')),
    'tracteur_remorque_compactrice': lambda v: (Decimal('0.3'), Decimal('0.3')),
}


def pct(x):
    return float((Decimal(100) * x).quantize(Decimal('0.1'), ROUND_HALF_UP))


def densite(engin):
    if not engin or engin.get('classe') not in DENSITES or engin.get('volume') is None:
        return None
    return DENSITES[engin['classe']](Decimal(str(engin['volume'])))


def commune(s, c):
    an, mois = map(int, s['mois'].split('-'))
    debut = dt.date(an, mois, 1)
    fin = min(dt.date(an, mois, calendar.monthrange(an, mois)[1]), dt.date.fromisoformat(s['aujourdhui']))
    jours = (fin - debut).days + 1
    produit = Decimal(str(c['theorique'])) * c['population'] * jours if c.get('theorique') and c.get('population') else None
    pesees = {(p['circuit'], p['date'], p['voyage']): Decimal(p['kg']) for p in c['pesees']}
    pesees_mois = {k: v for k, v in pesees.items() if debut <= dt.date.fromisoformat(k[1]) <= fin}
    attendus, peses = 0, 0
    estimables, est_min, est_max, tous_estimables = 0, Decimal(0), Decimal(0), True
    remp_pese, cap_min, cap_max, remp_voyages = Decimal(0), Decimal(0), Decimal(0), 0
    for ci in c['circuits']:
        regie = not ci.get('prestataire')
        voyages = []
        j = max(debut, dt.date.fromisoformat(ci['date_debut']))
        while j <= fin:
            if j.isoweekday() in ci['jours']:
                voyages += [(j.isoformat(), v) for v in range(1, ci['voyages'] + 1)]
            j += dt.timedelta(days=1)
        if regie:
            attendus += len(voyages)
            peses += sum(1 for (d, v) in voyages if (ci['nom'], d, v) in pesees)
        d = densite(ci.get('engin'))
        if ci['type'] == 'menager' and regie and voyages:
            if d is None or any((ci['nom'], dd, v) in pesees for dd, v in voyages):
                tous_estimables = False
            else:
                vol = Decimal(str(ci['engin']['volume']))
                estimables += 1
                est_min += vol * d[0] * len(voyages)
                est_max += vol * d[1] * len(voyages)
        if ci['type'] == 'menager' and d is not None:
            vol = Decimal(str(ci['engin']['volume']))
            for (nom, date, v), kg in pesees_mois.items():
                if nom == ci['nom']:
                    remp_voyages += 1
                    remp_pese += kg / 1000
                    cap_min += vol * d[0]
                    cap_max += vol * d[1]
    pese_menager = sum(pesees_mois.values(), Decimal(0))
    r = {}
    r['TAUX_COLLECTE'] = pct(pese_menager / produit) if produit and attendus > 0 and peses == attendus and pese_menager > 0 else None
    prestataire_menager = any(ci.get('prestataire') and ci['type'] == 'menager' for ci in c['circuits'])
    if produit and estimables > 0 and tous_estimables and not pese_menager and not prestataire_menager:
        r['TAUX_COLLECTE_ESTIME'] = [pct(est_min * 1000 / produit), pct(est_max * 1000 / produit)]
    else:
        r['TAUX_COLLECTE_ESTIME'] = None
    r['TAUX_REMPLISSAGE'] = [pct(remp_pese / cap_max), pct(remp_pese / cap_min)] if remp_voyages > 0 else None
    zones = c.get('secteurs', [])
    if zones and all(z['population'] > 0 for z in zones) and any(z['desservi'] for z in zones) and c.get('population'):
        r['TAUX_COUVERTURE'] = pct(Decimal(sum(z['population'] for z in zones if z['desservi'])) / c['population'])
    else:
        r['TAUX_COUVERTURE'] = None
    releves = [p for p in c.get('points_noirs', []) if dt.date.fromisoformat(p['releve']) <= fin]
    r['POINTS_NOIRS'] = float(sum(1 for p in releves if not p.get('resorbe') or dt.date.fromisoformat(p['resorbe']) > fin)) if releves else None
    return r


if __name__ == '__main__':
    s = json.load(open(sys.argv[1], encoding='utf-8'))
    print(json.dumps({nom: commune(s, c) for nom, c in s['communes'].items()}, ensure_ascii=False, sort_keys=True))
