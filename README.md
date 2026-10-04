# Irvin's Dink or Treat Halloween Birthday Party

Organizer site for the party: check players in (which assigns their team), record wins and losses during team play, and run the women's and men's doubles brackets.

- **Players** – women on the left and men on the right, A before B. Each row has a **Check in** button, which assigns a team and shows the reveal, and an **Edit** button: for a checked-in player it moves them to another team, undoes the check-in or edits their details, and for anyone else it renames, re-levels or deletes them. Tapping the row itself does nothing. **Add player** adds someone who isn't on the list. A player in a locked tournament pair can't change gender or team, undo their check-in or be deleted until that bracket is reset.
- **Teams** – a 1st-to-4th podium of teams by win rate (the prize goes to 1st; on the same win rate the team with more games ranks higher, and on an identical record the team that got there first), and each team's women and men by win rate, with a green/red bar per game. **+W** / **+L** ask for confirmation before recording. Tap a player's record to remove a result entered by mistake. **Simulate 5 games** adds random results to every checked-in player for a dry run; they're marked as simulated and **Clear simulated results** removes only those.
- **Tournament** – each team's top 2 women and top 2 men by win rate form fixed doubles pairs. Only players with at least 4 recorded games qualify (`MIN_PAIR_GAMES` in `src/domain/standings.ts`, also enforced in `set_bracket_pairs`). Lock the pairs to draw the semifinals at random, then tap the winning pair of each match. The semifinal winners play the final and the losers play the battle for 3rd, and the podium below the bracket fills in 1st to 4th.

## How teams stay fair

`check_in_player` (in `db/migrations/0001_schema.sql`, mirrored in `src/domain/assign.ts`) puts each arriving player on the team with the fewest checked-in players of the same gender and skill, then the same gender, then fewest overall, then at random. Every gender × skill group stays within one player across teams no matter who arrives when. With all 40 players, each team gets 2–3 A women and 4–5 A men. Check-ins are serialized in the database, so simultaneous QR check-ins can't unbalance it.

## How it fits together

- **Database:** [Neon](https://neon.tech) Postgres. The schema, the check-in balancing and the bracket rules are SQL in `db/migrations`.
- **API:** Vercel functions in `api/` sit between the site and the database. Anyone can read the event data and check in (`/api/state`, `/api/versions`, `/api/check-in`). Every other change goes through `/api/organizer`, which needs the organizer's session cookie.
- **Sign-in:** one shared organizer password (`ORGANIZER_PASSWORD`). Signing in sets an HttpOnly cookie, signed with `SESSION_SECRET`, that lasts 3 days.
- **Live updates:** every open page polls `/api/versions` every 3 seconds while it's on screen, and refetches only the tables that changed. Hidden tabs stop polling, so Neon can scale to zero when nobody is looking.

## Run it locally

```bash
npm install
npm run dev
```

Without a `DATABASE_URL` the app runs in **demo mode**: data is kept in this browser's local storage and the password is `boo`. Use **Reset demo data** on any page to start over.

To run against Neon instead, copy `.env.example` to `.env`, fill in all three settings, run `npm run db:setup` once, and restart `npm run dev`. The dev server serves the `api/` functions too.

## Set up Neon

1. Create a project at [neon.tech](https://neon.tech). Pick the region closest to where the party is.
2. Copy the **pooled** connection string (Connect → Pooled connection) into `.env` as `DATABASE_URL`.
3. Run `npm run db:setup`. It applies `db/migrations` in order (each only once) and loads the 40 players from `db/seed.sql` if the players table is empty. It's safe to run again after pulling new migrations.

## Deploy (Vercel)

Set three environment variables on the Vercel project: `DATABASE_URL`, `ORGANIZER_PASSWORD` and `SESSION_SECRET`. Then deploy. `vercel.json` sends every path except `/api/*` to the app, and Vercel picks up the functions in `api/` on its own.

`DATABASE_URL` must be set **before** the build: a build without it comes out in demo mode. If you add or change it later, redeploy. Changing `SESSION_SECRET` signs everyone out. Changing `ORGANIZER_PASSWORD` only affects new sign-ins.

## Updating the roster

For changes on the day, use **Add player** and the **Edit** buttons on the Players tab. To reload the whole list, put `pickleball_players.xlsx` in the project root (it isn't committed to the repository), edit it, and run `npm run seed:sql`. This regenerates `db/seed.sql` and the demo roster. `npm run db:setup` only loads the seed into an empty players table. To apply a changed list to a database that already has players, run `db/seed.sql` in the Neon SQL editor. That updates existing players by name and adds new ones, and it also brings back anyone deleted in the app who is still in the spreadsheet.

## Tests

```bash
npm test
```

Covers team balancing for any arrival order, standings and tie-breaks, qualifiers, the random draw and bracket progression. It also runs the real migrations in an in-memory Postgres (PGlite) to check `check_in_player`, the bracket functions and the change counters. It also calls the API handlers against that database to check sign-in, the organizer-only actions and the error messages.

## Party page and QR code

Guests don't need an account. The **QR code** button in the organizer header opens a Halloween-themed code for `/party` in a new tab (`/qr`), ready to put on a big screen for guests to scan. The party page has three tabs:

- **Check in** – guests find their name, confirm "Check in as …?", and see their team reveal. Their phone remembers them and shows "Irene, you're on Witch" on every tab.
- **Teams** and **Tournament** – the live standings and brackets, read-only.

The QR code uses the address the organizer has open, so open the organizer screens on the deployed site before showing it. Set `VITE_PUBLIC_URL` if you use a custom domain or want the code to always point at one address. The QR page warns you if the link would point at `localhost`.

Guests can read players, results and brackets, and the only change they can make is checking in. Everything else needs the organizer session, which `tests/api.test.ts` checks.
