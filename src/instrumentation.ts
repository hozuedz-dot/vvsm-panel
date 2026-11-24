export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const boot = async (attempt = 0): Promise<void> => {
    try {
      const { ensureBootstrap } = await import("@/lib/bootstrap");
      await ensureBootstrap();
      const { startJobs } = await import("@/lib/jobs");
      startJobs();
    } catch (e) {
      const g = globalThis as unknown as { __vvsmBooted?: boolean };
      g.__vvsmBooted = false;
      if (attempt < 12) {
        setTimeout(() => void boot(attempt + 1), 4000);
      } else {
        console.error("[vvsm] bootstrap failed", e);
      }
    }
  };
  void boot();
}
