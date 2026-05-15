/** Map Firebase Auth error codes to copy that a non-technical user can act on. */
export function humanizeAuthError(err: unknown): string {
  if (typeof err === "object" && err !== null && "code" in err) {
    const code = (err as { code: string }).code;
    switch (code) {
      case "auth/popup-closed-by-user":
      case "auth/cancelled-popup-request":
        return "Sign-in was cancelled.";
      case "auth/popup-blocked":
        return "Your browser blocked the sign-in popup. Allow popups and try again.";
      case "auth/user-disabled":
        return "This account has been disabled. Ask an admin.";
      case "auth/network-request-failed":
        return "Network problem. Check your connection and try again.";
      case "auth/unauthorized-domain":
        return "This site isn't in the Firebase authorized domains list yet.";
      default:
        return code;
    }
  }
  return "Something went wrong. Try again.";
}
