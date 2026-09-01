---
description: Run the morning brief — where things stand, what needs attention, plan today
---

Run the daily driver and turn it into an actual plan.

1. Run `wa-daily` and read the brief.
2. For anything under "Needs attention", look at what's actually there — don't
   just restate the flag. Uncommitted work: what is it, is it worth keeping?
   A quiet branch: was it finished, abandoned, or blocked?
3. Check `gh api notifications` if the count is non-zero and summarize what's
   waiting on Joshua.
4. Produce a ranked plan of **at most 5 items**. Each gets an explicit
   "done when" line. Name the single highest-leverage task.
5. Run `wa-daily save` to write the brief to `journal/` and ruflo memory.

Keep it short. This is a launchpad, not a status report — if there's nothing
worth doing in a category, say so in one line and move on.
