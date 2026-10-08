// Le rejeu du coût complet d'un bureau d'études (lot 17.5).
//
// L'ÉCRAN NE DIT PAS QUI A RAISON. Il montre les chiffres DÉCLARÉS par le
// bureau d'études, la méthode rejouée — Z = (A+B)+(C+D) —, et les huit écarts
// qu'une lecture attentive relève : un dénominateur qu'on ne retrouve pas, deux
// totaux pour un même poste, des postes absents. Chaque écart se termine par
// « à demander au bureau d'études » : c'est lui qui sait, pas la plateforme.
//
// UN RATIO PUBLIÉ EST ARRONDI. « 155 DT/t » couvre 154,5 à 155,5 : le tonnage
// qu'il implique est donc un intervalle, et l'écran l'écrit comme tel. Un
// écart n'est montré que si le chiffre déclaré sort de l'intervalle.

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ErreurApi, type EtudeCoutComplet, type EtudeCoutCompletDetail } from '../../lib/api';
import { useFormats } from '../../lib/formats';
import { formaterNombre } from '../../i18n';
import { Chargement, Erreur } from '../Elements';

type Rejeu = EtudeCoutCompletDetail['rejeu'];
type Ecart = Rejeu['ecarts'][number];
type Intervalle = { min: number; max: number } | null;

const bouton = 'min-h-11 rounded-lg bg-siipi-600 px-4 text-sm font-medium text-white disabled:opacity-40';
const boutonDiscret = 'min-h-11 rounded-lg border border-ardoise-300 bg-white px-3 text-sm text-ardoise-700 disabled:opacity-40';
const message = (e: unknown, defaut: string) => (e instanceof ErreurApi || e instanceof Error ? e.message : defaut);
const dt = (v: number | null | undefined, decimales = 0) => (v === null || v === undefined ? null : formaterNombre(v, decimales));

export function CoutComplet({ communeId }: { communeId: string }) {
  const { t } = useTranslation();
  const [etudes, setEtudes] = useState<EtudeCoutComplet[] | null>(null);
  const [choisie, setChoisie] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const charger = useCallback(() => {
    api
      .etudesCoutComplet(communeId)
      .then((l) => {
        setEtudes(l);
        setChoisie((c) => c ?? l[0]?.id ?? null);
      })
      .catch((e) => setErreur(message(e, t('commun.erreur'))));
  }, [communeId, t]);
  useEffect(() => charger(), [charger]);

  async function deposer(fichier: File) {
    setEnvoi(true);
    setErreur(null);
    try {
      let contenu: Record<string, unknown>;
      try {
        contenu = JSON.parse(await fichier.text());
      } catch {
        throw new Error(t('communal.coutComplet.fichierIllisible'));
      }
      const etude = await api.chargerEtudeCoutComplet(communeId, contenu);
      setChoisie(etude.id);
      charger();
    } catch (e) {
      setErreur(message(e, t('commun.erreur')));
    } finally {
      setEnvoi(false);
    }
  }

  if (!etudes && !erreur) return <Chargement />;

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-xl font-semibold text-ardoise-900">{t('communal.coutComplet.titre')}</h2>
        <p className="mt-1 max-w-3xl text-sm text-ardoise-600">{t('communal.coutComplet.intro')}</p>
      </header>

      {erreur && (
        <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">{erreur}</p>
      )}

      <div className="flex flex-wrap items-end gap-3">
        {etudes && etudes.length > 0 && (
          <label className="text-sm">
            <span className="block font-medium text-ardoise-700">{t('communal.coutComplet.etude')}</span>
            <select
              value={choisie ?? ''}
              onChange={(e) => setChoisie(e.target.value)}
              className="mt-1 min-h-11 rounded-lg border border-ardoise-300 bg-white px-3 text-base"
            >
              {etudes.map((e) => (
                <option key={e.id} value={e.id}>{e.exercice} — {e.bureau_etudes ?? e.document.slice(0, 60)}</option>
              ))}
            </select>
          </label>
        )}
        <label className={`${bouton} inline-flex cursor-pointer items-center ${envoi ? 'opacity-40' : ''}`}>
          {t('communal.coutComplet.charger')}
          <input
            type="file"
            accept="application/json,.json"
            className="sr-only"
            disabled={envoi}
            onChange={(e) => {
              const f = e.target.files?.[0];
              // Remis à zéro : rechoisir le même fichier après un refus ne
              // déclencherait sinon aucun événement.
              e.target.value = '';
              if (f) void deposer(f);
            }}
          />
        </label>
      </div>
      <p className="text-xs text-ardoise-500">{t('communal.coutComplet.aideCharger')}</p>

      {etudes && etudes.length === 0 && (
        <p className="rounded-xl border border-ardoise-200 bg-white p-6 text-sm text-ardoise-600">{t('communal.coutComplet.aucune')}</p>
      )}
      {choisie && (
        <FicheEtude
          key={choisie}
          id={choisie}
          onRetiree={() => {
            setChoisie(null);
            charger();
          }}
          onErreur={(e) => setErreur(message(e, t('commun.erreur')))}
        />
      )}
    </section>
  );
}

