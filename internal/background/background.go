package background

import "sync"

// Runner executes functions on a bounded pool of goroutines.
type Runner struct {
	tasks chan func()
	wg    sync.WaitGroup
}

// New creates a Runner with the given number of worker goroutines.
func New(concurrency int) *Runner {
	r := &Runner{tasks: make(chan func(), 100)}
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

// Shutdown stops accepting tasks and waits for in-flight ones to finish.
func (r *Runner) Shutdown() { close(r.tasks); r.wg.Wait() }
