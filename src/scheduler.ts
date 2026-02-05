export type ScheduledTask = {
  name: string;
  intervalMs: number;
  enabled?: boolean;
  run: () => Promise<void> | void;
};

export type Scheduler = {
  stop: () => void;
};

export function createScheduler(tasks: ScheduledTask[]): Scheduler {
  const timers: NodeJS.Timeout[] = [];

  const startTask = (task: ScheduledTask) => {
    if (task.enabled === false) return;
    const interval = Math.max(1_000, task.intervalMs);
    let running = false;

    const tick = async () => {
      if (running) return;
      running = true;
      try {
        await task.run();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[scheduler:${task.name}] ${message}`);
      } finally {
        running = false;
      }
    };

    void tick();
    timers.push(setInterval(tick, interval));
  };

  for (const task of tasks) {
    startTask(task);
  }

  return {
    stop: () => {
      for (const timer of timers) {
        clearInterval(timer);
      }
    },
  };
}
