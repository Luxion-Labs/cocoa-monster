export const readJsonResponse = async <T>(
  response: Response,
  fallback: T,
): Promise<T> => {
  const text = await response.text();
  if (!text.trim()) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Expected JSON response from ${response.url || "request"}`);
  }
};
