/**
 * Works out what the "Send claim guide" button does for a veteran.
 *
 * Nothing here sends anything. For texting, the button copies the message
 * and opens the veteran's 800.com thread so staff paste and send from the
 * company number, never a personal phone. For email-preferred veterans it
 * opens a prefilled email. The guide itself is hosted wherever
 * CLAIM_GUIDE_URL points (a shared Drive link, a Storage URL); it has to
 * be publicly reachable because the veteran has no login.
 */

const EIGHT00_INBOX = "https://app.800.com/company/worth-their-weight/inbox";

export type ClaimGuideContact = {
  firstName: string;
  preferredContact: "phone" | "email";
  phone?: string;
  email?: string;
  eight00ThreadId?: string | null;
};

export type ClaimGuideSend =
  | { kind: "eight00"; message: string; url: string }
  | { kind: "email"; href: string };

/** The veteran's 800.com thread, or the inbox when no thread is linked. */
export function eight00Url(threadId?: string | null): string {
  const id = threadId?.trim();
  return id ? `${EIGHT00_INBOX}/${id}` : EIGHT00_INBOX;
}

export function claimGuideMessage(firstName: string, guideUrl: string): string {
  const greeting = firstName.trim() ? `Hi ${firstName.trim()}, ` : "Hi, ";
  return (
    `${greeting}here's the Worth Their Weight VA claim self-guide we ` +
    `talked about: ${guideUrl}`
  );
}

/**
 * Returns null when there's no guide configured or no way to reach the
 * veteran, so the caller can simply not render the button.
 */
export function claimGuideSend(
  contact: ClaimGuideContact,
  guideUrl: string | undefined,
): ClaimGuideSend | null {
  const url = guideUrl?.trim();
  if (!url) return null;
  const message = claimGuideMessage(contact.firstName, url);

  if (contact.preferredContact === "email") {
    const email = contact.email?.trim();
    if (!email) return null;
    const subject = "Your VA claim self-guide";
    return {
      kind: "email",
      href: `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`,
    };
  }

  if (!contact.phone?.trim() && !contact.eight00ThreadId?.trim()) return null;
  return { kind: "eight00", message, url: eight00Url(contact.eight00ThreadId) };
}
