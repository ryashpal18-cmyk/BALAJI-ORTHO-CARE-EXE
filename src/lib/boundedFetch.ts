const rejectedReads = new Map<string, { until: number; response: Response }>();
/** Bound background requests so a lost connection cannot hold the sync worker forever. */
export async function boundedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const address = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  if (address.pathname.startsWith("/storage/v1/object") && !address.pathname.startsWith("/storage/v1/object/sign/") && !["GET", "HEAD"].includes((init?.method || (typeof Request !== "undefined" && input instanceof Request ? input.method : "GET")).toUpperCase()))
    throw new Error("Image/PDF cloud transfer disabled; keep the file on this PC");
  const method = (init?.method || (typeof Request !== "undefined" && input instanceof Request ? input.method : "GET")).toUpperCase();
  const requestHeaders = new Headers(init?.headers || (typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined));
  const cacheKey = address.href + "|" + requestHeaders.get("authorization") + "|" + requestHeaders.get("apikey");
  const canPause = method === "GET" && address.pathname.startsWith("/rest/v1/");
  const prior = rejectedReads.get(cacheKey);
  if (canPause && prior && prior.until > Date.now()) return prior.response.clone();
  const controller = new AbortController();
  const upstream = init?.signal || (typeof Request !== "undefined" && input instanceof Request ? input.signal : null);
  const cancel = () => controller.abort(upstream?.reason);
  if (upstream?.aborted) cancel(); else upstream?.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(() => controller.abort(new Error("Network request timed out; local data retained")), 30000);
  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    if (canPause && response.status === 400) {
      if (rejectedReads.size >= 100) rejectedReads.delete(rejectedReads.keys().next().value!);
      rejectedReads.set(cacheKey, { until: Date.now() + 60000, response: response.clone() });
    } else rejectedReads.delete(cacheKey);
    return response;
  }
  finally { clearTimeout(timer); upstream?.removeEventListener("abort", cancel); }
}
