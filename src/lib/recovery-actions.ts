type LogoutAuth = {
  getSession: () => Promise<{
    data: { session: { access_token: string } | null };
    error: unknown;
  }>;
  admin: {
    signOut: (jwt: string, scope: "global") => Promise<{ error: unknown }>;
  };
  signOut: (options: { scope: "local" }) => Promise<{ error: unknown }>;
};
type ResetAuth = LogoutAuth & {
  updateUser: (attributes: { password: string }) => Promise<{ error: unknown }>;
};

export async function finishRecoverySignOut(auth: LogoutAuth) {
  try {
    // Read an opaque credential, not an authorization decision. The Auth
    // logout endpoint validates the JWT. No service-role key is used here.
    const { data, error } = await auth.getSession();
    if (error || !data.session?.access_token) return false;
    // Unlike client signOut(), this API preserves the SSR session on failure
    // and does not turn a missing session / 401 / 403 into successful logout.
    const result = await auth.admin.signOut(
      data.session.access_token,
      "global",
    );
    if (result.error) return false;
  } catch {
    return false;
  }
  try {
    // Global revocation is confirmed. Use the SDK to clear its cookie chunks;
    // even a failed cleanup request cannot undo that confirmed revocation.
    await auth.signOut({ scope: "local" });
  } catch {
    // Do not report an unconfirmed global logout after a confirmed one.
  }
  return true;
}

export async function changeRecoveryPassword(
  auth: ResetAuth,
  password: string,
) {
  try {
    const result = await auth.updateUser({ password });
    if (result.error) return "update_failed";
  } catch {
    return "unknown";
  }
  return (await finishRecoverySignOut(auth))
    ? "complete"
    : "updated_logout_pending";
}
