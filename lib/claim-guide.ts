/**
 * Builds the link behind the "Send claim guide" button: an `sms:` or
 * `mailto:` URL with the guide's link already written into the message.
 *
 * Nothing here sends anything — the link opens the staff member's own
 * texting or mail app, prefilled, and they hit send. The guide itself is
 * hosted wherever CLAIM_GUIDE_URL points (a shared Drive link, a Storage
 * URL); it has to be publicly reachable because the veteran has no login.
 */

export type ClaimGuideContact = {
  firstName: string;
  preferredContact: "phone" | "email";
  phone?: string;
  email?: string;
};

export function claimGuideMessage(firstName: string, guideUrl: string): string {
  const greeting = firstName.trim() ? `Hi ${firstName.trim()}, ` : "Hi, ";
  return (
    `${greeting}here's the Worth Their Weight VA claim self-guide we ` +
    `talked about: ${guideUrl}`
  );
}

/**
 * Returns null when there's no guide configured or no usable contact, so
 * the caller can simply not render the button.
 */
export function claimGuideHref(
  contact: ClaimGuideContact,
  guideUrl: string | undefined,
): string | null {
  const url = guideUrl?.trim();
  if (!url) return null;
  const body = claimGuideMessage(contact.firstName, url);

  if (contact.preferredContact === "email") {
    const email = contact.email?.trim();
    if (!email) return null;
    const subject = "Your VA claim self-guide";
    return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  // Keep a leading + for international numbers; drop spaces, dashes, parens.
  const phone = contact.phone?.trim().replace(/(?!^\+)[^\d]/g, "") ?? "";
  if (!phone.replace("+", "")) return null;
  // `?&body=` is the form both iOS and Android Messages accept.
  return `sms:${phone}?&body=${encodeURIComponent(body)}`;
}
