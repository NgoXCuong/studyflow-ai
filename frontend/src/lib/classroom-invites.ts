export function classroomCodeFromHash(hash: string) {
  const code = new URLSearchParams(hash.replace(/^#/, "")).get("join-code");
  return code && /^[A-Za-z0-9_-]{16,128}$/.test(code) ? code : null;
}

export function parseClassroomInvite(value: string, origin: string) {
  const text = value.trim();
  if (/^[A-Za-z0-9_-]{16,128}$/.test(text)) return text;
  try {
    const url = new URL(text);
    if (url.origin !== origin || url.pathname !== "/classrooms" || url.username || url.password) return null;
    return classroomCodeFromHash(url.hash);
  } catch {
    return null;
  }
}

export function classroomInviteUrl(origin: string, code: string) {
  return `${origin}/classrooms#join-code=${encodeURIComponent(code)}`;
}
