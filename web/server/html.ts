import 'server-only';

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char);
}

/** Markup that html`` inserts without escaping (only built by html`` itself). */
export class SafeHtml {
  constructor(readonly value: string) {}
  toString(): string {
    return this.value;
  }
}

/** Escaping template: every interpolated value is escaped unless it is SafeHtml from another html`` call. */
export function html(strings: TemplateStringsArray, ...values: (string | number | SafeHtml)[]): SafeHtml {
  let out = strings[0] ?? '';
  values.forEach((value, index) => {
    out += value instanceof SafeHtml ? value.value : escapeHtml(String(value));
    out += strings[index + 1] ?? '';
  });
  return new SafeHtml(out);
}

/** CSP of the plain HTML pages of /auth/callback (the proxy does not run on /auth/*). */
export const AUTH_PAGE_CSP =
  "default-src 'none'; style-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

export interface PlainPage {
  lang: string;
  title: string;
  body: string;
  linkHref: string;
  linkText: string;
  secondaryHref?: string;
  secondaryText?: string;
}

/** The small localized HTML page used by the OAuth callback errors (styled by /auth.css). */
export function plainPage(page: PlainPage): string {
  const secondary =
    page.secondaryHref !== undefined && page.secondaryText !== undefined
      ? html`<a class="secondary" href="${page.secondaryHref}">${page.secondaryText}</a>`
      : html``;
  return html`<!doctype html>
<html lang="${page.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${page.title} · Perry</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/auth.css">
</head>
<body>
<main>
<h1>${page.title}</h1>
<p>${page.body}</p>
<p class="actions"><a class="primary" href="${page.linkHref}">${page.linkText}</a>${secondary}</p>
</main>
</body>
</html>
`.value;
}
