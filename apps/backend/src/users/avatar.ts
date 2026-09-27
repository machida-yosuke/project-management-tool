export const AVATAR_CONTENT_TYPES: readonly string[] = ['image/png', 'image/jpeg', 'image/webp'];

export const MAX_AVATAR_BYTES = 100 * 1024;

export const MAX_AVATAR_DIMENSION = 256;

export function avatarKeyFor(userId: string, fileId: string): string {
  return `avatars/${userId}/${fileId}`;
}

// Keys are `avatars/<userId>/<fileId>`, so the URL is the key under the API's `/api/` prefix.
export function avatarUrlFor(key: string | null): string | null {
  return key === null ? null : `/api/${key}`;
}
