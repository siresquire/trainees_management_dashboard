const CANVAS_BASE = "https://awsrestart.instructure.com";

/** Strip the " (123456)" Canvas ID suffix and normalise punctuation variants */
export function normaliseName(raw: string): string {
  return raw
    .replace(/\s*\(\d+\)\s*$/, "")  // strip trailing Canvas ID like " (596833)"
    .replace(/–|—/g, "-")  // en-dash / em-dash → hyphen
    .trim();
}

/** Paginate all pages of a Canvas API endpoint */
export async function canvasFetchAll<T>(token: string, path: string): Promise<T[]> {
  const results: T[] = [];
  let url: string | null = `${CANVAS_BASE}/api/v1${path}`;

  while (url) {
    const currentUrl: string = url;
    const res: Response = await fetch(currentUrl, {
      headers: { Authorization: `Bearer ${token}` },
      next: { revalidate: 0 },
    });
    if (!res.ok) {
      throw new Error(`Canvas API ${path} → ${res.status} ${res.statusText}`);
    }
    const data = (await res.json()) as T[];
    results.push(...data);
    const link = res.headers.get("Link") ?? "";
    url = link.match(/<([^>]+)>;\s*rel="next"/)?.[1] ?? null;
  }

  return results;
}

/** Test that a token can access a course. Returns course name on success. */
export async function verifyCanvasToken(
  courseId: string,
  token: string
): Promise<{ name: string; total_students: number }> {
  const res = await fetch(`${CANVAS_BASE}/api/v1/courses/${courseId}?include[]=total_students`, {
    headers: { Authorization: `Bearer ${token}` },
    next: { revalidate: 0 },
  });
  if (res.status === 401) throw new Error("Invalid token — Canvas returned 401 Unauthorized.");
  if (res.status === 404) throw new Error("Course not found — check the Canvas Course ID.");
  if (!res.ok) throw new Error(`Canvas returned ${res.status}.`);
  const course = await res.json();
  return { name: course.name, total_students: course.total_students ?? 0 };
}
