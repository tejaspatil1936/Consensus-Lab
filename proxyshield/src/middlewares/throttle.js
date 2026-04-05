/**
 * Throttle middleware factory.
 * Adds artificial delay to requests approaching the rate limit.
 * Slows clients down before blocking them entirely.
 * Only applies to endpoints with throttle_enabled: true.
 *
 * @returns {Function} Middleware function with signature (req, res, context) => Promise<string>
 */
export function createThrottle() {
  return async function throttle(req, res, context) {
    // Skip if no rate limit info or throttle not enabled
    if (!context.rateLimitInfo) return 'next';
    if (!context.rateLimitInfo.throttleEnabled) return 'next';

    // Calculate usage ratio
    const usageRatio = context.rateLimitInfo.current / context.rateLimitInfo.limit;

    // Get thresholds from config
    const warnThreshold = context.config.throttle?.warn_threshold || 0.8;
    const warnDelayMs = context.config.throttle?.warn_delay_ms || 200;
    const criticalThreshold = context.config.throttle?.critical_threshold || 0.9;
    const criticalDelayMs = context.config.throttle?.critical_delay_ms || 500;

    let delayMs = 0;

    if (usageRatio >= criticalThreshold) {
      delayMs = criticalDelayMs;
    } else if (usageRatio >= warnThreshold) {
      delayMs = warnDelayMs;
    } else {
      return 'next';
    }

    // Apply delay
    await new Promise(resolve => setTimeout(resolve, delayMs));

    // Emit warning event
    context.eventBus.emit('rate-limit:warning', {
      ip: context.ip,
      path: context.rateLimitInfo.path,
      usagePercent: Math.round(usageRatio * 100),
      delayMs,
      timestamp: Date.now()
    });

    return 'next';
  };
}
