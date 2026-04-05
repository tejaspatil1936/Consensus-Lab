// Package logger provides a structured JSON logger used throughout the proxy.
package logger

import (
	"encoding/json"
	"os"
	"sync"
	"time"
)

// Field represents a key-value pair for structured logging.
type Field struct {
	Key   string
	Value interface{}
}

// F creates a new Field with the given key and value.
func F(key string, value interface{}) Field {
	return Field{Key: key, Value: value}
}

// Logger writes structured JSON log entries.
type Logger struct {
	mu      sync.Mutex
	verbose bool
	silent  bool
}

func (l *Logger) write(w *os.File, level, msg string, fields []Field) {
	if l.silent {
		return
	}
	entry := make(map[string]interface{}, len(fields)+3)
	entry["level"] = level
	entry["message"] = msg
	entry["timestamp"] = time.Now().UTC().Format(time.RFC3339)
	for _, f := range fields {
		entry[f.Key] = f.Value
	}

	data, err := json.Marshal(entry)
	if err != nil {
		return
	}

	l.mu.Lock()
	defer l.mu.Unlock()
	w.Write(data)
	w.Write([]byte("\n"))
}

// Info logs an informational message to stdout.
func (l *Logger) Info(msg string, fields ...Field) {
	l.write(os.Stdout, "info", msg, fields)
}

// Warn logs a warning message to stderr.
func (l *Logger) Warn(msg string, fields ...Field) {
	l.write(os.Stderr, "warn", msg, fields)
}

// Error logs an error message to stderr.
func (l *Logger) Error(msg string, fields ...Field) {
	l.write(os.Stderr, "error", msg, fields)
}

// Debug logs a debug message to stdout only if verbose mode is enabled.
func (l *Logger) Debug(msg string, fields ...Field) {
	if l.verbose {
		l.write(os.Stdout, "debug", msg, fields)
	}
}

// defaultLogger is the package-level logger instance.
var defaultLogger = &Logger{}

// verbose controls debug output for the default logger.
var verbose bool

// SetVerbose enables or disables debug logging.
func SetVerbose(v bool) {
	verbose = v
	defaultLogger.verbose = v
}

// Silence suppresses all log output when set to true. Used in benchmark mode.
func Silence(s bool) {
	defaultLogger.silent = s
}

// Info logs an informational message using the default logger.
func Info(msg string, fields ...Field) {
	defaultLogger.Info(msg, fields...)
}

// Warn logs a warning message using the default logger.
func Warn(msg string, fields ...Field) {
	defaultLogger.Warn(msg, fields...)
}

// Error logs an error message using the default logger.
func Error(msg string, fields ...Field) {
	defaultLogger.Error(msg, fields...)
}

// Debug logs a debug message using the default logger.
func Debug(msg string, fields ...Field) {
	defaultLogger.Debug(msg, fields...)
}
