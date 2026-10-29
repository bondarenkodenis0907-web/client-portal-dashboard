import assert from "node:assert/strict";
import test from "node:test";
import {
  pendingSubmission,
  finishSubmission,
} from "../src/lib/request-submission.ts";

function journal() {
  const values = new Map();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}
const first = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const second = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
test("uncertain retries and remounts reuse the operation; another user is separate", () => {
  const storage = journal();
  assert.equal(
    pendingSubmission(storage, "user-a", () => first),
    first,
  );
  assert.equal(
    pendingSubmission(storage, "user-a", () => {
      throw Error("Must not rotate");
    }),
    first,
  );
  assert.equal(
    pendingSubmission(storage, "user-b", () => second),
    second,
  );
  assert.deepEqual([...storage.values.values()], [first, second]);
});
test("only confirmed matching operation can finish, next submission gets a new key", () => {
  const storage = journal();
  pendingSubmission(storage, "a", () => first);
  assert.throws(() => finishSubmission(storage, "a", second));
  assert.equal(pendingSubmission(storage, "a"), first);
  finishSubmission(storage, "a", first);
  assert.equal(
    pendingSubmission(storage, "a", () => second),
    second,
  );
});
test("unavailable, corrupt or non-persistent storage fails before sending", () => {
  const storage = journal();
  storage.setItem("portal:pending-request:a", "corrupt");
  assert.throws(() => pendingSubmission(storage, "a"));
  assert.throws(() =>
    pendingSubmission(
      {
        ...journal(),
        setItem() {
          throw Error("Denied");
        },
      },
      "a",
      () => first,
    ),
  );
  assert.throws(() =>
    pendingSubmission({ ...journal(), setItem() {} }, "a", () => first),
  );
  const retained = journal();
  pendingSubmission(retained, "a", () => first);
  assert.throws(() =>
    finishSubmission({ ...retained, removeItem() {} }, "a", first),
  );
  assert.equal(pendingSubmission(retained, "a"), first);
});
