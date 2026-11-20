# IRIS use-case demo: what to say

Video: `docs/media/IRIS-usecase-demo.mp4` (1:58, silent). The captions on screen name each step; say the lines below while it plays.
The demo data was reset before recording, so the video shows the seeded storyline. Everything is simulated except step 5 (real DOH dengue data).

| Time | Step | On screen | Say |
|---|---|---|---|
| 0:00 | Title | A quiet week. Is it real? | Introduce the user: a RESU surveillance analyst starting the week. Everything in the app is simulated except the real dengue data in step 5. |
| 0:05 | 1. See what needs attention | This week's headline, compared with the week before, and a work queue of concerns. | IRIS opens on the week's headline: how many expected reports arrived and how many concerns are open, each compared with the week before. Below it is the work queue. We filter it to the new concerns nobody has looked at yet. |
| 0:22 | 2. Check a flag | Mapayapa RHU reported 1 case against about 10 expected. Its reports did arrive, so this is a count problem, not a missing report. | This flag is an unexpected drop: 1 case reported against about 10 expected from recent weeks. IRIS shows the flagged week next to the weeks before, and separates what we know from what is not yet known. We start the review and ask the unit to check its case register. |
| 0:45 | 3. Find the shared cause | Kalinaw RHU I and II report through the same connection. One fix may solve both. | The reporting network shows how units connect to hubs and labs. Kalinaw RHU I and II share one connection, so their two problems may have one cause and one fix. The network itself is simulated; real reporting pathways are a next step. |
| 1:03 | 4. Decide what to fix first | The planner picks the set of actions that fits 40 staff-hours, and compares it with simply doing the highest priority first. | Staff time is limited. The planner takes the open concerns, the cost and expected benefit of each action, and the 40 staff-hours available, and picks the best set. It also shows what doing the highest-priority items first would give, so the team can compare. The benefits are planning assumptions, not proven results. |
| 1:23 | 5. Same model, real DOH data | Model A on real 2020 dengue reports: North Cotabato reported 0 cases against about 17 expected. | This page runs the same models on real Department of Health dengue data from 2016 to 2021. Model A flags weeks that came in far below what each province's own history predicts. North Cotabato reported zero against about seventeen expected. That week was a real error: cases were typed into the deaths column. Every flag is a lead to verify. |
| 1:43 | 6. Check that reporting recovered | After each action, did reports come back? People verify before a concern is closed. | Finally, IRIS checks whether reporting came back after each action, comparing the weeks before and after. A concern is only closed when a person confirms it with evidence. |
| 1:54 | End | Spot · Connect · Decide · Verify | Close: IRIS turns suspicious reports into a short, ranked list of what to check, and people make the decisions. |

## If someone asks

- **Is this real data?** The region, units and workflow are simulated. Step 5 is real HDX / DOH dengue data, 2016–2021.
- **How good is Model A?** On 158 known errors in 2020 it caught 32%, against 8% for the best simple method, flagging 10% of normal weeks. 2020 was looked at more than once, so treat it as a second look.
- **Does the planner's benefit happen in reality?** Not yet measured. The costs and success rates are planning assumptions; measuring recovery after real actions is a next step.
- **Does IRIS decide on its own?** No. It flags and ranks; a person reviews, asks the unit, and closes a concern only with evidence.
