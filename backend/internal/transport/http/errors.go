package http

import (
	"errors"

	"github.com/go-playground/validator/v10"

	"dealflow360/backend/internal/platform/apierr"
)

func apiNotFound() error {
	return apierr.NotFound("route not found")
}

// bindError turns a binding failure into a validation error carrying
// field-level detail, so the frontend can highlight the offending input
// instead of showing a generic message.
func bindError(err error) error {
	var invalid validator.ValidationErrors
	if errors.As(err, &invalid) {
		details := make(map[string]any, len(invalid))
		for _, fe := range invalid {
			details[fe.Field()] = describeRule(fe)
		}
		return apierr.Validation("request validation failed").WithDetails(details)
	}
	return apierr.Validation("request body could not be parsed")
}

func describeRule(fe validator.FieldError) string {
	switch fe.Tag() {
	case "required":
		return "is required"
	case "email":
		return "must be a valid email address"
	case "min":
		return "must be at least " + fe.Param() + " characters"
	case "oneof":
		return "must be one of: " + fe.Param()
	case "gt":
		return "must be greater than " + fe.Param()
	case "gte":
		return "must be at least " + fe.Param()
	case "lte":
		return "must be at most " + fe.Param()
	default:
		return "is invalid"
	}
}
