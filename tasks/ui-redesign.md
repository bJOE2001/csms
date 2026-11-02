# UI clarity redesign

The user requested a full UI/UX polish, with priority on finding modules and knowing what to do next.

- [x] Replace the horizontal module strip with grouped desktop navigation and a mobile menu.
- [x] Add keyboard-accessible page search using everyday task descriptions.
- [x] Make the dashboard a starting point: current stage, actionable next steps, review items and clearly scoped financial summaries.
- [x] Explain each module's purpose and provide relevant cross-links. Keep advanced/recovery controls out of the main task path.
- [x] Improve typography, spacing, form hierarchy, readable statuses, keyboard focus and responsive layouts without changing transaction rules.
- [x] Finish the runtime fix: cache only versioned production assets, retire the old public-shell cache, and separate generated development/production output.
- [x] Verify unit/lint/type/build checks, real authenticated dashboard/navigation flows, mobile navigation and production offline behavior.

No changes to hosted business data or accounting policy are part of this redesign.

Completed: 38 unit tests, lint/type checking, production build, four authenticated production scenarios, nine public/offline checks and focused development runtime/mobile checks. Screenshots were reviewed at desktop and phone sizes. No dependency or schema changes were needed.
