// Thin fetch wrapper that adds the Vidnovagram session token.
export function authFetch(url: string, token: string, opts: RequestInit = {}): Promise<Response> {
  return fetch(url, {
    ...opts,
    headers: {
      ...(opts.headers as Record<string, string>),
      Authorization: `Token ${token}`,
    },
  })
}
