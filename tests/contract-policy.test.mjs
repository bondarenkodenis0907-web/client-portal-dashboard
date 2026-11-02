import test from "node:test";
import assert from "node:assert/strict";
import {
  managementBody,
  validContractPdf,
  maxContractBytes,
  validRevision,
} from "../src/lib/contract-policy.ts";
test("bounded PDF checks reject path/control filenames, non-PDF and actual oversized bytes", () => {
  const valid = new TextEncoder().encode("%PDF-1.4\nfixture");
  assert(validContractPdf("contract.pdf", valid));
  for (const name of [
    "../contract.pdf",
    "folder\\file.pdf",
    "a\n.pdf",
    "a.txt",
  ])
    assert(!validContractPdf(name, valid));
  assert(!validContractPdf("file.pdf", new TextEncoder().encode("<html>")));
  assert(!validContractPdf("file.pdf", new Uint8Array(maxContractBytes + 1)));
});
test("stream limit is enforced without a content-length before JSON decoding", async () => {
  const stream = new ReadableStream({
    start(c) {
      c.enqueue(new Uint8Array(3 * 1024 * 1024 + 1));
      c.close();
    },
  });
  await assert.rejects(
    managementBody(
      new Request("http://localhost/test", {
        method: "POST",
        body: stream,
        duplex: "half",
      }),
    ),
    /too large/,
  );
  await assert.rejects(
    managementBody(
      new Request("http://localhost/test", {
        method: "POST",
        body: "not JSON",
      }),
    ),
  );
});
test("revisions exclude fractional, negative, coerced or overflowing CAS inputs", () => {
  for (const n of [0, 1, 15]) assert(validRevision(n));
  for (const n of [-1, NaN, 1.2, 2147483647, "1", null])
    assert(!validRevision(n));
});
