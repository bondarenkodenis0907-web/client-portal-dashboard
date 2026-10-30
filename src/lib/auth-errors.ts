export function isTransientAuthError(
  error: { status?: number; name?: string } | null,
) {
  return (
    !!error &&
    error.status !== 401 &&
    error.status !== 403 &&
    error.name !== "AuthSessionMissingError"
  );
}
