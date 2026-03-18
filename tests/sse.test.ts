import { describe, expect, it } from "vitest";
import { parseSseStream } from "../src/utils/sse.js";

const createStream = (chunks: string[]): ReadableStream<Uint8Array> => {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    }
  });
};

describe("sse parser", () => {
  it("parses CRLF separated events", async () => {
    const stream = createStream([
      "data: first\r\n\r\n",
      "data: second\r\n\r\n"
    ]);

    const events: string[] = [];
    for await (const event of parseSseStream(stream)) {
      events.push(event);
    }

    expect(events).toEqual(["first", "second"]);
  });

  it("joins multi-line data payloads", async () => {
    const stream = createStream([
      "data: line1\n",
      "data: line2\n\n"
    ]);

    const events: string[] = [];
    for await (const event of parseSseStream(stream)) {
      events.push(event);
    }

    expect(events).toEqual(["line1\nline2"]);
  });
});
