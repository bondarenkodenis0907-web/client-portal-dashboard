// A tab keeps only an operation identifier, never the request's contents.
type Journal = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const journalKey = (userId: string) => `portal:pending-request:${userId}`;

export function pendingSubmission(
  journal: Journal,
  userId: string,
  newKey: () => string = () => crypto.randomUUID(),
): string {
  const name = journalKey(userId);
  const existing = journal.getItem(name);
  if (existing !== null) {
    if (!uuid.test(existing)) throw new Error("Submission journal is invalid");
    return existing;
  }
  const key = newKey();
  if (!uuid.test(key)) throw new Error("Submission identifier is invalid");
  journal.setItem(name, key);
  if (journal.getItem(name) !== key)
    throw new Error("Submission journal could not be saved");
  return key;
}

// Clear only the operation whose successful result the caller has confirmed.
export function finishSubmission(
  journal: Journal,
  userId: string,
  key: string,
) {
  if (journal.getItem(journalKey(userId)) !== key)
    throw new Error("Submission journal changed");
  journal.removeItem(journalKey(userId));
  if (journal.getItem(journalKey(userId)) !== null)
    throw new Error("Submission journal could not be cleared");
}
