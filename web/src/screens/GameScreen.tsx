import { useEffect, useMemo, useState } from 'react';
import { EventAnimation, useRoundAnimation } from '../components/EventAnimation';
import { draftFromRound, HistoryTable, RoundForm, StandingsGrid } from '../components/GameParts';
import { RulesEditor } from '../components/RulesEditor';
import { Button, Card, Modal, Page, TopBar } from '../components/ui';
import { useLiveGame } from '../lib/live';
import { describeRules } from '../lib/rules';
import { gameUrl, navigate } from '../lib/router';
import { computeGameState } from '../lib/scoring';
import {
  adoptEditToken, createGame, deleteGameEverywhere, fetchGame, setCurrentGame, updateGame, useStore
} from '../lib/store';
import type { Rules } from '../lib/types';

type Tab = 'round' | 'history' | 'rules';

async function share(url: string, title: string) {
  if (navigator.share) {
    try { await navigator.share({ title, url }); return 'shared'; } catch { /* geannuleerd */ }
  }
  try { await navigator.clipboard.writeText(url); return 'copied'; } catch { return 'failed'; }
}

export function GameScreen({ id, editKey }: { id: string; editKey?: string }) {
  const game = useStore(s => s.games[id]);
  const token = useStore(s => s.tokens[id]);
  const canEdit = Boolean(token);
  const live = useLiveGame(id);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>(canEdit ? 'round' : 'history');
  const [menu, setMenu] = useState(false);
  const [editRules, setEditRules] = useState<Rules | null>(null);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (editKey) {
      adoptEditToken(id, editKey);
      navigate(`/g/${id}`, true);
    }
  }, [id, editKey]);

  useEffect(() => {
    if (canEdit) setCurrentGame(id);
  }, [id, canEdit]);

  useEffect(() => {
    if (game) return;
    fetchGame(id)
      .then(g => { if (!g) setLoadError('Dit potje bestaat niet (meer) op de server.'); })
      .catch(() => setLoadError('Server niet bereikbaar en dit potje staat niet op dit toestel.'));
  }, [id, game]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  const state = useMemo(() => (game ? computeGameState(game) : null), [game]);
  const event = useRoundAnimation(game, state);

  if (!game || !state) {
    return (
      <>
        <TopBar title={`Potje ${id}`} back="/" />
        <Page>
          <Card><p className="text-center text-sm text-slate-400">{loadError ?? 'Potje laden…'}</p></Card>
        </Page>
      </>
    );
  }

  const roundNo = game.rounds.length + 1;
  const doShare = async (withKey: boolean) => {
    const res = await share(gameUrl(id, withKey ? token : undefined), withKey ? `Yaniv: bewerk potje ${id}` : `Yaniv: kijk live mee (${id})`);
    if (res === 'copied') setToast('Link gekopieerd');
    if (res === 'failed') setToast('Kopiëren mislukt');
  };

  const aliveAtRound = (idx: number) =>
    game.players.filter(p => {
      const out = state.eliminatedInRound[p.id];
      return !out || out >= idx + 1;
    });

  return (
    <div className="min-h-screen">
      <EventAnimation event={event} />
      <TopBar
        title={<>Potje <span className="font-mono tracking-wider text-indigo-300">{id}</span>{!state.isOver && <span className="text-slate-400"> · R{roundNo}</span>}</>}
        back="/"
        right={
          <>
            <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={() => doShare(false)}>📲 Delen</Button>
            <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={() => setMenu(true)} aria-label="Menu">⋯</Button>
          </>
        }
      />
      <Page>
        {!canEdit && (
          <div className="flex items-center justify-between rounded-xl border border-sky-800/50 bg-sky-950/30 px-3 py-2 text-xs text-sky-200">
            <span>👀 Je kijkt mee. Alleen de scorebijhouder kan invoeren.</span>
            <span className="font-bold">{live === 'live' ? '● Live' : live === 'offline' ? '○ Offline' : live === 'missing' ? 'Verwijderd' : '… Verbinden'}</span>
          </div>
        )}

        <Card><StandingsGrid state={state} rules={game.rules} /></Card>

        <div className="flex rounded-xl border border-slate-800 bg-slate-900 p-1">
          {([
            ...(canEdit ? [['round', state.isOver ? 'Uitslag' : 'Ronde invoeren']] : []),
            ['history', `Historie (${game.rounds.length})`],
            ['rules', 'Regels']
          ] as [Tab, string][]).map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)} className={`flex-1 rounded-lg py-2 text-sm font-bold ${tab === t ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}>
              {label}
            </button>
          ))}
        </div>

        {tab === 'round' && canEdit && (
          <Card>
            {state.isOver ? (
              <div className="space-y-4 py-4 text-center">
                <div className="text-5xl">👑</div>
                <h3 className="text-2xl font-black text-white">
                  {state.champion ? `${state.champion.name} wint met ${state.champion.score} pt!` : 'Potje beëindigd'}
                </h3>
                <div className="flex flex-col justify-center gap-2 sm:flex-row">
                  <Button onClick={() => {
                    const newId = createGame(game.players.map(p => p.id), game.rules, game.players);
                    navigate(`/g/${newId}`);
                  }}>
                    Nieuw potje, zelfde spelers
                  </Button>
                  {game.endedManually && (
                    <Button variant="secondary" onClick={() => updateGame(id, g => ({ ...g, endedManually: false }))}>Verder spelen</Button>
                  )}
                  <Button variant="gold" onClick={() => navigate('/')}>Beginscherm</Button>
                </div>
              </div>
            ) : (
              <RoundForm
                key={game.rounds.length}
                alive={state.alive}
                rules={game.rules}
                submitLabel={`Ronde ${roundNo} opslaan`}
                onSubmit={round => updateGame(id, g => ({ ...g, rounds: [...g.rounds, round] }))}
                extra={game.rounds.length > 0 && (
                  <Button
                    variant="ghost"
                    className="w-full text-xs"
                    onClick={() => {
                      if (confirm(`Ronde ${game.rounds.length} ongedaan maken?`)) updateGame(id, g => ({ ...g, rounds: g.rounds.slice(0, -1) }));
                    }}
                  >
                    ↶ Laatste ronde ongedaan maken
                  </Button>
                )}
              />
            )}
          </Card>
        )}

        {tab === 'history' && (
          <Card>
            <HistoryTable state={state} players={game.players} onEdit={canEdit ? setEditIdx : undefined} />
          </Card>
        )}

        {tab === 'rules' && (
          <Card className="space-y-3">
            <ul className="space-y-1.5 text-sm text-slate-200">
              {describeRules(game.rules).map(l => <li key={l}>• {l}</li>)}
            </ul>
            {canEdit && <Button variant="secondary" className="w-full" onClick={() => setEditRules(game.rules)}>Regels van dit potje aanpassen</Button>}
          </Card>
        )}
      </Page>

      <Modal open={menu} onClose={() => setMenu(false)} title={`Potje ${id}`}>
        <div className="space-y-2">
          <Button variant="secondary" className="w-full" onClick={() => doShare(false)}>📲 Meekijk-link delen</Button>
          {canEdit && (
            <>
              <Button variant="secondary" className="w-full" onClick={() => doShare(true)}>✍️ Bewerk-link delen (overdragen)</Button>
              <p className="px-1 text-[11px] text-slate-500">Met de bewerk-link kan een ander toestel ook scores invoeren. Deel die alleen met de scorebijhouder.</p>
              {!state.isOver && (
                <Button variant="secondary" className="w-full" onClick={() => {
                  if (confirm('Potje nu beëindigen? De speler met de laagste score wint.')) {
                    updateGame(id, g => ({ ...g, endedManually: true }));
                    setMenu(false);
                    setTab('round');
                  }
                }}>🏁 Potje beëindigen</Button>
              )}
              <Button variant="danger" className="w-full" onClick={async () => {
                if (confirm('Dit potje definitief verwijderen, ook voor meekijkers?')) {
                  await deleteGameEverywhere(id);
                  navigate('/');
                }
              }}>🗑 Potje verwijderen</Button>
            </>
          )}
          <Button variant="ghost" className="w-full" onClick={() => navigate('/')}>⌂ Beginscherm</Button>
        </div>
      </Modal>

      <Modal open={editRules !== null} onClose={() => setEditRules(null)} title="Regels van dit potje">
        {editRules && (
          <div className="space-y-4">
            <p className="text-xs text-amber-200">Let op: alle standen worden met de nieuwe regels opnieuw berekend.</p>
            <RulesEditor rules={editRules} onChange={setEditRules} />
            <Button className="w-full" onClick={() => { updateGame(id, g => ({ ...g, rules: editRules })); setEditRules(null); }}>Opslaan</Button>
          </div>
        )}
      </Modal>

      <Modal open={editIdx !== null} onClose={() => setEditIdx(null)} title={editIdx !== null ? `Ronde ${editIdx + 1} aanpassen` : ''}>
        {editIdx !== null && game.rounds[editIdx] && (
          <div className="space-y-3">
            {game.rounds[editIdx].fixedScores && (
              <p className="text-xs text-amber-200">Deze ronde komt uit de oude app en heeft geen handpunten. Na opslaan wordt hij opnieuw berekend.</p>
            )}
            <RoundForm
              alive={aliveAtRound(editIdx)}
              rules={game.rules}
              initial={draftFromRound(game.rounds[editIdx])}
              base={game.rounds[editIdx]}
              submitLabel="Wijziging opslaan"
              onSubmit={round => {
                updateGame(id, g => ({ ...g, rounds: g.rounds.map((r, i) => (i === editIdx ? round : r)) }));
                setEditIdx(null);
              }}
              extra={
                <Button variant="danger" className="w-full" onClick={() => {
                  if (confirm(`Ronde ${editIdx + 1} verwijderen?`)) {
                    updateGame(id, g => ({ ...g, rounds: g.rounds.filter((_, i) => i !== editIdx) }));
                    setEditIdx(null);
                  }
                }}>Ronde verwijderen</Button>
              }
            />
          </div>
        )}
      </Modal>

      {toast && (
        <div className="fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
          <div className="rounded-full bg-slate-100 px-4 py-2 text-sm font-bold text-slate-900 shadow-xl">{toast}</div>
        </div>
      )}
    </div>
  );
}
