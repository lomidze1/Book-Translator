import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Queue, Worker, Job } from 'bullmq';
import { RetranslationService } from './retranslation.service';
import {
  RETRANSLATION_QUEUE,
  RETRANSLATION_JOB_OPTIONS,
  getRedisConnection,
} from './translation.constants';

export interface RetranslationJobData {
  feedbackId: string;
}

/**
 * Runs reader-triggered re-translations off the request path. Its own queue,
 * because the translation worker runs at concurrency 1 — a redo queued behind
 * a multi-hour book would reach the reader days late.
 */
@Injectable()
export class RetranslationProcessor implements OnModuleInit {
  private readonly logger = new Logger(RetranslationProcessor.name);
  private queue: Queue | null = null;
  private worker: Worker | null = null;

  constructor(private readonly retranslation: RetranslationService) {}

  onModuleInit() {
    try {
      const connection = getRedisConnection();
      this.queue = new Queue(RETRANSLATION_QUEUE, { connection });
      this.worker = new Worker(
        RETRANSLATION_QUEUE,
        async (job: Job<RetranslationJobData>) => {
          await this.retranslation.retranslate(job.data.feedbackId);
        },
        { connection, concurrency: 2, lockDuration: 600000 },
      );

      this.worker.on('ready', () => this.logger.log('✅ Retranslation worker is READY'));
      this.worker.on('failed', (job, err) =>
        this.logger.error(`Retranslation job ${job?.id} failed: ${err.message}`),
      );
      this.worker.on('error', (err) => this.logger.error(`Retranslation worker error: ${err.message}`));
    } catch (err) {
      this.logger.error(`Retranslation worker init FAILED: ${err instanceof Error ? err.stack : err}`);
    }
  }

  async enqueue(feedbackId: string): Promise<void> {
    if (!this.queue) {
      this.logger.warn(`Retranslation queue unavailable — skipping feedback ${feedbackId}`);
      return;
    }
    await this.queue.add(
      'retranslate',
      { feedbackId },
      { ...RETRANSLATION_JOB_OPTIONS, jobId: `retranslate-${feedbackId}` },
    );
  }
}
