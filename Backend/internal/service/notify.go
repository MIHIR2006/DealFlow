package service

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	sqlcgen "dealflow360/backend/internal/db/sqlc"
	"dealflow360/backend/internal/domain/money"
	"dealflow360/backend/internal/platform/mailer"
)

// Notifier is the platform's outbound voice: the mail it owes a customer or a
// sales team when something happened that they, not a staff screen, need to
// know about.
//
// It is wired as an option on each service rather than a dependency, the same
// way the recommendation engine is. A nil Notifier is a supported
// configuration — every method below is a no-op — because the platform has to
// run in a demo, a test, and a review with no SMTP credentials at all.
//
// Nothing here returns an error. A portal link that was minted or an approval
// that was recorded is done; a refused SMTP handshake afterwards must not undo
// it or surface as a failed request.
type Notifier struct {
	mail    *mailer.Mailer
	baseURL string
	q       *sqlcgen.Queries
}

// NewNotifier builds a notifier. baseURL is the public origin of the frontend,
// which is what turns a portal token into a link a customer can click.
func NewNotifier(m *mailer.Mailer, baseURL string, q *sqlcgen.Queries) *Notifier {
	return &Notifier{mail: m, baseURL: baseURL, q: q}
}

func (n *Notifier) enabled() bool {
	return n != nil && n.mail != nil && n.mail.Enabled()
}

// PortalURL builds the customer-facing link for a token.
func (n *Notifier) PortalURL(token string) string {
	if n == nil {
		return ""
	}
	return fmt.Sprintf("%s/portal/q/%s", n.baseURL, token)
}

// livePortalURL finds the link the customer already holds, if any. A
// notification must never mint a fresh token: that would revoke the link
// sitting in their inbox from the message before this one.
func (n *Notifier) livePortalURL(ctx context.Context, quotationID int64) string {
	if n == nil || n.q == nil {
		return ""
	}
	token, err := n.q.GetActivePortalToken(ctx, quotationID)
	if err != nil {
		if !errors.Is(err, pgx.ErrNoRows) {
			return ""
		}
		return ""
	}
	return n.PortalURL(token)
}

// QuotationSent carries a freshly minted portal link to the customer, so the
// rep does not have to copy it into a mail client by hand.
func (n *Notifier) QuotationSent(ctx context.Context, header sqlcgen.GetQuotationRow, token string) bool {
	if !n.enabled() || header.CustomerEmail == "" {
		return false
	}
	msg := mailer.PortalLink(header.CustomerName, header.Reference, header.RepName, n.PortalURL(token))
	msg.To = header.CustomerEmail
	n.mail.Queue(ctx, "portal_link", msg)
	return true
}

// CounterOfferDecided closes the loop on terms the customer proposed. It fires
// only on a settled round — an approval with steps still pending has not
// decided anything, and telling a customer otherwise would be a lie.
func (n *Notifier) CounterOfferDecided(ctx context.Context, header sqlcgen.GetQuotationRow, outcome string) {
	if !n.enabled() {
		return
	}
	msg, ok := mailer.CounterOfferDecided(
		header.CustomerName, header.Reference, outcome, n.livePortalURL(ctx, header.ID))
	if !ok {
		return
	}
	msg.To = header.CustomerEmail
	n.mail.Queue(ctx, "counter_offer_"+outcome, msg)
}

// InvoiceRaised tells a customer an invoice exists and what it covers.
func (n *Notifier) InvoiceRaised(
	ctx context.Context, header sqlcgen.GetQuotationRow, orderRef string,
	inv sqlcgen.Invoice, recurringPeriods int,
) {
	if !n.enabled() {
		return
	}

	due := ""
	if inv.DueDate != nil {
		due = inv.DueDate.Format("2 January 2006")
	}
	recurring := ""
	if recurringPeriods > 0 {
		recurring = fmt.Sprintf(
			"Your order also carries a subscription, billed separately over %d periods. "+
				"Those are scheduled and invoiced on their own cycle — they are not part of the amount above.",
			recurringPeriods)
	}

	msg := mailer.InvoiceRaised(
		header.CustomerName, inv.Reference, orderRef,
		money.FormatINR(inv.Total), due, recurring)
	msg.To = header.CustomerEmail
	n.mail.Queue(ctx, "invoice_raised", msg)
}

// QuotationNudged is the chase a manager triggers from the deal health
// dashboard. Until now the nudge recorded that a deal was chased without
// anything actually reaching the customer.
func (n *Notifier) QuotationNudged(ctx context.Context, header sqlcgen.GetQuotationRow) {
	if !n.enabled() {
		return
	}
	url := n.livePortalURL(ctx, header.ID)
	if url == "" {
		// No live link means the customer has nothing to act on, and a chase
		// pointing nowhere is worse than none.
		return
	}
	msg := mailer.QuotationNudge(header.CustomerName, header.Reference, header.RepName, url)
	msg.To = header.CustomerEmail
	n.mail.Queue(ctx, "quotation_nudge", msg)
}

// LeadCaptured notifies the sales inbox about a landing-page enquiry, and
// acknowledges it to the person who left it.
func (n *Notifier) LeadCaptured(ctx context.Context, prospectEmail, salesInbox, capturedAt string) {
	if !n.enabled() {
		return
	}

	if salesInbox != "" {
		sales := mailer.LeadForSales(prospectEmail, capturedAt)
		sales.To = salesInbox
		n.mail.Queue(ctx, "lead_for_sales", sales)
	}

	ack := mailer.LeadAcknowledgement()
	ack.To = prospectEmail
	n.mail.Queue(ctx, "lead_ack", ack)
}
