// Comptes et accès de la commune.
//
// C'est le cadre du service qui sait qui entre et qui part. Un référentiel des
// accès tenu ailleurs est faux le lendemain.
//
// Le mot de passe provisoire s'affiche UNE fois, à la création. Il n'est
// stocké nulle part en clair et ne pourra pas être relu : si le cadre le perd,
// il réinitialise. C'est volontaire — un mot de passe qu'on peut consulter
// n'engage plus son porteur.

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ErreurApi, type Compte } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { Chargement, Erreur } from '../Elements';

const ROLES = ['admin_commune', 'gestionnaire_prestataire', 'citoyen'] as const;

export function Comptes({ communeId }: { communeId: string }) {
  const { t } = useTranslation();
  const { utilisateur } = useAuth();
  const [comptes, setComptes] = useState<Compte[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [ouvert, setOuvert] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  // Identifiants à transmettre, affichés une seule fois.
  const [aTransmettre, setATransmettre] = useState<{ email: string; nom: string; motDePasse: string } | null>(null);

  const [f, setF] = useState({ email: '', fullName: '', role: 'admin_commune' as (typeof ROLES)[number], phone: '' });

  const charger = async () => {
    try {
      setComptes(await api.comptes(communeId));
      setErreur(null);
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    }
  };

  useEffect(() => {
    void charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communeId]);

  const creer = async (evt: React.FormEvent) => {
    evt.preventDefault();
    setEnvoi(true);
    setErreur(null);
    try {
      const cree = await api.creerCompte({ ...f, communeId, phone: f.phone || undefined });
      setATransmettre({ email: cree.email, nom: cree.full_name, motDePasse: cree.motDePasseProvisoire });
      setF({ email: '', fullName: '', role: 'admin_commune', phone: '' });
      setOuvert(false);
      await charger();
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    } finally {
      setEnvoi(false);
    }
  };

  const reinitialiser = async (c: Compte) => {
    setErreur(null);
    try {
      const r = await api.reinitialiserMotDePasse(c.id);
      setATransmettre({ email: c.email, nom: c.full_name, motDePasse: r.motDePasseProvisoire });
      await charger();
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    }
  };

  const basculerActif = async (c: Compte) => {
    setErreur(null);
    try {
      await api.modifierCompte(c.id, { isActive: !c.is_active });
      await charger();
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    }
  };

  if (erreur && !comptes) return <Erreur message={erreur} onReessayer={() => void charger()} />;
  if (!comptes) return <Chargement />;

  const champ = 'mt-1 min-h-11 w-full rounded-lg border border-ardoise-300 bg-white px-3 text-base';

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ardoise-900">{t('communal.comptes.titre')}</h1>
          <p className="mt-1 text-sm text-ardoise-500">{t('communal.comptes.sousTitre')}</p>
        </div>
        <button
          type="button"
          onClick={() => setOuvert((o) => !o)}
          className="min-h-11 rounded-lg bg-siipi-600 px-4 font-semibold text-white"
        >
          {t('communal.comptes.ajouter')}
        </button>
      </header>

      {erreur && <Erreur message={erreur} />}

      {/* Les identifiants à transmettre. Volontairement visibles et non
          masqués : le cadre doit pouvoir les lire à voix haute, et ils
          disparaissent dès qu'il ferme l'encart. */}
      {aTransmettre && (
        <div className="rounded-xl border-2 border-siipi-400 bg-siipi-50 p-4">
          <h2 className="font-semibold text-siipi-900">{t('communal.comptes.aTransmettre')}</h2>
          <p className="mt-1 text-sm text-siipi-800">
            {t('communal.comptes.aTransmettreAide', { nom: aTransmettre.nom })}
          </p>
          <dl className="mt-3 space-y-1.5">
            <div className="flex flex-wrap items-baseline gap-2">
              <dt className="text-sm text-ardoise-600">{t('communal.comptes.email')}</dt>
              <dd className="chiffres rounded bg-white px-2 py-1 font-medium">{aTransmettre.email}</dd>
            </div>
            <div className="flex flex-wrap items-baseline gap-2">
              <dt className="text-sm text-ardoise-600">{t('communal.comptes.motDePasse')}</dt>
              <dd className="chiffres select-all rounded bg-white px-2 py-1 text-lg font-bold tracking-wide">
                {aTransmettre.motDePasse}
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-siipi-800">{t('communal.comptes.aTransmettreUneFois')}</p>
          <button
            type="button"
            onClick={() => setATransmettre(null)}
            className="mt-3 min-h-11 rounded-lg border border-siipi-400 bg-white px-4 font-medium text-siipi-800"
          >
            {t('communal.comptes.jaiNote')}
          </button>
        </div>
      )}

      {ouvert && (
        <form onSubmit={creer} className="space-y-4 rounded-xl border border-ardoise-200 bg-white p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-ardoise-700">{t('communal.comptes.nomComplet')}</span>
              <input value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} className={champ} required minLength={3} />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-ardoise-700">{t('communal.comptes.email')}</span>
              <input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} className={champ} required />
              <span className="mt-1 block text-xs text-ardoise-500">{t('communal.comptes.emailAide')}</span>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-ardoise-700">{t('communal.comptes.role')}</span>
              <select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as (typeof ROLES)[number] })} className={champ}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>{t(`communal.comptes.roles.${r}`)}</option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-ardoise-500">{t(`communal.comptes.rolesAide.${f.role}`)}</span>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-ardoise-700">{t('communal.comptes.telephone')}</span>
              <input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} className={champ} />
            </label>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setOuvert(false)} className="min-h-11 flex-1 rounded-lg border border-ardoise-300 bg-white px-4 font-medium text-ardoise-700">
              {t('citoyen.annuler')}
            </button>
            <button type="submit" disabled={envoi} className="min-h-11 flex-1 rounded-lg bg-siipi-600 px-4 font-semibold text-white disabled:opacity-50">
              {t('communal.comptes.creer')}
            </button>
          </div>
        </form>
      )}

      {comptes.length === 0 ? (
        <p className="rounded-xl border border-ardoise-200 bg-white p-6 text-sm text-ardoise-500">
          {t('communal.comptes.aucun')}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-ardoise-200 bg-white">
          <table className="w-full min-w-[46rem] text-sm">
            <thead className="border-b border-ardoise-200 bg-ardoise-50 text-left text-xs uppercase text-ardoise-500">
              <tr>
                <th className="px-3 py-2">{t('communal.comptes.nomComplet')}</th>
                <th className="px-3 py-2">{t('communal.comptes.email')}</th>
                <th className="px-3 py-2">{t('communal.comptes.role')}</th>
                <th className="px-3 py-2">{t('communal.comptes.derniereConnexion')}</th>
                <th className="px-3 py-2">{t('communal.comptes.etat')}</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {comptes.map((c) => (
                <tr key={c.id} className="border-b border-ardoise-100 last:border-0">
                  <td className="px-3 py-2.5 font-medium text-ardoise-900">
                    {c.full_name}
                    {c.id === utilisateur?.id && (
                      <span className="ms-2 text-xs text-ardoise-400">{t('communal.comptes.vous')}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-ardoise-600">{c.email}</td>
                  <td className="px-3 py-2.5 text-ardoise-600">
                    {t(`communal.comptes.roles.${c.role}`, { defaultValue: c.role })}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-ardoise-500">
                    {c.derniere_connexion ? (
                      new Date(c.derniere_connexion).toLocaleDateString()
                    ) : (
                      // Un compte jamais utilisé est une information : il se
                      // ferme, ou la personne n'a jamais reçu ses accès.
                      <span className="text-amber-700">{t('communal.comptes.jamais')}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {!c.is_active ? (
                      <span className="rounded bg-ardoise-100 px-1.5 py-0.5 text-xs text-ardoise-600">
                        {t('communal.comptes.desactive')}
                      </span>
                    ) : c.mot_de_passe_provisoire ? (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">
                        {t('communal.comptes.provisoire')}
                      </span>
                    ) : (
                      <span className="text-xs text-siipi-700">{t('communal.comptes.actif')}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-end">
                    <div className="flex flex-wrap justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => void reinitialiser(c)}
                        className="rounded border border-ardoise-300 px-2 py-1 text-xs font-medium text-ardoise-700"
                      >
                        {t('communal.comptes.reinitialiser')}
                      </button>
                      {c.id !== utilisateur?.id && (
                        <button
                          type="button"
                          onClick={() => void basculerActif(c)}
                          className="rounded border border-ardoise-300 px-2 py-1 text-xs font-medium text-ardoise-700"
                        >
                          {c.is_active ? t('communal.comptes.desactiver') : t('communal.comptes.reactiver')}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
