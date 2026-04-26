# Reference design assets

Local-only, gitignored. Do not commit.

## What's here

- `claude-design/omnidash/` — the Claude Design prototype that this repo's UI
  is being ported from. Originally lived at `/tmp/claude-design/` but `/tmp`
  gets wiped between sessions, so it's now here instead.
  - `claude-design/omnidash/project/OmniDash.html` — the "regular" prototype
    (styles + layout).
  - `claude-design/omnidash/project/OmniDash Experimental.html` — alternate
    variant.
  - `claude-design/omnidash/project/src/app.jsx` — top-level React structure.
  - `claude-design/omnidash/project/src/icons.jsx` — custom icon primitives.
  - `claude-design/omnidash/project/src/widgets.jsx` — widget definitions.
  - `claude-design/omnidash/project/uploads/` — screenshots from the design
    conversation (useful for visual reference when porting).
  - `claude-design/omnidash/chats/` — the design conversation transcripts.

## Source

Downloaded on 2026-04-22 from the Claude Design share URL
`https://api.anthropic.com/v1/design/h/l5uvPpshKRpfX4N9K3rfUw`. If this
directory is missing, re-fetch the URL (it serves a gzipped tar of the
project tree).

## How to use

When porting a component, find the prototype's version by name in
`src/app.jsx` and the matching CSS in `OmniDash.html`. For visual refs,
check `uploads/` — screenshot filenames describe the flow they capture
(e.g. `Configure Widget.png`, `Empty dashboard.png`).
