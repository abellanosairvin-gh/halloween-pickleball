import { type ChangeEvent, type CSSProperties, type FormEvent, useMemo, useState } from 'react';
import { useEventData } from '../data/EventData';
import { eligibleVoters, entrantName, standing } from '../domain/costume';
import { MAX_NAME_LENGTH, normalizeName } from '../domain/roster';
import { GENDER_LABEL } from '../domain/teams';
import type { CostumeEntrant, Gender } from '../domain/types';
import { shrinkPhoto } from '../lib/photo';
import { CameraIcon, PhotoViewer } from './CostumePhoto';
import { ConfirmDialog, Dialog } from './Dialog';
import { useToast } from './Toast';

/** Organizer only: who is in the Best in Costume line-up, the live vote counts, and tie-breaks. */
export function CostumeSection() {
  const { data, run } = useEventData();
  const toast = useToast();
  const { players, entrants, votes, voting, ballots } = data!;
  const [adding, setAdding] = useState(false);
  /** Open (true) or close (false) voting, waiting for confirmation. Fixed when asked, in case another device toggles it. */
  const [confirmVoting, setConfirmVoting] = useState<boolean | null>(null);
  const [showVoters, setShowVoters] = useState(false);
  const [removing, setRemoving] = useState<CostumeEntrant | null>(null);
  const [photographing, setPhotographing] = useState<string | null>(null);

  const voterCount = eligibleVoters(players, entrants).length;
  const votedCount = ballots.length;
  const removingName = removing ? entrantName(removing, players) : '';
  const removingVotes = removing ? votes.filter((v) => v.entrantId === removing.id).length : 0;
  const removingVoted = removing ? ballots.includes(removing.id) : false;

  return (
    <section className="costume" aria-labelledby="costume-title">
      <div className="costume__head">
        <h2 id="costume-title" className="section-title">
          Best in costume
          <span className="section-count">
            {votedCount} of {voterCount} voted
          </span>
          <span className={`costume__status ${voting.open ? 'is-open' : ''}`}>
            {voting.open ? 'Voting open' : voting.closed ? 'Voting closed' : 'Not open yet'}
          </span>
        </h2>
        <div className="toolbar__actions">
          <button type="button" className="btn btn--small btn--quiet" disabled={votedCount === 0} onClick={() => setShowVoters(true)}>
            Who voted
          </button>
          <button type="button" className="btn btn--small" onClick={() => setAdding(true)}>
            Add costume
          </button>
          <button
            type="button"
            className={`btn btn--small ${voting.open ? 'btn--danger-quiet' : 'btn--primary'}`}
            onClick={() => setConfirmVoting(!voting.open)}
          >
            {voting.open ? 'Close voting' : 'Open voting'}
          </button>
        </div>
      </div>
      <p className="page-meta costume__intro">
        {voting.open
          ? 'Guests are voting on the party page’s Costume tab: one woman and one man each, once. Only you see the counts.'
          : voting.closed
            ? 'Voting is closed and guests can’t vote. Open it again to let more people vote.'
            : 'Add everyone in costume, then open voting. Guests vote once and can’t change it, so anyone added after they vote misses out on their vote.'}{' '}
        Tap the camera beside a name to photograph their costume, so guests can still see it after they change.
      </p>

      <div className="roster-columns">
        {(['F', 'M'] as Gender[]).map((gender) => (
          <CostumeColumn key={gender} gender={gender} onRemove={setRemoving} onPhoto={(e) => setPhotographing(e.id)} />
        ))}
      </div>

      <ConfirmDialog
        open={confirmVoting !== null}
        tone={confirmVoting ? 'primary' : 'danger'}
        title={confirmVoting ? 'Open voting?' : 'Close voting?'}
        message={
          confirmVoting
            ? `Guests can vote on the party page’s Costume tab right away. Is everyone in costume on the list? There are ${
                entrants.length
              } in the line-up now, and each guest votes only once.`
            : 'Guests can’t vote until you open it again. Votes already cast are kept.'
        }
        confirmLabel={confirmVoting ? 'Open voting' : 'Close voting'}
        onConfirm={() => {
          const open = confirmVoting!;
          void run(['voting'], async (r) => {
            await r.setCostumeVoting(open);
            toast.show(open ? 'Voting is open' : 'Voting is closed');
          });
        }}
        onCancel={() => setConfirmVoting(null)}
      />
      <CostumeForm open={adding} onClose={() => setAdding(false)} />
      <PhotoDialog entrantId={photographing} onClose={() => setPhotographing(null)} />
      <VotersDialog open={showVoters} onClose={() => setShowVoters(false)} />
      <ConfirmDialog
        open={removing !== null}
        title={`Remove ${removingName}?`}
        message={
          <>
            {removingName} leaves the costume line-up.
            {removingVotes > 0 &&
              ` The ${removingVotes} ${removingVotes === 1 ? 'vote' : 'votes'} they got ${
                removingVotes === 1 ? 'is' : 'are'
              } removed, and those voters can vote again for that award from the phone they used.`}
            {removingVoted && ' Their own vote is removed as well.'}
          </>
        }
        confirmLabel="Remove"
        onConfirm={() => {
          const entrant = removing!;
          void run(['entrants', 'votes', 'picks', 'ballots'], async (r) => {
            await r.removeCostumeEntrant(entrant.id);
            toast.show(`Removed ${entrantName(entrant, players)} from the line-up`);
          });
        }}
        onCancel={() => setRemoving(null)}
      />
    </section>
  );
}

