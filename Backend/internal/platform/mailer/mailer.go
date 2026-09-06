// Package mailer sends the transactional email the platform owes people
// outside it: a customer who is waiting on a link or a decision, and a sales
// team who has a prospect on the landing page.
//
// Two properties matter more than the sending itself.
//
// It is optional. With SMTP unset the mailer reports itself disabled and every
// call is a no-op, exactly as the recommendation engine and the AI assistant
// are optional — the platform must run in a demo, a test, and an air-gapped
// review with no credentials at all.
//
// It never fails the operation it describes. A portal link that was minted, an
// approval that was recorded, an invoice that was raised: those are done, and a
// refused SMTP handshake afterwards must not roll any of them back or return an
// error to the caller. Sends are dispatched in the background and failures are
// logged.
package mailer

import (
	"context"
	"fmt"
	"log/slog"
	"net/smtp"
	"strings"
	"sync"
	"time"
)

// SendTimeout bounds a single delivery. An SMTP server that accepts the
// connection and then stalls must not leak a goroutine for the process's
// lifetime.
const SendTimeout = 15 * time.Second

// Config is the SMTP account the mailer sends through.
type Config struct {
	Host string
	Port string
	User string
	Pass string

	// From is the envelope and header sender. Empty falls back to User,
	// which is what most providers require anyway.
	From string
}

// Mailer sends mail through one SMTP account, or does nothing when that
// account is not configured.
type Mailer struct {
	cfg Config
	log *slog.Logger

	// wg lets a shutdown path wait for in-flight sends. Nothing waits on it
	// today; it exists so a graceful shutdown can, without reworking this.
	wg sync.WaitGroup
}

// New builds a mailer. A zero or partial Config yields a disabled mailer
// rather than an error: missing credentials are a deployment choice here, not
// a misconfiguration.
func New(cfg Config, log *slog.Logger) *Mailer {
	if log == nil {
		log = slog.Default()
	}
	if cfg.From == "" {
		cfg.From = cfg.User
	}
	return &Mailer{cfg: cfg, log: log}
}

// Enabled reports whether the mailer has everything it needs to send.
func (m *Mailer) Enabled() bool {
	if m == nil {
		return false
	}
	c := m.cfg
	return c.Host != "" && c.Port != "" && c.User != "" && c.Pass != ""
}

// Message is one email.
type Message struct {
	To      string
	Subject string
	Body    string

	// ReplyTo is set on a lead notification so a sales rep can answer the
	// prospect by hitting reply rather than copying an address out of the body.
	ReplyTo string
}

// Send delivers synchronously and returns what happened. Use it only where the
// caller genuinely wants to know; every business path should use Queue.
func (m *Mailer) Send(msg Message) error {
	if !m.Enabled() {
		return fmt.Errorf("mailer: SMTP is not configured")
	}
	if strings.TrimSpace(msg.To) == "" {
		return fmt.Errorf("mailer: no recipient")
	}

	auth := smtp.PlainAuth("", m.cfg.User, m.cfg.Pass, m.cfg.Host)
	addr := fmt.Sprintf("%s:%s", m.cfg.Host, m.cfg.Port)

	var h strings.Builder
	fmt.Fprintf(&h, "From: %s\r\n", m.cfg.From)
	fmt.Fprintf(&h, "To: %s\r\n", msg.To)
	if msg.ReplyTo != "" {
		fmt.Fprintf(&h, "Reply-To: %s\r\n", msg.ReplyTo)
	}
	fmt.Fprintf(&h, "Subject: %s\r\n", msg.Subject)
	fmt.Fprintf(&h, "Date: %s\r\n", time.Now().Format(time.RFC1123Z))
	h.WriteString("MIME-Version: 1.0\r\n")
	h.WriteString("Content-Type: text/plain; charset=UTF-8\r\n\r\n")
	h.WriteString(msg.Body)
	h.WriteString("\r\n")

	return smtp.SendMail(addr, auth, m.cfg.From, []string{msg.To}, []byte(h.String()))
}

// Queue dispatches in the background and logs the outcome.
//
// The caller's context is deliberately not carried into the send: a request
// that has already answered the browser will have had its context cancelled,
// and the mail it triggered is still owed.
func (m *Mailer) Queue(ctx context.Context, kind string, msg Message) {
	if !m.Enabled() {
		// Not an error worth a log line on every action — say it once at
		// startup instead, which main does.
		return
	}
	if strings.TrimSpace(msg.To) == "" {
		m.log.Warn("mail skipped: no recipient", "kind", kind)
		return
	}

	log := m.log
	m.wg.Add(1)
	go func() {
		defer m.wg.Done()

		done := make(chan error, 1)
		go func() { done <- m.Send(msg) }()

		select {
		case err := <-done:
			if err != nil {
				log.Warn("mail send failed", "kind", kind, "to", msg.To, "error", err.Error())
				return
			}
			log.Info("mail sent", "kind", kind, "to", msg.To)
		case <-time.After(SendTimeout):
			log.Warn("mail send timed out", "kind", kind, "to", msg.To,
				"timeout", SendTimeout.String())
		}
	}()
}

// Wait blocks until every queued send has finished or timed out.
func (m *Mailer) Wait() {
	if m == nil {
		return
	}
	m.wg.Wait()
}
