package background

import (
	"sync"
	"time"
)

// Runner executes functions on a bounded pool of goroutines.
type Runner struct {
	tasks chan func()
	wg    sync.WaitGroup
	stop  chan struct{}
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
func (r *Runner) Do(fn func()) { r.tasks <- fn }

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
	close(r.stop)
	close(r.tasks)
	r.wg.Wait()
}
