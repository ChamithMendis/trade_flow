import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import {
  EXCHANGE_QUEUE,
  PROCESS_ORDER_JOB,
  processOrderJobId,
  type ProcessOrderJobData,
} from './exchange.constants';

@Injectable()
export class ExchangeProducer {
  constructor(
    @InjectQueue(EXCHANGE_QUEUE)
    private readonly queue: Queue<ProcessOrderJobData>,
  ) {}

  /**
   * Queues the next execution step for an order. `sequence` is how many
   * executions the order already has, which makes the job id deterministic —
   * enqueueing the same step twice is harmless.
   */
  async enqueueOrder(
    orderId: string,
    sequence = 0,
    delayMs = 0,
  ): Promise<void> {
    await this.queue.add(
      PROCESS_ORDER_JOB,
      { orderId },
      {
        jobId: processOrderJobId(orderId, sequence),
        delay: delayMs,
        attempts: 3,
        backoff: { type: 'exponential', delay: 1_000 },
        removeOnComplete: 200,
        // Keep failures around so they can be inspected and retried (NFR-03).
        removeOnFail: false,
      },
    );
  }
}
