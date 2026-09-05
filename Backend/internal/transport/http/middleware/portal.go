package middleware

import (
	"errors"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"

	sqlcgen "dealflow360/backend/internal/db/sqlc"
	"dealflow360/backend/internal/platform/apierr"
)

const ctxPortalQuotation = "portal_quotation"

// RequirePortalToken resolves the customer's quotation from the URL token.
//
// This is the security boundary for the whole customer-facing side. The
// quotation is looked up by token and nothing else, and it is the only
// quotation any downstream portal handler can see. Because no portal handler
// ever reads a quotation id from the request, a token for one quotation
// cannot be pointed at another: the isolation is structural rather than a
// check someone has to remember to write.
//
// An expired, revoked, or unknown token returns 404 rather than 401, so the
// endpoint does not confirm which tokens exist.
func RequirePortalToken(q *sqlcgen.Queries, fail func(*gin.Context, error)) gin.HandlerFunc {
	return func(c *gin.Context) {
		token := c.Param("token")
		if token == "" {
			fail(c, apierr.NotFound("quotation not found"))
			return
		}

		row, err := q.GetQuotationByPortalToken(c.Request.Context(), token)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				fail(c, apierr.NotFound("this link is invalid or has expired"))
				return
			}
			fail(c, apierr.Internal(err))
			return
		}

		c.Set(ctxPortalQuotation, row)
		c.Next()
	}
}

// PortalQuotationOf returns the quotation this portal request is scoped to.
func PortalQuotationOf(c *gin.Context) (sqlcgen.GetQuotationByPortalTokenRow, bool) {
	v, ok := c.Get(ctxPortalQuotation)
	if !ok {
		return sqlcgen.GetQuotationByPortalTokenRow{}, false
	}
	row, ok := v.(sqlcgen.GetQuotationByPortalTokenRow)
	return row, ok
}
