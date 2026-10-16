"""Les fichiers d'essai de la campagne `import-geo` (C2.2), et ce qu'on doit en lire.

Écrit, octet par octet et sans bibliothèque SIG, des Shapefiles (.shp, .shx, .dbf,
.prj, .cpg) mis en zip, des KML, un KMZ et des GeoJSON ; les coordonnées projetées
(UTM 32N, Web Mercator) sont calculées ici par les formules du manuel (Snyder,
« Map Projections — A Working Manual », 1987), sans rien lire du code testé.

  python3 fichiers_geo.py <dossier>

écrit, pour chaque cas, <cas>.json (le corps de la requête) et attendus.json.
"""
import base64
import io
import json
import math
import struct
import sys
import zipfile

# Les sommets, en degrés : un carré autour de Dar Chaâbane, et un trou dedans.
EXTERIEUR = [(10.70, 36.46), (10.70, 36.50), (10.76, 36.50), (10.76, 36.46), (10.70, 36.46)]  # horaire
TROU = [(10.72, 36.47), (10.74, 36.47), (10.74, 36.49), (10.72, 36.49), (10.72, 36.47)]        # antihoraire
SECOND = [(10.80, 36.46), (10.80, 36.48), (10.82, 36.48), (10.82, 36.46), (10.80, 36.46)]       # horaire


# --- Projections (Snyder) --------------------------------------------------------

def utm32n(lon, lat):
    a, f, k0 = 6378137.0, 1 / 298.257223563, 0.9996
    e2 = f * (2 - f)
    ep2 = e2 / (1 - e2)
    phi, lam, lam0 = math.radians(lat), math.radians(lon), math.radians(9)
    n = a / math.sqrt(1 - e2 * math.sin(phi) ** 2)
    t = math.tan(phi) ** 2
    c = ep2 * math.cos(phi) ** 2
    aa = (lam - lam0) * math.cos(phi)
    m = a * ((1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256) * phi
             - (3 * e2 / 8 + 3 * e2 ** 2 / 32 + 45 * e2 ** 3 / 1024) * math.sin(2 * phi)
             + (15 * e2 ** 2 / 256 + 45 * e2 ** 3 / 1024) * math.sin(4 * phi)
             - (35 * e2 ** 3 / 3072) * math.sin(6 * phi))
    x = 500000 + k0 * n * (aa + (1 - t + c) * aa ** 3 / 6 + (5 - 18 * t + t ** 2 + 72 * c - 58 * ep2) * aa ** 5 / 120)
    y = k0 * (m + n * math.tan(phi) * (aa ** 2 / 2 + (5 - t + 9 * c + 4 * c ** 2) * aa ** 4 / 24
                                       + (61 - 58 * t + t ** 2 + 600 * c - 330 * ep2) * aa ** 6 / 720))
    return x, y


def mercator(lon, lat):
    r = 6378137.0
    return r * math.radians(lon), r * math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))


# --- Shapefile -------------------------------------------------------------------

