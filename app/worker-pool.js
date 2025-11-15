// Worker Pool for concurrent image processing
class WorkerPool {
  constructor(maxWorkers = 2) {
    this.maxWorkers = Math.min(maxWorkers, navigator.hardwareConcurrency || 4);
    this.workers = [];
    this.taskQueue = [];
    this.activeTasks = new Map();
    this.readyWorkers = new Set();
    this.isInitializing = false;

    console.log(`WorkerPool initialized with ${this.maxWorkers} workers`);
  }

  async initialize() {
    if (this.isInitializing) {
      return;
    }

    this.isInitializing = true;
    console.log('Initializing worker pool...');

    // Create workers
    for (let i = 0; i < this.maxWorkers; i++) {
      const worker = new Worker(new URL('./worker.js', import.meta.url), {
        type: 'module'
      });

      worker.id = i;
      worker.busy = false;

      worker.addEventListener('message', (e) => {
        this.handleWorkerMessage(worker, e);
      });

      worker.addEventListener('error', (error) => {
        console.error(`Worker ${worker.id} error:`, error);
        this.handleWorkerError(worker, error);
      });

      this.workers.push(worker);

      // Initialize worker
      worker.postMessage({ type: 'init' });
    }

    this.isInitializing = false;
  }

  handleWorkerMessage(worker, event) {
    const data = event.data;
    const taskId = this.findTaskIdByWorker(worker);

    switch (data.status) {
      case 'ready':
        console.log(`Worker ${worker.id} is ready`);
        this.readyWorkers.add(worker);
        this.processQueue();
        break;

      case 'complete':
      case 'error':
        // Task completed, mark worker as available
        worker.busy = false;
        this.readyWorkers.add(worker);

        // Get task info and resolve/reject
        if (taskId && this.activeTasks.has(taskId)) {
          const task = this.activeTasks.get(taskId);
          this.activeTasks.delete(taskId);

          if (data.status === 'complete') {
            task.resolve(data);
          } else {
            task.reject(new Error(data.error));
          }
        }

        this.processQueue();
        break;

      default:
        // Forward progress and other messages
        if (taskId && this.activeTasks.has(taskId)) {
          const task = this.activeTasks.get(taskId);
          if (task.onProgress) {
            task.onProgress(data);
          }
        }
        break;
    }
  }

  handleWorkerError(worker, error) {
    worker.busy = false;
    this.readyWorkers.delete(worker);

    // Reject all active tasks for this worker
    for (const [taskId, task] of this.activeTasks.entries()) {
      if (this.findTaskIdByWorker(worker) === taskId) {
        task.reject(error);
        this.activeTasks.delete(taskId);
      }
    }

    // Try to restart the worker
    setTimeout(() => {
      this.restartWorker(worker);
    }, 1000);
  }

  restartWorker(worker) {
    console.log(`Restarting worker ${worker.id}`);
    worker.terminate();

    const newWorker = new Worker(new URL('./worker.js', import.meta.url), {
      type: 'module'
    });

    newWorker.id = worker.id;
    newWorker.busy = false;

    newWorker.addEventListener('message', (e) => {
      this.handleWorkerMessage(newWorker, e);
    });

    newWorker.addEventListener('error', (error) => {
      this.handleWorkerError(newWorker, error);
    });

    this.workers[worker.id] = newWorker;
    newWorker.postMessage({ type: 'init' });
  }

  findTaskIdByWorker(worker) {
    for (const [taskId, task] of this.activeTasks.entries()) {
      if (task.worker === worker) {
        return taskId;
      }
    }
    return null;
  }

  processQueue() {
    if (this.taskQueue.length === 0 || this.readyWorkers.size === 0) {
      return;
    }

    const task = this.taskQueue.shift();
    const worker = this.getAvailableWorker();

    if (worker) {
      this.executeTask(task, worker);
    } else {
      // No available workers, put task back in queue
      this.taskQueue.unshift(task);
    }
  }

  getAvailableWorker() {
    if (this.readyWorkers.size === 0) {
      return null;
    }

    // Get the first available worker
    const worker = this.readyWorkers.values().next().value;
    this.readyWorkers.delete(worker);
    return worker;
  }

  executeTask(task, worker) {
    worker.busy = true;
    task.worker = worker;

    this.activeTasks.set(task.id, task);

    console.log(`Executing task ${task.id} on worker ${worker.id}`);
    worker.postMessage({
      imageUrl: task.imageUrl,
      taskId: task.id
    });
  }

  async processImage(imageUrl, onProgress = null) {
    return new Promise((resolve, reject) => {
      const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const task = {
        id: taskId,
        imageUrl,
        resolve,
        reject,
        onProgress
      };

      this.taskQueue.push(task);
      this.processQueue();
    });
  }

  getStats() {
    return {
      totalWorkers: this.workers.length,
      readyWorkers: this.readyWorkers.size,
      activeTasks: this.activeTasks.size,
      queuedTasks: this.taskQueue.length,
      isInitializing: this.isInitializing
    };
  }

  async terminate() {
    console.log('Terminating worker pool...');

    // Reject all pending tasks
    for (const task of this.taskQueue) {
      task.reject(new Error('Worker pool terminated'));
    }
    this.taskQueue = [];

    // Reject all active tasks
    for (const task of this.activeTasks.values()) {
      task.reject(new Error('Worker pool terminated'));
    }
    this.activeTasks.clear();

    // Terminate all workers
    for (const worker of this.workers) {
      worker.terminate();
    }
    this.workers = [];
    this.readyWorkers.clear();
  }
}

// Export singleton instance
export const workerPool = new WorkerPool();