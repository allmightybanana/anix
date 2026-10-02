/**
 * SvelteKit / devalue deserializer for streamed or single __data.json responses.
 * Reconstructs cyclic and referenced objects/arrays from indexed representation.
 */

/**
 * Deserializes an array serialized with SvelteKit's unflatten format.
 * @param {Array<any>} data - Indexed array of values/references
 * @returns {any} Deserialized root object
 */
export function unflatten(data) {
  if (!Array.isArray(data) || data.length === 0) {
    return data;
  }

  const hydrated = new Array(data.length);
  const resolving = new Set();

  function hydrate(index) {
    if (index === null || index === undefined) return index;
    if (typeof index !== 'number') return index;
    if (index < 0 || index >= data.length) return index;

    if (resolving.has(index)) {
      return hydrated[index];
    }
    if (hydrated[index] !== undefined) {
      return hydrated[index];
    }

    const raw = data[index];
    if (raw === null || typeof raw !== 'object') {
      hydrated[index] = raw;
      return raw;
    }

    resolving.add(index);

    if (Array.isArray(raw)) {
      const arr = [];
      hydrated[index] = arr;
      for (const item of raw) {
        arr.push(hydrate(item));
      }
      resolving.delete(index);
      return arr;
    }

    const obj = {};
    hydrated[index] = obj;
    for (const [key, valIdx] of Object.entries(raw)) {
      obj[key] = hydrate(valIdx);
    }
    resolving.delete(index);
    return obj;
  }

  return hydrate(0);
}

/**
 * Parses raw text from a SvelteKit text/sveltekit-data or application/json endpoint.
 * Handles newline-delimited stream chunks (lines with type "data" and type "chunk").
 * @param {string} rawText - Response body from __data.json
 * @returns {any} Combined parsed and unflattened data object
 */
export function parseSvelteKitData(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    return null;
  }

  const lines = rawText.trim().split(/\r?\n/).filter(Boolean);
  const result = {
    data: null,
    chunks: []
  };

  for (const line of lines) {
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }

    if (parsed.type === 'data') {
      // SvelteKit page data nodes
      const nodes = parsed.nodes || [];
      for (const node of nodes) {
        if (node && node.type === 'data' && Array.isArray(node.data)) {
          const unflattened = unflatten(node.data);
          result.data = { ...(result.data || {}), ...unflattened };
        }
      }
    } else if (parsed.type === 'chunk') {
      // Streaming chunk
      if (Array.isArray(parsed.data)) {
        const unflattenedChunk = unflatten(parsed.data);
        result.chunks.push({
          id: parsed.id,
          data: unflattenedChunk
        });
      }
    }
  }

  return result;
}
