import { useId, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { AppHeader } from '@/components/AppHeader';
import { ErrorView, LoadingView } from '@/components/StateViews';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useTrip } from '@/hooks/useTripData';
import { toISODate } from '@/lib/date';
import { tripRepository } from '@/repositories/tripRepository';
import { fieldErrors, tripFormSchema } from '@/validation/schemas';

interface TripFormPageProps {
  mode: 'create' | 'edit';
}

interface FormState {
  title: string;
  startDate: string;
  endDate: string;
  description: string;
}

function emptyForm(): FormState {
  const today = toISODate(new Date());
  return { title: '', startDate: today, endDate: today, description: '' };
}

export function TripFormPage({ mode }: TripFormPageProps) {
  const { tripId } = useParams<{ tripId: string }>();
  const existing = useTrip(mode === 'edit' ? tripId : undefined);

  if (mode === 'edit') {
    if (existing.status === 'loading') {
      return (
        <FormShell>
          <LoadingView label="旅行を読み込み中…" />
        </FormShell>
      );
    }
    if (existing.status === 'error') {
      return (
        <FormShell>
          <ErrorView title="旅行の読み込みに失敗しました" error={existing.error} />
        </FormShell>
      );
    }
    if (!existing.data) {
      return (
        <FormShell>
          <ErrorView title="旅行が見つかりません" />
        </FormShell>
      );
    }
  }

  const initial: FormState =
    mode === 'edit' && existing.data
      ? {
          title: existing.data.title,
          startDate: existing.data.startDate,
          endDate: existing.data.endDate,
          description: existing.data.description,
        }
      : emptyForm();

  // Remounting on id change initialises the form from props without an effect.
  const formKey = mode === 'edit' ? (existing.data?.id ?? 'edit') : 'new';

  return (
    <FormShell>
      <TripForm key={formKey} mode={mode} tripId={tripId} initial={initial} />
    </FormShell>
  );
}

interface TripFormProps {
  mode: 'create' | 'edit';
  tripId: string | undefined;
  initial: FormState;
}

function TripForm({ mode, tripId, initial }: TripFormProps) {
  const navigate = useNavigate();
  const fieldId = useId();
  const [form, setForm] = useState<FormState>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const update = (patch: Partial<FormState>) => setForm((prev) => ({ ...prev, ...patch }));

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = tripFormSchema.safeParse(form);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      if (mode === 'create') {
        const trip = await tripRepository.create(parsed.data);
        toast.success('旅行を作成しました');
        navigate(`/trips/${trip.id}`, { replace: true });
      } else if (tripId) {
        await tripRepository.updateDetails(tripId, parsed.data);
        toast.success('変更を保存しました');
        navigate(`/trips/${tripId}`);
      }
    } catch (err) {
      console.error('保存に失敗しました', err);
      toast.error('保存に失敗しました');
      setSubmitting(false);
    }
  };

  const cancel = () => {
    if (mode === 'edit' && tripId) navigate(`/trips/${tripId}`);
    else navigate('/');
  };

  const errorText = (key: string) =>
    errors[key] ? (
      <p id={`${fieldId}-${key}-error`} className="text-destructive text-sm">
        {errors[key]}
      </p>
    ) : null;

  const describedBy = (key: string) => (errors[key] ? `${fieldId}-${key}-error` : undefined);

  return (
    <>
      <h1 className="font-display text-foreground mb-1 text-2xl font-bold">
        {mode === 'create' ? '新しい旅行' : '旅行を編集'}
      </h1>
      <p className="text-muted-foreground mb-6 text-sm">
        旅行名と日程を決めましょう。日程はあとから変更でき、日数に合わせて自動で日が作られます。
      </p>

      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor={`${fieldId}-title`}>
            旅行名 <span className="text-destructive">*</span>
          </Label>
          <Input
            id={`${fieldId}-title`}
            value={form.title}
            onChange={(event) => update({ title: event.target.value })}
            placeholder="例：京都・嵐山さんぽ"
            aria-invalid={Boolean(errors.title)}
            aria-describedby={describedBy('title')}
            autoFocus
          />
          {errorText('title')}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`${fieldId}-start`}>
              開始日 <span className="text-destructive">*</span>
            </Label>
            <Input
              id={`${fieldId}-start`}
              type="date"
              value={form.startDate}
              onChange={(event) => update({ startDate: event.target.value })}
              aria-invalid={Boolean(errors.startDate)}
              aria-describedby={describedBy('startDate')}
            />
            {errorText('startDate')}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${fieldId}-end`}>
              終了日 <span className="text-destructive">*</span>
            </Label>
            <Input
              id={`${fieldId}-end`}
              type="date"
              value={form.endDate}
              min={form.startDate}
              onChange={(event) => update({ endDate: event.target.value })}
              aria-invalid={Boolean(errors.endDate)}
              aria-describedby={describedBy('endDate')}
            />
            {errorText('endDate')}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${fieldId}-desc`}>概要</Label>
          <Textarea
            id={`${fieldId}-desc`}
            value={form.description}
            onChange={(event) => update({ description: event.target.value })}
            placeholder="この旅のテーマや目的など（任意）"
            rows={3}
            aria-invalid={Boolean(errors.description)}
            aria-describedby={describedBy('description')}
          />
          {errorText('description')}
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={cancel} disabled={submitting}>
            キャンセル
          </Button>
          <Button type="submit" disabled={submitting}>
            {mode === 'create' ? '作成する' : '保存する'}
          </Button>
        </div>
      </form>
    </>
  );
}

function FormShell({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  return (
    <div className="min-h-dvh">
      <AppHeader>
        <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
          <ArrowLeft aria-hidden />
          一覧へ
        </Button>
      </AppHeader>
      <main className="mx-auto max-w-xl px-4 py-8">{children}</main>
    </div>
  );
}
