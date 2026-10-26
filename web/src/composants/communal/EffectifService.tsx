// L'effectif et la masse salariale du service, pour une année (préparation de R1).
//
// L'API savait les recevoir depuis le module 4 ; aucun écran ne les demandait. « Ma
// commune dans SIIPI » envoyait ici une commune à qui il manquait sa masse salariale,
// et elle n'y trouvait rien où la saisir — le coût de collecte restait « non
// renseigné » sans qu'elle puisse y remédier.
//
// UN SEUL MONTANT, CHARGES COMPRISES. C'est la rémunération publique du budget pour
// le service et l'année (décision du 26/10/2026) : jamais un salaire individuel, et
// aucun taux de charges ajouté ensuite. Une case laissée vide ne remplace rien : elle
// n'est pas envoyée, et l'API garde la valeur déjà déclarée.

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ErreurApi } from '../../lib/api';

const CHAMPS = ['effectifOuvriers', 'effectifEncadrement', 'effectifContractuels', 'masseSalarialeTnd'] as const;
type Champ = (typeof CHAMPS)[number];

const nombre = (s: string) => (s.trim() === '' ? null : Number(s.replace(/\s/g, '').replace(',', '.')));

export function EffectifService({ communeId, onFait }: { communeId: string; onFait: () => void | Promise<void> }) {
  const { t } = useTranslation();
  const anneeCourante = new Date(Date.now() + 3_600_000).getUTCFullYear();
  const [annee, setAnnee] = useState(String(anneeCourante));
  const [valeurs, setValeurs] = useState<Record<Champ, string>>({
    effectifOuvriers: '',
    effectifEncadrement: '',
    effectifContractuels: '',
    masseSalarialeTnd: '',
  });
  const [source, setSource] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);

  const lus = CHAMPS.map((c) => [c, nombre(valeurs[c])] as const);
  const valides =
    /^\d{4}$/.test(annee) &&
    lus.every(([c, n]) => n === null || (Number.isFinite(n) && n >= 0 && (c === 'masseSalarialeTnd' || Number.isInteger(n))));
  const rempli = lus.some(([, n]) => n !== null);

  const enregistrer = async () => {
    setEnvoi(true);
    setMessage(null);
    try {
      await api.declarerEffectif(communeId, {
        annee: Number(annee),
        ...Object.fromEntries(lus.filter(([, n]) => n !== null)),
        ...(source.trim() ? { source: source.trim() } : {}),
      });
      setMessage({ ok: true, texte: t('communal.personnel.declaration.enregistree', { annee }) });
      setValeurs({ effectifOuvriers: '', effectifEncadrement: '', effectifContractuels: '', masseSalarialeTnd: '' });
      await onFait();
    } catch (err) {
      setMessage({ ok: false, texte: err instanceof ErreurApi ? err.message : t('commun.erreur') });
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <section className="space-y-3 rounded-xl border border-ardoise-200 bg-white p-4">
      <h2 className="font-semibold text-ardoise-900">{t('communal.personnel.declaration.titre')}</h2>
      <p className="text-sm text-ardoise-600">{t('communal.personnel.declaration.aide')}</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm" htmlFor="effectif-annee">
          {t('communal.personnel.declaration.annee')}
          <input
            id="effectif-annee"
            inputMode="numeric"
            dir="ltr"
            value={annee}
            onChange={(e) => setAnnee(e.target.value)}
            className="mt-1 min-h-11 w-full rounded-lg border border-ardoise-300 bg-white px-3"
          />
        </label>
        {CHAMPS.map((c) => (
          <label key={c} className="text-sm" htmlFor={`effectif-${c}`}>
            {t(`communal.personnel.declaration.${c}`)}
            <input
              id={`effectif-${c}`}
              inputMode="decimal"
              dir="ltr"
              value={valeurs[c]}
              onChange={(e) => setValeurs({ ...valeurs, [c]: e.target.value })}
              className="mt-1 min-h-11 w-full rounded-lg border border-ardoise-300 bg-white px-3"
            />
          </label>
        ))}
        <label className="text-sm sm:col-span-3" htmlFor="effectif-source">
          {t('communal.personnel.declaration.source')}
          <input
            id="effectif-source"
            maxLength={200}
            value={source}
            placeholder={t('communal.personnel.declaration.sourceExemple')}
            onChange={(e) => setSource(e.target.value)}
            className="mt-1 min-h-11 w-full rounded-lg border border-ardoise-300 bg-white px-3"
          />
        </label>
      </div>
      {!valides && <p className="text-xs text-amber-800">{t('communal.personnel.declaration.invalide')}</p>}
      {message && (
        <p role={message.ok ? 'status' : 'alert'} className={`text-sm ${message.ok ? 'text-siipi-800' : 'text-red-800'}`}>
          {message.texte}
        </p>
      )}
      <button
        type="button"
        disabled={!valides || !rempli || envoi}
        onClick={() => void enregistrer()}
        className="min-h-11 rounded-lg bg-siipi-600 px-4 text-sm font-semibold text-white disabled:opacity-40"
      >
        {t('communal.personnel.declaration.enregistrer')}
      </button>
    </section>
  );
}
