package background

import (
	"log/slog"
	"sync"
	"time"
)

// Runner executes functions on a bounded pool of goroutines.
type Runner struct {
	tasks    chan func()
	wg       sync.WaitGroup
	stop     chan struct{}
	closed   bool
	closedMu sync.Mutex
}

// New creates a Runner with the given number of worker goroutines.
func New(concurrency int) *Runner {
	r := &Runner{
		tasks: make(chan func(), 100),
		stop:  make(chan struct{}),
	}
	for range concurrency {
		r.wg.Add(1)
		go func() {
			defer r.wg.Done()
			for fn := range r.tasks {
				fn()
			}
		}()
	}
	return r
}

// Do enqueues a function for background execution.
// Calls after Shutdown are silently dropped.
func (r *Runner) Do(fn func()) {
	r.closedMu.Lock()
	if r.closed {
		r.closedMu.Unlock()
		slog.Warn("background: task submitted after shutdown, dropping")
		return
	}
	r.closedMu.Unlock()
	r.tasks <- fn
}

// Every runs fn on the given interval until Shutdown is called.
func (r *Runner) Every(interval time.Duration, fn func()) {
	r.wg.Add(1)
	go func() {
		defer r.wg.Done()
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				fn()
			case <-r.stop:
				return
			}
		}
	}()
}

// Shutdown stops accepting tasks, cancels periodic jobs, and waits for
// in-flight work to finish.
func (r *Runner) Shutdown() {
	r.closedMu.Lock()
	r.closed = true
	r.closedMu.Unlock()
	close(r.stop)
	close(r.tasks)
	r.wg.Wait()
}
