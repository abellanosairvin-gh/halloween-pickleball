// POST /api/organizer { action, args }: every change other than check-in. Needs the organizer's session.
import { deps } from './_lib/deps.js';
import { postOrganizer } from './_lib/handlers.js';

export const POST = (request: Request) => postOrganizer(request, deps);
