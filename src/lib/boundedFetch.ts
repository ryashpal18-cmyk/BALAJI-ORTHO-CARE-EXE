/** Bound background requests so a lost connection cannot hold the sync worker forever. */
export async function boundedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const upstream = init?.signal || (typeof Request !== "undefined" && input instanceof Request ? input.signal : null);
  const cancel = () => controller.abort(upstream?.reason);
  if (upstream?.aborted) cancel(); else upstream?.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(() => controller.abort(new Error("Network request timed out; local data retained")), 30000);
  try { return await fetch(input, { ...init, signal: controller.signal }); }
  finally { clearTimeout(timer); upstream?.removeEventListener("abort", cancel); }
}
