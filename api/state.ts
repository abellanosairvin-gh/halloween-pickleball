// GET /api/state?tables=players,results: the event data, readable by anyone (the party page uses it).
import { deps } from './_lib/deps.js';
import { getState } from './_lib/handlers.js';

export const GET = (request: Request) => getState(request, deps);
