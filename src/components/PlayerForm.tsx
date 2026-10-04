import { type FormEvent, useState } from 'react';
import { useEventData } from '../data/EventData';
import { lockedPairMessage, lockedPairPlayerIds, MAX_NAME_LENGTH, nameProblem, normalizeName } from '../domain/roster';
import { recordOf } from '../domain/standings';
import type { Gender, Player, Skill } from '../domain/types';
import { Dialog } from './Dialog';
import { useToast } from './Toast';

interface Props {
  /** The player to edit, or 'new' to add one. null keeps the dialog closed. */
  target: Player | 'new' | null;
  onClose: () => void;
}

export function PlayerForm({ target, onClose }: Props) {
  if (!target) return <Dialog open={false} onClose={onClose} title="" children={null} />;
  // Keyed so the fields reset whenever a different player is opened.
  return <PlayerFormBody key={target === 'new' ? 'new' : target.id} player={target === 'new' ? null : target} onClose={onClose} />;
}

function PlayerFormBody({ player, onClose }: { player: Player | null; onClose: () => void }) {
  const { data, records, run } = useEventData();
  const toast = useToast();
  const [name, setName] = useState(player?.name ?? '');
  const [gender, setGender] = useState<Gender | null>(player?.gender ?? null);
  const [skill, setSkill] = useState<Skill | null>(player?.skill ?? null);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const locked = player ? lockedPairPlayerIds(data!.pairs).has(player.id) : false;
  const nameError = nameProblem(name, data!.players, player?.id);
  const missing = !gender ? 'Choose women or men.' : !skill ? 'Choose a skill level.' : null;
  const error = submitted ? (nameError ?? missing) : null;
  const games = player ? recordOf(records, player.id).games : 0;

  async function save(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (nameError || !gender || !skill) return;
    setSaving(true);
    const draft = { name, gender, skill };
    const ok = await run(['players'], async (r) => {
      if (player) await r.updatePlayer(player.id, draft);
      else await r.addPlayer(draft);
      return true;
    });
    setSaving(false);
    if (ok) {
      toast.show(player ? `Saved ${normalizeName(name)}` : `Added ${normalizeName(name)}`);
      onClose();
    }
  }

  async function remove() {
    if (!player) return;
    setSaving(true);
    const ok = await run(['players', 'results'], async (r) => {
      await r.deletePlayer(player.id);
      return true;
    });
    setSaving(false);
    if (ok) {
      toast.show(`Deleted ${player.name}`);
      onClose();
    }
  }

  if (player && confirmDelete) {
    return (
      <Dialog open onClose={onClose} title={`Delete ${player.name}?`}>
        <p className="dialog__text">
          {player.name} will be removed from the player list
          {player.teamId ? ' and their team' : ''}.
          {games > 0 && ` Their ${games} recorded ${games === 1 ? 'game is' : 'games are'} deleted too, which changes the team win rate.`}{' '}
          This can’t be undone.
        </p>
        <div className="dialog__actions">
          <button type="button" className="btn btn--quiet" onClick={() => setConfirmDelete(false)}>
            Keep player
          </button>
          <button type="button" className="btn btn--danger" disabled={saving} onClick={() => void remove()}>
            Delete player
          </button>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog open onClose={onClose} title={player ? `Edit ${player.name}` : 'Add a player'}>
      <form className="player-form" onSubmit={save} noValidate>
        <label className="field">
          <span className="field__label">Name</span>
          <input
            className="input"
            value={name}
            maxLength={MAX_NAME_LENGTH + 10}
            autoComplete="off"
            autoCapitalize="words"
            autoFocus={!player}
            aria-invalid={Boolean(submitted && nameError)}
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        <fieldset className="choice-field" disabled={locked}>
          <legend className="field__label">Plays with</legend>
          <div className="choices">
            {(
              [
                ['F', 'Women'],
                ['M', 'Men'],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="choice">
                <input type="radio" name="gender" checked={gender === value} onChange={() => setGender(value)} />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="choice-field">
          <legend className="field__label">Skill level</legend>
          <div className="choices">
            {(['A', 'B'] as const).map((value) => (
              <label key={value} className="choice">
                <input type="radio" name="skill" checked={skill === value} onChange={() => setSkill(value)} />
                <span>{value}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {locked && player && <p className="dialog__text">{lockedPairMessage(player.name)} Until then you can still change the name and skill level.</p>}
        {player?.teamId && !locked && (
          <p className="dialog__text">Changing gender or skill doesn’t move {player.name} to another team.</p>
        )}

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <div className="dialog__actions">
          {player && (
            <button
              type="button"
              className="btn btn--danger-quiet player-form__delete"
              disabled={locked}
              onClick={() => setConfirmDelete(true)}
            >
              Delete player
            </button>
          )}
          <button type="button" className="btn btn--quiet" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn--primary" disabled={saving}>
            {player ? 'Save changes' : 'Add player'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
