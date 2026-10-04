// GET /api/versions: per-table change counters that every open page polls to stay live.
import { deps } from './_lib/deps.js';
import { getVersions } from './_lib/handlers.js';

export const GET = (request: Request) => getVersions(request, deps);
