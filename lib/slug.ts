import { customAlphabet } from 'nanoid';

const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 7);

export function generateSlug(): string {
  return nanoid();
}

const RESERVED_SLUGS = new Set([
  'admin',
  'api',
  'upload',
  'workspace',
  'public',
  'w',
  'note',
  'pdf',
  'image',
  'docx',
  'audio',
  'file',
  'health',
]);

export function isSlugValid(slug: string): boolean {
  if (!slug || slug.length < 3 || slug.length > 30) {
    return false;
  }

  // Lowercase alphanumeric + hyphens only
  const validRegex = /^[a-z0-9-]+$/;
  if (!validRegex.test(slug)) {
    return false;
  }

  if (RESERVED_SLUGS.has(slug)) {
    return false;
  }

  return true;
}
