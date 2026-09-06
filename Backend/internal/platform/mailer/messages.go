package mailer

import (
	"fmt"
	"strings"
)

// The wording of every outbound email lives here rather than at the call
// sites, so the voice stays consistent and a change to what a customer is told
// is one edit in one file.
//
// Customer-facing copy never carries cost, margin, a risk score, a discount
// ceiling, or the name of an approver — the same rule the portal document
// itself follows. A customer is told that terms are under review, never what
// they are being reviewed against.

const signOff = "\n\n—\nDealFlow360\nThis message was sent automatically; replies reach your sales contact."

// PortalLink is the email that carries a quotation to the customer.
func PortalLink(customerName, reference, repName, url string) Message {
	body := fmt.Sprintf(
		"Hello %s,\n\n"+
			"Your quotation %s is ready to review.\n\n"+
			"    %s\n\n"+
			"From that link you can read the full breakdown, ask questions about any line, "+
			"propose different commercial terms, and accept the quotation when you are happy with it.\n\n"+
			"The link is unique to this quotation and will expire, so keep it to yourself. "+
			"If it stops working, ask %s to send a fresh one.%s",
		customerName, reference, url, repName, signOff)

	return Message{
		To:      "",
		Subject: fmt.Sprintf("Your quotation %s is ready to review", reference),
		Body:    body,
	}
}

// CounterOfferDecided tells a customer what happened to terms they proposed.
// outcome is the stored counter-offer outcome.
func CounterOfferDecided(customerName, reference, outcome, url string) (Message, bool) {
	var headline, detail string

	switch outcome {
	case "APPROVED":
		headline = fmt.Sprintf("Your request on %s has been approved", reference)
		detail = "The revised terms you proposed have been approved and applied to your quotation. " +
			"You can review them and confirm the order from the link below."
	case "REJECTED":
		headline = fmt.Sprintf("An update on your request for %s", reference)
		detail = "We were not able to approve the terms you proposed. Your sales contact will follow up " +
			"to talk through what we can do. The quotation is unchanged in the meantime."
	default:
		// Nothing has actually been decided — say nothing.
		return Message{}, false
	}

	body := fmt.Sprintf("Hello %s,\n\n%s\n\n    %s%s",
		customerName, detail, url, signOff)

	return Message{Subject: headline, Body: body}, true
}

// InvoiceRaised tells a customer an invoice exists, and what it covers.
// recurringNote is empty on an order with no subscription lines.
func InvoiceRaised(customerName, invoiceRef, orderRef, amount, dueDate, recurringNote string) Message {
	var b strings.Builder
	fmt.Fprintf(&b, "Hello %s,\n\n", customerName)
	fmt.Fprintf(&b, "Invoice %s has been raised against your order %s.\n\n", invoiceRef, orderRef)
	fmt.Fprintf(&b, "    Amount due:  %s\n", amount)
	if dueDate != "" {
		fmt.Fprintf(&b, "    Due by:      %s\n", dueDate)
	}
	if recurringNote != "" {
		fmt.Fprintf(&b, "\n%s\n", recurringNote)
	}
	b.WriteString("\nYour sales contact can answer any question about this invoice.")
	b.WriteString(signOff)

	return Message{
		Subject: fmt.Sprintf("Invoice %s for order %s", invoiceRef, orderRef),
		Body:    b.String(),
	}
}

// QuotationNudge is the chase a manager sends from the deal health dashboard.
func QuotationNudge(customerName, reference, repName, url string) Message {
	body := fmt.Sprintf(
		"Hello %s,\n\n"+
			"We wanted to check in on quotation %s — it has been open for a while and we did not want it to go stale.\n\n"+
			"    %s\n\n"+
			"If anything about the terms is holding it up, reply to %s or propose a change directly from that link. "+
			"If the timing is simply wrong, tell us and we will come back to you later.%s",
		customerName, reference, url, repName, signOff)

	return Message{
		Subject: fmt.Sprintf("Checking in on quotation %s", reference),
		Body:    body,
	}
}

// LeadForSales is the notification a sales inbox gets when someone asks to be
// contacted from the landing page.
func LeadForSales(prospectEmail, capturedAt string) Message {
	body := fmt.Sprintf(
		"A new enquiry came in from the DealFlow360 site.\n\n"+
			"    Email:     %s\n"+
			"    Received:  %s\n\n"+
			"Reply to this message to reach them directly.",
		prospectEmail, capturedAt)

	return Message{
		Subject: fmt.Sprintf("New enquiry: %s", prospectEmail),
		Body:    body,
		ReplyTo: prospectEmail,
	}
}

// LeadAcknowledgement is what the prospect gets back, so the form is not a
// black hole.
func LeadAcknowledgement() Message {
	return Message{
		Subject: "Thanks for getting in touch with DealFlow360",
		Body: "Thanks for reaching out.\n\n" +
			"Someone from our sales team will get back to you shortly to talk through what you are " +
			"trying to solve and whether DealFlow360 is a fit.\n\n" +
			"If anything is urgent in the meantime, just reply to this message." + signOff,
	}
}
