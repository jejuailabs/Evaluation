/** The public homepage never opens a sample organization implicitly. */
export function publicEntry(request: Request, landing: string): Response {
  const url = new URL(request.url);
  const mode = url.searchParams.get('mode');
  if (mode && ['demo', 'preview', 'start', 'app'].includes(mode)) {
    // Preserve old bookmarks, OAuth returns and organization invitations.
    // Browsers inherit the original fragment when Location omits a fragment.
    return new Response(null, {
      status: 307,
      headers: { Location: `/app${url.search}`, 'Cache-Control': 'no-store' },
    });
  }
  return new Response(landing, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=0, must-revalidate',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
