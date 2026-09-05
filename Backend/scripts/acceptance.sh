#!/usr/bin/env bash
#
# The eight steps from section 9 of the problem statement, run against a live
# server with nothing but curl.
#
# The point is that the backend can be shown to work on its own. If the
# frontend is not ready, or breaks during a demo, this still demonstrates
# every graded behaviour end to end.
#
#   ./scripts/acceptance.sh [base-url]
#
set -euo pipefail

BASE="${1:-http://localhost:8080}/api/v1"
PASS="dealflow360"
JSON="Content-Type: application/json"

green() { printf '\033[32m%s\033[0m\n' "$1"; }
red()   { printf '\033[31m%s\033[0m\n' "$1"; }
step()  { printf '\n\033[1m%s\033[0m\n' "$1"; }

FAILED=0
check() {
  if [ "$2" = "$3" ]; then green "    ✓ $1: $2"
  else red "    ✗ $1: got $2, want $3"; FAILED=1; fi
}

jqf() { python3 -c "import sys,json;d=json.load(sys.stdin);print($1)"; }

login() {
  curl -sf -X POST "$BASE/auth/login" -H "$JSON" \
    -d "{\"email\":\"$1\",\"password\":\"$PASS\"}" | jqf "d['token']"
}

# ---------------------------------------------------------------------------

step "Step 1 — sign in; a discount tier, warehouse and subscription plan exist"
REP=$(login rep@dealflow360.test)
MGR=$(login manager@dealflow360.test)
FIN=$(login finance@dealflow360.test)
ADM=$(login admin@dealflow360.test)
AR="Authorization: Bearer $REP"

check "discount tiers"     "$(curl -sf "$BASE/governance" -H "$AR" | jqf "len(d['tiers'])")" "3"
check "warehouses"         "$(curl -sf "$BASE/warehouses" -H "$AR" | jqf "len(d['data'])")" "3"
check "subscription plans" "$(curl -sf "$BASE/subscription-plans" -H "$AR" | jqf "len(d['data'])")" "2"

id_of() { curl -sf "$BASE/products?limit=100" -H "$AR" | jqf "[p['id'] for p in d['data'] if p['sku']=='$1'][0]"; }
LAPTOP=$(id_of HW-LAPTOP); SETUP=$(id_of SV-SETUP); SUPPORT=$(id_of SB-SUPPORT); DOCK=$(id_of HW-DOCK)
CUST=$(curl -sf "$BASE/quotations?limit=1" -H "$AR" >/dev/null; curl -sf "$BASE/governance" -H "$AR" >/dev/null; echo 1)
CUST=$(curl -sf "$BASE/customers?limit=10" -H "$AR" 2>/dev/null | jqf "[c['id'] for c in d['data'] if c['name']=='Acme Corporation'][0]" 2>/dev/null || echo 1)
PLAN=$(curl -sf "$BASE/subscription-plans" -H "$AR" | jqf "[p['id'] for p in d['data'] if p['period']=='MONTHLY'][0]")

step "Step 2 — a quotation with a discount above the allowed limit"
QID=$(curl -sf -X POST "$BASE/quotations" -H "$AR" -H "$JSON" -d "{\"customer_id\":$CUST}" | jqf "d['id']")
curl -sf -X POST "$BASE/quotations/$QID/lines" -H "$AR" -H "$JSON" \
  -d "{\"product_id\":$LAPTOP,\"qty\":\"1\",\"discount_pct\":\"12\"}" >/dev/null
RISK=$(curl -sf -X POST "$BASE/quotations/$QID/lines" -H "$AR" -H "$JSON" \
  -d "{\"product_id\":$SETUP,\"qty\":\"7\",\"discount_pct\":\"18\"}")
check "blended risk score" "$(echo "$RISK" | jqf "d['risk']['blended_score']")" "5.6"
check "worst line overage" "$(echo "$RISK" | jqf "d['risk']['max_line_overage']")" "8"

step "Step 3 — approval is requested automatically, with no rep action"
SUB=$(curl -sf -X POST "$BASE/quotations/$QID/submit" -H "$AR")
check "status"      "$(echo "$SUB" | jqf "d['status']")" "PENDING_APPROVAL"
check "chain steps" "$(echo "$SUB" | jqf "len(d['approvals'])")" "2"
check "step 1"      "$(echo "$SUB" | jqf "d['approvals'][0]['required_role']")" "MANAGER"
check "step 2"      "$(echo "$SUB" | jqf "d['approvals'][1]['required_role']")" "FINANCE"

