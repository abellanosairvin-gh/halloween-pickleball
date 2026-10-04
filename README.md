# Irvin's Halloween Pickleball Party

Organizer site for the party: check players in (which assigns their team), record wins and losses during team play, and run the women's and men's doubles brackets.

- **Players** – women on the left and men on the right, A before B. Tap a name to check them in, which assigns a team and shows the reveal. Tap a checked-in player to move them, undo the check-in or edit their details. **Edit list** switches the page to editing, where you can add, rename, re-level or delete players. A player in a locked tournament pair can't change gender or team, undo their check-in or be deleted until that bracket is reset.
- **Teams** – team standings by win rate (the prize goes to the leader), and each team's women and men by win rate, with a green/red bar per game. **+W** / **+L** ask for confirmation before recording. Tap a player's record to remove a result entered by mistake. **Simulate 5 games** adds random results to every checked-in player for a dry run; they're marked as simulated and **Clear simulated results** removes only those.
- **Tournament** – each team's top 2 women and top 2 men by win rate form fixed doubles pairs. Only players with at least 4 recorded games qualify (`MIN_PAIR_GAMES` in `src/domain/standings.ts`, also enforced in `set_bracket_pairs`). Lock the pairs to draw the semifinals at random, then tap the winning pair of each match.

## How teams stay fair

`check_in_player` (in `supabase/migrations/0001_init.sql`, mirrored in `src/domain/assign.ts`) puts each arriving player on the team with the fewest checked-in players of the same gender and skill, then the same gender, then fewest overall, then at random. Every gender × skill group stays within one player across teams no matter who arrives when. With all 40 players, each team gets 2–3 A women and 4–5 A men. Check-ins are serialized in the database, so simultaneous QR check-ins can't unbalance it.

## Run it locally (demo mode)

```bash
npm install
npm run dev
```

Without Supabase settings the app runs in **demo mode**: data is kept in this browser's local storage, and the login accepts any email with the password `boo`. Use **Reset demo data** on any page to start over.

## Connect Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. In the SQL editor, run each file in `supabase/migrations` in order (`0001_init.sql`, then `0002_simulated_results.sql`, then `0003_party_page.sql`), then `supabase/seed.sql`. If you already ran `0001`, just run the newer files.
3. Under **Authentication → Users**, add the organizer (email and password). Turn off public sign-ups under **Authentication → Providers → Email** so nobody else can create an account.
4. Copy `.env.example` to `.env` and fill in the project URL and anon key from **Project Settings → API**.
5. `npm run dev`, then sign in as the organizer.

Changes appear live on every signed-in device through Supabase Realtime.

## Deploy (Vercel)

Import the folder as a Vite project, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as environment variables, and deploy. `vercel.json` routes every path to the app.

## Updating the roster

For changes on the day, use **Edit list** on the Players tab. To reload the whole list, put `pickleball_players.xlsx` in the project root (it isn't committed to the repository), edit it, and run `npm run seed:sql`. This regenerates `supabase/seed.sql` and the demo roster. Re-running the seed on Supabase updates existing players by name and adds new ones. It also brings back anyone deleted in the app who is still in the spreadsheet.

## Tests

```bash
npm test
```

Covers team balancing for any arrival order, standings and tie-breaks, qualifiers, the random draw and bracket progression. It also runs the real SQL migration in an in-memory Postgres (PGlite) to check `check_in_player` and the bracket functions.

## Party page and QR code

Guests don't need an account. The **QR code** button in the organizer header shows a code for `/party`, with options to copy the link or print a poster (`/qr`). The party page has three tabs:

- **Check in** – guests find their name, confirm "Check in as …?", and see their team reveal. Their phone remembers them and shows "Irene, you're on Witch" on every tab.
- **Teams** and **Tournament** – the live standings and brackets, read-only.

Set `VITE_PUBLIC_URL` to the deployed address so the QR code points at the live site even when you open the organizer screens elsewhere. The QR dialog warns you if the link would point at `localhost`.

Anonymous visitors can read players, results and brackets (`0003_party_page.sql`). The only change they can make is checking in through `check_in_player`. Everything else is refused by the database, which the SQL tests check by running as the `anon` role.
