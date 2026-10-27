/** Who a write is attributed to: the signed-in person, or the admin who
 *  approved a Claude change request. A Session satisfies this. */
export type Actor = { uid: string; email: string };
