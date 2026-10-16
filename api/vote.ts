// POST /api/vote { voterId, femaleId, maleId }: casts a Best in Costume vote. Open to guests, once per voter.
import { deps } from './_lib/deps.js';
import { postVote } from './_lib/handlers.js';

export const POST = (request: Request) => postVote(request, deps);
