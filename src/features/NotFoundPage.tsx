import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { AppHeader } from '@/components/AppHeader';

export function NotFoundPage() {
  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto flex max-w-5xl flex-col items-center gap-4 px-4 py-24 text-center">
        <p className="font-display text-2xl font-bold">ページが見つかりません</p>
        <p className="text-muted-foreground">
          お探しのページは存在しないか、移動した可能性があります。
        </p>
        <Button asChild>
          <Link to="/">旅行一覧へ戻る</Link>
        </Button>
      </main>
    </div>
  );
}