function NonRenseigne() {
  const { t } = useTranslation();
  return <span className="text-ardoise-400">{t('communal.coutComplet.nonRenseigne')}</span>;
}

function FicheEtude({ id, onRetiree, onErreur }: { id: string; onRetiree: () => void; onErreur: (e: unknown) => void }) {
  const { t } = useTranslation();
  const f = useFormats();
  const [e, setE] = useState<EtudeCoutCompletDetail | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(() => {
    api.etudeCoutComplet(id).then(setE).catch((x) => setErreur(message(x, t('commun.erreur'))));
  }, [id, t]);
  useEffect(() => charger(), [charger]);

  if (erreur) return <Erreur message={erreur} onReessayer={charger} />;
  if (!e) return <Chargement />;
  const r = e.rejeu;

  async function retirer() {
    if (!window.confirm(t('communal.coutComplet.confirmerRetrait'))) return;
    try {
      await api.retirerEtudeCoutComplet(id);
      onRetiree();
    } catch (x) {
      onErreur(x);
    }
  }

  const ligneTotal = (cle: 'A' | 'X' | 'Y' | 'Z', libelle: string) => {
    const c = r.comparaison[cle];
    return (
      <tr className="border-t border-ardoise-200 font-semibold">
        <td className="px-3 py-2">{libelle}</td>
        <td className="px-3 py-2 text-end tabular-nums">{dt(c.siipi) ?? <NonRenseigne />}</td>
        <td className="px-3 py-2 text-end tabular-nums">{dt(c.publie) ?? '—'}</td>
        <td className={`px-3 py-2 text-end tabular-nums ${c.ecart ? 'text-amber-800' : 'text-ardoise-500'}`}>
          {c.ecart === null ? '—' : `${c.ecart > 0 ? '+' : ''}${dt(c.ecart)}`}
        </td>
      </tr>
    );
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-ardoise-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="font-semibold text-ardoise-900">
              {t('communal.coutComplet.exercice', { annee: e.exercice })}
              {e.bureau_etudes && <span className="ms-2 font-normal text-ardoise-600">· {e.bureau_etudes}</span>}
            </h3>
            <p className="text-xs text-ardoise-500">{e.document}</p>
          </div>
          <span className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-900">
            {t('communal.coutComplet.provenance')}
          </span>
        </div>
        <p className="mt-2 text-sm text-ardoise-700">
          {t('communal.coutComplet.denominateurs', {
            tonnage: dt(e.tonnage_pese_t, 2) ?? '—',
            population: dt(e.population) ?? '—',
            menages: dt(e.menages) ?? '—',
          })}
        </p>
        <button type="button" onClick={() => void retirer()} className={`${boutonDiscret} mt-3`}>
          {t('communal.coutComplet.retirer')}
        </button>
      </div>

      {/* La méthode rejouée, bloc par bloc, face aux totaux publiés. */}
      <div className="overflow-x-auto rounded-xl border border-ardoise-200 bg-white">
        <p className="border-b border-ardoise-100 p-3 text-sm font-semibold text-ardoise-900">
          {t('communal.coutComplet.formule')}
        </p>
        <table className="w-full text-sm">
          <thead className="bg-ardoise-50 text-xs text-ardoise-600">
            <tr>
              <th className="px-3 py-2 text-start">{t('communal.coutComplet.poste')}</th>
              <th className="px-3 py-2 text-end">{t('communal.coutComplet.rejeu')}</th>
              <th className="px-3 py-2 text-end">{t('communal.coutComplet.publie')}</th>
              <th className="px-3 py-2 text-end">{t('communal.coutComplet.ecart')}</th>
            </tr>
          </thead>
          <tbody>
            {(['A', 'B', 'C', 'D'] as const).map((b) => (
              <BlocLignes key={b} bloc={b} donnees={r.blocs[b]} />
            ))}
            {ligneTotal('A', t('communal.coutComplet.totaux.A'))}
            {ligneTotal('X', t('communal.coutComplet.totaux.X'))}
            {ligneTotal('Y', t('communal.coutComplet.totaux.Y'))}
            {ligneTotal('Z', t('communal.coutComplet.totaux.Z'))}
          </tbody>
        </table>
        <p className="border-t border-ardoise-100 p-3 text-sm text-ardoise-800">
          {r.recalcul_tonnage_pese.cout_par_tonne === null
            ? t('communal.coutComplet.sansTonnage')
            : t('communal.coutComplet.surTonnagePese', {
                cout: dt(r.recalcul_tonnage_pese.cout_par_tonne, 2),
                tonnage: dt(r.recalcul_tonnage_pese.tonnage_pese, 2),
              })}
          {!r.complet && <span className="ms-2 text-amber-800">{t('communal.coutComplet.incomplet')}</span>}
        </p>
      </div>

      {/* Les ratios publiés et le dénominateur que chacun implique. */}
      <div className="overflow-x-auto rounded-xl border border-ardoise-200 bg-white">
        <p className="border-b border-ardoise-100 p-3 text-sm font-semibold text-ardoise-900">{t('communal.coutComplet.ratios')}</p>
        <table className="w-full text-sm">
          <thead className="bg-ardoise-50 text-xs text-ardoise-600">
            <tr>
              <th className="px-3 py-2 text-start">{t('communal.coutComplet.ratio')}</th>
              <th className="px-3 py-2 text-end">{t('communal.coutComplet.valeurPubliee')}</th>
              <th className="px-3 py-2 text-end">{t('communal.coutComplet.numerateur')}</th>
              <th className="px-3 py-2 text-end">{t('communal.coutComplet.denominateurImplicite')}</th>
              <th className="px-3 py-2 text-end">{t('communal.coutComplet.denominateurDeclare')}</th>
              <th className="px-3 py-2 text-center">{t('communal.coutComplet.compatible')}</th>
            </tr>
          </thead>
          <tbody>
            {r.ratios.map((x) => (
              <tr key={x.code} className="border-t border-ardoise-100">
                <td className="px-3 py-2">{t(`communal.coutComplet.codesRatios.${x.code}`, { defaultValue: x.code })}</td>
                <td className="px-3 py-2 text-end tabular-nums">{formaterNombre(x.valeur, String(x.pas_arrondi).split('.')[1]?.length ?? 0)}</td>
                <td className="px-3 py-2 text-end tabular-nums">{dt(x.numerateur) ?? <NonRenseigne />}</td>
                <td className="px-3 py-2 text-end tabular-nums">
                  <IntervalleTexte i={x.intervalle} unite={x.unite} />
                </td>
                <td className="px-3 py-2 text-end tabular-nums">
                  {x.denominateur_declare === null
                    ? '—'
                    : `${dt(x.denominateur_declare, x.unite === 't' ? 2 : 0)} ${t(`communal.coutComplet.unites.${x.unite}`)}`}
                </td>
                <td className="px-3 py-2 text-center">
                  {x.compatible === null ? '—' : x.compatible ? (
                    <span className="text-siipi-700">{t('communal.coutComplet.oui')}</span>
                  ) : (
                    <span className="font-semibold text-amber-800">{t('communal.coutComplet.non')}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="border-t border-ardoise-100 p-3 text-xs text-ardoise-600">{t('communal.coutComplet.noteArrondi')}</p>
      </div>

      <div className="space-y-3">
        <h4 className="font-semibold text-ardoise-900">{t('communal.coutComplet.ecarts')}</h4>
        <p className="text-xs text-ardoise-600">{t('communal.coutComplet.aideEcarts')}</p>
        <div className="grid gap-3 lg:grid-cols-2">
          {r.ecarts.map((x) => (
            <CarteEcart key={x.code} ecart={x} />
          ))}
        </div>
      </div>
      <p className="text-xs text-ardoise-500">{t('communal.coutComplet.chargeLe', { date: f.date(e.created_at, { heure: true }) })}</p>
    </div>
  );
}

function BlocLignes({ bloc, donnees }: { bloc: 'A' | 'B' | 'C' | 'D'; donnees: Rejeu['blocs']['A'] }) {
  const { t } = useTranslation();
  return (
    <>
      <tr className="bg-ardoise-50/60">
        <td className="px-3 py-1.5 text-xs font-semibold uppercase text-ardoise-600" colSpan={4}>
          {t(`communal.coutComplet.blocs.${bloc}`)}
        </td>
      </tr>
      {donnees.postes.map((p) => (
        <tr key={p.code} className="border-t border-ardoise-100">
          <td className="px-3 py-2 ps-6">
            {t(`communal.coutComplet.postes.${p.code}`, { defaultValue: p.code })}
            {p.variantes.map((v, i) => (
              <span key={i} className="block text-xs text-amber-800">
                {t('communal.coutComplet.autreVersion', { montant: dt(v.montant) ?? '—' })}
              </span>
            ))}
          </td>
          <td className="px-3 py-2 text-end tabular-nums">{dt(p.montant) ?? <NonRenseigne />}</td>
          <td className="px-3 py-2" />
          <td className="px-3 py-2" />
        </tr>
      ))}
      <tr className="border-t border-ardoise-100 text-ardoise-700">
        <td className="px-3 py-2 ps-6 text-xs">{t('communal.coutComplet.sousTotalBloc', { bloc })}</td>
        <td className="px-3 py-2 text-end font-medium tabular-nums">{dt(donnees.montant) ?? <NonRenseigne />}</td>
        <td className="px-3 py-2" />
        <td className="px-3 py-2" />
      </tr>
    </>
  );
}

function IntervalleTexte({ i, unite }: { i: Intervalle; unite: string }) {
  const { t } = useTranslation();
  if (!i) return <NonRenseigne />;
  const min = formaterNombre(i.min, 0);
  const max = formaterNombre(i.max, 0);
  return (
    <span>
      {/* « 288 à 288 jours » ne dit rien de plus que « ≈ 288 jours ». */}
      {min === max ? t('communal.coutComplet.environ', { valeur: min }) : t('communal.coutComplet.intervalle', { min, max })}{' '}
      {t(`communal.coutComplet.unites.${unite}`)}
    </span>
  );
}

function CarteEcart({ ecart }: { ecart: Ecart }) {
  const { t } = useTranslation();
  // Les données d'un écart varient d'un code à l'autre (contrat : objet libre).
  const d = ecart.donnees as Record<string, any>;
  const teinte = {
    constate: 'border-amber-300 bg-amber-50',
    declare: 'border-ardoise-300 bg-ardoise-50',
    non_verifiable: 'border-ardoise-200 bg-white',
    aucun: 'border-siipi-200 bg-white',
  }[ecart.statut];
  const poste = (c: string) => t(`communal.coutComplet.postes.${c}`, { defaultValue: c });
  const lignes: string[] = [];

  if (ecart.statut === 'constate') {
    switch (ecart.code) {
      case 'E1':
        lignes.push(
          t('communal.coutComplet.textes.E1', {
            ratio: formaterNombre(d.ratio_publie),
            min: formaterNombre(d.intervalle?.min, 0),
            max: formaterNombre(d.intervalle?.max, 0),
            pese: formaterNombre(d.tonnage_pese, 2),
            surPese: formaterNombre(d.ratio_sur_tonnage_pese, 1),
          })
        );
        break;
      case 'E2':
        for (const x of d.ratios ?? []) {
          lignes.push(
            t('communal.coutComplet.textes.E2', {
              ratio: t(`communal.coutComplet.codesRatios.${x.code}`, { defaultValue: x.code }),
              min: formaterNombre(x.intervalle.min, 0),
              max: formaterNombre(x.intervalle.max, 0),
              accord: x.compatible_tonnage_pese ? t('communal.coutComplet.retombeSurPese') : '',
            })
          );
        }
        break;
      case 'E3':
        for (const v of d.versions ?? []) {
          for (const a of v.autres) {
            lignes.push(
              t('communal.coutComplet.textes.E3version', {
                total: t(`communal.coutComplet.codesTotaux.${v.code}`, { defaultValue: v.code }),
                retenue: formaterNombre(v.retenue.montant),
                autre: formaterNombre(a.montant),
              })
            );
          }
        }
        for (const x of d.recoupements ?? []) {
          lignes.push(
            t('communal.coutComplet.textes.E3recoupement', {
              verification: t(`communal.coutComplet.verifications.${x.verification}`, { defaultValue: x.verification }),
              attendu: formaterNombre(x.attendu),
              obtenu: formaterNombre(x.obtenu),
            })
          );
        }
        break;
      case 'E4':
        for (const v of d.versions ?? []) {
          lignes.push(
            t('communal.coutComplet.textes.E4', {
              poste: poste(v.code),
              retenue: formaterNombre(v.retenue.montant),
              autres: v.autres.map((a: { montant: number }) => formaterNombre(a.montant)).join(' ; '),
            })
          );
        }
        break;
      case 'E7':
        lignes.push(t('communal.coutComplet.textes.E7', { postes: (d.non_renseignes ?? []).map(poste).join(', ') }));
        break;
      case 'E8':
        lignes.push(
          t('communal.coutComplet.textes.E8', {
            ventiles: (d.flux_ventiles ?? []).map((x: { code: string }) => t(`communal.coutComplet.flux.${x.code}`)).join(', ') || '—',
            manquants: (d.flux_manquants ?? []).map((c: string) => t(`communal.coutComplet.flux.${c}`)).join(', '),
          })
        );
        break;
    }
  }
  if (ecart.code === 'E5' && ecart.statut !== 'aucun') {
    for (const x of d.ratios ?? []) {
      lignes.push(
        x.compatible === null
          ? t('communal.coutComplet.textes.E5nonVerifiable', { ratio: t(`communal.coutComplet.codesRatios.${x.code}`) })
          : t('communal.coutComplet.textes.E5', {
              ratio: t(`communal.coutComplet.codesRatios.${x.code}`),
              valeur: formaterNombre(x.valeur),
              min: formaterNombre(x.intervalle?.min, 0),
              max: formaterNombre(x.intervalle?.max, 0),
              declare: formaterNombre(x.denominateur_declare),
              accord: x.compatible ? t('communal.coutComplet.retombeSurDeclare') : '',
            })
      );
    }
  }

  return (
    <article className={`space-y-2 rounded-xl border p-4 ${teinte}`}>
      <div className="flex items-baseline justify-between gap-2">
        <h5 className="font-semibold text-ardoise-900">
          {ecart.code} — {t(`communal.coutComplet.titresEcarts.${ecart.code}`)}
        </h5>
        <span className="text-xs font-medium text-ardoise-700">{t(`communal.coutComplet.statuts.${ecart.statut}`)}</span>
      </div>
      {lignes.length > 0 && (
        <ul className="list-disc space-y-1 ps-5 text-sm text-ardoise-800">
          {lignes.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      )}
      {ecart.notes.map((n, i) => (
        // Une note de lecture est recopiée telle qu'elle a été écrite (en français) :
        // c'est un constat du lecteur, pas un texte de l'écran.
        <p key={i} className="text-sm text-ardoise-700" lang="fr" dir="auto">
          <span className="font-medium">{n.sujet} : </span>
          {n.constat}
        </p>
      ))}
      {ecart.statut === 'constate' && <p className="text-xs text-ardoise-600">{t('communal.coutComplet.aDemander')}</p>}
    </article>
  );
}
