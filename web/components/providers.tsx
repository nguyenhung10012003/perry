'use client';

import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import type { SessionUser } from '@/shared/api';
import { getWebMessages } from '@/shared/i18n';
import type { Locale, WebMessages } from '@/shared/i18n';

interface I18nValue {
  locale: Locale;
  t: WebMessages;
}

const I18nContext = createContext<I18nValue>({ locale: 'en', t: getWebMessages('en') });

/** The page language (negotiated by proxy.ts) for client components. */
export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const value = useMemo(() => ({ locale, t: getWebMessages(locale) }), [locale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useT(): I18nValue {
  return useContext(I18nContext);
}

export interface SessionValue {
  user: SessionUser;
  csrfToken: string;
}

const SessionContext = createContext<SessionValue | null>(null);

/** The logged-in user and the CSRF token of the session (never the Discord token). */
export function SessionProvider({ value, children }: { value: SessionValue; children: ReactNode }) {
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (value === null) throw new Error('useSession() needs a SessionProvider');
  return value;
}
