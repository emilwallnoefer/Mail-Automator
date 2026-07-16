# Development workflow

How a change gets from idea to production in this repo. The short version:
**describe → branch → verify → PR → merge.** `main` is always clean and
deployable; nothing lands on it without going through a pull request.

## The standard loop

1. **Describe the change** — a feature, fix, or tweak, in plain language.
   No need to know where the code lives.
2. **Work happens on a branch in an isolated worktree** — never directly on
   `main`. The main checkout stays untouched, so the dev server can keep
   running while the change is built.
3. **Verify before shipping** — `npm run build` and `npm run lint` at minimum
   (there is no test suite; the build is the safety net), plus exercising the
   changed flow by hand when it's testable.
4. **Commit → push → open a PR.** These three happen together, automatically:
   a PR can't exist until the branch is pushed. The state after any completed
   task is "there's a PR waiting."
5. **Merge decision** — the one human checkpoint. Either review the PR on
   GitHub and press the button, say "merge it," or authorize in advance with
   "merge if green."
6. **After the merge** — local `main` gets pulled so it matches what's
   deployed, and the feature branch is deleted (locally and on origin).

## Division of labor

| Step | Who |
| --- | --- |
| Describe the change | Emil |
| Branch, commit, push, open PR | Claude (automatic) |
| Verify build + lint | Claude (before the PR is opened) |
| **Merge or not** | **Emil** (or delegated per-PR) |
| Merge, pull, delete branch | Claude (after approval) |
| Apply DB migrations, set env vars | Emil (manual — see below) |

## Steps git can't do for you

These need a manual action outside the repo, and every PR that involves one
should call it out explicitly:

- **Database migrations** — new dated `.sql` files in `web/supabase/` are
  **not** applied automatically. Run them against the Supabase project by
  hand, ideally *before* the code that depends on them goes live.
- **New environment variables** — anything added to `web/.env.local` must
  also be set on the hosting platform (Vercel), or production breaks while
  dev works fine.
- **Release notes** — user-facing features need a `RELEASE_NOTES` entry in
  `web/src/lib/release-notes.ts` **in the same PR** (see CLAUDE.md), or the
  dashboard "What's new" popup never fires. Internal changes (refactors,
  deps, docs) skip this.

## Recurring maintenance

- **Dependabot PRs** — let them accumulate, then handle them as a batch
  (roughly monthly): apply all bumps on one branch, verify build + lint,
  merge the batch PR, close the superseded Dependabot PRs. Test major-version
  bumps individually and reject what breaks (e.g. eslint 10 is ignored until
  eslint-config-next supports it). Merging them one at a time causes
  `package-lock.json` conflicts — don't.
- **iCloud duplicate files** — this repo lives in iCloud Drive, which
  occasionally leaves `<name> 2.<ext>` sync-conflict copies. If `git status`
  shows them: verify each against its original, then delete. They are never
  meant to be committed.

## Conventions

- **Never commit directly to `main`** — even one-liners go through the loop.
  It keeps main releasable and every change traceable to a PR.
- **Merge commits, not squash** — this repo keeps each branch commit visible
  behind a "Merge pull request #N" commit.
- **Broken after merge?** Revert the PR (a new commit that reverses it) —
  don't rewrite history.
- **Commit messages** — `type(scope): summary`, e.g. `fix(chat): …`,
  `feat(mail): …`, `deps: …`, matching the existing log.
