export function isValidMediaRange(value: string): boolean {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(value.trim());
  if (!match || (!match[1] && !match[2])) return false;

  if (match[1] && match[2]) {
    return Number(match[1]) <= Number(match[2]);
  }
  return true;
}

export function getDeclaredMediaSize(headers: Headers): number | null {
  const sizes: number[] = [];
  const contentLength = Number.parseInt(headers.get("content-length") ?? "", 10);
  if (Number.isFinite(contentLength)) sizes.push(contentLength);

  const contentRange = headers.get("content-range");
  const totalMatch = contentRange?.match(/\/(\d+)$/);
  if (totalMatch) {
    const total = Number.parseInt(totalMatch[1], 10);
    if (Number.isFinite(total)) sizes.push(total);
  }

  return sizes.length > 0 ? Math.max(...sizes) : null;
}

export function createBoundedMediaStream(
  body: ReadableStream<Uint8Array>,
  maxBytes: number
): ReadableStream<Uint8Array> {
  let receivedBytes = 0;

  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        receivedBytes += chunk.byteLength;
        if (receivedBytes > maxBytes) {
          controller.error(new Error("Media stream exceeded the byte limit"));
          return;
        }
        controller.enqueue(chunk);
      },
    })
  );
}
