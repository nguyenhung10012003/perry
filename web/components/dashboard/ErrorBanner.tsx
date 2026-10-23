'use client';

import { CircleAlertIcon } from 'lucide-react';
import { useT } from '@/components/providers';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { ErrorBody } from '@/shared/api';

export interface SaveError {
  /** null: the server could not be reached. */
  body: ErrorBody | null;
  /** A deleted channel or role was in the request; the pickers were refreshed. */
  stale?: boolean;
}

/** Localized banner for a failed save: the error code's message, then each field issue. */
export function ErrorBanner({ error, labels }: { error: SaveError; labels: Record<string, string> }) {
  const { t } = useT();
  const { body } = error;
  const message = body === null ? t.errors.network : t.errors.codes[body.error];
  const label = (path: string): string => {
    const [first = path] = path.split('.');
    return labels[first] ?? first;
  };
  return (
    <Alert variant="destructive" data-testid="error-banner">
      <CircleAlertIcon />
      <AlertTitle>{t.errors.title}</AlertTitle>
      <AlertDescription>
        <p>{message}</p>
        {error.stale === true ? <p>{t.errors.staleId}</p> : null}
        {body?.error === 'bot_unavailable' ? <p>{t.errors.botUnavailableHint}</p> : null}
        {body?.code !== undefined ? <p>{t.errors.discordCode(body.code)}</p> : null}
        {body?.issues !== undefined && body.issues.length > 0 ? (
          <>
            <p>{t.errors.issuesTitle}</p>
            <ul className="list-disc pl-5">
              {body.issues.map((issue) => (
                <li key={`${issue.path}:${issue.message}`}>
                  <span className="font-medium">{label(issue.path)}</span>:{' '}
                  {issue.code !== undefined ? t.errors.issues[issue.code] : issue.message}
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
