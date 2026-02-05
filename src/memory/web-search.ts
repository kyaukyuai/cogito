export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

const BRAVE_API_KEY = process.env.BRAVE_API_KEY;

export async function webSearch(query: string, count = 3): Promise<WebSearchResult[]> {
  if (!BRAVE_API_KEY) {
    throw new Error("BRAVE_API_KEY is not set");
  }

  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}`;
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": BRAVE_API_KEY,
    },
  });

  if (!response.ok) {
    throw new Error(`Brave Search failed: ${response.status}`);
  }

  const data = await response.json();
  const results = (data.web?.results ?? []) as Array<{ title: string; url: string; description?: string }>;
  return results.map((r) => ({
    title: r.title,
    url: r.url,
    snippet: r.description ?? "",
  }));
}
