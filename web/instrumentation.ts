/** Runs once when the server process starts (not during next build): starts the web runtime (config, Postgres, Redis). */
export async function register(): Promise<void> {
  // The positive check lets webpack drop the import from the edge build, which `next dev` compiles too.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startWebRuntime } = await import('./server/runtime');
    await startWebRuntime();
  }
}
