"""Les contrôles qu'une campagne saute sans le dire.

    docker compose exec -T api npm test > npm-test.log 2>&1
    python3 scripts/skills/audit-blocs.py backend npm-test.log

POURQUOI. Un contrôle placé sous condition — `if [ -n "$X" ]; then chk …; fi`,
ou `[ -n "$X" ] && chk …` — ne tourne que si la donnée cherchée existe. Sur le
jeu de référence, elle manquait parfois : la campagne imprimait son titre, ne
contrôlait rien, et se comptait réussie. Le 9 octobre 2026, ce silence cachait
la vérification de bout en bout de B5.1.3 (JC-003) et quatre autres contrôles
(JC-004, docs/recette/JOURNAL_DES_CORRECTIONS.md).

COMMENT. Pour chaque contrôle sous condition, l'outil cherche son libellé dans
la section de SA campagne du journal de `npm test` — une base neuve chargée
dans l'ordre de référence (CLAUDE.md § 7). Un libellé absent : le contrôle n'a
pas tourné. Le libellé est pris jusqu'à sa première substitution `$…`, la part
qui s'imprime telle quelle.

Code de sortie : 0 si tous les contrôles sous condition ont tourné, 1 sinon.
"""
import io
import json
import re
import sys

if len(sys.argv) != 3:
    print(__doc__)
    sys.exit(2)
backend, journal = sys.argv[1], sys.argv[2]

chaine = re.findall(r'executer\.sh ([a-z0-9-]+)',
                    json.load(open(f'{backend}/package.json', encoding='utf-8'))['scripts']['test'])
texte = re.sub(r'\x1b\[[0-9;]*m', '', io.open(journal, encoding='utf-8', errors='replace').read())
sections = re.split(r'^\[tests\] base .*$', texte, flags=re.M)[1:]
if len(sections) != len(chaine):
    print(f'Le journal compte {len(sections)} campagnes, la chaîne `test` en enchaîne {len(chaine)} : '
          'il faut le journal complet d\'un `npm test` allé jusqu\'au bout.')
    sys.exit(2)
par_campagne = dict(zip(chaine, sections))


def libelle(ligne):
    m = re.search(r'\bchk\s+"((?:[^"\\]|\\.)*)"', ligne) or re.search(r"\bchk\s+'([^']*)'", ligne)
    return m.group(1) if m else None


def imprime(lib):
    return re.split(r'\$|`', lib)[0].replace('\\"', '"').strip()


manques = 0
blocs = 0
for nom in chaine:
    lignes = io.open(f'{backend}/tests/{nom}.sh', encoding='utf-8').read().split('\n')
    sortie = par_campagne[nom]
    controles = []  # (ligne, condition, branche, libellé)
    i = 0
    while i < len(lignes):
        l = lignes[i]
        # Forme courte : [ … ] && chk "…"
        if re.match(r'^\s*\[.*\]\s*&&\s*chk\b', l):
            controles.append((i + 1, l.strip()[:100], 'si', libelle(l)))
            i += 1
            continue
        m = re.match(r'^( *)if \[(.*)$', l)
        # Le chk() lui-même, le bilan final et les if d'une ligne ne sont pas des blocs.
        if (not m or 'pass=$((pass+1))' in l or '$fail' in l
                or (l.rstrip().endswith('fi') and 'then' in l)):
            i += 1
            continue
        retrait, debut, branche, profondeur, j = m.group(1), i, 'si', 0, i + 1
        while j < len(lignes):
            lj = lignes[j]
            if re.match(r'^\s*if \[', lj) and not lj.rstrip().endswith('fi'):
                profondeur += 1
            elif re.match(r'^\s*fi\b', lj):
                if profondeur == 0 and lj.startswith(retrait + 'fi'):
                    break
                profondeur -= 1
            elif profondeur == 0 and re.match(rf'^{retrait}else\b', lj):
                branche = 'sinon'
            e = libelle(lj)
            if e:
                controles.append((debut + 1, l.strip()[:100], branche, e))
            j += 1
        i = j + 1
    vus = {}
    for ligne, condition, branche, e in controles:
        vus.setdefault((ligne, condition), []).append((branche, e, bool(imprime(e)) and imprime(e) in sortie))
    for (ligne, condition), liste in vus.items():
        blocs += 1
        absents = [x for x in liste if not x[2]]
        if absents:
            manques += len(absents)
            print(f'{nom}.sh:{ligne}  {len(liste) - len(absents)}/{len(liste)} tournés  {condition}')
            for branche, e, _ in absents:
                print(f'      ✗ ({branche}) {e[:100]}')

print(f'\n{blocs} blocs sous condition contenant des contrôles ; '
      + ('tous leurs contrôles ont tourné.' if manques == 0 else f'{manques} contrôle(s) n\'ont pas tourné.'))
sys.exit(1 if manques else 0)
