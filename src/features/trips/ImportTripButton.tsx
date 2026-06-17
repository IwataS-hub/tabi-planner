import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { BackupError, MAX_BACKUP_BYTES, parseBackup } from '@/domain/backup';
import { readFileAsText } from '@/lib/download';
import { tripRepository } from '@/repositories/tripRepository';

/**
 * Imports a trip backup as a new trip. Errors are surfaced in an accessible
 * dialog (never toast-only), and the file input is reset after each attempt so
 * the same file can be selected again.
 */
export function ImportTripButton({ onImported }: { onImported?: (tripId: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Reset immediately so re-selecting the same file fires onChange again.
    event.target.value = '';
    if (!file) return;
    if (busyRef.current) return;

    busyRef.current = true;
    setBusy(true);
    try {
      if (file.size > MAX_BACKUP_BYTES) {
        throw new BackupError('ファイルサイズが大きすぎます（上限は約2MBです）。');
      }
      const text = await readFileAsText(file);
      const backup = parseBackup(text);
      const trip = await tripRepository.importBackup(backup);
      toast.success(`「${trip.title}」を読み込みました`);
      onImported?.(trip.id);
    } catch (err) {
      const message =
        err instanceof BackupError
          ? err.message
          : '読み込みに失敗しました。ファイルを確認してください。';
      if (!(err instanceof BackupError)) console.error('インポートに失敗しました', err);
      setError(message);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={handleFile}
        tabIndex={-1}
        aria-hidden
      />
      <Button
        variant="outline"
        size="sm"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        aria-label="JSONバックアップから旅行を読み込み"
      >
        <Upload aria-hidden />
        読み込み
      </Button>

      <Dialog
        open={error !== null}
        onOpenChange={(open) => {
          if (!open) setError(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>読み込みできませんでした</DialogTitle>
            <DialogDescription>{error}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setError(null)}>閉じる</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
