// Package recommender talks to the DealFlow360 recommendation engine.
//
// The engine is a separate Python service (see recommendation/) that keeps a
// co-purchase matrix built from confirmed quotations and ranks candidates by
// pairing strength, promotion, and a margin floor. It is a signal source, not
// an authority: it returns which products to offer, and the Go side still
// prices them and decides what a rep is shown.
//
// Every failure mode here is non-fatal by design. The engine being slow,
// down, or misconfigured must never break the quotation builder, so callers
// treat any error as "no signal" and fall back to the rules-based path.
package recommender

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/shopspring/decimal"
)

// DefaultTimeout keeps a stalled engine from holding a rep's request open.
// The upsell panel is an aside on the page; waiting seconds for it would cost
// more than showing the rules-based list instead.
const DefaultTimeout = 1500 * time.Millisecond

// maxTopN is the engine's own ceiling on top_n. Asking for more is a
// validation error there, so it is clamped here.
const maxTopN = 20

// Suggestion is one ranked candidate as the engine returned it.
//
// Only the identity and the ranking signals are carried across. Prices,
// margins, and deltas the engine also reports are deliberately dropped: money
// is computed once, by the Go pricing engine, from the current catalogue.
type Suggestion struct {
	ProductID       int64
	IsPromoted      bool
	Confidence      decimal.Decimal
	CoPurchaseCount int64
}

// Client calls the recommendation engine over HTTP.
type Client struct {
	baseURL string
	http    *http.Client
}

// New builds a client for an engine at baseURL. A zero or negative timeout
// falls back to DefaultTimeout.
func New(baseURL string, timeout time.Duration) *Client {
	if timeout <= 0 {
		timeout = DefaultTimeout
	}
	return &Client{
		baseURL: strings.TrimRight(baseURL, "/"),
		http:    &http.Client{Timeout: timeout},
	}
}

type recommendRequest struct {
	QuotationID *int64  `json:"quotation_id,omitempty"`
	ProductIDs  []int64 `json:"product_ids"`
	TopN        int     `json:"top_n"`
}

type recommendResponse struct {
	Suggestions []struct {
		ProductID       int64           `json:"product_id"`
		IsPromoted      bool            `json:"is_promoted"`
		Confidence      decimal.Decimal `json:"confidence"`
		CoPurchaseCount int64           `json:"co_purchase_count"`
	} `json:"suggestions"`
}

// Suggest ranks products worth offering alongside productIDs.
//
// quotationID is passed so the engine can score against the lines already on
// the quotation; it is optional there and may be zero.
func (c *Client) Suggest(ctx context.Context, quotationID int64, productIDs []int64, topN int) ([]Suggestion, error) {
	if len(productIDs) == 0 {
		return nil, nil
	}
	if topN <= 0 {
		topN = 5
	}
	if topN > maxTopN {
		topN = maxTopN
	}

	payload := recommendRequest{ProductIDs: productIDs, TopN: topN}
	if quotationID > 0 {
		payload.QuotationID = &quotationID
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("encode recommend request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/recommend", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("build recommend request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	res, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("call recommendation engine: %w", err)
	}
	defer func() { _ = res.Body.Close() }()

	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("recommendation engine returned %s", res.Status)
	}

	var parsed recommendResponse
	if err := json.NewDecoder(res.Body).Decode(&parsed); err != nil {
		return nil, fmt.Errorf("decode recommend response: %w", err)
	}

	// The engine returns its list already ranked; that order is the product of
	// its scoring pipeline and is preserved rather than re-sorted here.
	out := make([]Suggestion, 0, len(parsed.Suggestions))
	for _, s := range parsed.Suggestions {
		if s.ProductID <= 0 {
			continue
		}
		out = append(out, Suggestion{
			ProductID:       s.ProductID,
			IsPromoted:      s.IsPromoted,
			Confidence:      s.Confidence,
			CoPurchaseCount: s.CoPurchaseCount,
		})
	}
	return out, nil
}
