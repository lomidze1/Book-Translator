import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Queue, Worker, Job } from 'bullmq';
import { BatchEditorService } from './batch-editor.service';
import {
  EDITOR_BATCH_QUEUE,
  EDITOR_BATCH_JOB_OPTIONS,
  EDITOR_BATCH_POLL_DELAY_MS,
  EDITOR_BATCH_MAX_POLLS,
  getRedisConnection,
} from './translation.constants';

export interface EditorBatchJobData {
  translationId: string;
  /** Incremented on every re-enqueue so polling cannot loop forever. */
  pollCount?: number;
}

/**
 * Drives the STANDARD-tier editor batch: submit once, then re-check every few
 * minutes until the Message Batch ends and its results are spliced in. The
 * translation is already COMPLETED at this point — the reader has the draft,
 * and this only upgrades the text underneath them.
 */
@Injectable()
export class EditorBatchProcessor implements OnModuleInit {
  private readonly logger = new Logger(EditorBatchProcessor.name);
  private queue: Queue | null = null;
  private worker: Worker | null = null;

  constructor(private readonly batchEditor: BatchEditorService) {}

  onModuleInit() {
    try {
      const connection = getRedisConnection();
      this.queue = new Queue(EDITOR_BATCH_QUEUE, { connection });
      this.worker = new Worker(
        EDITOR_BATCH_QUEUE,
        async (job: Job<EditorBatchJobData>) => this.process(job),
        { connection, concurrency: 2 },
      );

      this.worker.on('ready', () => this.logger.log('✅ Editor batch worker is READY'));
      this.worker.on('failed', (job, err) =>
        this.logger.error(`Editor batch job ${job?.id} failed: ${err.message}`),
      );
      this.worker.on('error', (err) => this.logger.error(`Editor batch worker error: ${err.message}`));
    } catch (err) {
      this.logger.error(`Editor batch worker init FAILED: ${err instanceof Error ? err.stack : err}`);
    }
  }

  /** Kick off the editor batch for a finished STANDARD translation. */
  async enqueue(translationId: string): Promise<void> {
    if (!this.queue) {
      this.logger.warn(`Editor batch queue unavailable — skipping ${translationId}`);
      return;
    }
    await this.queue.add(
      'edit-translation',
      { translationId, pollCount: 0 },
      { ...EDITOR_BATCH_JOB_OPTIONS, jobId: `editor-batch-${translationId}` },
    );
  }

  private async process(job: Job<EditorBatchJobData>): Promise<void> {
    const { translationId, pollCount = 0 } = job.data;

    // First run submits; later runs only poll.
    if (pollCount === 0) {
      const batchId = await this.batchEditor.submit(translationId);
      if (!batchId) return;
    }

    const { done, applied } = await this.batchEditor.poll(translationId);
    if (done) {
      if (applied > 0) {
        this.logger.log(`Editor batch for ${translationId} improved ${applied} chapter(s)`);
      }
      return;
    }

    if (pollCount + 1 >= EDITOR_BATCH_MAX_POLLS) {
      this.logger.warn(`Editor batch for ${translationId} never ended — giving up, draft stands`);
      return;
    }

    await this.reschedule(translationId, pollCount + 1);
  }

  private async reschedule(translationId: string, pollCount: number): Promise<void> {
    if (!this.queue) return;
    await this.queue.add(
      'edit-translation',
      { translationId, pollCount },
      {
        ...EDITOR_BATCH_JOB_OPTIONS,
        delay: EDITOR_BATCH_POLL_DELAY_MS,
        // Poll number in the id so the completed previous job doesn't make
        // BullMQ silently drop the next one.
        jobId: `editor-batch-${translationId}-${pollCount}`,
      },
    );
  }
}
