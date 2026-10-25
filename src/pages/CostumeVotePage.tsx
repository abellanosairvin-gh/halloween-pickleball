import { useEffect, useMemo, useState } from 'react';
import { useAccess } from '../auth/Access';
import { PhotoViewer } from '../components/CostumePhoto';
import { Dialog } from '../components/Dialog';
import { useEventData } from '../data/EventData';
import { eligibleVoters, entrantName, lineUp, type Voter } from '../domain/costume';
import { GENDER_LABEL } from '../domain/teams';
import type { BallotStatus, CostumeEntrant, Gender } from '../domain/types';
import { repo } from '../lib/backend';
import { readBallot, type StoredBallot, writeBallot } from '../lib/ballotStore';

const GENDERS: Gender[] = ['F', 'M'];

/** Party page: say who you are, then vote once for the best costume among the women and among the men. */
export function CostumeVotePage() {
  const { data, run } = useEventData();
  const { meId } = useAccess();
  const { players, entrants, ballots, voting } = data!;
  const [stored, setStored] = useState<StoredBallot | null>(readBallot);
  /** This phone's ballot as the server has it: undefined while loading, null once the organizer cleared it. */
  const [status, setStatus] = useState<BallotStatus | null | undefined>(undefined);
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [picks, setPicks] = useState<Record<Gender, string | null>>({ F: null, M: null });
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);

  const voters = useMemo(() => eligibleVoters(players, entrants), [players, entrants]);
  const voted = new Set(ballots);

  // Re-check this phone's ballot whenever the line-up changes: removing someone it voted for frees that award.
  const token = stored?.token ?? null;
  useEffect(() => {
    if (!token) return;
    let current = true;
    repo.ballotStatus(token).then(
      (s) => current && setStatus(s),
      () => {},
    );
    return () => {
      current = false;
    };
  }, [token, entrants, ballots]);

  /** Who a voter can pick for an award: the line-up, minus themselves. */
  const choices = (gender: Gender, who: Voter | null) =>
    lineUp(gender, entrants, players).filter((e) => e.id !== who?.entrantId);

  // A phone that already voted can only fill in awards its ballot lost, as the same voter.
  const continuing = stored && status ? (voters.find((v) => v.id === status.voterId) ?? null) : null;
  const toFill = continuing ? GENDERS.filter((g) => !status!.genders.includes(g) && choices(g, continuing).length > 0) : [];

  // The player this phone checked in as is the likely voter, until they say otherwise.
  const voterId = chosenId ?? (meId && voters.some((v) => v.id === meId) && !voted.has(meId) ? meId : null);
  const voter = stored ? (toFill.length > 0 ? continuing : null) : (voters.find((v) => v.id === voterId && !voted.has(v.id)) ?? null);
  const awards = stored ? toFill : GENDERS;

  // A confirmation left open when the ballot went away (voting closed, someone else voted) mustn't pop back up.
  useEffect(() => setConfirming(false), [voting.open, voter?.id, awards.length]);

  /** A pick only counts while its person is still a choice; someone removed meanwhile drops out. */
  const pickFor = (g: Gender) => (choices(g, voter).some((e) => e.id === picks[g]) ? picks[g] : null);
  const missing = awards.some((g) => choices(g, voter).length > 0 && !pickFor(g));
  const ready = !missing && awards.some((g) => pickFor(g));
  const name = (id: string | null) => {
    const e = entrants.find((x) => x.id === id);
    return e ? entrantName(e, players) : '';
  };

  const head = (
    <header className="page-head">
      <h1 className="page-title">Best in costume</h1>
      <p className="page-meta">
        Vote for the best costume among the women and among the men. Only the organizer sees who you picked, and you only get
        one vote.
      </p>
    </header>
  );

  const notice = (title: string, text: string) => (
    <>
      {head}
      <div className="vote-done" role="status">
        <p className="vote-done__title">{title}</p>
        <p>{text}</p>
      </div>
      <CostumeGallery />
    </>
  );

  if (stored && (!voting.open || toFill.length === 0)) {
    const who = voters.find((v) => v.id === stored.voterId)?.name;
    return notice(who ? `Thanks, ${who}!` : 'Thanks!', 'This phone has voted. The winners are announced at the party.');
  }

  if (!voting.open) {
    return voting.closed
      ? notice('Voting is closed', 'Thanks to everyone who voted. The winners are announced at the party.')
      : notice(
          'Voting hasn’t opened yet',
          'It opens once everyone in costume is on the list. This page updates by itself when it does.',
        );
  }

  async function cast() {
    if (!voter || !ready) return;
    setBusy(true);
    const pickIn = (g: Gender) => (awards.includes(g) ? pickFor(g) : null);
    const ballot = await run(['votes', 'ballots'], (r) => r.castVotes(voter.id, pickIn('F'), pickIn('M'), stored?.token ?? null));
    setBusy(false);
    setConfirming(false);
    if (ballot) {
      const next = { voterId: voter.id, token: ballot };
      writeBallot(next);
      setStored(next);
      setStatus(undefined);
      setPicks({ F: null, M: null });
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
        {!stored && (
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
        )}
      </div>
      {stored && (
        <p className="page-meta vote-refill">
          Someone you voted for left the line-up, so you can vote again for the{' '}
          {awards.map((g) => GENDER_LABEL[g].toLowerCase()).join(' and ')}.
        </p>
      )}

      {awards.map((gender) => {
        const options = choices(gender, voter);
        return (
          <fieldset key={gender} className="vote-group">
            <legend className="section-title">{GENDER_LABEL[gender]}</legend>
            {options.length === 0 ? (
              <p className="roster__empty">Nobody to vote for here yet.</p>
            ) : (
              <div className="vote-cards">
                {options.map((e) => (
                  <div key={e.id} className="vote-card">
                    <label className="vote-card__pick">
                      <input
                        type="radio"
                        name={`vote-${gender}`}
                        checked={pickFor(gender) === e.id}
                        onChange={() => setPicks((prev) => ({ ...prev, [gender]: e.id }))}
                      />
                      <span className="vote-card__face">
                        {e.thumbUrl && <img className="photo-tile__img" src={e.thumbUrl} alt="" loading="lazy" />}
                        <span className="vote-card__name">{entrantName(e, players)}</span>
                      </span>
                    </label>
                    {/* Beside the label, not in it, so it opens the photo without picking them. */}
                    {e.photoUrl && (
                      <button
                        type="button"
                        className="vote-card__zoom"
                        aria-label={`See ${entrantName(e, players)}’s photo bigger`}
                        onClick={() => setViewing(e.id)}
                      >
                        <ZoomIcon />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </fieldset>
        );
      })}

      <div className="vote-submit">
        <button type="button" className="btn btn--primary btn--block" disabled={!ready} onClick={() => setConfirming(true)}>
          Cast my {awards.filter((g) => choices(g, voter).length > 0).length === 1 ? 'vote' : 'votes'}
        </button>
        {missing && (
          <p className="pick-list__note">{awards.length === 1 ? 'Pick one to vote.' : 'Pick one in each group to vote.'}</p>
        )}
      </div>

      <PhotoViewer entrantId={viewing} onClose={() => setViewing(null)} />
      <Dialog open={confirming} onClose={() => setConfirming(false)} title="Cast your votes?">
        <ul className="change-list">
          {awards
            .filter((g) => pickFor(g))
            .map((g) => (
              <li key={g}>
                {GENDER_LABEL[g]}: {name(pickFor(g))}
              </li>
            ))}
        </ul>
        <p className="dialog__text">You can’t change your votes after this.</p>
        <div className="dialog__actions">
          <button type="button" className="btn btn--quiet" onClick={() => setConfirming(false)}>
            Keep choosing
          </button>
          <button type="button" className="btn btn--primary" disabled={busy || !ready} onClick={() => void cast()}>
            Vote
          </button>
        </div>
      </Dialog>
    </>
  );
}

function ZoomIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M10 3a7 7 0 0 1 5.6 11.2l5.1 5.1-1.4 1.4-5.1-5.1A7 7 0 1 1 10 3zm0 2a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm-1 2h2v2h2v2h-2v2H9v-2H7V9h2z" />
    </svg>
  );
}

/** Everyone in costume, with their photos, for when guests aren't voting: before it opens, after they vote, once it closes. */
function CostumeGallery() {
  const { data } = useEventData();
  const { players, entrants } = data!;
  const [viewing, setViewing] = useState<string | null>(null);
  if (entrants.length === 0) return null;
  const name = (e: CostumeEntrant) => entrantName(e, players);

  return (
    <section className="costume-gallery" aria-labelledby="costume-gallery-title">
      <h2 id="costume-gallery-title" className="section-title">
        In costume
      </h2>
      {GENDERS.map((gender) => {
        const list = lineUp(gender, entrants, players);
        if (list.length === 0) return null;
        return (
          <div key={gender} className="vote-group">
            <h3 className="roster__title">{GENDER_LABEL[gender]}</h3>
            <ul className="vote-cards">
              {list.map((e) => (
                <li key={e.id}>
                  {e.photoUrl ? (
                    <button type="button" className="photo-tile" onClick={() => setViewing(e.id)}>
                      <img className="photo-tile__img" src={e.thumbUrl ?? e.photoUrl} alt="" loading="lazy" />
                      <span className="vote-card__name">{name(e)}</span>
                    </button>
                  ) : (
                    <div className="photo-tile">
                      <span className="vote-card__name">{name(e)}</span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      <PhotoViewer entrantId={viewing} onClose={() => setViewing(null)} />
    </section>
  );
}