step "Step 4 — an upsell is accepted; totals and margin update immediately"
BEFORE=$(curl -sf "$BASE/quotations/$QID" -H "$AR" | jqf "d['totals']['grand_total']")
UPSELL=$(curl -sf "$BASE/quotations/$QID/upsell" -H "$AR")
check "suggestions offered" "$([ "$(echo "$UPSELL" | jqf "len(d['data'])")" -gt 0 ] && echo yes || echo no)" "yes"
# Adding requires a draft, so this is shown on a second quotation.
Q2=$(curl -sf -X POST "$BASE/quotations" -H "$AR" -H "$JSON" -d "{\"customer_id\":$CUST}" | jqf "d['id']")
curl -sf -X POST "$BASE/quotations/$Q2/lines" -H "$AR" -H "$JSON" \
  -d "{\"product_id\":$LAPTOP,\"qty\":\"1\",\"discount_pct\":\"0\"}" >/dev/null
T0=$(curl -sf "$BASE/quotations/$Q2" -H "$AR" | jqf "d['totals']['grand_total']")
SUG=$(curl -sf "$BASE/quotations/$Q2/upsell" -H "$AR" | jqf "d['data'][0]['product_id']")
T1=$(curl -sf -X POST "$BASE/quotations/$Q2/lines" -H "$AR" -H "$JSON" \
  -d "{\"product_id\":$SUG,\"qty\":\"1\",\"discount_pct\":\"0\"}" | jqf "d['totals']['grand_total']")
check "total changed" "$([ "$T0" != "$T1" ] && echo yes || echo no)" "yes"

step "Step 5 — approved; stock is pulled from the right warehouses"
M=$(curl -sf "$BASE/approvals?limit=100" -H "Authorization: Bearer $MGR" \
     | jqf "[a['id'] for a in d['data'] if a['quotation_id']==$QID][0]")
curl -sf -X POST "$BASE/approvals/$M/approve" -H "Authorization: Bearer $MGR" >/dev/null
F=$(curl -sf "$BASE/approvals?limit=100" -H "Authorization: Bearer $FIN" \
     | jqf "[a['id'] for a in d['data'] if a['quotation_id']==$QID][0]")
APPROVED=$(curl -sf -X POST "$BASE/approvals/$F/approve" -H "Authorization: Bearer $FIN")
check "status after both approvals" "$(echo "$APPROVED" | jqf "d['status']")" "APPROVED"

curl -sf -X POST "$BASE/quotations/$Q2/submit" -H "$AR" >/dev/null
O2=$(curl -sf -X POST "$BASE/quotations/$Q2/confirm" -H "$AR" | jqf "d['id']")

# A seven-laptop order splits across warehouses and backorders the remainder.
Q3=$(curl -sf -X POST "$BASE/quotations" -H "$AR" -H "$JSON" -d "{\"customer_id\":$CUST}" | jqf "d['id']")
curl -sf -X POST "$BASE/quotations/$Q3/lines" -H "$AR" -H "$JSON" \
  -d "{\"product_id\":$LAPTOP,\"qty\":\"7\",\"discount_pct\":\"0\"}" >/dev/null
curl -sf -X POST "$BASE/quotations/$Q3/lines" -H "$AR" -H "$JSON" \
  -d "{\"product_id\":$DOCK,\"qty\":\"1\",\"discount_pct\":\"0\"}" >/dev/null
curl -sf -X POST "$BASE/quotations/$Q3/submit" -H "$AR" >/dev/null
O3=$(curl -sf -X POST "$BASE/quotations/$Q3/confirm" -H "$AR" | jqf "d['id']")
PLANNED=$(curl -sf -X POST "$BASE/orders/$O3/fulfillment" -H "$AR")
check "warehouses used" "$(echo "$PLANNED" | jqf "d['plan']['shipment_count']")" "2"
check "backordered"     "$(echo "$PLANNED" | jqf "sum(b['qty'] for b in d['plan']['backorders'])")" "1"

step "Step 6 — one-time and recurring lines bill correctly and separately"
Q4=$(curl -sf -X POST "$BASE/quotations" -H "$AR" -H "$JSON" -d "{\"customer_id\":$CUST}" | jqf "d['id']")
curl -sf -X POST "$BASE/quotations/$Q4/lines" -H "$AR" -H "$JSON" \
  -d "{\"product_id\":$LAPTOP,\"qty\":\"1\",\"discount_pct\":\"0\"}" >/dev/null
