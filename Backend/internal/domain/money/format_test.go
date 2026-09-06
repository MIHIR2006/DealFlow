package money_test

import (
	"testing"

	"dealflow360/backend/internal/domain/money"
)

func TestFormatINR(t *testing.T) {
	for _, tc := range []struct{ in, want string }{
		{"504096", "₹5,04,096"},
		{"445096", "₹4,45,096"},
		{"50000", "₹50,000"},
		{"999", "₹999"},
		{"1618476.6", "₹16,18,476.60"},
		{"0", "₹0"},
	} {
		if got := money.FormatINR(money.MustFromString(tc.in)); got != tc.want {
			t.Errorf("FormatINR(%s) = %s, want %s", tc.in, got, tc.want)
		}
	}
}
