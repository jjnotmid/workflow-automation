# Memory

Long-term memory for the command center. Everything here is loaded at the start of every new
conversation, across the web UI, WhatsApp and voice. Append to it when Joshua
says something worth keeping; keep entries short and factual.

## Who

Usifoh Eseosa Joshua — 19, Lagos, Nigeria (from Edo State). Tech business
development executive, founder, full-stack developer. 6+ years in sales,
selling since age 12, coding since age 8. First-year (100 level) B.Sc.
Petroleum & Gas Engineering student at the University of Lagos, a five-year
course. GitHub: `jjnotmid`. WhatsApp: 2348124966881.

## Jobs

- **N28 Consulting** — Senior Product Manager, Syntricore Enterprise Platform.
  Started 1 Sept 2026, 3 office days/week.
- **Delphi Education Hub** — Marketing & Growth Lead, remote. Starts 13 Sept 2026.

## Projects (his own)

- **Blu Tech Learn** — AI-powered EdTech platform. Co-founder. Pre-launch.
- **NepaWatch** — real-time crowd-sourced Nigerian power-outage tracker,
  2,000+ users (Joshua's report, 2026-10-02) across all 36 states + FCT.
- **Content creation** — short-form video; wants editing and posting automated.

Stack: Next.js, React, Supabase, plus IT admin / RBAC / DevOps.

## Voice — how to write and talk to him

- No em dashes, ever.
- Plain, short sentences. No corporate register, no performed closings.
- Give a pick, not a menu of options — number a recommendation.
- ₦ figures get comma separators. Density over length, he scans.
- Never over-praise — he calls it out when it happens, and he's right to.
- Never invent a number, source, or biographical detail. Flag guesses as guesses.
- Research publicly available facts independently; do not ask Joshua to fetch information available online. Mark private, unpublished provider quotes as unknown and continue the work.

## Working preferences

- **Data is limited.** Never download anything without asking first — no brew,
  pip, npm or model pulls. Check what's already installed.
- **AI route:** Codex through the existing ChatGPT login is primary. No OpenAI
  API key is used. `openrouter/free` is the only fallback.
- Do not route work to DeepSeek, Claude/Anthropic, or AgentRouter.
- **OpenRouter is free-tier only.** Never route it to paid models.
- Prefers things fully set up and working over being handed instructions.
- Wants permissions pre-approved so nothing stalls waiting for a prompt.
- Workflow Automation is the canonical context and memory system for Codex,
  including the secondary worktree and remote surfaces.
- Suggest system improvements when repeated behavior provides real evidence;
  keep suggestions concise and actionable.

## Decisions made
- KoroPay customer-facing copy must never mention partners or "after provider approval". Site copy must sound plain and human, never AI or corporate, and no text goes inside pill badges.
 Approved 2026-10-08 after Joshua rejected the gated framing. The footer disclosure reads "KoroPay is a financial technology company, not a bank. Your PIN stays private and never appears in chat."
- Virtual Mastercard cards are a key KoroPay flagship feature and must stay prominent on the landing and features pages. Joshua states KoroPay offers Mastercard cards; card mocks carry the Mastercard wordmark and a "Powered by Mastercard" pill.
- KoroPay landing design direction is the usexara.ai section structure (hero badge and phone mockup, tabbed feature explorer, security pillar cards, four-step start, FAQ, freeze section, partner rail, full footer), rebuilt in KoroPay green and gold. Motion One (npm `motion`) is vendored for animation. No invented testimonials or processed-amount stats are allowed until real ones exist. Site preview: Node static servers with no-cache at 127.0.0.1:8765 and 8775; every asset carries a version stamp. The full end-of-day site state for other agents is the top entry in projects/koropay/state.md.
 (hero badge and phone mockup, tabbed feature explorer, security pillar cards, four-step start, FAQ, freeze section, partner rail, full footer), rebuilt in KoroPay green and gold. Motion One (npm `motion`) is vendored for animation. No invented testimonials or processed-amount stats are allowed until real ones exist.

- KudiAI is Joshua's chosen primary venture for the next year, with a proposed company/product name of KoroPay. He wants a lean, non-hackathon product within a month and prioritizes trust and retention. Other ventures are to receive less founder attention while he focuses on this; no job or existing obligation change was stated.
- KoroPay's intended experience is voice first in English, Nigerian Pidgin, Igbo, Yoruba and Hausa, with text also available. The envisioned scope includes transfers, bill payments, airtime/data, working virtual cards, personal savings and ajo/group savings. Joshua's three-month ambition is 50,000 active, retained users; it is a target, not a current metric.
- KoroPay is payments first. Joshua sees WhatsApp group ajo as its second flagship feature and a potential user acquisition and retention loop; Xara told him in his chat that it does not currently offer group ajo. Voice notes and text must both work, with language detection and code-switching. He wants verifiable picture receipts, provider choice based on real capabilities and costs, and a profitable path at scale.
- Joshua decided the KoroPay prototype and launch will use the official WhatsApp Business Platform, with no Baileys dependency. He wants a usable prototype with real users by the end of October 2026. Cards and general AI remain undecided. He set a **₦300,000 total October launch cap on 2026-10-02**, including CAC registration, legal, hosting and tests; live money is conditional on an affordable licensed partner and legal clearance. On 2026-10-03 he selected Rubies as the payment integration direction; its verified API pack, signed custody terms and live approval are still pending. He confirmed HarmonWeb, but shared hosting is only a prototype web candidate pending testing. He explicitly rejected direct member-to-recipient and externally tracked ajo: KoroPay must operate a rotating circle, with every member contributing to a licensed provider-held balance and KoroPay managing controlled payout. Anchor remains a sandbox engineering adapter, not an approved live custodian. Meta's pricing page checked 2026-10-06 says customer-window service replies are free; paid categories depend on message type and market.
- Joshua is already talking with Intron and wants to explore an enterprise partnership for KoroPay at large scale. The current KudiAI code already uses Intron Sahara STT/TTS. The first-release AI direction is Intron speech plus deterministic money-intent parsing and secure confirmation; a general LLM has no payment authority. Intron commercial terms remain unpublished and unverified.
- KoroPay is a greenfield company codebase. The old KudiAI hackathon repository is read-only reference material for benchmark and integration lessons; its auth, payment, ledger, database and Baileys code are not the launch foundation. The reviewed `https://github.com/liquidslr/system-design-notes` chapters inform the new architecture: one transactional ledger, durable outbox/inbox, provider reconciliation and measured scaling.
- On 2026-10-03 Joshua chose a WhatsApp-only customer product for KoroPay, with no downloadable customer app roadmap. The browser page in the greenfield `/Users/user/Developer/KoroPay` repository is a tester console. Existing WhatsApp groups can forward private ajo invites; direct bot entry into arbitrary existing groups remains unverified.
- On 2026-10-03 Joshua asked KoroPay to reuse the AI credentials in the old KudiAI checkout. They were copied without displaying values into KoroPay's ignored owner-only `.env.local`; the existing Sahara key maps to Intron. Gemini, Groq, Spitch, YarnGPT and OpenRouter credentials are present but dormant. No paid provider calls were enabled. No secret values belong in canonical memory.
- On 2026-10-03 Joshua replaced Rubies as KoroPay's payment direction with Flutterwave for transfers, funding, bills, customer wallets, cards and stablecoins where Flutterwave approves the product. He proposed ₦50 on NGN transfers below ₦50,000 and ₦100 from ₦50,000, subject to verified unit economics. He wants web onboarding, an owner admin dashboard and snap-to-pay images alongside the WhatsApp-first experience. The Flutterwave test adapter is off without a test key, virtual-card issuing needs private approval, and no live money is enabled. A Meta test phone ID/token passed a read-only check; a temporary public webhook challenge worked, while actual inbound bot delivery is still unverified. The public tunnel now blocks the weak browser demo session. No raw credentials belong in memory.
- On 2026-10-03 Joshua supplied Flutterwave test credentials for KoroPay; they are in the ignored owner-only local environment, not memory. A synthetic test payout wallet and one ₦100 test funding credit were verified from Flutterwave's wallet statement. Customer KYC, account binding and deposit notifications are not yet implemented. Joshua wants downloadable transaction history, NGN/USD cards with issuer PIN and hold/block controls, complete financial/security notifications, and a forgotten-PIN recovery flow. His chosen security preference is optional timed PIN for account unlock (including never), with a PIN always required for outgoing payments. Issuer card PIN and temporary hold APIs are not publicly verified; do not promise them until Flutterwave approves and documents them.
- Joshua supplied his Intron account pricing screen on 2026-10-02: English STT ₦0.43/second, English TTS ₦0.65/second, and displayed minimum purchases of ₦5,000 Individual, ₦10,000 Organization, ₦25,000 Integrator. Local-language and enterprise rates, billing increments and whether minimums recur remain unknown. Do not store transient account balance.
- KoroPay's provisional **demo** stack is Anchor sandbox for the first bank adapter (documented simulated funding, transfers, idempotency, status and statements), direct Meta Cloud API, Intron speech, Railway app/worker and Supabase demo PostgreSQL. Joshua challenged Railway/Supabase scale suitability; the live host is unselected pending measured load, security, recovery, data-location and full-cost checks. Keep standard PostgreSQL/container portability. Rubies remains Joshua's preferred live-custody candidate to compare on written terms; no live bank is selected. Bills/cards have no first-month provider decision. See `docs/KOROPAY_STACK_AND_NEXT_STEPS_2026-10-02.md` in the old repo's documentation.
- KoroPay now has its own private `jjnotmid/KoroPay` GitHub repository. The old KudiAI repository remains a read-only reference. Vercel Hobby rejected Mac-local commit authorship, so KoroPay repo-local Git identity and the three initial commits were corrected to Joshua's GitHub profile/no-reply identity; future KoroPay commits must retain that repo-local identity. The only intended Vercel project is **koropay**; Joshua showed its successful Production check on 2026-10-03. A duplicate **koropay-site** Vercel project still has a failing GitHub check and should be disconnected from the repo before any further pushes. The Vercel page is not a deployed WhatsApp backend. See `projects/koropay/state.md` for current build status.
- `ruflo` is the default orchestration layer.
- Durable conclusions live in `MEMORY.md` or a project state file; ruflo holds
  searchable supporting detail.
- Chrome automation uses the local `chrome-devtools` MCP server with Codex.
- iPhone, so no tool can inject taps into his phone. WhatsApp bot is the
  workaround.
- Web UI is **Joshua's AI Command Center**, blue theme, no emojis anywhere.
- Delphi's WhatsApp campaign transport is a separate Render service at
  `/Users/user/Developer/delphi-whatsapp-bridge`. It must never share Joshua's
  personal WhatsApp/Codex bot. Make owns the campaign automation; the Delphi
  service only pairs the business number, sends authenticated text, and
  forwards inbound replies. The Delphi number is still pending from Joshua.

## Known environment gotchas

- Python 3.13 ships without a CA bundle (fixed via Install Certificates.command).
- `openai-whisper` won't build on 3.13 — using `whisper-cpp` instead.
- Homebrew's core `ffmpeg` lacks libass; `ffmpeg-full` has it and is keg-only.
- `screencapture` silently refuses dotfile destinations.
- BSD `sed` doesn't support `\?`.
- Free models answer questions fine but **fabricate tool use** — don't trust them
  for actions.
