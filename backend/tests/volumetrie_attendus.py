#!/usr/bin/env python3
"""Valeurs attendues du moteur volumétrique (lot 17.2).

Script INDÉPENDANT : il ne lit que le scénario JSON donné en argument (ce que la
campagne `volumetrie` a bâti) et la méthode décidée le 25/10/2026. Il ne lit
jamais le code testé (app.tonnage_estime, migration 088) : c'est ce qui en fait un
témoin.

La méthode :
  - un voyage est attendu un jour de passage du circuit (jour ISO 1 = lundi), pour
    chacun de ses voyages du jour, à partir de sa date de début, jusqu'à la fin du
    mois ou aujourd'hui ;
  - un voyage qui a une pesée est pesé, et ne s'estime pas ;
  - un voyage non pesé s'estime : volume de la benne × densité du jour, en
    fourchette (benne pleine) ;
  - la matrice du 25/10/2026 (flux DMA) : benne tasseuse 0,35 de 7 à 8 m³ inclus,
    0,5 au-delà de 8 m³, rien sous 7 m³ ; tracteur et remorque compactrice 0,3 ;
    benne basculante, tracteur et remorque agricole, pick-up et ampli-roll (non
    compactants, décision du 26/10/2026) 0,20 – 0,25. Une révision du scénario
    (equipement, min, max, date d'effet) remplace la valeur à partir de sa date ;
  - pour un tracteur, la benne est sa remorque attelée, s'il y en a exactement une ;
  - ce qui manque, dans cet ordre : flux non renseigné ; flux autre que ménager ;
    circuit sans engin ; remorque absente ou plusieurs ; classe et/ou volume ;
    aucun voyage attendu ; densité absente pour un voyage à estimer.

    python3 volumetrie_attendus.py scenario.json
"""
import calendar
import datetime as dt
import json
import sys
from decimal import ROUND_HALF_UP, Decimal

MATRICE = {
    # équipement : [(borne basse, incluse ?, borne haute, incluse ?, min, max)] ; None = sans borne
    'benne_tasseuse': [(7, True, 8, True, 0.35, 0.35), (8, False, None, False, 0.5, 0.5)],
    'tracteur_remorque_compactrice': [(None, False, None, False, 0.3, 0.3)],
    'benne_basculante': [(None, False, None, False, 0.20, 0.25)],
    'tracteur_remorque_agricole': [(None, False, None, False, 0.20, 0.25)],
    # Décision du 26/10/2026 : non compactants, la fourchette des non-compactants.
    'pick_up': [(None, False, None, False, 0.20, 0.25)],
    'ampli_roll': [(None, False, None, False, 0.20, 0.25)],
}


def dans(tranche, volume):
    bas, bas_inc, haut, haut_inc = tranche[:4]
    if bas is not None and (volume < bas or (volume == bas and not bas_inc)):
        return False
    if haut is not None and (volume > haut or (volume == haut and not haut_inc)):
        return False
    return True


def densite(classe, volume, jour, revisions):
    tranches = [t for t in MATRICE.get(classe, []) if dans(t, volume)]
    if not tranches:
        return None
    dmin, dmax = tranches[0][4], tranches[0][5]
    for r in sorted(revisions, key=lambda r: r['date_effet']):
        if r['equipement'] == classe and dt.date.fromisoformat(r['date_effet']) <= jour:
            dmin, dmax = r['min'], r['max']
    return dmin, dmax


def benne(engin):
    """(classe, volume, manque) de la benne qui travaille."""
    if engin is None:
        return None, None, 'circuit_sans_engin'
    if engin['type'] == 'tracteur':
        remorques = engin.get('remorques', [])
        if len(remorques) == 0:
            return None, None, 'remorque_absente'
        if len(remorques) > 1:
            return None, None, 'remorques_multiples'
        engin = remorques[0]
    classe, volume = engin.get('classe'), engin.get('volume')
    if classe is None and volume is None:
        return None, None, 'classe_et_volume'
    if classe is None:
        return None, None, 'classe'
    if volume is None:
        return None, None, 'volume'
    return classe, volume, None


def attendus(scenario):
    an, mois = map(int, scenario['mois'].split('-'))
    debut = dt.date(an, mois, 1)
    fin = min(dt.date(an, mois, calendar.monthrange(an, mois)[1]), dt.date.fromisoformat(scenario['aujourdhui']))
    revisions = scenario.get('revisions', [])
    pesees = {(p['circuit'], p['date'], p['voyage']) for p in scenario['pesees']}
    resultat = {}
    for c in scenario['circuits']:
        jours = []
        j = debut
        while j <= fin:
            if j.isoweekday() in c['jours'] and j >= dt.date.fromisoformat(c['date_debut']):
                jours.append(j)
            j += dt.timedelta(days=1)
        voyages = [(j, v) for j in jours for v in range(1, c['voyages'] + 1)]
        peses = [x for x in voyages if (c['nom'], x[0].isoformat(), x[1]) in pesees]
        a_estimer = [x for x in voyages if (c['nom'], x[0].isoformat(), x[1]) not in pesees]
        classe, volume, manque = benne(c.get('engin'))
        if c['type_dechet'] is None:
            manque = 'flux_non_renseigne'
        elif c['type_dechet'] != 'menager':
            manque = 'flux_sans_densite'
        tmin = tmax = None
        if manque is None and not voyages:
            manque = 'aucun_voyage_attendu'
        if manque is None and a_estimer:
            densites = [densite(classe, volume, j, revisions) for j, _ in a_estimer]
            if any(d is None for d in densites):
                manque = 'densite_absente'
            else:
                # En décimal, arrondi au plus proche, moitié vers le haut : 23,625 t donne
                # 23,63 t, pas les 23,62 qu'un flottant rendrait.
                v = Decimal(str(volume))
                tmin = float(sum(v * Decimal(str(d[0])) for d in densites).quantize(Decimal('0.01'), ROUND_HALF_UP))
                tmax = float(sum(v * Decimal(str(d[1])) for d in densites).quantize(Decimal('0.01'), ROUND_HALF_UP))
        pese = [p['kg'] for p in scenario['pesees'] if p['circuit'] == c['nom']]
        resultat[c['nom']] = {
            'voyages_attendus': len(voyages),
            'voyages_peses': len(peses),
            'voyages_estimes': len(a_estimer),
            'tonnage_min_t': tmin,
            'tonnage_max_t': tmax,
            'tonnage_pese_t': round(sum(pese) / 1000, 3) if pese else None,
            'manque': manque,
        }
    return resultat


if __name__ == '__main__':
    print(json.dumps(attendus(json.load(open(sys.argv[1], encoding='utf-8'))), ensure_ascii=False, sort_keys=True))