curl -sf -X POST "$BASE/quotations/$Q4/lines" -H "$AR" -H "$JSON" \
  -d "{\"product_id\":$SUPPORT,\"qty\":\"3\",\"discount_pct\":\"0\",\"plan_id\":$PLAN}" >/dev/null
curl -sf -X POST "$BASE/quotations/$Q4/submit" -H "$AR" >/dev/null
O4=$(curl -sf -X POST "$BASE/quotations/$Q4/confirm" -H "$AR" | jqf "d['id']")
BILL=$(curl -sf -X POST "$BASE/orders/$O4/invoices" -H "$AR")
check "one-time invoices"  "$(echo "$BILL" | jqf "len([i for i in d['invoices'] if i['kind']=='ONETIME'])")" "1"
check "recurring periods"  "$(echo "$BILL" | jqf "len(d['schedule'])")" "12"
check "per-period amount"  "$(echo "$BILL" | jqf "d['recurring_total_per_period']")" "15000"

step "Step 7 — a portal counter-offer sends the quote back for approval"
Q5=$(curl -sf -X POST "$BASE/quotations" -H "$AR" -H "$JSON" -d "{\"customer_id\":$CUST}" | jqf "d['id']")
curl -sf -X POST "$BASE/quotations/$Q5/lines" -H "$AR" -H "$JSON" \
  -d "{\"product_id\":$LAPTOP,\"qty\":\"2\",\"discount_pct\":\"8\"}" >/dev/null
curl -sf -X POST "$BASE/quotations/$Q5/submit" -H "$AR" >/dev/null
TOKEN=$(curl -sf -X POST "$BASE/quotations/$Q5/send" -H "$AR" | jqf "d['token']")
LINE=$(curl -sf "$BASE/portal/q/$TOKEN" | jqf "d['lines'][0]['id']")
COUNTER=$(curl -sf -X POST "$BASE/portal/q/$TOKEN/counter-offer" -H "$JSON" \
  -d "{\"line_id\":$LINE,\"proposed_discount_pct\":\"25\"}")
check "status after counter-offer" "$(echo "$COUNTER" | jqf "d['status']")" "PENDING_APPROVAL"
check "outcome"                    "$(echo "$COUNTER" | jqf "d['counter_offers'][0]['outcome']")" "ROUTED_FOR_APPROVAL"
check "no staff action needed"     "$(curl -sf "$BASE/approvals?limit=100" -H "Authorization: Bearer $MGR" | jqf "len([a for a in d['data'] if a['quotation_id']==$Q5])")" "1"

step "Step 8 — payment is recorded and the invoice status updates"
INV=$(curl -sf "$BASE/orders/$O4/billing" -H "$AR" | jqf "d['invoices'][0]['id']")
TOTAL=$(curl -sf "$BASE/invoices/$INV" -H "$AR" | jqf "d['invoice']['total']")
HALF=$(python3 -c "from decimal import Decimal;print(Decimal('$TOTAL')/2)")
PART=$(curl -sf -X POST "$BASE/invoices/$INV/payments" -H "$AR" -H "$JSON" \
  -d "{\"amount\":\"$HALF\",\"method\":\"BANK\"}")
check "after a part payment" "$(echo "$PART" | jqf "d['status']")" "PARTIAL"
REST=$(python3 -c "from decimal import Decimal;print(Decimal('$TOTAL')-Decimal('$HALF'))")
FULL=$(curl -sf -X POST "$BASE/invoices/$INV/payments" -H "$AR" -H "$JSON" \
  -H "Idempotency-Key: acceptance-final" -d "{\"amount\":\"$REST\",\"method\":\"CASH\"}")
check "after settlement" "$(echo "$FULL" | jqf "d['status']")" "PAID"
REPLAY=$(curl -sf -X POST "$BASE/invoices/$INV/payments" -H "$AR" -H "$JSON" \
  -H "Idempotency-Key: acceptance-final" -d "{\"amount\":\"$REST\",\"method\":\"CASH\"}")
check "a replayed payment does not double-charge" "$(echo "$REPLAY" | jqf "d['amount_paid']")" "$TOTAL"

printf '\n'
if [ "$FAILED" = 0 ]; then green "All eight steps pass."; else red "Some checks failed."; exit 1; fi
