// GET /api/photo?id=...: a Best in Costume photo, readable by anyone. Each upload gets a new id, so it caches for good.
import { deps } from './_lib/deps.js';
import { getPhoto } from './_lib/handlers.js';

export const GET = (request: Request) => getPhoto(request, deps);
