let verbose = false;

/**
 * Set verbose mode. When enabled, debug() calls produce output.
 * @param {boolean} enabled - Whether to enable verbose/debug logging
 */
export function setVerbose(enabled) {
  verbose = enabled;
}

/**
 * Write a structured JSON log entry to the given output stream.
 * @param {NodeJS.WriteStream} stream - process.stdout or process.stderr
 * @param {string} level - Log level (info, warn, error, debug)
 * @param {string} message - Log message
 * @param {Object} [data] - Optional additional fields to include in the log entry
 */
function write(stream, level, message, data) {
  const entry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...data
  };
  stream.write(JSON.stringify(entry) + '\n');
}

/**
 * Structured JSON logger for ProxyShield.
 * All internal logging goes through this — never use console.log in library code.
 */
const logger = {
  /**
   * Log an informational message to stdout.
   * @param {string} message - The log message
   * @param {Object} [data] - Optional additional fields
   */
  info(message, data) {
    write(process.stdout, 'info', message, data);
  },

  /**
   * Log a warning message to stderr.
   * @param {string} message - The log message
   * @param {Object} [data] - Optional additional fields
   */
  warn(message, data) {
    write(process.stderr, 'warn', message, data);
  },

  /**
   * Log an error message to stderr.
   * @param {string} message - The log message
   * @param {Object} [data] - Optional additional fields
   */
  error(message, data) {
    write(process.stderr, 'error', message, data);
  },

  /**
   * Log a debug message to stdout. Only produces output when verbose mode is enabled.
   * @param {string} message - The log message
   * @param {Object} [data] - Optional additional fields
   */
  debug(message, data) {
    if (!verbose) return;
    write(process.stdout, 'debug', message, data);
  }
};

export default logger;
