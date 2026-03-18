export async function* parseSseStream(
  stream: ReadableStream<Uint8Array>
): AsyncGenerator<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const extractData = (rawEvent: string): string | null => {
    const lines = rawEvent.split(/\r?\n/);
    const dataLines = lines
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart());

    if (dataLines.length === 0) {
      return null;
    }

    return dataLines.join("\n");
  };

  const nextSeparator = (): { index: number; length: number } | null => {
    const match = /\r?\n\r?\n/.exec(buffer);
    if (!match || match.index < 0) {
      return null;
    }
    return { index: match.index, length: match[0].length };
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });

    let separator = nextSeparator();
    while (separator) {
      const rawEvent = buffer.slice(0, separator.index);
      buffer = buffer.slice(separator.index + separator.length);
      const data = extractData(rawEvent);
      if (data !== null) {
        yield data;
      }
      separator = nextSeparator();
    }
  }

  buffer += decoder.decode();
  const trailing = extractData(buffer.trim());
  if (trailing !== null) {
    yield trailing;
  }
}
