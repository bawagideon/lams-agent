# LAMS HQ UI Interaction Audit

## Scope

This audit covers the server-rendered dashboard and episode preview templates:

- Dashboard views: Home, Episodes, Skills, Activity, Connections
- Episode preview: scene filmstrip, master export player, CapCut draft, FFmpeg render, and release modal
- Dashboard interaction families: tab navigation, episode filters/search, chat and quick prompts, release preflight/approval, skill execution/approval, demonstration capture, recording palette, presets, and skill compilation

## Fixes in this change

1. **Queued work is no longer presented as completed.** In cloud mode, CapCut assembly and FFmpeg rendering return HTTP 202 while waiting for a Windows Desktop Worker. The dashboard and preview now show a queued state and job ID, check HTTP failures, and only show a completed state when the API confirms success.
2. **The FFmpeg fallback button owns its loading state.** Previously, clicking the fallback action changed the header render button instead of the button the user clicked. It now updates and restores the correct control.
3. **Repeated CapCut clicks are guarded.** All CapCut actions for the same episode are disabled while a request is in flight, reducing accidental duplicate job creation.
4. **Scene cards are keyboard-operable.** Scene preview cards now expose button semantics, receive keyboard focus, show a focus ring, and activate on Enter or Space as well as mouse click.
5. **Regression checks are part of the test runner.** `scripts/test_ui_interactions.ts` checks tab route coverage, dashboard delegated actions, preview scene keyboard support, queued-job semantics, API route families, and hash-only placeholder links. It is included in `npm test`.

## Interaction inventory

| Area | Expected behavior | External requirement |
|---|---|---|
| Dashboard tabs | Switch the active view and keep browser back/forward in sync | None beyond dashboard access |
| Episode filters/search | Filter cards by status and text | Episode data source |
| Episode card links | Open the selected episode preview | Episode must exist |
| CapCut actions | Create a local draft or queue work in cloud mode | Local CapCut adapter or a running Windows Desktop Worker |
| Render actions | Render locally or queue work in cloud mode | FFmpeg/media dependencies or a running Windows Desktop Worker |
| Release actions | Load preflight checks, request signed approval, then publish privately after explicit confirmation | Valid auth, Supabase/episode data, export file, Google OAuth/YouTube connection |
| Chat/quick prompts | Send a request to the server and display its response/plan card | Auth and configured server dependencies |
| Skill actions | Propose a run, request human approval where required, then execute | Skill registry, authorization, and supported execution adapter |
| Teach/record controls | Capture screen/audio where browser supports it, persist events/video, compile a skill | Browser screen-capture permission, server auth, recorder storage, and (for cross-app work) compatible desktop worker |
| Preview scene cards | Load a scene clip and update prompt/selection state | A generated scene video URL |

## Important limitations

- A cloud deployment cannot directly open CapCut on the user's computer or run a local FFmpeg binary inside the browser. It queues those tasks for the Windows Desktop Worker. A queued response is **not** proof that the worker completed the job.
- Browser screen capture only captures a surface the browser's screen-sharing API allows the user to select. It does not automatically grant unrestricted desktop control.
- The added interaction regression audit is a static source-level check. It is not a substitute for running the dashboard in a real browser with valid environment variables, a live database, Google OAuth, and the Windows worker. This change has not been represented as a completed full browser/E2E run.
- Existing integration/security suites may require a running local service and configured secrets. Run them in the project environment and preserve the output/exit codes for the exact tested commit.

## Recommended validation sequence

1. Run `npm run build`.
2. Run `npm test` in the configured project environment.
3. Start the app and test each dashboard tab at desktop and mobile widths.
4. Test CapCut/render once with a running Windows worker and once with the worker unavailable; verify queued/error feedback is honest.
5. Test release preflight with (a) no export, (b) disconnected YouTube, and (c) a valid private-release test account.
6. Test recording permission granted/denied, recording stop/upload failure, skill compile with no steps, and skill execution rejected by approval.
7. Confirm no public release or irreversible action occurs without the existing explicit approval gate.
