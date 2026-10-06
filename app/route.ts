import landing from '../landing/index.html?raw';
import { publicEntry } from '../server/entry';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return publicEntry(request, landing);
}
