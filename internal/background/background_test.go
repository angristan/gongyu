package background

import (
	"context"
	"sync/atomic"
	"testing"
	"time"
)

func TestRunnerExecutesQueuedTaskDuringShutdown(t *testing.T) {
	r := New(1)

	done := make(chan struct{})
	r.Do(func(ctx context.Context) {
		close(done)
	})

	r.Shutdown()

	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("queued task did not run before shutdown completed")
	}
}

func TestRunnerDropsTaskAfterShutdown(t *testing.T) {
	r := New(1)
	r.Shutdown()

	var ran atomic.Bool
	r.Do(func(ctx context.Context) {
		ran.Store(true)
	})

	time.Sleep(20 * time.Millisecond)
	if ran.Load() {
		t.Fatal("task ran after shutdown")
	}
}

func TestRunnerCancelsLifecycleContextOnShutdown(t *testing.T) {
	r := New(1)

	done := make(chan struct{})
	r.Do(func(ctx context.Context) {
		<-ctx.Done()
		close(done)
	})

	r.Shutdown()

	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("task did not observe canceled context during shutdown")
	}
}

func TestRunnerStopsPeriodicTasksOnShutdown(t *testing.T) {
	r := New(1)

	var count atomic.Int32
	r.Every(10*time.Millisecond, func(ctx context.Context) {
		count.Add(1)
	})

	time.Sleep(35 * time.Millisecond)
	before := count.Load()
	if before == 0 {
		t.Fatal("periodic task never ran")
	}

	r.Shutdown()

	time.Sleep(30 * time.Millisecond)
	after := count.Load()
	if after != before {
		t.Fatalf("periodic task kept running after shutdown: before=%d after=%d", before, after)
	}
}
