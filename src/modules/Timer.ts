import TinyQueue from 'tinyqueue';

interface Task {
	time: number;
	callback: () => void;
	id: number;
	isInterval: boolean;
	interval?: number;
}

class TaskScheduler {
	private queue: TinyQueue<Task>;
	private currentId: number;
	private tasks: Map<number, boolean>;
	private currentTimer: NodeJS.Timeout | null;
	private currentTask: Task | null;

	private releaseReadyTime: number = 5 * 1000;

	constructor() {
		this.queue = new TinyQueue([], (a: Task, b: Task) => a.time - b.time);
		this.currentId = 0;
		this.tasks = new Map();
		this.currentTimer = null;
	}

	public schedule(callback: () => void, delay: number, isInterval: boolean = false, existingId: number | null = null): number {
		const id = existingId !== null ? existingId : this.currentId++;
		const time = Date.now() + delay;

		this.queue.push({time, callback, id, isInterval, interval: delay});
		this.tasks.set(id, true);

		this.checkQueue();

		return id;
	}

	public clear(id: number) {
		if (this.tasks.has(id)) {
			this.tasks.delete(id);
		}
	}

	/**
	 * 释放并执行任务。任务一旦释放不可撤回或撤销。
	 * @param task 任务
	 * @param delay 延迟时间
	 * @private
	 */
	private releaseTask(task: Task, delay: number = 0) {
		if (this.tasks.has(task.id)) {
			setTimeout(task.callback, delay);
			this.tasks.delete(task.id);

			if (task.isInterval) {
				this.schedule(task.callback, task.interval, true, task.id);
			}
		}
	}

	private checkQueue() {
		if (this.queue.length === 0) {
			return;
		}

		const now = Date.now();

		// 找出里面所有剩余时间小于5s的任务，另起一个setTimeout执行它们
		let nextTask = this.queue.peek();
		while (nextTask && nextTask.time <= now + this.releaseReadyTime) {
			this.queue.pop();
			this.releaseTask(nextTask, nextTask.time - now);
			nextTask = this.queue.peek();
		}

		// 如果下一个任务不是当前任务，那么清除当前任务
		if (this.currentTask && this.currentTask !== this.queue.peek()) {
			clearTimeout(this.currentTimer);
			this.currentTask = null;
		}

		// 如果队列不为空，并且还没有设置，那么确定下一个任务的时间，设置定时器
		if (this.currentTask == null && this.queue.length > 0) {
			nextTask = this.queue.peek();
			this.currentTask = nextTask;
			this.currentTimer = setTimeout(() => this.checkQueue(), nextTask.time - now - this.releaseReadyTime / 2);
		}
	}
}

const scheduler = new TaskScheduler();

export function setTimerTimeout(callback: () => void, delay: number): number {
	if (delay < 0 || isNaN(delay) || !isFinite(delay)) {
		return -1;
	}
	return scheduler.schedule(callback, delay, false);
}

export function setTimerInterval(callback: () => void, delay: number): number {
	if (delay < 0 || isNaN(delay) || !isFinite(delay)) {
		return -1;
	}
	return scheduler.schedule(callback, delay, true);
}

export function clearTimerTimeout(id: number): void {
	scheduler.clear(id);
}

export function clearTimerInterval(id: number): void {
	scheduler.clear(id);
}
