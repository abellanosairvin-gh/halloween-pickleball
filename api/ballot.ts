// POST /api/ballot { token }: the phone that cast a costume ballot checks which awards it still has votes in.
import { deps } from './_lib/deps.js';
import { postBallot } from './_lib/handlers.js';

export const POST = (request: Request) => postBallot(request, deps);
