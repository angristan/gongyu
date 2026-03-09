package handler

import (
	"testing"
	"time"
)

func TestMondayMidnight(t *testing.T) {
	tests := []struct {
		name string
		in   time.Time
		want time.Time
	}{
		{
			name: "Monday stays Monday midnight",
			in:   time.Date(2026, 3, 2, 14, 30, 0, 0, time.UTC), // Monday
			want: time.Date(2026, 3, 2, 0, 0, 0, 0, time.UTC),
		},
		{
			name: "Wednesday goes back to Monday",
			in:   time.Date(2026, 3, 4, 10, 0, 0, 0, time.UTC), // Wednesday
			want: time.Date(2026, 3, 2, 0, 0, 0, 0, time.UTC),
		},
		{
			name: "Sunday goes back to Monday",
			in:   time.Date(2026, 3, 8, 23, 59, 0, 0, time.UTC), // Sunday
			want: time.Date(2026, 3, 2, 0, 0, 0, 0, time.UTC),
		},
		{
			name: "Saturday goes back to Monday",
			in:   time.Date(2026, 3, 7, 8, 0, 0, 0, time.UTC), // Saturday
			want: time.Date(2026, 3, 2, 0, 0, 0, 0, time.UTC),
		},
		{
			name: "Monday at midnight exact",
			in:   time.Date(2026, 3, 2, 0, 0, 0, 0, time.UTC),
			want: time.Date(2026, 3, 2, 0, 0, 0, 0, time.UTC),
		},
		{
			name: "crosses month boundary",
			in:   time.Date(2026, 3, 1, 12, 0, 0, 0, time.UTC), // Sunday March 1
			want: time.Date(2026, 2, 23, 0, 0, 0, 0, time.UTC), // Monday Feb 23
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := mondayMidnight(tt.in)
			if !got.Equal(tt.want) {
				t.Errorf("mondayMidnight(%v) = %v, want %v (weekday=%s)", tt.in, got, tt.want, tt.in.Weekday())
			}
			if got.Weekday() != time.Monday {
				t.Errorf("result weekday = %s, want Monday", got.Weekday())
			}
			if got.Hour() != 0 || got.Minute() != 0 || got.Second() != 0 {
				t.Errorf("result not at midnight: %v", got)
			}
		})
	}
}
