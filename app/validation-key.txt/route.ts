// Serves the Pi domain-verification key at /validation-key.txt.
//
// Pi requires `https://<host>/validation-key.txt` to return the domain key, but
// the Pi guide also says not to commit that key. So the value lives in the
// PI_VALIDATION_KEY environment variable (set in the host's env settings) and is
// served from here, keeping it out of git while the file stays reachable.
//
// If the variable is unset the route 404s rather than serving a placeholder, so a
// missing config fails visibly instead of silently answering with the wrong key.

export const dynamic = "force-dynamic";

export async function GET() {
  const key = process.env.PI_VALIDATION_KEY?.trim();
  if (!key) {
    return new Response("Not found", { status: 404 });
  }
  return new Response(key, {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
}
