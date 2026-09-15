import { Button } from "@/components/ui";

/**
 * The holding screen a signed-in account sees while it has no role.
 *
 * Roles are written by exactly one place — the guardAdmin()-protected
 * PATCH /api/admin/users — so there is nothing useful for the user to do here
 * and nothing to click except sign out. This replaced a first-login picker that
 * let people choose their own profile; that write landed in `user_metadata`,
 * which the user can rewrite themselves, and no reader ever looked there.
 *
 * It is a server component rendered INSTEAD of the dashboard shell, not an
 * overlay on top of it: no module code is sent, no panel is mounted and no
 * prefetch runs, so there is nothing to reach behind it.
 */
export function RoleGate({ email }: { email: string }) {
  return (
    <main
      id="main-content"
      className="relative grid min-h-dvh place-items-center overflow-x-hidden bg-surface p-4 text-ink"
    >
      <div className="absolute inset-0 aurora-bg" />
      <div className="relative w-full max-w-md rounded-2xl border border-glass/20 bg-surface/95 p-6 shadow-xl">
        <p className="text-[11px] uppercase tracking-[0.15em] text-accent-soft/75">Waiting for access</p>
        <h1 className="mt-2 text-lg font-semibold">Your account needs a role</h1>
        <p className="mt-3 text-sm text-ink-3/85">
          You are signed in as <span className="font-medium text-ink-2">{email}</span>, but an admin has not
          assigned you a role yet. That role is what decides which modules you see, so nothing is available
          until it is set.
        </p>
        <p className="mt-3 text-sm text-ink-3/85">
          The admins have been told you are here. You will not get a confirmation — just sign in again once
          they have set you up, and the workspace opens.
        </p>
        <form action="/logout" method="post" className="mt-5">
          <Button type="submit" variant="glass" size="md" className="w-full">
            Sign out
          </Button>
        </form>
      </div>
    </main>
  );
}
