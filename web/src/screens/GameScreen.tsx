import { useEffect, useMemo, useState } from 'react';
import { EventAnimation, useRoundAnimation } from '../components/EventAnimation';
import { draftFromRound, HistoryTable, RoundForm, Standings } from '../components/GameParts';
import { RulesEditor } from '../components/RulesEditor';
import { Button, Icon, IconButton, Modal, Page, Segmented, TopBar } from '../components/ui';
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

const LIVE_LABEL = { live: 'Live', offline: 'Offline', missing: 'Verwijderd', connecting: 'Verbinden' } as const;

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
        <TopBar title="Potje" kicker={id} back="/" />
        <Page><p className="py-10 text-center text-sm text-muted">{loadError ?? 'Potje laden…'}</p></Page>
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

  const tabs: { value: Tab; label: string }[] = [
    ...(canEdit ? [{ value: 'round' as const, label: state.isOver ? 'Uitslag' : 'Invoeren' }] : []),
    { value: 'history', label: `Historie ${game.rounds.length}` },
    { value: 'rules', label: 'Regels' }
  ];

  return (
    <div className="min-h-screen">
      <EventAnimation event={event} />
      <TopBar
        kicker={<>{state.isOver ? 'Afgelopen' : `Ronde ${roundNo}`} · <span className="font-mono text-accent">{id}</span></>}
        title="Stand"
        back="/"
        right={
          <>
            <IconButton icon="share" label="Meekijk-link delen" onClick={() => doShare(false)} />
            <IconButton icon="more" label="Menu" onClick={() => setMenu(true)} />
          </>
        }
      />
      <Page>
        {!canEdit && (
          <div className="mt-4 flex items-center justify-between border border-line px-3 py-2 text-[13px]">
            <span className="text-muted">Je kijkt mee. Alleen de scorebijhouder voert in.</span>
            <span className="flex items-center gap-1.5 font-mono text-xs">
              <span className={`h-1.5 w-1.5 ${live === 'live' ? 'bg-accent' : 'bg-faint'}`} />
              {LIVE_LABEL[live]}
            </span>
          </div>
        )}

        <div className="pt-2">
          <Standings state={state} rules={game.rules} />
        </div>

        <div className="pt-6">
          <Segmented value={tab} onChange={setTab} options={tabs} />
        </div>

        {tab === 'round' && canEdit && (
          state.isOver ? (
            <div className="pt-8">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">Winnaar</div>
              <h2 className="mt-1 text-[40px] font-extrabold leading-none tracking-[-0.03em]">{state.champion?.name ?? 'Potje beëindigd'}</h2>
              {state.champion && <p className="mt-2 font-mono text-sm text-muted">{state.champion.score} punten na {game.rounds.length} rondes</p>}
              <div className="mt-6 grid gap-2">
                <Button onClick={() => navigate(`/g/${createGame(game.players.map(p => p.id), game.rules, game.players)}`)}>
                  Nieuw potje, zelfde spelers
                </Button>
                {game.endedManually && (
                  <Button variant="secondary" onClick={() => updateGame(id, g => ({ ...g, endedManually: false }))}>Verder spelen</Button>
                )}
                <Button variant="secondary" onClick={() => navigate('/')}>Naar beginscherm</Button>
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
                  className="mt-2 w-full"
                  onClick={() => {
                    if (confirm(`Ronde ${game.rounds.length} ongedaan maken?`)) updateGame(id, g => ({ ...g, rounds: g.rounds.slice(0, -1) }));
                  }}
                >
                  <Icon name="undo" size={16} /> Laatste ronde ongedaan maken
                </Button>
              )}
            />
          )
        )}

        {tab === 'history' && (
          <div className="pt-4">
            <HistoryTable state={state} players={game.players} onEdit={canEdit ? setEditIdx : undefined} />
          </div>
        )}

        {tab === 'rules' && (
          <div className="pt-4">
            <ul>
              {describeRules(game.rules).map(l => <li key={l} className="border-b border-line-soft py-3 text-[15px]">{l}</li>)}
            </ul>
            {canEdit && <Button variant="secondary" className="mt-4 w-full" onClick={() => setEditRules(game.rules)}>Regels van dit potje aanpassen</Button>}
          </div>
        )}
      </Page>

      <Modal open={menu} onClose={() => setMenu(false)} title={<>Potje <span className="font-mono text-accent">{id}</span></>}>
        <div className="grid gap-2">
          <Button variant="secondary" onClick={() => doShare(false)}>Meekijk-link delen</Button>
          {canEdit && (
            <>
              <Button variant="secondary" onClick={() => doShare(true)}>Bewerk-link delen</Button>
              <p className="pb-2 text-xs text-muted">Met de bewerk-link kan een ander toestel ook scores invoeren. Deel die alleen met wie de score overneemt.</p>
              {!state.isOver && (
                <Button variant="secondary" onClick={() => {
                  if (confirm('Potje nu beëindigen? De speler met de laagste score wint.')) {
                    updateGame(id, g => ({ ...g, endedManually: true }));
                    setMenu(false);
                    setTab('round');
                  }
                }}>Potje beëindigen</Button>
              )}
              <Button variant="danger" onClick={async () => {
                if (confirm('Dit potje definitief verwijderen, ook voor meekijkers?')) {
                  await deleteGameEverywhere(id);
                  navigate('/');
                }
              }}>Potje verwijderen</Button>
            </>
          )}
          <Button variant="ghost" onClick={() => navigate('/')}>Naar beginscherm</Button>
        </div>
      </Modal>

      <Modal open={editRules !== null} onClose={() => setEditRules(null)} title="Regels van dit potje">
        {editRules && (
          <div>
            <p className="border-l-2 border-accent pl-3 text-[13px]">Alle standen worden met de nieuwe regels opnieuw berekend.</p>
            <RulesEditor rules={editRules} onChange={setEditRules} />
            <Button className="mt-6 w-full" onClick={() => { updateGame(id, g => ({ ...g, rules: editRules })); setEditRules(null); }}>Opslaan</Button>
          </div>
        )}
      </Modal>

      <Modal open={editIdx !== null} onClose={() => setEditIdx(null)} title={editIdx !== null ? `Ronde ${editIdx + 1} aanpassen` : ''}>
        {editIdx !== null && game.rounds[editIdx] && (
          <div>
            {game.rounds[editIdx].fixedScores && (
              <p className="border-l-2 border-accent pl-3 text-[13px]">Deze ronde komt uit de oude app en heeft geen handpunten. Na opslaan wordt hij opnieuw berekend.</p>
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
                <Button variant="danger" className="mt-2 w-full" onClick={() => {
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
          <div className="bg-fg px-4 py-2.5 text-sm font-semibold text-bg">{toast}</div>
        </div>
      )}
    </div>
  );
}
