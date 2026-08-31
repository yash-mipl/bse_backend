/**
 * Recursive text chunker with overlap for RAG indexing.
 */

/**
 * Approximate token count (roughly 4 characters per token in English).
 */
export function estimateTokens(text) {
  return Math.ceil((text || '').length / 4);
}

/**
 * Split text into semantic chunks with token target and overlap.
 * @param {string} text - Raw extracted text
 * @param {Object} options - { maxTokens: 600, overlapTokens: 100 }
 * @returns {Array<{ id: number, text: string, tokenCount: number, index: number }>}
 */
export function chunkText(text, { maxTokens = 600, overlapTokens = 100 } = {}) {
  if (!text || typeof text !== 'string') return [];

  const cleanedText = text
    .replace(/\r\n/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/[ ]{2,}/g, ' ')
    .trim();

  if (!cleanedText) return [];

  const maxChars = maxTokens * 4;
  const overlapChars = overlapTokens * 4;

  if (cleanedText.length <= maxChars) {
    return [{
      id: 0,
      text: cleanedText,
      tokenCount: estimateTokens(cleanedText),
      index: 0
    }];
  }

  // Split hierarchically: paragraphs -> lines -> sentences -> words
  const paragraphs = cleanedText.split(/\n\s*\n/);
  const chunks = [];
  let currentChunk = '';
  let chunkIndex = 0;

  for (const para of paragraphs) {
    const trimmedPara = para.trim();
    if (!trimmedPara) continue;

    if ((currentChunk + '\n\n' + trimmedPara).length <= maxChars) {
      currentChunk = currentChunk ? `${currentChunk}\n\n${trimmedPara}` : trimmedPara;
    } else {
      if (currentChunk) {
        chunks.push({
          id: chunkIndex,
          text: currentChunk.trim(),
          tokenCount: estimateTokens(currentChunk),
          index: chunkIndex++
        });

        // Compute overlap from end of current chunk
        const words = currentChunk.split(/\s+/);
        const overlapWordCount = Math.min(words.length, Math.floor(overlapChars / 6));
        const overlapSnippet = words.slice(-overlapWordCount).join(' ');
        currentChunk = overlapSnippet ? `${overlapSnippet}\n\n${trimmedPara}` : trimmedPara;
      } else {
        // Single paragraph larger than maxChars: split by sentences
        const sentences = trimmedPara.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) || [trimmedPara];
        for (const sentence of sentences) {
          if ((currentChunk + ' ' + sentence).length <= maxChars) {
            currentChunk = currentChunk ? `${currentChunk} ${sentence}` : sentence;
          } else {
            if (currentChunk) {
              chunks.push({
                id: chunkIndex,
                text: currentChunk.trim(),
                tokenCount: estimateTokens(currentChunk),
                index: chunkIndex++
              });
              currentChunk = sentence;
            } else {
              // Extremely long sentence without punctuation: split by characters/words
              let start = 0;
              while (start < sentence.length) {
                const end = Math.min(start + maxChars, sentence.length);
                const subStr = sentence.slice(start, end);
                chunks.push({
                  id: chunkIndex,
                  text: subStr.trim(),
                  tokenCount: estimateTokens(subStr),
                  index: chunkIndex++
                });
                start += (maxChars - overlapChars);
              }
              currentChunk = '';
            }
          }
        }
      }
    }
  }

  if (currentChunk.trim()) {
    chunks.push({
      id: chunkIndex,
      text: currentChunk.trim(),
      tokenCount: estimateTokens(currentChunk),
      index: chunkIndex
    });
  }

  return chunks;
}
