import { EventEmitter } from 'events';

/**
 * Central event bus shared across the entire proxy.
 *
 * Every middleware emits events through this emitter. Dashboard, logger,
 * and metrics subscribe to it. This is the decoupling layer — no middleware
 * should ever import or reference any other middleware or the dashboard directly.
 *
 * Events emitted through this bus:
 * - request:received   { ip, method, path, timestamp }
 * - request:forwarded  { ip, method, path, statusCode, latencyMs, timestamp }
 * - request:blocked    { ip, method, path, reason, threatTag, timestamp }
 * - ip:banned          { ip, path, banMinutes, timestamp }
 * - config:reloaded    { diffs: Array<{field, oldValue, newValue}>, timestamp }
 * - rate-limit:warning { ip, path, usagePercent, delayMs, timestamp }
 *
 * @type {EventEmitter}
 */
const eventBus = new EventEmitter();
eventBus.setMaxListeners(50);

export default eventBus;
