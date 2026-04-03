export interface ChunkResult {
  chunks: string[];
  totalBytes: number;
  totalChars: number;
}

// Georgian abbreviations that should NOT trigger sentence splits
const GEORGIAN_ABBREVIATIONS = [
  'მაგ.', 'ე.ი.', 'ე.წ.', 'ა.შ.', 'და ა.შ.', 'თ.', 'ქ.', 'სტ.',
  'გვ.', 'ნახ.', 'შდრ.', 'იხ.', 'აღნ.',
];

/**
 * Get byte length of string in UTF-8
 * Georgian characters (U+10D0-U+10FF) are 3 bytes each
 */
export function getByteLength(text: string): number {
  return Buffer.byteLength(text, 'utf-8');
}

/**
 * Split text into chunks, each not exceeding maxBytes in UTF-8
 * Prioritizes natural boundaries: paragraph > sentence > comma > word
 */
export function chunkText(text: string, maxBytes: number): ChunkResult {
  if (!text || !text.trim()) {
    return { chunks: [], totalBytes: 0, totalChars: 0 };
  }

  const totalBytes = getByteLength(text);
  const totalChars = text.length;

  // If entire text fits in one chunk
  if (totalBytes <= maxBytes) {
    return { chunks: [text], totalBytes, totalChars };
  }

  // Split by paragraphs first
  const paragraphs = splitByParagraphs(text);
  const rawChunks = accumulateSegments(paragraphs, maxBytes, splitBySentences, maxBytes);

  // Filter empty chunks
  const chunks = rawChunks.filter((c) => c.trim().length > 0);

  return { chunks, totalBytes, totalChars };
}

/**
 * Accumulate small segments into chunks up to maxBytes.
 * When a segment exceeds maxBytes, split it with the fallback splitter.
 */
function accumulateSegments(
  segments: string[],
  maxBytes: number,
  fallbackSplitter: (text: string) => string[],
  fallbackMaxBytes: number,
): string[] {
  const chunks: string[] = [];
  let current = '';

  for (const segment of segments) {
    const segBytes = getByteLength(segment);

    if (segBytes > maxBytes) {
      // Flush current
      if (current.trim()) {
        chunks.push(current.trim());
        current = '';
      }
      // Split the oversized segment further
      const subSegments = fallbackSplitter(segment);
      const subChunks = accumulateWithWordFallback(subSegments, maxBytes);
      chunks.push(...subChunks);
      continue;
    }

    const combined = current ? current + '\n\n' + segment : segment;
    if (getByteLength(combined) <= maxBytes) {
      current = combined;
    } else {
      if (current.trim()) chunks.push(current.trim());
      current = segment;
    }
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

/**
 * Accumulate sentence-level segments, falling back to word splitting
 */
function accumulateWithWordFallback(segments: string[], maxBytes: number): string[] {
  const chunks: string[] = [];
  let current = '';

  for (const segment of segments) {
    const segBytes = getByteLength(segment);

    if (segBytes > maxBytes) {
      if (current.trim()) {
        chunks.push(current.trim());
        current = '';
      }
      // Split by commas, then by words
      const commaSegments = splitByCommas(segment);
      for (const cs of commaSegments) {
        if (getByteLength(cs) > maxBytes) {
          // Last resort: split by words
          const wordChunks = splitByWordsToFit(cs, maxBytes);
          chunks.push(...wordChunks);
        } else {
          const combined = current ? current + ' ' + cs : cs;
          if (getByteLength(combined) <= maxBytes) {
            current = combined;
          } else {
            if (current.trim()) chunks.push(current.trim());
            current = cs;
          }
        }
      }
      continue;
    }

    const combined = current ? current + ' ' + segment : segment;
    if (getByteLength(combined) <= maxBytes) {
      current = combined;
    } else {
      if (current.trim()) chunks.push(current.trim());
      current = segment;
    }
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

/**
 * Split text into paragraphs by double newline
 */
export function splitByParagraphs(text: string): string[] {
  return text.split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p.length > 0);
}

/**
 * Split text into sentences (Georgian-aware)
 * Does NOT split after known Georgian abbreviations
 */
export function splitBySentences(text: string): string[] {
  // Replace abbreviations with placeholders
  let processed = text;
  const placeholders: string[] = [];
  for (const abbr of GEORGIAN_ABBREVIATIONS) {
    const placeholder = `__ABBR${placeholders.length}__`;
    while (processed.includes(abbr)) {
      processed = processed.replace(abbr, placeholder);
      placeholders.push(abbr);
    }
  }

  // Split on sentence boundaries: period/exclamation/question followed by space and uppercase
  const parts = processed.split(/(?<=[.!?…])\s+/);

  // Restore abbreviations
  return parts.map((part) => {
    let restored = part;
    for (let i = 0; i < placeholders.length; i++) {
      restored = restored.replace(`__ABBR${i}__`, placeholders[i]);
    }
    return restored;
  }).filter((s) => s.trim().length > 0);
}

/**
 * Split text by commas, semicolons, colons
 */
export function splitByCommas(text: string): string[] {
  return text.split(/(?<=[,;:])\s+/).filter((s) => s.trim().length > 0);
}

/**
 * Split text by words to fit within maxBytes
 */
function splitByWordsToFit(text: string, maxBytes: number): string[] {
  const words = text.split(/\s+/);
  const chunks: string[] = [];
  let current = '';

  for (const word of words) {
    const combined = current ? current + ' ' + word : word;
    if (getByteLength(combined) <= maxBytes) {
      current = combined;
    } else {
      if (current.trim()) chunks.push(current.trim());
      // If single word exceeds maxBytes, force-split by characters
      if (getByteLength(word) > maxBytes) {
        const charChunks = splitByCharacters(word, maxBytes);
        chunks.push(...charChunks);
        current = '';
      } else {
        current = word;
      }
    }
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

/**
 * Last resort: split by characters ensuring valid UTF-8 boundaries
 */
function splitByCharacters(text: string, maxBytes: number): string[] {
  const chunks: string[] = [];
  let current = '';

  for (const char of text) {
    const combined = current + char;
    if (getByteLength(combined) <= maxBytes) {
      current = combined;
    } else {
      if (current) chunks.push(current);
      current = char;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}
