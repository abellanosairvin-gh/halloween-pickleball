// GET /api/session: whether this browser is signed in as the organizer.
// POST /api/session { password }: signs in. DELETE /api/session: signs out.
import { deps } from './_lib/deps.js';
import { deleteSession, getSession, postSession } from './_lib/handlers.js';

export const GET = (request: Request) => getSession(request, deps);
export const POST = (request: Request) => postSession(request, deps);
export const DELETE = (request: Request) => deleteSession(request, deps);
