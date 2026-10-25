// GET /api/photo?id=...[&size=thumb]: a Best in Costume photo or its small copy, readable by anyone.
import { deps } from './_lib/deps.js';
import { getPhoto } from './_lib/handlers.js';

export const GET = (request: Request) => getPhoto(request, deps);
