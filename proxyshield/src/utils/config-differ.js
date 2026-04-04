/**
 * Compare two config objects and return an array of differences.
 * Used when config.json is hot-reloaded to show what changed on the dashboard.
 *
 * @param {Object} oldConfig - The previous configuration object
 * @param {Object} newConfig - The new configuration object
 * @returns {Array<{field: string, oldValue: any, newValue: any}>} Array of diff objects
 */
export function diffConfigs(oldConfig, newConfig) {
  const diffs = [];
  diffRecursive(oldConfig, newConfig, '', diffs);
  return diffs;
}

/**
 * Recursively walk two objects and collect differences.
 * @param {any} oldVal - Old value
 * @param {any} newVal - New value
 * @param {string} path - Dot-separated path to current field
 * @param {Array} diffs - Accumulator for diff objects
 */
function diffRecursive(oldVal, newVal, path, diffs) {
  // Handle cases where a field exists in one config but not the other
  if (oldVal === undefined && newVal !== undefined) {
    diffs.push({ field: path, oldValue: null, newValue: newVal });
    return;
  }
  if (oldVal !== undefined && newVal === undefined) {
    diffs.push({ field: path, oldValue: oldVal, newValue: null });
    return;
  }

  // Both null/undefined — no diff
  if (oldVal == null && newVal == null) return;

  // One is null, other is not
  if (oldVal == null || newVal == null) {
    diffs.push({ field: path, oldValue: oldVal, newValue: newVal });
    return;
  }

  // Primitive comparison
  if (typeof oldVal !== 'object' || typeof newVal !== 'object') {
    if (oldVal !== newVal) {
      diffs.push({ field: path, oldValue: oldVal, newValue: newVal });
    }
    return;
  }

  // Special array handling
  if (Array.isArray(oldVal) && Array.isArray(newVal)) {
    diffArrays(oldVal, newVal, path, diffs);
    return;
  }

  // One is array, other is not
  if (Array.isArray(oldVal) !== Array.isArray(newVal)) {
    diffs.push({ field: path, oldValue: oldVal, newValue: newVal });
    return;
  }

  // Object comparison — recurse into all keys from both objects
  const allKeys = new Set([...Object.keys(oldVal), ...Object.keys(newVal)]);
  for (const key of allKeys) {
    const childPath = path ? `${path}.${key}` : key;
    diffRecursive(oldVal[key], newVal[key], childPath, diffs);
  }
}

/**
 * Compare two arrays with context-aware logic based on the field path.
 * - blacklisted_ips: report additions and removals
 * - middlewares: report order changes, additions, removals
 * - honeypots: compare by path field as key
 * - rate_limits and other arrays: compare by index
 *
 * @param {Array} oldArr - Old array
 * @param {Array} newArr - New array
 * @param {string} path - Dot-separated path
 * @param {Array} diffs - Accumulator
 */
function diffArrays(oldArr, newArr, path, diffs) {
  // blacklisted_ips — report additions and removals as string sets
  if (path.endsWith('blacklisted_ips')) {
    const oldSet = new Set(oldArr);
    const newSet = new Set(newArr);
    for (const ip of oldArr) {
      if (!newSet.has(ip)) {
        diffs.push({ field: `${path}: removed ${ip}`, oldValue: ip, newValue: null });
      }
    }
    for (const ip of newArr) {
      if (!oldSet.has(ip)) {
        diffs.push({ field: `${path}: added ${ip}`, oldValue: null, newValue: ip });
      }
    }
    return;
  }

  // middlewares — report order changes, additions, removals
  if (path === 'middlewares') {
    const oldSet = new Set(oldArr);
    const newSet = new Set(newArr);
    for (const mw of oldArr) {
      if (!newSet.has(mw)) {
        diffs.push({ field: `${path}: removed ${mw}`, oldValue: mw, newValue: null });
      }
    }
    for (const mw of newArr) {
      if (!oldSet.has(mw)) {
        diffs.push({ field: `${path}: added ${mw}`, oldValue: null, newValue: mw });
      }
    }
    // Check order change (only if same elements)
    if (oldArr.length === newArr.length && oldArr.every((v) => newSet.has(v))) {
      const orderChanged = oldArr.some((v, i) => v !== newArr[i]);
      if (orderChanged) {
        diffs.push({
          field: `${path}: order changed`,
          oldValue: oldArr.join(', '),
          newValue: newArr.join(', ')
        });
      }
    }
    return;
  }

  // honeypots — compare by path field as key
  if (path === 'honeypots') {
    const oldByPath = new Map(oldArr.map((h) => [h.path, h]));
    const newByPath = new Map(newArr.map((h) => [h.path, h]));

    for (const [hPath, oldHoneypot] of oldByPath) {
      if (!newByPath.has(hPath)) {
        diffs.push({
          field: `${path}: removed ${hPath}`,
          oldValue: `${hPath} (${oldHoneypot.ban_minutes}min)`,
          newValue: null
        });
      } else {
        const newHoneypot = newByPath.get(hPath);
        if (oldHoneypot.ban_minutes !== newHoneypot.ban_minutes) {
          diffs.push({
            field: `${path}[${hPath}].ban_minutes`,
            oldValue: oldHoneypot.ban_minutes,
            newValue: newHoneypot.ban_minutes
          });
        }
      }
    }
    for (const [hPath, newHoneypot] of newByPath) {
      if (!oldByPath.has(hPath)) {
        diffs.push({
          field: `${path}: added ${hPath}`,
          oldValue: null,
          newValue: `${hPath} (${newHoneypot.ban_minutes}min)`
        });
      }
    }
    return;
  }

  // Default: compare arrays by index (e.g. rate_limits)
  const maxLen = Math.max(oldArr.length, newArr.length);
  for (let i = 0; i < maxLen; i++) {
    const itemPath = `${path}[${i}]`;
    if (i >= oldArr.length) {
      diffs.push({ field: `${itemPath}: added`, oldValue: null, newValue: newArr[i] });
    } else if (i >= newArr.length) {
      diffs.push({ field: `${itemPath}: removed`, oldValue: oldArr[i], newValue: null });
    } else if (typeof oldArr[i] === 'object' && typeof newArr[i] === 'object') {
      diffRecursive(oldArr[i], newArr[i], itemPath, diffs);
    } else if (oldArr[i] !== newArr[i]) {
      diffs.push({ field: itemPath, oldValue: oldArr[i], newValue: newArr[i] });
    }
  }
}
