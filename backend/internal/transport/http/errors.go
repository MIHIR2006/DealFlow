package http

import "dealflow360/backend/internal/platform/apierr"

func apiNotFound() error {
	return apierr.NotFound("route not found")
}
