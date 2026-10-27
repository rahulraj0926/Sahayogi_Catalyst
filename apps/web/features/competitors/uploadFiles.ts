import { actor } from '@/lib/api';

/** Upload files to a competitor, one after the other. Throws with the server's words if one is refused. */
export async function uploadFiles(files: File[], target: string, pid: string) {
  for (const file of files) {
    const res = await fetch(`/api/v1/attachments?target=${encodeURIComponent(target)}&name=${encodeURIComponent(file.name)}&product=${encodeURIComponent(pid)}`, {
      method: 'POST', headers: { 'x-actor': actor(), 'content-type': file.type || 'application/octet-stream' }, body: file,
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error || `Could not upload ${file.name} (${res.status})`);
  }
}
