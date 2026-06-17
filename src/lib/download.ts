/** Trigger a client-side download of `text` as a UTF-8 file, revoking the
 * object URL once the download has started. */
export function downloadTextFile(filename: string, text: string, mime = 'application/json'): void {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    // Revoke on the next tick so the click has been processed.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

/** Read a File as UTF-8 text. */
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error ?? new Error('ファイルの読み込みに失敗しました'));
    reader.readAsText(file, 'utf-8');
  });
}
