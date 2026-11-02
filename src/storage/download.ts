/**
 * Сохранение файлов.
 * В обычном браузере — стандартное скачивание.
 * Внутри платформы, где скачивание из страницы запрещено, используется её
 * разрешённый механизм сохранения (пользователь подтверждает его сам).
 */

type DownloadsNs = { save(req: { filename: string; data: string | Blob | ArrayBuffer | ArrayBufferView }): Promise<unknown> };

let hostDownloads: Promise<DownloadsNs | null> | null = null;

function host(): Promise<DownloadsNs | null> {
  if (hostDownloads) return hostDownloads;
  const w = window as unknown as { claude?: { use?: (n: string) => Promise<unknown> } };
  if (w.claude && typeof w.claude.use === 'function') {
    hostDownloads = w.claude
      .use('downloads')
      .then((ns) => (ns as DownloadsNs) ?? null)
      .catch(() => null);
  } else {
    hostDownloads = Promise.resolve(null);
  }
  return hostDownloads;
}

/** Запускаем определение заранее, чтобы клик не ждал */
export function warmupDownloads(): void {
  void host();
}

export type SaveResult = 'saved' | 'declined' | 'failed';

export async function saveFile(filename: string, data: Blob): Promise<SaveResult> {
  const ns = await host();
  if (ns) {
    try {
      await ns.save({ filename, data });
      return 'saved';
    } catch (e) {
      const code = (e as { code?: string })?.code;
      if (code === 'declined') return 'declined';
      // упадём на стандартный способ ниже
    }
  }
  try {
    const url = URL.createObjectURL(data);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
    return 'saved';
  } catch {
    return 'failed';
  }
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}
