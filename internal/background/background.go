package background

import (
	"context"
	"log/slog"
	"sync"
	"time"
)

// Runner executes functions on a bounded pool of goroutines.
type Runner struct {
	ctx        context.Context
	cancel     context.CancelFunc
	tasks      chan func(context.Context)
	workerWG   sync.WaitGroup
	periodicWG sync.WaitGroup
	taskWG     sync.WaitGroup
	closed     bool
	closedMu   sync.Mutex
}

// New creates a Runner with the given number of worker goroutines.
func New(concurrency int) *Runner {
	if concurrency < 1 {
		concurrency = 1
	}

	ctx, cancel := context.WithCancel(context.Background())
	r := &Runner{
		ctx:    ctx,
		cancel: cancel,
		tasks:  make(chan func(context.Context), 100),
	}
	for range concurrency {
		r.workerWG.Add(1)
		go func() {
			defer r.workerWG.Done()
			r.runWorker()
		}()
	}
	return r
}

// Context returns the runner lifecycle context, which is canceled during Shutdown.
func (r *Runner) Context() context.Context {
	return r.ctx
}

// Do enqueues a function for background execution.
// Calls after Shutdown are silently dropped.
func (r *Runner) Do(fn func(context.Context)) {
	if fn == nil {
		return
	}

	r.closedMu.Lock()
	if r.closed {
		r.closedMu.Unlock()
		slog.Warn("background: task submitted after shutdown, dropping")
		return
	}
	r.taskWG.Add(1)
	r.closedMu.Unlock()

	select {
	case r.tasks <- fn:
	case <-r.ctx.Done():
		r.taskWG.Done()
		slog.Warn("background: task submitted after shutdown, dropping")
	}
}

// Every runs fn on the given interval until Shutdown is called.
func (r *Runner) Every(interval time.Duration, fn func(context.Context)) {
	if fn == nil {
		return
	}

	r.closedMu.Lock()
	if r.closed {
		r.closedMu.Unlock()
		slog.Warn("background: periodic task submitted after shutdown, dropping")
		return
	}
	r.periodicWG.Add(1)
	r.closedMu.Unlock()

	go func() {
		defer r.periodicWG.Done()
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				r.runPeriodic(fn)
			case <-r.ctx.Done():
				return
			}
		}
	}()
}

// Shutdown stops accepting tasks, cancels periodic jobs, and waits for
// in-flight work to finish.
func (r *Runner) Shutdown() {
	r.closedMu.Lock()
	if r.closed {
		r.closedMu.Unlock()
		return
	}
	r.closed = true
	r.closedMu.Unlock()

	r.cancel()
	r.periodicWG.Wait()
	r.taskWG.Wait()
	r.workerWG.Wait()
}

func (r *Runner) runWorker() {
	for {
		select {
		case fn := <-r.tasks:
			if fn == nil {
				continue
			}
			r.runTask(fn)
		case <-r.ctx.Done():
			r.drainTasks()
			return
		}
	}
}

func (r *Runner) drainTasks() {
	for {
		select {
		case fn := <-r.tasks:
			if fn == nil {
				return
			}
			r.runTask(fn)
		default:
			return
		}
	}
}

func (r *Runner) runTask(fn func(context.Context)) {
	defer r.taskWG.Done()
	defer func() {
		if err := recover(); err != nil {
			slog.Error("background: task panicked", "error", err)
		}
	}()
	fn(r.ctx)
}

func (r *Runner) runPeriodic(fn func(context.Context)) {
	defer func() {
		if err := recover(); err != nil {
			slog.Error("background: periodic task panicked", "error", err)
		}
	}()
	fn(r.ctx)
}
