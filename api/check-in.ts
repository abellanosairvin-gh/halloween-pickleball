// POST /api/check-in { playerId }: checks a player in and assigns their team. Open to guests.
import { deps } from './_lib/deps.js';
import { postCheckIn } from './_lib/handlers.js';

export const POST = (request: Request) => postCheckIn(request, deps);
