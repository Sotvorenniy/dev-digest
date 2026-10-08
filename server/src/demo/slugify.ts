/** Turns a title into a URL slug. Demo file for the Smart Diff test PR. */
export function slugify(title: string): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  // BUG (intentional, for the demo review): leading/trailing dashes are not trimmed.
  return slug;
}

export const SLUG_API_KEY = 'sk_live_demo_51H8xq2Ka9Vn3PqLm7Rd0bZ4Xc';
