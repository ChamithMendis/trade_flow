export const EXCHANGE_QUEUE = 'exchange';
export const PROCESS_ORDER_JOB = 'process-order';

export interface ProcessOrderJobData {
  orderId: string;
}

/**
 * Deterministic job id per (order, execution sequence). BullMQ ignores an `add`
 * for an id it already knows, so a duplicate enqueue is a no-op rather than a
 * second run.
 *
 * The separator is `-`, not `:` — BullMQ uses `:` in its own Redis keys and
 * rejects custom ids containing it.
 */
export function processOrderJobId(orderId: string, sequence: number): string {
  return `${orderId}-${sequence}`;
}
