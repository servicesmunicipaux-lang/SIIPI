// L'inscription d'un établissement, et la modification de sa fiche (jalon G,
// lot G2a). Le même formulaire pour le catalogue « + Ajouter » et pour l'écran
// « Établissements » : un seul endroit où les règles se disent.
//
// LA RÈGLE SE DIT AVANT LE REFUS. La catégorie se choisit dans la liste
// nationale du jour, l'unité d'échelle parmi celles qu'elle admet, le matricule
// se montre normalisé tel que la base le gardera, la position se donne entière
// (latitude, longitude, précision) et en Tunisie. Ce que l'écran laisse passer,
// l'API le refuse de toute façon, et la base aussi.
//
// UN DOUBLON PROBABLE EST MONTRÉ, JAMAIS FUSIONNÉ. Après l'enregistrement, la
// réponse nomme les établissements de même raison sociale ou à moins de 5 m :
// le formulaire les montre avant de se fermer, et la commune décide (fermer
// l'un pour doublon, ou garder les deux).

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  api,
  ErreurApi,
  type ElementListeAssimiles,
  type Etablissement,
  type EtablissementEnregistre,
  type SaisieEtablissement,
} from '../../lib/api';
import { Chargement, Erreur } from '../Elements';
import { CadreAjout, champAjout } from './CadreAjout';

type Unite = NonNullable<SaisieEtablissement['uniteEchelle']>;

// Le jour à Tunis : la catégorie se vérifie en vigueur ce jour-là.
export const aujourdhui = () => new Date(Date.now() + 3_600_000).toISOString().slice(0, 10);

/** Le matricule tel que la base le gardera (majuscules, sans espace ni barre). */
const normaliserMatricule = (m: string) => m.toUpperCase().replace(/[\s./\\-]/g, '');
const MATRICULE_VALIDE = /^[0-9]{7}[A-Z]([A-Z]{2}[0-9]{3})?$/;

/** Un nombre saisi : null quand la case est vide, NaN quand elle n'est pas un nombre. */
function lireNombre(v: string): number | null {
  const s = v.trim().replace(',', '.');
  return s === '' ? null : Number(s);
}

export function categoriesDuJour(elements: ElementListeAssimiles[], jour: string) {
  return elements.filter((e) => !e.retire_le && e.date_effet && e.date_effet <= jour && (!e.date_fin || e.date_fin > jour));
}

