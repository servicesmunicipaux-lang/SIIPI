// Le choix de sa commune par le citoyen (D-FNCT-1, tranchée le 9 octobre 2026).
//
// D'ABORD LA POSITION, PUIS LA CONFIRMATION. À l'ouverture du formulaire,
// quand le citoyen n'a pas encore de commune, on demande sa position et on
// propose la commune qui la contient : « Vous êtes localisé à … Est-ce
// correct ? ». Rien n'est retenu sans son « oui » — la plateforme propose,
// elle ne décide pas. La position ne sert qu'à cette proposition : elle n'est
// pas enregistrée (voir POST /communes/localiser).
//
// À DÉFAUT, DEUX ÉTAPES. Refus, géolocalisation indisponible, position hors de
// toute commune, ou « non » : le gouvernorat, puis la commune. Chaque commune
// s'affiche « Nom (Gouvernorat) » : deux Ennour (Sfax, Kasserine) et deux
// Ezzouhour (Kasserine, Sousse) portent le même nom, et une liste de noms seuls
// faisait choisir la mauvaise au citoyen sans qu'il le sache.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type Commune } from '../lib/api';

type Etape = 'recherche' | 'proposition' | 'manuel';

const champ = 'mt-1 w-full rounded-lg border border-ardoise-300 bg-white px-3 py-2.5 text-base';

export function ChoixCommune({
  communes,
  valeur,
  onChange,
  localiserAuDepart,
}: {
  communes: Commune[];
  valeur: string;
  onChange: (communeId: string) => void;
  /** Vrai quand le citoyen n'a pas encore de commune : on cherche sa position. */
  localiserAuDepart: boolean;
}) {
  const { t, i18n } = useTranslation();
  const arabe = i18n.language === 'ar';
  const [etape, setEtape] = useState<Etape>(
    localiserAuDepart && typeof navigator !== 'undefined' && navigator.geolocation ? 'recherche' : 'manuel'
  );
  const [proposition, setProposition] = useState<Commune | null>(null);
  const [horsCommune, setHorsCommune] = useState(false);
  const [gouvernorat, setGouvernorat] = useState('');
  // La recherche ne part qu'une fois : React rejoue les effets en développement,
  // et deux demandes de position feraient deux invites au citoyen.
  const dejaDemande = useRef(false);

  const nomGouvernorat = (g: string) => t(`gouvernorats.${g}`, { defaultValue: g });
  const libelle = (c: Pick<Commune, 'name' | 'name_ar' | 'gouvernorat'>) =>
    `${arabe ? c.name_ar || c.name : c.name} (${c.gouvernorat ? nomGouvernorat(c.gouvernorat) : '—'})`;

  useEffect(() => {
    if (etape !== 'recherche' || dejaDemande.current) return;
    dejaDemande.current = true;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        api
          .localiserCommune(pos.coords.latitude, pos.coords.longitude)
          .then((r) => {
            if (r.trouvee) {
              setProposition(r.commune);
              setEtape('proposition');
            } else {
              setHorsCommune(true);
              setEtape('manuel');
            }
          })
          .catch(() => setEtape('manuel'));
      },
      // Refus, indisponible ou trop long : on passe au choix, sans reproche.
      () => setEtape('manuel'),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 }
    );
  }, [etape]);

  // Le gouvernorat de la commune déjà retenue, pour qu'un changement d'adresse
  // ne reparte pas de zéro.
  useEffect(() => {
    if (gouvernorat || !valeur) return;
    const c = communes.find((x) => x.id === valeur);
    if (c?.gouvernorat) setGouvernorat(c.gouvernorat);
  }, [valeur, communes, gouvernorat]);

  const gouvernorats = useMemo(
    () =>
      [...new Set(communes.map((c) => c.gouvernorat).filter((g): g is string => Boolean(g)))].sort((a, b) =>
        nomGouvernorat(a).localeCompare(nomGouvernorat(b), arabe ? 'ar' : 'fr')
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [communes, arabe]
  );
  const communesDuGouvernorat = useMemo(
    () =>
      communes
        .filter((c) => c.gouvernorat === gouvernorat)
        .sort((a, b) => (arabe ? a.name_ar || a.name : a.name).localeCompare(arabe ? b.name_ar || b.name : b.name, arabe ? 'ar' : 'fr')),
    [communes, gouvernorat, arabe]
  );

  if (etape === 'recherche') {
    return (
      <p role="status" className="rounded-xl border border-ardoise-200 bg-white p-3 text-sm text-ardoise-600">
        {t('citoyen.adresse.recherche')}
      </p>
    );
  }

  if (etape === 'proposition' && proposition) {
    return (
      <div className="space-y-3 rounded-xl border border-siipi-300 bg-siipi-50 p-3">
        <p className="text-sm text-ardoise-800">
          {t('citoyen.adresse.localiseA', {
            commune: arabe ? proposition.name_ar || proposition.name : proposition.name,
            gouvernorat: proposition.gouvernorat ? nomGouvernorat(proposition.gouvernorat) : '—',
          })}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              onChange(proposition.id);
              setGouvernorat(proposition.gouvernorat ?? '');
              setEtape('manuel');
            }}
            className="flex-1 rounded-lg bg-siipi-600 px-4 py-2.5 text-sm font-semibold text-white"
          >
            {t('citoyen.adresse.oui')}
          </button>
          <button
            type="button"
            onClick={() => {
              // La commune voisine est souvent du même gouvernorat : on le garde.
              onChange('');
              setGouvernorat(proposition.gouvernorat ?? '');
              setEtape('manuel');
            }}
            className="flex-1 rounded-lg border border-ardoise-300 bg-white px-4 py-2.5 text-sm font-medium text-ardoise-700"
          >
            {t('citoyen.adresse.non')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {horsCommune && (
        <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {t('citoyen.adresse.horsCommune')}
        </p>
      )}
      <label className="block">
        <span className="text-sm font-medium text-ardoise-700">{t('citoyen.adresse.gouvernorat')}</span>
        <select
          required
          value={gouvernorat}
          onChange={(e) => {
            setGouvernorat(e.target.value);
            onChange('');
          }}
          className={champ}
        >
          <option value="">{t('citoyen.adresse.choisirGouvernorat')}</option>
          {gouvernorats.map((g) => (
            <option key={g} value={g}>
              {nomGouvernorat(g)}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="text-sm font-medium text-ardoise-700">{t('citoyen.adresse.commune')}</span>
        <select required value={valeur} onChange={(e) => onChange(e.target.value)} disabled={!gouvernorat} className={`${champ} disabled:opacity-50`}>
          <option value="">{t('citoyen.adresse.choisir')}</option>
          {communesDuGouvernorat.map((c) => (
            <option key={c.id} value={c.id}>
              {libelle(c)}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