def shapefile(base, enregistrements, champs, valeurs, prj=None, cpg=None, encodage='utf-8', type_forme=5):
    """enregistrements : liste de listes d'anneaux [(x, y), …] (polygones) ou de points [(x, y)]."""
    corps, index, decalage = [], [], 100
    for k, parts in enumerate(enregistrements, 1):
        if type_forme == 1:
            contenu = struct.pack('<i2d', 1, *parts[0])
        else:
            pts = [p for r in parts for p in r]
            xs, ys = [p[0] for p in pts], [p[1] for p in pts]
            debuts, n = [], 0
            for r in parts:
                debuts.append(n)
                n += len(r)
            contenu = struct.pack('<i4d2i', type_forme, min(xs), min(ys), max(xs), max(ys), len(parts), len(pts))
            contenu += struct.pack(f'<{len(parts)}i', *debuts) + b''.join(struct.pack('<2d', *p) for p in pts)
        corps.append(struct.pack('>2i', k, len(contenu) // 2) + contenu)
        index.append(struct.pack('>2i', decalage // 2, len(contenu) // 2))
        decalage += 8 + len(contenu)
    tous = [p for parts in enregistrements for r in parts for p in (r if type_forme != 1 else [r])] if type_forme != 1 else [e[0] for e in enregistrements]
    bbox = (min(p[0] for p in tous), min(p[1] for p in tous), max(p[0] for p in tous), max(p[1] for p in tous))

    def entete(longueur):
        return struct.pack('>7i', 9994, 0, 0, 0, 0, 0, longueur // 2) + struct.pack('<2i', 1000, type_forme) + struct.pack('<8d', *bbox, 0, 0, 0, 0)

    shp = b''.join(corps)
    shx = b''.join(index)
    fichiers = {f'{base}.shp': entete(100 + len(shp)) + shp, f'{base}.shx': entete(100 + len(shx)) + shx}

    # .dbf (dBase III) : un champ C, N ou D par colonne.
    descr = b''
    taille_ligne = 1
    for nom, typ, longueur in champs:
        descr += nom.encode('ascii').ljust(11, b'\0') + typ.encode() + b'\0' * 4 + bytes([longueur, 0]) + b'\0' * 14
        taille_ligne += longueur
    lignes = b''
    for v in valeurs:
        ligne = b' '
        for (nom, typ, longueur), x in zip(champs, v):
            octets = ('' if x is None else str(x)).encode(encodage)
            ligne += octets.rjust(longueur, b' ') if typ == 'N' else octets.ljust(longueur, b' ')
        lignes += ligne
    longueur_entete = 32 + len(descr) + 1
    fichiers[f'{base}.dbf'] = struct.pack('<B3BIHH20x', 3, 126, 10, 16, len(valeurs), longueur_entete, taille_ligne) + descr + b'\r' + lignes + b'\x1a'
    if prj is not None:
        fichiers[f'{base}.prj'] = prj.encode()
    if cpg is not None:
        fichiers[f'{base}.cpg'] = cpg.encode()
    return fichiers


class SansRetour(io.RawIOBase):
    """Un flux qu'on ne peut pas relire : zipfile y écrit des descripteurs de données."""
    def __init__(self):
        self.tampon = io.BytesIO()
    def writable(self):
        return True
    def write(self, b):
        return self.tampon.write(b)


def zipper(fichiers, flux=False):
    if flux:
        s = SansRetour()
        with zipfile.ZipFile(s, 'w', zipfile.ZIP_DEFLATED) as z:
            for nom, octets in fichiers.items():
                with z.open(nom, 'w') as f:
                    f.write(octets)
        return s.tampon.getvalue()
    b = io.BytesIO()
    with zipfile.ZipFile(b, 'w', zipfile.ZIP_DEFLATED) as z:
        for nom, octets in fichiers.items():
            z.writestr(nom, octets)
    return b.getvalue()


PRJ_WGS84 = 'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]'
PRJ_UTM = ('PROJCS["WGS_1984_UTM_Zone_32N",GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],'
           'PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",500000.0],'
           'PARAMETER["False_Northing",0.0],PARAMETER["Central_Meridian",9.0],PARAMETER["Scale_Factor",0.9996],PARAMETER["Latitude_Of_Origin",0.0],UNIT["Meter",1.0]]')
PRJ_CARTHAGE = ('PROJCS["Carthage_UTM_Zone_32N",GEOGCS["GCS_Carthage",DATUM["D_Carthage",SPHEROID["Clarke_1880_IGN",6378249.2,293.4660212936269]],'
                'PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",500000.0],'
                'PARAMETER["False_Northing",0.0],PARAMETER["Central_Meridian",9.0],PARAMETER["Scale_Factor",0.9996],PARAMETER["Latitude_Of_Origin",0.0],UNIT["Meter",1.0]]')
PRJ_MERCATOR = ('PROJCS["WGS_1984_Web_Mercator_Auxiliary_Sphere",GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],'
                'PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Mercator_Auxiliary_Sphere"],PARAMETER["False_Easting",0.0],'
                'PARAMETER["False_Northing",0.0],PARAMETER["Central_Meridian",0.0],PARAMETER["Standard_Parallel_1",0.0],PARAMETER["Auxiliary_Sphere_Type",0.0],UNIT["Meter",1.0]]')
PRJ_LAMBERT93 = 'PROJCS["RGF93_Lambert_93",GEOGCS["GCS_RGF_1993",DATUM["D_RGF_1993",SPHEROID["GRS_1980",6378137.0,298.257222101]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Lambert_Conformal_Conic"],UNIT["Meter",1.0]]'

CHAMPS = [('NOM', 'C', 40), ('CODE', 'N', 6), ('RELEVE', 'D', 8)]
NOM_AR = 'قطاع الشاطئ'
projeter = lambda f, anneaux: [[f(*p) for p in r] for r in anneaux]


def cas():
    c, a = {}, {}
    poly = [EXTERIEUR, TROU]
    # A. WGS 84, un trou, attributs UTF-8 (arabe compris) ; zip écrit en flux (descripteurs de données).
    c['wgs84'] = ('secteurs.zip', zipper(shapefile('secteurs', [poly], CHAMPS, [[NOM_AR, 12, '20260915']], PRJ_WGS84, 'UTF-8'), flux=True))
    a['wgs84'] = {'srid': 4326, 'anneaux': poly, 'nom': NOM_AR, 'code': 12, 'releve': '2026-09-15'}
    # B. UTM 32N.
    c['utm'] = ('utm.zip', zipper(shapefile('perimetre', [projeter(utm32n, poly)], CHAMPS, [['Perimetre', 1, None]], PRJ_UTM)))
    a['utm'] = {'srid': 32632, 'anneaux': poly}
    # C. Web Mercator.
    c['mercator'] = ('mercator.zip', zipper(shapefile('perimetre', [projeter(mercator, poly)], CHAMPS, [['Perimetre', 1, None]], PRJ_MERCATOR)))
    a['mercator'] = {'srid': 3857, 'anneaux': poly}
    # D. Deux contours extérieurs dans un même enregistrement : un MultiPolygon.
    c['multi'] = ('multi.zip', zipper(shapefile('multi', [[EXTERIEUR, SECOND]], CHAMPS, [['Deux parties', 2, None]], PRJ_WGS84)))
    a['multi'] = {'parties': 2}
    # E. Arabe en Windows-1256, avec son .cpg.
    c['cp1256'] = ('cp1256.zip', zipper(shapefile('s', [poly], CHAMPS, [[NOM_AR, 3, None]], PRJ_WGS84, '1256', 'cp1256')))
    a['cp1256'] = {'nom': NOM_AR}
    # F. Le même, sans .cpg : lu en Windows-1252, et dit.
    c['sans_cpg'] = ('sanscpg.zip', zipper(shapefile('s', [poly], CHAMPS, [[NOM_AR, 3, None]], PRJ_WGS84, None, 'cp1256')))
    # G. Un système inconnu (Lambert 93).
    c['lambert93'] = ('l93.zip', zipper(shapefile('s', [poly], CHAMPS, [['x', 1, None]], PRJ_LAMBERT93)))
    # H. Sans .prj : des degrés en Tunisie (acceptés, dit) ; des mètres (refusés).
    c['sans_prj_degres'] = ('sp.zip', zipper(shapefile('s', [poly], CHAMPS, [['x', 1, None]])))
    c['sans_prj_metres'] = ('spm.zip', zipper(shapefile('s', [projeter(utm32n, poly)], CHAMPS, [['x', 1, None]])))
    # I. Archives incomplètes ou fausses.
    sans_dbf = shapefile('s', [poly], CHAMPS, [['x', 1, None]], PRJ_WGS84)
    del sans_dbf['s.dbf']
    c['sans_dbf'] = ('sansdbf.zip', zipper(sans_dbf))
    c['zip_vide'] = ('vide.zip', zipper({'lisez-moi.txt': b'rien'}))
    c['shp_seul'] = ('secteurs.shp', shapefile('s', [poly], CHAMPS, [['x', 1, None]])['s.shp'])
    c['charabia'] = ('notes.txt', b'ceci n est pas un fichier de limites')
    # La bombe : une entrée qui annonce 100 octets et en déplie un million.
    b = bytearray(zipper({'bombe.shp': b'\0' * 1_000_000}))
    rc = b.rfind(b'PK\x01\x02')
    struct.pack_into('<I', b, rc + 24, 100)
    c['bombe'] = ('bombe.zip', bytes(b))
    # J. Carthage / UTM 32N : reconnu, et reprojeté avec son changement de datum.
    c['carthage'] = ('carthage.zip', zipper(shapefile('s', [projeter(utm32n, poly)], CHAMPS, [['x', 1, None]], PRJ_CARTHAGE)))
    a['carthage'] = {'srid': 22332, 'anneaux': poly}
    # K. KML et KMZ : un polygone troué, un nom, un attribut.
    fmt = lambda r: ' '.join(f'{x},{y},0' for x, y in r)
    kml = (f'<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark><name>{NOM_AR}</name>'
           f'<ExtendedData><Data name="code"><value>7</value></Data></ExtendedData><Polygon><outerBoundaryIs><LinearRing><coordinates>{fmt(EXTERIEUR)}'
           f'</coordinates></LinearRing></outerBoundaryIs><innerBoundaryIs><LinearRing><coordinates>{fmt(TROU)}</coordinates></LinearRing>'
           '</innerBoundaryIs></Polygon></Placemark></Document></kml>').encode()
    c['kml'] = ('secteur.kml', kml)
    c['kmz'] = ('secteur.kmz', zipper({'doc.kml': kml}))
    a['kml'] = {'srid': 4326, 'anneaux': poly, 'nom': NOM_AR, 'code': '7'}
    # L. GeoJSON : avec le membre « crs » d'UTM (reprojeté), d'un système inconnu (refusé), en mètres sans crs (refusé).
    gj = lambda crs, anneaux: json.dumps({'type': 'FeatureCollection', **({'crs': {'type': 'name', 'properties': {'name': crs}}} if crs else {}),
                                          'features': [{'type': 'Feature', 'properties': {'nom': 'x'}, 'geometry': {'type': 'Polygon', 'coordinates': anneaux}}]}).encode()
    c['geojson_utm'] = ('utm.geojson', gj('urn:ogc:def:crs:EPSG::32632', projeter(utm32n, poly)))
    a['geojson_utm'] = {'srid': 32632, 'anneaux': poly}
    c['geojson_2154'] = ('l93.geojson', gj('urn:ogc:def:crs:EPSG::2154', projeter(utm32n, poly)))
    c['geojson_metres'] = ('m.geojson', gj(None, projeter(utm32n, poly)))
    return c, a


if __name__ == '__main__':
    dossier = sys.argv[1]
    c, a = cas()
    for cle, (nom, octets) in c.items():
        with open(f'{dossier}/{cle}.json', 'w') as f:
            json.dump({'nomFichier': nom, 'contenu': base64.b64encode(octets).decode()}, f)
    with open(f'{dossier}/attendus.json', 'w', encoding='utf-8') as f:
        json.dump(a, f, ensure_ascii=False)
    print(len(c))