export function FormulaireEtablissement({
  communeId,
  etablissement,
  onFait,
  onAnnuler,
}: {
  communeId: string;
  /** Un établissement à modifier ; absent, le formulaire en inscrit un. */
  etablissement?: Etablissement;
  onFait: (enregistre?: EtablissementEnregistre) => void | Promise<void>;
  onAnnuler?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const arabe = i18n.language.startsWith('ar');
  const e = etablissement;
  const [categories, setCategories] = useState<ElementListeAssimiles[] | null>(null);
  const [listeIndisponible, setListeIndisponible] = useState(false);
  const [essai, setEssai] = useState(0);
  const [secteurs, setSecteurs] = useState<{ id: string; name: string }[]>([]);
  const [nom, setNom] = useState(e?.nom ?? '');
  const [nature, setNature] = useState<'commerce' | 'institution'>(e?.categorie ?? 'commerce');
  const [categorie, setCategorie] = useState(e?.categorie_activite ?? '');
  const [activite, setActivite] = useState(e?.activite ?? '');
  const [matricule, setMatricule] = useState(e?.matricule_fiscal ?? '');
  const [adresse, setAdresse] = useState(e?.adresse ?? '');
  const [secteur, setSecteur] = useState(e?.zone_id ?? '');
  const [unite, setUnite] = useState<Unite | ''>((e?.unite_echelle as Unite | null) ?? '');
  const [valeur, setValeur] = useState(e?.valeur_echelle != null ? String(e.valeur_echelle) : '');
  const [surface, setSurface] = useState(e?.surface_m2 != null ? String(e.surface_m2) : '');
  const [latitude, setLatitude] = useState(e?.latitude != null ? String(e.latitude) : '');
  const [longitude, setLongitude] = useState(e?.longitude != null ? String(e.longitude) : '');
  const [precision, setPrecision] = useState(e?.precision_m != null ? String(e.precision_m) : '');
  const [dangereux, setDangereux] = useState(e?.produit_dangereux ?? false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [enregistre, setEnregistre] = useState<EtablissementEnregistre | null>(null);

  // Une liste qui n'a pas pu se lire n'est pas une liste vide : la confondre
  // dirait « pas en vigueur aujourd'hui » d'une catégorie que la FNCT n'a pas
  // touchée, et bloquerait l'enregistrement sans dire pourquoi.
  useEffect(() => {
    setListeIndisponible(false);
    api
      .listesAssimiles()
      .then((l) => setCategories(categoriesDuJour(l.listes.find((x) => x.liste === 'categories_activite_assimiles')?.elements ?? [], aujourdhui())))
      .catch(() => setListeIndisponible(true));
    api
      .zones(communeId)
      .then((z) => setSecteurs(z.map((x: { id: string; name: string }) => ({ id: x.id, name: x.name }))))
      .catch(() => setSecteurs([]));
  }, [communeId, essai]);

  const categorieChoisie = useMemo(() => categories?.find((c) => c.code === categorie) ?? null, [categories, categorie]);
  // Une catégorie fermée depuis l'inscription n'est plus dans la liste du jour.
  // Gardée telle quelle, elle reste celle de l'établissement (la base ne la
  // relit pas) : on corrige une adresse sans reclasser. Son unité se garde ou se
  // retire ; une autre unité, ou une autre catégorie, se prend dans la liste du jour.
  const codeInitial = e?.categorie_activite ?? null;
  const horsListe = categorie !== '' && categories !== null && !categorieChoisie;
  const categorieGardee = horsListe && categorie === codeInitial;
  const uniteInitiale = (e?.unite_echelle as Unite | null) ?? null;
  const unitesPermises = (
    categorieChoisie?.unites_echelle ?? (categorieGardee && uniteInitiale ? [uniteInitiale] : [])
  ) as Unite[];

  const problemes: string[] = [];
  const cle = (s: string) => `ajout.etablissement.problemes.${s}`;
  if (!nom.trim()) problemes.push(t(cle('nom')));
  if (!categorie || (horsListe && !categorieGardee)) problemes.push(t(cle('categorie')));
  if (matricule.trim() && !MATRICULE_VALIDE.test(normaliserMatricule(matricule))) problemes.push(t(cle('matricule')));
  const nValeur = lireNombre(valeur);
  if (Boolean(unite) !== (nValeur !== null)) problemes.push(t(cle('echelle')));
  if (nValeur !== null && !(Number.isFinite(nValeur) && nValeur > 0)) problemes.push(t(cle('echelle')));
  if (unite && (categorieChoisie || categorieGardee) && !unitesPermises.includes(unite)) problemes.push(t(cle('unite')));
  const nSurface = lireNombre(surface);
  if (nSurface !== null && !(Number.isFinite(nSurface) && nSurface > 0)) problemes.push(t(cle('surface')));
  const [lat, lng, prec] = [lireNombre(latitude), lireNombre(longitude), lireNombre(precision)];
  const positionDonnee = [lat, lng, prec].filter((x) => x !== null).length;
  if (positionDonnee > 0 && positionDonnee < 3) problemes.push(t(cle('positionEntiere')));
  if (positionDonnee === 3) {
    if (!(Number.isFinite(lat!) && Number.isFinite(lng!) && lat! >= 30.2 && lat! <= 37.6 && lng! >= 7.5 && lng! <= 11.7)) {
      problemes.push(t(cle('positionTunisie')));
    }
    if (!(Number.isFinite(prec!) && prec! > 0 && prec! <= 1000)) problemes.push(t(cle('precision')));
  }

  const enregistrer = async () => {
    setEnvoi(true);
    setErreur(null);
    const saisie: SaisieEtablissement = {
      nom: nom.trim(),
      categorie: nature,
      categorieActivite: categorie,
      activite: activite.trim() || null,
      matriculeFiscal: matricule.trim() ? matricule.trim() : null,
      adresse: adresse.trim() || null,
      zoneId: secteur || null,
      latitude: positionDonnee === 3 ? lat : null,
      longitude: positionDonnee === 3 ? lng : null,
      precisionM: positionDonnee === 3 ? prec : null,
      uniteEchelle: unite || null,
      valeurEchelle: unite ? nValeur : null,
      surfaceM2: nSurface,
      produitDangereux: dangereux,
    };
    try {
      const r = e ? await api.modifierEtablissement(e.id, saisie) : await api.creerEtablissement(communeId, saisie);
      // Les doublons probables se montrent avant de fermer : la commune décide.
      if (r.doublons_probables.length > 0) setEnregistre(r);
      else await onFait(r);
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    } finally {
      setEnvoi(false);
    }
  };

  if (enregistre) {
    return (
      <div role="status" className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
        <p className="font-medium">{t('ajout.etablissement.doublons.titre', { nom: enregistre.nom })}</p>
        <p>{t('ajout.etablissement.doublons.aide')}</p>
        <ul className="list-disc space-y-1 ps-5">
          {enregistre.doublons_probables.map((d) => (
            <li key={d.id}>
              {d.nom} —{' '}
              {d.meme_nom
                ? t('ajout.etablissement.doublons.memeNom')
                : t('ajout.etablissement.doublons.proche', { distance: d.distance_m?.toLocaleString(i18n.language) })}
              {d.statut !== 'actif' && ` (${t(`ajout.etablissement.statuts.${d.statut}`)})`}
            </li>
          ))}
        </ul>
        <button type="button" onClick={() => void onFait(enregistre)} className="min-h-11 rounded-lg bg-siipi-600 px-4 text-sm font-medium text-white">
          {t('ajout.etablissement.doublons.compris')}
        </button>
      </div>
    );
  }
  if (listeIndisponible) {
    return <Erreur message={t('ajout.etablissement.listeIndisponible')} onReessayer={() => setEssai((n) => n + 1)} />;
  }
  if (!categories) return <Chargement />;

  const libelle = (c: ElementListeAssimiles) => (arabe ? c.libelle_ar : c.libelle_fr);
  return (
    <CadreAjout
      id={e ? `etablissement-${e.id}` : 'etablissement-nouveau'}
      titre={t(e ? 'ajout.etablissement.titreModification' : 'ajout.etablissement.titre')}
      aide={t('ajout.etablissement.aide')}
      erreur={erreur}
      enregistrable={problemes.length === 0}
      envoi={envoi}
      onEnregistrer={enregistrer}
      onAnnuler={onAnnuler}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm sm:col-span-2">
          {t('ajout.etablissement.nom')}
          <input value={nom} onChange={(ev) => setNom(ev.target.value)} maxLength={200} className={champAjout} />
        </label>
        <label className="text-sm">
          {t('ajout.etablissement.categorie')}
          <select value={categorie} onChange={(ev) => { setCategorie(ev.target.value); setUnite(''); setValeur(''); }} className={champAjout} aria-invalid={horsListe || undefined}>
            <option value="">{t('ajout.etablissement.choisir')}</option>
            {horsListe && <option value={categorie}>{t('ajout.etablissement.horsListe', { code: categorie })}</option>}
            {categories.map((c) => (
              <option key={c.id} value={c.code}>{libelle(c)}</option>
            ))}
          </select>
          {categorieGardee && <span className="mt-1 block text-xs text-ardoise-600">{t('ajout.etablissement.categorieGardee')}</span>}
        </label>
        <label className="text-sm">
          {t('ajout.etablissement.nature')}
          <select value={nature} onChange={(ev) => setNature(ev.target.value as 'commerce' | 'institution')} className={champAjout}>
            <option value="commerce">{t('ajout.etablissement.natures.commerce')}</option>
            <option value="institution">{t('ajout.etablissement.natures.institution')}</option>
          </select>
        </label>
        <label className="text-sm">
          {t('ajout.etablissement.activite')}
          <input value={activite} onChange={(ev) => setActivite(ev.target.value)} maxLength={200} className={champAjout} />
        </label>
        <label className="text-sm">
          {t('ajout.etablissement.matricule')}
          <input value={matricule} onChange={(ev) => setMatricule(ev.target.value)} maxLength={40} dir="ltr" placeholder="1234567A/A/M/000" className={champAjout} />
          {matricule.trim() && (
            <span className="mt-1 block text-xs text-ardoise-600" dir="ltr">
              {MATRICULE_VALIDE.test(normaliserMatricule(matricule))
                ? t('ajout.etablissement.matriculeNormalise', { matricule: normaliserMatricule(matricule) })
                : t('ajout.etablissement.matriculeFormat')}
            </span>
          )}
        </label>
        <label className="text-sm sm:col-span-2">
          {t('ajout.etablissement.adresse')}
          <input value={adresse} onChange={(ev) => setAdresse(ev.target.value)} maxLength={300} className={champAjout} />
        </label>
        <label className="text-sm">
          {t('ajout.etablissement.secteur')}
          <select value={secteur} onChange={(ev) => setSecteur(ev.target.value)} className={champAjout}>
            <option value="">{t('ajout.etablissement.aucunSecteur')}</option>
            {secteurs.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          {t('ajout.etablissement.surface')}
          <input value={surface} onChange={(ev) => setSurface(ev.target.value)} inputMode="decimal" className={`${champAjout} text-end`} />
        </label>
        <label className="text-sm">
          {t('ajout.etablissement.unite')}
          <select value={unite} onChange={(ev) => { setUnite(ev.target.value as Unite | ''); if (!ev.target.value) setValeur(''); }} disabled={!categorieChoisie && !categorieGardee} className={`${champAjout} disabled:bg-ardoise-100`}>
            <option value="">{t('ajout.etablissement.aucuneUnite')}</option>
            {unitesPermises.map((u) => (
              <option key={u} value={u}>{t(`national.parametres.assimiles.unites.${u}`)}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          {t('ajout.etablissement.valeur')}
          <input value={valeur} onChange={(ev) => setValeur(ev.target.value)} inputMode="decimal" disabled={!unite} className={`${champAjout} text-end disabled:bg-ardoise-100`} />
        </label>
        <fieldset className="grid gap-3 text-sm sm:col-span-2 sm:grid-cols-3">
          <legend className="mb-1 text-sm">{t('ajout.etablissement.position')}</legend>
          <label>
            {t('ajout.etablissement.latitude')}
            <input value={latitude} onChange={(ev) => setLatitude(ev.target.value)} inputMode="decimal" dir="ltr" className={champAjout} />
          </label>
          <label>
            {t('ajout.etablissement.longitude')}
            <input value={longitude} onChange={(ev) => setLongitude(ev.target.value)} inputMode="decimal" dir="ltr" className={champAjout} />
          </label>
          <label>
            {t('ajout.etablissement.precision')}
            <input value={precision} onChange={(ev) => setPrecision(ev.target.value)} inputMode="decimal" dir="ltr" className={champAjout} />
          </label>
          <p className="text-xs text-ardoise-600 sm:col-span-3">{t('ajout.etablissement.positionAide')}</p>
        </fieldset>
        <label className="flex min-h-11 items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" checked={dangereux} onChange={(ev) => setDangereux(ev.target.checked)} className="h-5 w-5 shrink-0" />
          {t('ajout.etablissement.dangereux')}
        </label>
      </div>
      {problemes.length > 0 && (
        <div className="rounded-lg bg-ardoise-50 p-3 text-sm text-ardoise-700">
          <p>{t('ajout.etablissement.pourEnregistrer')}</p>
          <ul className="list-disc ps-5">
            {[...new Set(problemes)].map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}
    </CadreAjout>
  );
}
