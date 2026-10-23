/** Runs once when the server process starts (not during next build): starts the web runtime (config, Postgres, Redis). */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { startWebRuntime } = await import('./server/runtime');
  await startWebRuntime();
}
