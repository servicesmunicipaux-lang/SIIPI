// Ce qui ne colle pas entre le registre des circuits et l'inventaire du parc.
//
// Placé en tête du constat du jour, l'écran qu'on ouvre chaque matin : c'est
// précisément le moment où « ce circuit est confié à un engin en panne » sert
// à quelque chose. Le même avis dans un écran d'administration serait lu une
// fois, à l'installation, puis jamais.
//
// Ne s'affiche que s'il y a quelque chose à dire. Un bandeau permanent qui
// répète « tout va bien » finit par ne plus être lu du tout, et emporte avec
// lui les jours où il disait autre chose.

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type Incoherence } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { PREFERENCES_DEFAUT } from '../../lib/formats';

const RANG: Record<string, number> = { bloquant: 0, avertissement: 1, information: 2 };

const ALLURE: Record<string, string> = {
  bloquant: 'border-red-300 bg-red-50 text-red-900',
  avertissement: 'border-amber-300 bg-amber-50 text-amber-900',
  information: 'border-ardoise-200 bg-ardoise-50 text-ardoise-700',
};

export function Coherence({ communeId }: { communeId: string }) {
  const { t } = useTranslation();
  const [ecarts, setEcarts] = useState<Incoherence[] | null>(null);
  const [tout, setTout] = useState(false);
  const [sansFiltre, setSansFiltre] = useState(false);
  const { utilisateur } = useAuth();
  const { domainesMasques, graviteMin } = (utilisateur?.preferences ?? PREFERENCES_DEFAUT).alertes;

  useEffect(() => {
    let annule = false;
    void api
      .coherence(communeId)
      .then((l) => !annule && setEcarts(l))
      // Un contrôle de cohérence qui échoue ne doit pas empêcher de travailler :
      // il est utile, il n'est pas indispensable.
      .catch(() => !annule && setEcarts([]));
    return () => {
      annule = true;
    };
  }, [communeId]);

  if (!ecarts || ecarts.length === 0) return null;

  // Les préférences de chacun (Paramètres) règlent ce qu'on lui montre — sauf
  // un avis bloquant, qui s'affiche toujours : un engin en panne sur un
  // circuit du jour ne se masque pas d'une case décochée un mois plus tôt.
  const voulu = (e: Incoherence) =>
    e.gravite === 'bloquant' ||
    (!domainesMasques.includes(e.domaine as never) && (RANG[e.gravite] ?? 9) <= (RANG[graviteMin] ?? 2));
  const retenus = sansFiltre ? ecarts : ecarts.filter(voulu);
  const masques = ecarts.length - ecarts.filter(voulu).length;
  if (retenus.length === 0 && masques === 0) return null;

  const tries = [...retenus].sort((a, b) => (RANG[a.gravite] ?? 9) - (RANG[b.gravite] ?? 9));
  const bloquants = tries.filter((e) => e.gravite === 'bloquant');
  // Sans dépliage, on montre les bloquants, et à défaut les trois premiers :
  // un écran du matin n'est pas une liste de tâches de fond.
  const affiches = tout ? tries : bloquants.length > 0 ? bloquants : tries.slice(0, 3);

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-ardoise-900">{t('communal.coherence.titre')}</h2>
        {(tout || tries.length > affiches.length) && (
          <button
            type="button"
            onClick={() => setTout((x) => !x)}
            className="text-xs font-medium text-siipi-700 hover:underline"
          >
            {tout
              ? t('communal.coherence.replier')
              : t('communal.coherence.voirTout', { count: tries.length })}
          </button>
        )}
      </div>

      <ul className="space-y-1.5">
        {affiches.map((e, i) => (
          <li
            key={`${e.sujet_id}-${i}`}
            className={`rounded-lg border p-2.5 text-sm ${ALLURE[e.gravite] ?? ALLURE.information}`}
          >
            <p>
              <span className="font-semibold">{e.sujet}</span>
              {' — '}
              {e.constat}
            </p>
            {/* Ce qu'il y a à faire, pas une injonction : la plateforme constate,
                elle ne décide pas à la place du service. */}
            <p className="mt-0.5 text-xs opacity-80">{e.quoi_faire}</p>
          </li>
        ))}
      </ul>

      {!tout && tries.length > affiches.length && (
        <p className="text-xs text-ardoise-500">
          {t('communal.coherence.reste', { count: tries.length - affiches.length })}
        </p>
      )}
      {masques > 0 && (
        <p className="text-xs text-ardoise-500">
          {sansFiltre ? t('communal.coherence.filtreLeve') : t('communal.coherence.masques', { count: masques })}{' '}
          <button type="button" onClick={() => setSansFiltre((x) => !x)} className="font-medium text-siipi-700 hover:underline">
            {sansFiltre ? t('communal.coherence.appliquerFiltre') : t('communal.coherence.afficherMasques')}
          </button>
        </p>
      )}
    </section>
  );
}
