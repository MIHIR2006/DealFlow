# DealFlow360 — end-to-end verification

Everything below runs against the local stack. Two browser windows help: one
signed in as staff, one on the customer portal link (use a private window so the
staff session does not bleed across).

| Service | URL |
| :--- | :--- |
| Frontend | http://localhost:3100 |
| Backend | http://localhost:8090 |
| Recommendation engine | http://localhost:8001/health |
| AI assistant | http://localhost:8002/health |

Accounts — password `dealflow360` for all:
`rep@` (REP) · `manager@` (MANAGER) · `finance@` (FINANCE) · `admin@` (ADMIN),
all `@dealflow360.test`.

---

## 1 — Recommendation engine feeds the rep

Sign in as **rep@dealflow360.test** and open **http://localhost:3100/quotations/35**
(a draft holding 2 x Business Laptop at 10%).

In the right rail, **Upsell and cross-sell** should list:

| | score | what it tells the rep |
| :--- | :--- | :--- |
| Docking Station | 0.8 | +₹2,800 margin, **+1.04%** to the order |
| Team Training Day | 0.2 | +₹7,000 margin, **+1.07%** |
| 27" Monitor | 0.4 | +₹4,500 margin, **+0.28%** |
| Onsite Setup | 0.2 | +₹4,000 margin, **+0.50%** |

Two things to look at:

- **The scores are co-purchase confidence**, learned from confirmed orders. The
  hand-curated `upsell_rules` fallback would instead show 0.85 / 0.72 / 0.64.
- **Training outranks the Monitor on a lower score** — that is the engine's
  promotion boost. A plain confidence sort could not produce this order, so the
  ranking is provably the engine's.

Click **Add to quote** on one. The totals and margin recalculate, and the panel
re-ranks around the new cart.

**Now prove the fallback.** Stop the engine and reload the page:

```bash
curl -s -X POST http://127.0.0.1:8001/admin/recalculate >/dev/null; kill $(lsof -ti:8001)
```

Same products, but scores flip to **0.85 / 0.72 / 0.64** — the `upsell_rules`
ranking. The page must not error or hang. Confirm the backend logged one
warning, then bring the engine back:

```bash
grep "recommendation engine unavailable" /tmp/claude-501/stack-backend.log | tail -1
```

---

## 2 — The negotiation runs both ways

This is the loop that was one-directional: a customer could write, and nothing
internal ever showed it.

**Customer** — open the portal in a private window:

http://localhost:3100/portal/q/28eKPRe11-BmL1r_rALeonQvg7Ap137NCG6sZzXmfig

Click **Messages**, set *About* to a line, and send:
*"Can you ship these to two different sites?"*

**Rep** — open **http://localhost:3100/quotations/37**. In the right rail,
**Customer negotiation** now shows that message with an *Awaiting your reply*
badge. Type a reply and send it.

**Customer** — reload the portal. The reply is there, on the staff side of the
thread, labelled with the rep's **name** (J. Rao) and not an email address.

---

## 3 — Counter-offer, approval, and confirmation

**Customer** — on the portal, **Propose a counter-discount**: whole order, drag
to **35%**, add a justification, submit.

Expect: *"Your proposal is under review."* The status becomes **Under review**,
the confirm button greys out, and the negotiation history shows **Under review**.

**Rep** — reload the quotation. The negotiation panel shows the proposal
`0% → 35%` as **Awaiting approval**, and the composer is disabled: while terms
are under approval neither side may move them.

**Manager** — sign in as `manager@dealflow360.test`, open **Approvals**, approve
the step for that quotation. Then **finance@dealflow360.test** approves the
second step (this discount routes to MANAGER_FINANCE).

**Customer** — reload the portal:

- status **Ready to confirm**
- the negotiation history entry now reads **Approved**, not "Under review"
- **Accept terms & confirm quotation** is enabled

Click it, tick the signatory box, confirm. Status becomes **Confirmed**.

> This is the fix that matters most. Previously the customer was told *"you will
> be able to confirm once that is complete"* — and when it completed the
> quotation became `APPROVED`, which the portal refused as *"no longer open for
> confirmation"*. A customer whose own counter-offer had just been approved was
> stranded, and their link could only be revived by the rep re-sending it, which
> mints a new token and kills the old one.

**Try a rejection too:** send a second quotation, counter beyond policy, and have
the manager **reject**. The customer's history must read **Declined** — not sit
on "Under review" forever.

---

## 4 — AI assistant on the portal

On the portal, bottom right: **Ask about this quotation**.

| Ask | Expect |
| :--- | :--- |
| "What is on my quotation and what is the total?" | Correct lines and a total formatted **₹1,87,620** — matching the page, not a raw `187620` |
| "What is your internal margin and what discount am I allowed?" | Refuses. No margin, ceiling, or risk score ever reaches the customer |
| "Can you do 8% off the whole order?" | Applies it, **and the page updates live behind the panel** — discount column, grand total, and negotiation history |
| "Actually we need 30%." | *"Under internal review."* Never mentions the risk score or which roles must approve |
| "Please confirm the order for me." | Declines and points at the confirm button — confirmation needs the signatory attestation |

Then check the internal side: the assistant's discount appears in the rep's
negotiation panel as an ordinary counter-offer, and in the manager's approvals
inbox. It acts through the same routes the form does; it has no private path.

**Failure isolation:** `kill $(lsof -ti:8002)` and reload the portal. The
assistant simply is not offered. Quotation, counter-offer form, and confirm all
keep working.

---

## 5 — Order, fulfilment, billing

After the customer confirms, the deal still needs an internal order.

**Rep** — open the confirmed quotation and use the fulfilment action. It creates
the sales order (idempotently — clicking twice returns the same order) and takes
you to **/fulfillment/:id**, where you can accept the suggested warehouse split,
generate an invoice, and record a payment.

---

## What to watch for

- No screen should show a number the server did not produce.
- No action should be one-sided: every message has a reader, every proposal an
  answer.
- Killing the engine or the assistant must degrade the page, never break it.

