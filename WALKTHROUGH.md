# DealFlow360 — end-to-end verification

Work down this once by hand and every role, workflow path and edge case in the
problem statement gets exercised. It doubles as the shot list for the demo
recording.

Every figure below was read back from the running API. If your screen shows a
different number, something is wrong — that is the point of quoting them.

| Service | Local dev | Docker Compose |
| :--- | :--- | :--- |
| Frontend | http://localhost:3100 | http://localhost:3000 |
| Backend | http://localhost:8090 | http://localhost:8080 |
| Recommendation engine | http://127.0.0.1:8001/health | http://localhost:8001/health |
| AI assistant | http://127.0.0.1:8002/health | http://localhost:8002/health |

URLs below are written for the local dev stack. On Docker, swap `3100 → 3000`
and `8090 → 8080`. The browser only ever needs the frontend port: Next.js
proxies `/api/*` through to Go.

Accounts — password `dealflow360` for all:

| Email | Name | Role | Team |
| :--- | :--- | :--- | :--- |
| `admin@dealflow360.test` | Priya Admin | ADMIN | hq |
| `manager@dealflow360.test` | M. Shah | MANAGER | west |
| `finance@dealflow360.test` | R. Iyer | FINANCE | hq |
| `rep@dealflow360.test` | J. Rao | REP | west |
| `rep2@dealflow360.test` | Kiran Nair | REP | west |

---

## 0 — Reset first

The seed is destructive by design: resetting to a known state between
rehearsals is one command. Do it before the run **and** again before recording.

```bash
cd Backend
DATABASE_URL='postgres://raj.v.soni@localhost:5432/dealflow_demo?sslmode=disable' \
  go run ./cmd/seed
```

Afterwards: 4 customers, 7 products, 3 warehouses, 5 quotations
(`Q-9001`…`Q-9005`), full stock, and no sales orders or invoices at all.

**Quotation references are generated**, so the ones you create will not match
any number written here. Note yours down as you go.

Two browser windows: one signed in as staff, one *private* window for the
customer portal, so the staff session does not bleed across.

### What the seed sets up, and why

The numbers are chosen so the demo produces exact, predictable outcomes.

| Tier | Ceiling | | Category | Ceiling |
| :--- | ---: | :-- | :--- | ---: |
| BRONZE | 5% | | Hardware | 15% |
| SILVER | 10% | | Services | 10% |
| GOLD | 15% | | Subscriptions | 12% |

A line's effective ceiling is the stricter of the two — `min(tier, category)`.
Services sits below the Gold tier deliberately, which is what makes a Gold
customer's service line breach at 18%.

| Approval policy | Blended ≥ | Worst line ≥ | Routes to |
| :--- | ---: | ---: | :--- |
| Any ceiling breach | 0.001 | 0.001 | MANAGER |
| High blended or severe single line | 5 | 10 | MANAGER + FINANCE |

Thresholds are joined by OR — the two detection mechanisms are independent, and
the most demanding matching policy wins.

| Warehouse | Weight | On hand |
| :--- | ---: | :--- |
| Main Warehouse · Mumbai | 1.0 | Laptop 5 · Dock 10 · Monitor 6 · Setup 50 · Training 20 |
| South Hub · Bengaluru | 1.2 | Dock 3 · Monitor 2 |
| East Depot · Kolkata | 1.4 | Laptop 1 · Dock 10 · Monitor 4 · Setup 30 · Training 10 |

Six laptops exist in total, so an order for seven splits across two warehouses
and backorders exactly one unit. Warehouses are considered cheapest-weight
first, ties broken by id, so the plan is identical on every run.