function CostumeColumn({
  gender,
  onRemove,
  onPhoto,
}: {
  gender: Gender;
  onRemove: (entrant: CostumeEntrant) => void;
  onPhoto: (entrant: CostumeEntrant) => void;
}) {
  const { data, run } = useEventData();
  const { players, entrants, votes, picks } = data!;
  const { ranked, leaders, winner } = standing(gender, entrants, players, votes, picks);
  const top = ranked[0]?.votes ?? 0;
  const name = (e: CostumeEntrant) => entrantName(e, players);

  return (
    <section className="roster" aria-labelledby={`costume-${gender}`}>
      <h3 id={`costume-${gender}`} className="roster__title">
        {GENDER_LABEL[gender]}
        <span className="section-count">{ranked.length} in costume</span>
      </h3>
      {ranked.length === 0 ? (
        <p className="roster__empty">Nobody yet. Use Add costume.</p>
      ) : (
        <ul className="roster__list">
          {ranked.map(({ entrant, votes: count }) => (
            <li key={entrant.id}>
              <div className={`costume__row ${winner?.id === entrant.id ? 'is-winner' : ''}`}>
                <button
                  type="button"
                  className={`costume__thumb ${entrant.photoUrl ? '' : 'is-empty'}`}
                  onClick={() => onPhoto(entrant)}
                  aria-label={entrant.photoUrl ? `Photo of ${name(entrant)}` : `Add a photo of ${name(entrant)}`}
                >
                  {entrant.thumbUrl ? <img src={entrant.thumbUrl} alt="" loading="lazy" /> : <CameraIcon />}
                </button>
                <span className="costume__who">
                  <span className="costume__name">
                    {name(entrant)}
                    {winner?.id === entrant.id && <span className="member__tie">Winner</span>}
                  </span>
                  {entrant.guestName !== null && <span className="costume__note">Not playing</span>}
                </span>
                <span className="costume__count">
                  {count}
                  <span className="visually-hidden">{count === 1 ? ' vote' : ' votes'}</span>
                </span>
                <button type="button" className="roster__btn" onClick={() => onRemove(entrant)} aria-label={`Remove ${name(entrant)}`}>
                  <span className="costume__remove" aria-hidden="true">
                    ×
                  </span>
                </button>
                <span
                  className="costume__bar"
                  style={{ '--share': top ? count / top : 0 } as CSSProperties}
                  aria-hidden="true"
                />
              </div>
            </li>
          ))}
        </ul>
      )}
      {leaders.length > 1 && (
        <div className="costume__tie" role="status">
          <p>
            {leaders.length} tied at {top} {top === 1 ? 'vote' : 'votes'}.{' '}
            {winner ? `You picked ${name(winner)}.` : 'Pick the winner:'}
          </p>
          <div className="costume__tie-picks">
            {leaders.map((e) => (
              <button
                key={e.id}
                type="button"
                className="btn btn--small"
                aria-pressed={winner?.id === e.id}
                onClick={() => void run(['picks'], (r) => r.setCostumePick(gender, winner?.id === e.id ? null : e.id))}
              >
                {name(e)}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * Takes, replaces or removes the photo of someone in the line-up. Shows the live photo, so a new one appears at once.
 * Only one save or removal runs at a time, so a removal can't land after (and delete) a photo taken just after it.
 */
function PhotoDialog({ entrantId, onClose }: { entrantId: string | null; onClose: () => void }) {
  const { data, run } = useEventData();
  const toast = useToast();
  const [busy, setBusy] = useState<'saving' | 'removing' | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const { players, entrants } = data!;
  const entrant = entrants.find((e) => e.id === entrantId) ?? null;
  const name = entrant ? entrantName(entrant, players) : '';

  const close = () => {
    setConfirmRemove(false);
    onClose();
  };

  async function choose(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Cleared so picking the same file again still counts as a change.
    e.target.value = '';
    if (!file || !entrant || busy) return;
    setBusy('saving');
    try {
      const photo = await shrinkPhoto(file);
      const ok = await run(['entrants'], async (r) => {
        await r.setCostumePhoto(entrant.id, photo);
        return true;
      });
      if (ok) toast.show(`Saved ${name}’s photo`);
    } catch (err) {
      toast.show((err as Error).message, { tone: 'error' });
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!entrant || busy) return;
    setConfirmRemove(false);
    setBusy('removing');
    const ok = await run(['entrants'], async (r) => {
      await r.setCostumePhoto(entrant.id, null);
      return true;
    });
    setBusy(null);
    if (ok) toast.show(`Removed ${name}’s photo`);
  }

  if (entrant && confirmRemove) {
    return (
      <Dialog open onClose={close} title={`Remove ${name}’s photo?`}>
        <p className="dialog__text">
          Guests stop seeing their costume. Phones that already loaded it can keep showing it for up to an hour. You can
          take a new photo afterwards.
        </p>
        <div className="dialog__actions">
          <button type="button" className="btn btn--quiet" onClick={() => setConfirmRemove(false)}>
            Keep photo
          </button>
          <button type="button" className="btn btn--danger" onClick={() => void remove()}>
            Remove photo
          </button>
        </div>
      </Dialog>
    );
  }

  return (
    <PhotoViewer
      entrantId={entrantId}
      onClose={close}
      empty="No photo yet. Take one while they’re in costume, and guests see it beside their name when they vote."
      actions={
        <>
          {entrant?.photoUrl && (
            <button type="button" className="btn btn--danger-quiet" disabled={busy !== null} onClick={() => setConfirmRemove(true)}>
              {busy === 'removing' ? 'Removing…' : 'Remove photo'}
            </button>
          )}
          <button type="button" className="btn btn--quiet" onClick={close}>
            Done
          </button>
          {/* On a phone this offers the camera or the photo library. */}
          <label className={`btn btn--primary photo-pick ${busy ? 'is-busy' : ''}`}>
            <input
              type="file"
              accept="image/*"
              className="visually-hidden"
              disabled={busy !== null}
              onChange={(e) => void choose(e)}
            />
            {busy === 'saving' ? 'Saving…' : entrant?.photoUrl ? 'Replace photo' : 'Add photo'}
          </label>
        </>
      }
    />
  );
}

/** Adds a player, or a guest who isn't playing, to the line-up. Stays open so several can be added in a row. */
function CostumeForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, run } = useEventData();
  const toast = useToast();
  const [mode, setMode] = useState<'player' | 'guest'>('player');
  const [query, setQuery] = useState('');
  const [name, setName] = useState('');
  const [gender, setGender] = useState<Gender | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { players, entrants } = data!;

  // Only players who are here: someone not checked in yet isn't at the party to be in costume.
  const checkedIn = useMemo(() => players.filter((p) => p.checkedInAt !== null), [players]);
  const available = useMemo(() => {
    const entered = new Set(entrants.map((e) => e.playerId));
    const q = query.trim().toLowerCase();
    return checkedIn
      .filter((p) => !entered.has(p.id) && (!q || p.name.toLowerCase().includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [checkedIn, entrants, query]);
  const emptyMessage = query
    ? 'No checked-in players match.'
    : checkedIn.length === 0
      ? 'Nobody is checked in yet. Players show up here once they check in.'
      : 'Every checked-in player is already in the line-up.';

  const close = () => {
    setQuery('');
    setName('');
    setGender(null);
    setError(null);
    onClose();
  };

  async function addPlayer(playerId: string, playerName: string) {
    setBusy(true);
    const ok = await run(['entrants'], async (r) => {
      await r.addCostumePlayer(playerId);
      return true;
    });
    setBusy(false);
    if (ok) toast.show(`Added ${playerName} to the line-up`);
  }

  async function addGuest(e: FormEvent) {
    e.preventDefault();
    const clean = normalizeName(name);
    if (!clean) return setError('Enter a name.');
    if (clean.length > MAX_NAME_LENGTH) return setError(`Keep the name under ${MAX_NAME_LENGTH} characters.`);
    if (!gender) return setError('Choose the women’s or men’s award.');
    setError(null);
    setBusy(true);
    const ok = await run(['entrants'], async (r) => {
      await r.addCostumeGuest(clean, gender);
      return true;
    });
    setBusy(false);
    if (ok) {
      toast.show(`Added ${clean} to the line-up`);
      setName('');
      setGender(null);
    }
  }

  return (
    <Dialog open={open} onClose={close} title="Add to the costume line-up">
      <div className="segmented costume__mode">
        <button type="button" aria-pressed={mode === 'player'} onClick={() => setMode('player')}>
          A player
        </button>
        <button type="button" aria-pressed={mode === 'guest'} onClick={() => setMode('guest')}>
          Not playing
        </button>
      </div>

      {mode === 'player' ? (
        <>
          <label className="field">
            <span className="field__label">Find a checked-in player</span>
            <input className="input" type="search" value={query} autoComplete="off" onChange={(e) => setQuery(e.target.value)} />
          </label>
          {available.length === 0 ? (
            <p className="dialog__text">{emptyMessage}</p>
          ) : (
            <ul className="pick-list costume__players">
              {available.map((p) => (
                <li key={p.id}>
                  <button type="button" className="costume__add" disabled={busy} onClick={() => void addPlayer(p.id, p.name)}>
                    <span className="pick-list__name">{p.name}</span>
                    <span className="pick-list__note">{GENDER_LABEL[p.gender]}</span>
                    <span className="costume__plus" aria-hidden="true">
                      +
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <form className="player-form" onSubmit={(e) => void addGuest(e)} noValidate>
          <p className="dialog__text">For someone in costume who isn’t on the player list. They can vote too.</p>
          <label className="field">
            <span className="field__label">Name</span>
            <input
              className="input"
              value={name}
              maxLength={MAX_NAME_LENGTH + 10}
              autoComplete="off"
              autoCapitalize="words"
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <fieldset className="choice-field">
            <legend className="field__label">Award</legend>
            <div className="choices">
              {(['F', 'M'] as const).map((value) => (
                <label key={value} className="choice">
                  <input type="radio" name="costume-gender" checked={gender === value} onChange={() => setGender(value)} />
                  <span>{GENDER_LABEL[value]}</span>
                </label>
              ))}
            </div>
          </fieldset>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="dialog__actions">
            <button type="submit" className="btn btn--primary" disabled={busy}>
              Add
            </button>
          </div>
        </form>
      )}

      <div className="dialog__actions">
        <button type="button" className="btn btn--quiet" onClick={close}>
          Done
        </button>
      </div>
    </Dialog>
  );
}

/** Everyone who has voted, with a way to clear a vote someone cast in another person's name. */
function VotersDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, run } = useEventData();
  const toast = useToast();
  const [clearing, setClearing] = useState<{ id: string; name: string } | null>(null);
  const { players, entrants, votes, ballots } = data!;
  const voted = new Set(ballots);
  const list = eligibleVoters(players, entrants).filter((v) => voted.has(v.id));
  /** Who a voter picked, as "Women: Adi · Men: Count Dracula". An award they lost shows as not voted. */
  const picksOf = (voterId: string) =>
    (['F', 'M'] as Gender[])
      .map((g) => {
        const entrant = entrants.find((e) => e.id === votes.find((v) => v.voterId === voterId && v.gender === g)?.entrantId);
        return `${GENDER_LABEL[g]}: ${entrant ? entrantName(entrant, players) : 'not voted'}`;
      })
      .join(' · ');

  const close = () => {
    setClearing(null);
    onClose();
  };

  if (clearing) {
    return (
      <Dialog open={open} onClose={close} title={`Clear ${clearing.name}’s vote?`}>
        <p className="dialog__text">
          Their votes are removed and {clearing.name} can vote again. Use this when someone else voted in their name. The
          phone that cast the vote still can’t vote again.
        </p>
        <div className="dialog__actions">
          <button type="button" className="btn btn--quiet" onClick={() => setClearing(null)}>
            Keep vote
          </button>
          <button
            type="button"
            className="btn btn--danger"
            onClick={() => {
              const voter = clearing;
              setClearing(null);
              void run(['votes', 'ballots'], async (r) => {
                await r.clearCostumeVotes(voter.id);
                toast.show(`Cleared ${voter.name}’s vote`);
              });
            }}
          >
            Clear vote
          </button>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onClose={close} title="Who voted for whom">
      {list.length === 0 ? (
        <p className="dialog__text">Nobody has voted yet.</p>
      ) : (
        <ul className="pick-list">
          {list.map((v) => (
            <li key={v.id} className="costume__voter">
              <span className="pick-list__who">
                <span className="pick-list__name">{v.name}</span>
                <span className="pick-list__note">{picksOf(v.id)}</span>
              </span>
              <button type="button" className="btn btn--small btn--danger-quiet" onClick={() => setClearing(v)}>
                Clear vote
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="dialog__actions">
        <button type="button" className="btn btn--quiet" onClick={close}>
          Done
        </button>
      </div>
    </Dialog>
  );
}
