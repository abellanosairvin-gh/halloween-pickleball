import { useMemo, useState } from 'react';
import { useAccess } from '../auth/Access';
import { Dialog } from '../components/Dialog';
import { useEventData } from '../data/EventData';
import { eligibleVoters, entrantName, lineUp, votedIds } from '../domain/costume';
import { GENDER_LABEL } from '../domain/teams';
import type { Gender } from '../domain/types';

/** The voter this phone voted as. One phone, one vote, even if the organizer later clears that vote. */
const VOTED_KEY = 'hpp-party-voted-v1';

function readVoted(): string | null {
  try {
    return localStorage.getItem(VOTED_KEY);
  } catch {
    return null;
  }
}

function writeVoted(id: string) {
  try {
    localStorage.setItem(VOTED_KEY, id);
  } catch {
    // Storage unavailable: the server still refuses a second vote under the same name.
  }
}

const GENDERS: Gender[] = ['F', 'M'];

/** Party page: say who you are, then vote once for the best costume among the women and among the men. */
export function CostumeVotePage() {
  const { data, run } = useEventData();
  const { meId } = useAccess();
  const { players, entrants, votes, voting } = data!;
  const [votedAs, setVotedAs] = useState(readVoted);
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [picks, setPicks] = useState<Record<Gender, string | null>>({ F: null, M: null });
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const voters = useMemo(() => eligibleVoters(players, entrants), [players, entrants]);
  const voted = votedIds(votes);
  // The player this phone checked in as is the likely voter, until they say otherwise.
  const voterId = chosenId ?? (meId && voters.some((v) => v.id === meId) && !voted.has(meId) ? meId : null);
  const voter = voters.find((v) => v.id === voterId && !voted.has(v.id)) ?? null;

  /** Who each voter can pick for each award: the line-up, minus themselves. */
  const choices = (gender: Gender) => lineUp(gender, entrants, players).filter((e) => e.id !== voter?.entrantId);
  const name = (id: string | null) => {
    const e = entrants.find((x) => x.id === id);
    return e ? entrantName(e, players) : '';
  };
  const missing = GENDERS.some((g) => choices(g).length > 0 && !choices(g).some((e) => e.id === picks[g]));

  const head = (
    <header className="page-head">
      <h1 className="page-title">Best in costume</h1>
      <p className="page-meta">Vote for the best costume among the women and among the men. Only the organizer sees who you picked, and you only get one vote.</p>
    </header>
  );

  if (votedAs) {
    const who = voters.find((v) => v.id === votedAs)?.name;
    return (
      <>
        {head}
        <div className="vote-done" role="status">
          <p className="vote-done__title">{who ? `Thanks, ${who}!` : 'Thanks!'}</p>
          <p>This phone has voted. The winners are announced at the party.</p>
        </div>
      </>
    );
  }

  if (!voting.open) {
    return (
      <>
        {head}
        <div className="vote-done" role="status">
          <p className="vote-done__title">Voting hasn’t opened yet</p>
          <p>It opens once everyone in costume is on the list. This page updates by itself when it does.</p>
        </div>
      </>
    );
  }

  async function cast() {
    if (!voter) return;
    setBusy(true);
    const ok = await run(['votes'], async (r) => {
      await r.castVotes(voter.id, picks.F, picks.M);
      return true;
    });
    setBusy(false);
    setConfirming(false);
    if (ok) {
      writeVoted(voter.id);
      setVotedAs(voter.id);
    }
  }

  if (!voter) {
    const q = query.trim().toLowerCase();
    const shown = voters.filter((v) => !q || v.name.toLowerCase().includes(q));
    return (
      <>
        {head}
        <h2 className="section-title">Who are you?</h2>
        <label className="search vote-search">
          <span className="visually-hidden">Find your name</span>
          <input className="input" type="search" placeholder="Find your name" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        {shown.length === 0 ? (
          <p className="roster__empty">No names match.</p>
        ) : (
          <ul className="pick-list vote-voters">
            {shown.map((v) => (
              <li key={v.id}>
                <button
                  type="button"
                  className="vote-voter"
                  disabled={voted.has(v.id)}
                  onClick={() => {
                    setChosenId(v.id);
                    setPicks({ F: null, M: null });
                  }}
                >
                  <span className="pick-list__name">{v.name}</span>
                  {voted.has(v.id) && <span className="pick-list__note">Voted</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </>
    );
  }

  return (
    <>
      {head}
      <div className="vote-as">
        <span>
          Voting as <strong>{voter.name}</strong>
        </span>
        <button
          type="button"
          className="me-banner__clear"
          onClick={() => {
            // An empty choice (not null) also skips the checked-in guess, so the full list shows.
            setChosenId('');
            setQuery('');
          }}
        >
          Not you?
        </button>
      </div>

      {GENDERS.map((gender) => {
        const options = choices(gender);
        return (
          <fieldset key={gender} className="vote-group">
            <legend className="section-title">{GENDER_LABEL[gender]}</legend>
            {options.length === 0 ? (
              <p className="roster__empty">Nobody to vote for here yet.</p>
            ) : (
              <div className="vote-cards">
                {options.map((e) => (
                  <label key={e.id} className="vote-card">
                    <input
                      type="radio"
                      name={`vote-${gender}`}
                      checked={picks[gender] === e.id}
                      onChange={() => setPicks((prev) => ({ ...prev, [gender]: e.id }))}
                    />
                    <span>{entrantName(e, players)}</span>
                  </label>
                ))}
              </div>
            )}
          </fieldset>
        );
      })}

      <div className="vote-submit">
        <button type="button" className="btn btn--primary btn--block" disabled={missing || !(picks.F || picks.M)} onClick={() => setConfirming(true)}>
          Cast my votes
        </button>
        {missing && <p className="pick-list__note">Pick one in each group to vote.</p>}
      </div>

      <Dialog open={confirming} onClose={() => setConfirming(false)} title="Cast your votes?">
        <ul className="change-list">
          {GENDERS.filter((g) => picks[g]).map((g) => (
            <li key={g}>
              {GENDER_LABEL[g]}: {name(picks[g])}
            </li>
          ))}
        </ul>
        <p className="dialog__text">You can’t change your votes after this.</p>
        <div className="dialog__actions">
          <button type="button" className="btn btn--quiet" onClick={() => setConfirming(false)}>
            Keep choosing
          </button>
          <button type="button" className="btn btn--primary" disabled={busy} onClick={() => void cast()}>
            Vote
          </button>
        </div>
      </Dialog>
    </>
  );
}