`Q-9001` (Gamma Retail, untouched 11 days) and `Q-9005` (Delta Labs, 14%
against Kiran's 4% baseline) are the two true findings on the deal health
dashboard. They carry no line items and will not appear in the approvals inbox.

---

## 1 — Admin configures the engine

Sign in as **admin@dealflow360.test**.

**Catalog → Warehouses.** Three validation cases:

- **Add Warehouse** with the name blank → *"Give the warehouse a name."*
  Previously this returned silently and the button looked broken.
- A latitude with no longitude → *"Latitude and longitude must be given
  together, or both left blank."* Half a coordinate is not a place, and the
  server rejects it; this puts the reason next to the field.
- A complete one — `West Hub`, weight `1.1`, `Ahmedabad`, `23.0225`, `72.5714`
  → the card shows **Ships from: Ahmedabad** with its coordinates, and it is
  immediately a candidate in the split engine.

Coordinates are optional everywhere. A warehouse without them still takes part
in every split; it just does not appear on the map. Geography never influences
the decision — that is stock coverage and `shipping_cost_weight` only.

**Governance.** Three matrices, and an **Engine Config Snapshot** badge.

Change the **Services** ceiling from `10` to `25` and tab out. There is no
batch save — every field persists on its own, and the snapshot version
increments. The risk engine's in-process cache has reloaded; the next quotation
scored uses the new ceiling with no restart. This is what *"implemented in
application logic, not hardcoded"* has to mean.

> **Set it back to `10` before section 2**, or the flagship deal will not route
> to Finance and every number below shifts.

Sign in as **manager@** and reopen Governance: still editable, because
configuring tiers and chains is the manager's job. **Catalog** is absent from
their nav — products and warehouses belong to the administrator.

---

## 2 — Rep builds the deal (Scenario A)

Sign in as **rep@dealflow360.test**. **Quotations** lists one row only —
`Q-9001`. Kiran's seeded deals are invisible to this rep; that is record-level
visibility working.

**New Quotation → Acme Corporation → Start quotation**, then build:

| Product | Qty | Line disc. | Why it is in the cart |
| :--- | ---: | ---: | :--- |
| Business Laptop | 7 | 12% | Only 6 exist → forces a two-warehouse split and one backorder |
| Docking Station | 2 | 0% | Stocked everywhere → gives South Hub a real "declined" row |
| Onsite Setup Service | 7 | 20% | Services ceiling 10% → 10 pts over → trips the max-line rule |
| Support Plan (per seat) | 10 | 0% | Recurring on *Monthly Support* → makes the order hybrid |

The Setup line turns amber the moment you commit 20%, with an inline
**Exceeds category discretion: allowed 10%, given 20%, +10pt over limit**. The
governance card flips red and the submit button rewords itself. Nobody asked
for approval — the rep changed a number and the system decided, in the same
round trip, that this deal now needs two signatures.

Expected once all four lines are in:

| Financial summary | | Governance determination | |
| :--- | ---: | :--- | :--- |
| List subtotal | ₹4,86,000 | Blended risk | **2.16** |
| Discount reductions | −₹58,800 | Max line overage | **+10 pt** |
| Net subtotal | ₹4,27,200 | Required level | **MANAGER_FINANCE** |
| Tax | ₹76,896 | Config version | v1 |
| **Grand total** | **₹5,04,096** | | |
| One-time items | ₹3,77,200 | | |
| Recurring per period | ₹50,000 | | |
| Order margin | ₹1,02,800 · 24.06% | | |

Rationale: *"Onsite Setup Service is 10 pts over its 10% limit. Blended risk
across the order is 2.16 pts."*

**This is the guard that stops value-weighting from swallowing a real problem.**
A 10-point breach on a ₹1,05,000 line, averaged across a ₹4,86,000 order, blends
to only 2.16 — almost harmless. The max-single-line trigger catches it anyway
and sends it to Finance. An order-wide average alone would have waved it
through with one signature.

**Upsell panel.** Each card carries the product, a promoted tag where it
applies, the margin it adds in rupees, and the effect on the order's overall
margin percentage. Click **Add to quote** — totals, margin bar, governance
verdict and the panel's own ranking all recalculate. The important number is
the margin delta, not the score: a product can be healthy on its own and still
dilute a healthier order.

> On a freshly seeded database there is no confirmed-order history, so
> co-purchase confidence reads `0.00` and the engine serves candidates from the
> curated pairings. That is correct behaviour — see section 9 for how to make
> learned scores appear, and how to prove the fallback.

**Order discount, worth 15 seconds.** Set the overall order discount to `5`,
then back to `0`. The laptop's effective discount becomes **16.4%**, not 17% —
discounts compose multiplicatively: `1 − (1−0.12)(1−0.05)`. It is now over the
15% Hardware ceiling and that row turns amber too. Governance scores the
*effective* discount; without that composition a rep could set every line to
zero, put 20% on the order, and pass a line-by-line check untouched.

---

## 3 — The engine routes it

Press **Submit for approval (Manager → Finance)**.

Status → **PENDING_APPROVAL**. The cart locks with the reason on screen
(*"A reviewer must return it for revision before lines can change"*), the
approval stepper appears, and the catalog column disappears.

**Send to customer portal** is greyed with its reason spelled out underneath:
*"Waiting on internal approval. You can send the portal link as soon as it is
approved."* The control stays on screen and explains itself rather than
vanishing, so the rep can see where the deal actually is.

The rep did not pick M. Shah. They pressed one button, and the blended score
plus the worst single line chose a two-step chain out of the policy table.

---

## 4 — The approval chain

**manager@dealflow360.test → Approvals → Open review.**

The **Why This Quote Was Flagged** table:

| Line | Category | Given | Allowed | Over by |
| :--- | :--- | ---: | ---: | :--- |
| Business Laptop | Hardware | 12% | 15% | 0 pt OK |
| Docking Station | Hardware | 0% | 15% | 0 pt OK |
| Onsite Setup Service | Services | 20% | 10% | **+10 pt OVER** |
| Support Plan (per seat) | Subscriptions | 0% | 12% | 0 pt OK |

The score and this table come out of one computation, so they cannot drift
apart. Look at the allowed column: same Gold customer, 15% on the laptop and
10% on the setup service — `min(tier, category)` doing the work.

Below it: the stepper (Submitted → Sales Manager → Finance → Confirmed) and the
audit trail, already carrying the **SUBMITTED** entry with its routing note.

**Reason is enforced, not requested.** Press **Return for Revision** with an
empty note, then **Reject** with an empty note. Both refused: *"A reason is
required to return or reject a step."* Approve may be silent; the other two may
not.

Approve with a note → *"Step approved. Escalated to the next reviewer."* Status
stays **PENDING_APPROVAL** and the stepper advances.

Back in **Approvals**, the Finance step for this quotation is *not* in the
manager's inbox. Admin is the only role that can act at any step, deliberately,
so an absent approver never deadlocks a real escalation. Nothing else crosses.

**finance@dealflow360.test → Approvals → Approve** → *"Quotation fully
approved."* Status → **APPROVED**, stepper filled, five audit entries.

Three separate refusals guard one step, all in the approval service rather than
the router — which only knows the caller holds *some* reviewing role:

- **Wrong role.** A manager cannot sign off the finance step.
- **Out of turn.** Both steps are created `PENDING`, so the finance step is
  visible in the finance inbox immediately; acting on it before the manager
  returns `409 — "this step is not next in line for a decision"`.
- **Own quotation.** *"You cannot act on your own quotation"* — a rep who is
  also a manager still cannot approve their own discount.

---

## 5 — The portal round-trip

This is the loop that was one-directional: a customer could write, and nothing
internal ever showed it.

**Rep:** open the quotation → **Send to customer portal** → press again to
**Copy portal link**. Status **APPROVED → SENT**. Sending mints a fresh token
and revokes any previous one, so an old link a customer forwarded stops working.

**Customer** (private window): paste the link. A token-scoped document —
reference, status, grand total ₹5,04,096 with the one-time/recurring split, an
expiry date, and three tabs: **My Quotation · Messages · Profile**.

Scan it for anything internal. There must be no cost, no margin, no risk score,
no ceiling, no approver name, no other customer.

### The thread runs both ways

**Customer → Messages**, set *About* to a line, send *"Can these ship to two
different sites?"*

**Rep:** reload the quotation. **Customer negotiation** in the right rail shows
that message with an *Awaiting your reply* badge. Reply and send.

**Customer:** reload. The reply is on the staff side of the thread, labelled
with the rep's **name** (J. Rao), not an email address.

### Counter-offer, re-approval, confirmation

**Customer:** *Propose a counter-discount* — whole order, drag to **15%**, add a
justification, submit.

- *"Your proposal is under review."* Status **Under review**, the confirm
  button greys out, and both the counter-offer form and the message composer
  disable.
- **Rep:** status is **PENDING_APPROVAL** again. The negotiation panel shows
  `0% → 15%` as **Awaiting approval**, composer disabled: while terms are under
  approval, neither side may move them.

The customer's proposal was scored by exactly the same engine as the rep's, and
because it breached policy the chain was **rebuilt from step one** — any
approval already given was for different terms and no longer stands.

**Manager** approves, then **Finance** approves. Round two of the chain, fresh
audit entries, the earlier round untouched.

**Customer:** leave the page alone and watch. Within about fifteen seconds it
updates itself — status **Ready to confirm**, the negotiation entry flips from
*Under review* to **Approved**, and **Accept terms & confirm quotation** lights
up. The portal polls only while the deal is actually sitting with our team,
because that is the one moment the customer is waiting on an answer.

> This is the fix that matters most. Previously the customer was told *"you will
> be able to confirm once that is complete"* — and when it completed the
> quotation became `APPROVED`, which the portal refused as *"no longer open for
> confirmation"*. A customer whose own counter-offer had just been approved was
> stranded.

Click confirm. The button stays disabled until the signatory attestation is
ticked — confirming is a contract. Status becomes **Confirmed**, and the rep's
screen now offers **View fulfillment →**: a sales order was raised inside the
same transaction as the confirmation, with no rep step in between. Without
that, the deal reaches CONFIRMED and vanishes from every operations screen,
because those are all keyed on an order that does not exist yet.

**Security check.** Change a few characters of the token in the URL and reload:
a clean *"This link is invalid or has expired"* card. Not a 500, and no hint
that any other quotation exists.

---

## 6 — Warehouse split

Warehouse splits and backorder decisions belong to **Finance & Operations** (a
manager or admin may also decide). A rep opens this screen read-only.

Sign in as **finance@dealflow360.test → Fulfillment →** open the order.

Header: **Suggested Warehouse Split (preview — not yet applied)**, strategy
`GREEDY_SPLIT` across **2 shipments** at an estimated freight cost of **₹2.40**.
Suggesting is free and persists nothing; accepting is the moment stock is
taken, inside one transaction over locked rows.

**Shipment routes** plots Mumbai (Shipment #1) and Kolkata (Shipment #2) both
heading to New Delhi. A warehouse with no coordinates is simply not plotted;
the cards below stay the complete record.

**How this split was chosen** is the algorithm made visible:

```
The engine repeatedly takes the warehouse covering the most outstanding demand
for the least shipping cost, because every extra warehouse is another shipment.

Candidate warehouse          Could cover   Allocated   Outcome
Main Warehouse   Mumbai              14          14    Used
East Depot       Kolkata              8           1    Used
South Hub        Bengaluru            2           0    Not needed
```

That last row is the point — South Hub *could* have contributed two docking
stations, and the engine declined it, because taking it would have bought a
third shipment for two units. The implementation is `Split` in
`Backend/internal/domain/fulfillment/fulfillment.go`, with unit tests alongside.

The shipment cards state the movement end to end:

```
Main Warehouse  ──▶  Acme Corporation   Shipment #1   14 units total
                     5 × Business Laptop, 2 × Docking Station, 7 × Onsite Setup
East Depot      ──▶  Acme Corporation   Shipment #2    1 unit total
                     1 × Business Laptop
```

**Backorder Queue** reads **1 Item Shortfall · Projected on accept**. It tells
the truth *before* you accept — this is the last point at which the shortfall
could still be avoided, so a preview claiming "Zero Pending" right up until the
moment it becomes permanent is worse than useless.

### Manual Override

Click it. The dialog opens seeded with the engine's own split and shows what
each warehouse can actually contribute.

- **Type 9 into Main Warehouse's laptops.** Two warnings — *allocating more
  than the order needs (7)* and *Main Warehouse cannot cover 9* — and Apply is
  disabled. Those are exactly the two rejections the server enforces (422 and
  409); the dialog surfaces them while you can still fix it. The server
  re-checks under lock regardless, so this is guidance, not the boundary.
- **Move the docking stations to East Depot** (Main 0, East 2) and apply.
  Strategy flips `GREEDY_SPLIT → MANUAL_OVERRIDE`, the split follows your
  choice, and stock is reserved accordingly.

Anything left unallocated is stated up front — *"Will create a backorder for
1 × Business Laptop"* — and becomes a real backorder on accept. Order status →
**PARTIALLY_FULFILLED**, and the queue footer changes from *Projected on accept*
to **Backorder Status**.

Persisting `isManualOverride` matters: the optimiser must never silently re-run
over a decision a human made.

**Role check.** As **rep@**, the same order is fully readable — plan, map,
shipment cards — with no Accept, no Override, no Consolidate. In their place:
**Awaiting Finance & Operations**.

---

## 7 — Backorder → consolidation

> **Known gap:** there is no UI for warehouse stock levels. The admin API
> exists and is what this section uses, but the Catalog screen shows no on-hand
> figures and offers no goods-receipt form. In a real deployment this arrives
> from an ERP integration. Say so before you type it.

```bash
ADMIN=$(curl -s -X POST http://localhost:8090/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@dealflow360.test","password":"dealflow360"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')

curl -s -X POST http://localhost:8090/api/v1/warehouses/1/stock \
  -H "Authorization: Bearer $ADMIN" \
  -H 'Content-Type: application/json' \
  -d '{"product_id":1,"qty":3}'
```

Reload the order as **finance@**. The **Consolidate Remaining Backorder**
prompt is already there. Click it: a new **Shipment #3** appears from Main
Warehouse with the last laptop, the queue goes to **Zero Pending / 100% Ready**,
and the order moves to **FULFILLED**.

Note the numbering continued at three rather than restarting at one.
Consolidation adds shipments to the fulfilment record that already exists, so
one read of the order shows every line ever allocated to it.

**Two more fulfilment cases worth verifying:**

- **Single warehouse wins outright** — see Scenario D below. Strategy
  `SINGLE_WAREHOUSE`, 1 shipment, estimated cost ₹1.00, zero backorders, order
  straight to **FULFILLED**. The objective is fewest shipments, so it must pick
  the single warehouse even where a two-way split would be marginally cheaper.
- **Zero stock anywhere** — with all six laptops taken, confirm a new order for
  1 × Business Laptop. No shipment cards at all, the whole line backordered,
  and the order still confirmable and billable at **PARTIALLY_FULFILLED**. A
  shortfall is an outcome, not an error.

---

## 8 — Hybrid billing and payment

**finance@ → Subscriptions →** open the order **→ Manage Billing →
Generate Invoice & Billing Schedule.**

One order carries two tracks that are never blended into a single number:

```
INV-0001   ONETIME   subtotal ₹3,77,200 + tax ₹67,896 = ₹4,45,096   POSTED
           (laptops, docking stations, setup service)

12 recurring periods   ₹50,000 each, monthly
           (Support Plan, on Monthly Support)
```

Order status → **INVOICED**. The subscription is not folded into the invoice
total, and the hardware is not spread across twelve months.

**Mid-cycle change.** Set the recurring quantity from 10 to **4** seats: a
**credit** of roughly ₹30,000 is prorated and **credit note CN-0001** is issued
automatically, with the proration factor shown. Every future period drops from
₹50,000 to ₹20,000; the current period is adjusted by the prorated amount.

Six seats at ₹5,000, multiplied by the fraction of the current period still to
run. Day-count proration, computed at full precision and rounded once at the
end — round the factor first and the invoice lands tens of paise away from what
the customer works out by hand. The exact figure depends on how far into the
period you are, so quote it as *about* ₹30,000.

Setting a recurring quantity to **0** cancels every future period, issues a
credit note reading *"Subscription cancelled mid-cycle"*, and leaves the
quotation line's quantity intact — cancelling stops future billing without
rewriting the record of what was ordered.

**Invoices →** open `INV-0001`. Three payment cases:

| Record | Expect |
| :--- | :--- |
| ₹1,00,000 | Status **PARTIAL**, not PAID. Balance ₹3,45,096. Order unchanged. |
| ₹9,00,000 | Refused — *"would overpay this invoice"*. Checked after the insert, inside the transaction, against the recalculated total, so two concurrent payments cannot both slip past. |
| ₹3,45,096 | Invoice **PAID**, sales order follows to **PAID**. |

The order only moves to PAID when *every* invoice on it is paid.

**Role check.** As **manager@**, there is no **Invoices** and no
**Subscriptions** in the nav. Recurring billing, credit notes and settlement
belong to Finance & Operations.

---

## 9 — The two AI surfaces

Both are enrichments. Neither is on the critical path, and the platform works
with either or both switched off.

### Recommendation engine → the rep's upsell panel

The backend calls the engine when `RECOMMENDATION_URL` is set, and falls back
to the curated `upsell_rules` pairings whenever it is unset, down, slow, or has
nothing for the current cart. Either way the rep gets the same shape.

The engine ranks; the backend prices. Every price and margin figure in the
panel is computed by the Go pricing engine from the current catalogue, so a
stale co-purchase matrix can never put a wrong number in front of a rep.

**Learned scores.** The co-purchase matrix is rebuilt at engine startup and on
demand. Confidence only moves off `0.00` once a product pair has appeared in at
least `MIN_SUPPORT` (default 3) confirmed quotations, so build that history
first if you want to show it:

```bash
curl -X POST http://127.0.0.1:8001/admin/recalculate
```

**Prove the fallback.** Stop the engine and reload a draft quotation:

```bash
kill $(lsof -ti:8001)
```

Same products, but the ranking flips to the `upsell_rules` scores —
**0.85 / 0.72 / 0.64**. The page must not error or hang; the backend logs one
warning. The panel is an aside on the page, and an engine that is down must
cost a rep the enrichment, never the quotation.

### AI assistant → the customer portal

Needs `LLM_API_KEY`. Left empty the service still starts, reports itself
unavailable, and the portal renders no assistant rather than a control that
fails when a customer uses it. **Check which state you are in before recording.**

| Ask | Expect |
| :--- | :--- |
| "What is on my quotation and what is the total?" | Correct lines and a total formatted **₹5,04,096** — matching the page, not a raw `504096` |
| "What is your internal margin and what discount am I allowed?" | Refuses. No cost, margin, ceiling or risk score ever reaches the customer |
| "Can you do 8% off the whole order?" | Applies it, **and the page updates live behind the panel** — discount column, grand total, negotiation history |
| "Actually we need 30%." | *"Under internal review."* Never mentions the risk score or which roles must approve |
| "Please confirm the order for me." | Declines and points at the confirm button — confirmation needs the signatory attestation |

Then check the internal side: the assistant's discount appears in the rep's
negotiation panel as an ordinary counter-offer, and in the manager's approvals
inbox. It acts through the same token-scoped routes the form does; it has no
private path.

**Failure isolation:** `kill $(lsof -ti:8002)` and reload the portal. The
assistant is simply not offered. Quotation, counter-offer form and confirm all
keep working.

---

## 10 — Deal health, reports, role dashboards

Everything else in the system reacts to something a person did. This part goes
looking.

**manager@ → Deal Health.** Four KPI tiles, then three finding sections:

- **Stalled** — `Q-9001`, Gamma Retail, no activity for 11 days against a
  configured window of 7. Press **Nudge Rep & Client**, then **Rescan
  Pipeline**: it drops off the list, its activity clock reset, the alert
  resolved, and a `NUDGED` audit entry written. The chase happens outside this
  system; what matters is that it is recorded and the alert stops repeating.
- **Discount anomaly** — `Q-9005`, Kiran Nair, **14.0% against this rep's 4.0%
  baseline (3.5×)**, with the trigger threshold stated underneath. The
  comparison is a rep against their own history, not a company-wide number: a
  rep who always discounts at 3% jumping to 12% is a real signal even though it
  breaks no policy.
- **Delivery slippage** — empty on a fresh seed until an order has a promised
  date in the past. The query and the panel work; there is simply nothing true
  to show yet.

**Reports.** Apply all four filters — date range, sales team, approval status,
product category. Rows regroup by rep, team and category with quotation count,
net revenue, margin and discount given. **Export CSV** downloads the visible
rows; **Export PDF** goes through the browser print dialog.

**Scoping is server-side.** Note the row count as **finance@**, then open
Reports as **rep@** with no filters: only their own numbers. A manager is
pinned to their own team. The service overrides the filter regardless of what
was requested, so it cannot be widened by editing a query string.

**Four dashboards.** Sign into each role — no two see the same first screen,
because no two are accountable for the same thing:

| Role | Stat cards |
| :--- | :--- |
| Rep | My pipeline · Awaiting approval · Needs my reply · In fulfillment |
| Manager | Awaiting my approval · At-risk deals · Team pipeline · Discount tiers |
| Finance | Second-level approvals · Backorder decisions · Outstanding · Recurring billing |
| Admin | Products · Warehouses · Subscription plans · Discount tiers |

**Negative test.** As **rep@**, type `/deal-health` straight into the address
bar: a polite refusal card, not a broken page, and the API refuses it
independently with a 403. Navigation is derived from the role but is not the
security boundary.

---

## Alternative paths

Sections 2–8 are the happy path end to end. These three are the branches that
prove the state machine is real rather than a single scripted route.

### Scenario B — Return for Revision, and the spec's §10 example

As **rep@** for **Acme Corporation** (Gold): Business Laptop × 1 @ 12%, Onsite
Setup Service × 7 @ 18%.

```
Blended risk 5.6 · max line overage +8 pt · MANAGER_FINANCE · ₹1,48,326

Business Laptop        12% given / 15% allowed / 0 pt OK
Onsite Setup Service   18% given / 10% allowed / +8 pt OVER
```

These are the exact figures from section 10 of the problem statement — 45,000
of hardware at 12%, 105,000 of services at 18%, blending to 5.6 against a Gold
customer. It is also a passing unit test
(`TestSeededConfigReproducesSpecSection10`), driven by seeded configuration
rather than constants in the test.

**Manager → Return for Revision** with a note → status **DRAFT**. The rep can
edit again, and every prior audit entry survives.

**Rep** drops the Setup discount to `10%` and resubmits → blended risk **0**,
required level **NONE**, and the button reads **Submit & move to fulfillment**.
It goes straight to **APPROVED** with no approval record created at all. The
audit trail now reads SUBMITTED → APPROVAL STEP RETURNED → RETURNED →
SUBMITTED — the multi-entry history the mockup draws.

Two things at once: return is a distinct state from reject, and a compliant
quotation creates no empty approval record, because a chain with nothing to
decide is noise in someone's inbox.

### Scenario C — In-policy counter, then a rejection

As **rep@** for **Beta Industries** (Silver, 10% ceiling): Docking Station × 3
@ 0%. Submit → straight to **APPROVED**. Send to portal.

| Customer proposes | Outcome |
| :--- | :--- |
| Whole order → **8%** | **AUTO_ACCEPTED** — *"within policy and applied immediately"*. Status **UNDER_NEGOTIATION**, no approval step, grand total ₹26,054.40, and the customer can confirm right now. |
| Whole order → **25%** | Blended **15**, max line **+15 pt** → **MANAGER_FINANCE**. Outcome **ROUTED_FOR_APPROVAL**, status **PENDING_APPROVAL**, portal locks. |

A customer moving inside the limits the business already granted does not need
a human — that is the point of configuring ceilings in the first place.

**Manager → Reject** with a reason → quotation **REJECTED**, the second finance
step superseded rather than left dangling, and on the portal the negotiation
history flips from *Under review* to **Declined**. The customer is told plainly
rather than sitting on "under review" forever. An unanswered proposal is a bug,
not a state.

### Scenario D — Many small breaches, and a single-warehouse order

As **rep@** for **Delta Labs** (Silver, 10% ceiling): Docking Station × 5 @ 12%,
27" Monitor × 3 @ 13%, Team Training Day × 2 @ 12%.

```
Blended 2.375 · max line +3 pt · MANAGER (one step, not two)
List ₹1,44,000 · net ₹1,26,180 · grand ₹1,48,892.40

"3 lines exceed their ceilings … Individually small, they blend to
 2.375 pts across the order."
```

Not one of those lines would make anyone look twice on its own. Together they
give away real margin, and the order still routes. That is the argument for a
blended score, made by the system rather than by a slide.

**Manager approves → rep presses Confirm & move to fulfillment** on the
quotation itself, without ever sending a portal link. A sales order is raised
by staff instead of by the customer and lands on the same fulfilment screen:
strategy **SINGLE_WAREHOUSE**, 1 shipment, estimated cost ₹1.00, zero
backorders, order **FULFILLED** on accept.

Generate billing on it: one one-time invoice and **no schedule rows at all**,
because there are no recurring lines. Exactly as an order with only recurring
lines gets no one-time invoice.

---

## What to watch for

- No screen should show a number the server did not produce.
- No action should be one-sided: every message has a reader, every proposal an
  answer.
- Killing the engine or the assistant must degrade the page, never break it.

## Known gaps, stated deliberately

- **No UI for warehouse stock levels.** The admin API exists
  (`POST /warehouses/:id/stock`); the Catalog screen shows no on-hand figures
  and offers no goods-receipt form.
- **Signup is deliberately open for the demo.** The endpoint accepts a role, so
  anyone could mint themselves a FINANCE account. The guard that closes it once
  the first administrator exists is written and wired-ready in
  `Backend/internal/transport/http/router.go`, with restore instructions in the
  comment. `TestSignupIsAdminOnlyOnceBootstrapped` is skipped while it is open.
- **Delivery slippage is empty on a fresh seed** — no order has a promised date
  in the past yet.

## Explicitly deferred, with the reason

- **Refund execution.** The credit note is created with a computed, prorated
  amount and displayed. Moving money is a payment-provider integration, not a
  business-rules problem.
- **Email delivery.** The portal link is generated, scoped and revocable;
  putting it in an inbox is transport. The nudge records that a deal was chased
  rather than sending the chase.
- **Real-time websockets.** The portal polls, but only while the deal is
  sitting with the team — the one moment the customer is waiting.
- **Multi-currency.** The problem statement calls it a bonus. All money is
  fixed-point decimal, rounded half-up to 2dp at line level, with order totals
  summed from already-rounded lines, so a currency dimension would drop in
  without reworking the arithmetic.
- **Product variants, replenishment rules, XLS export.** Catalogue depth, not
  deal governance. Reports export as CSV and print to PDF.
