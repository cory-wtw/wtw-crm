/**
 * Just enough of Firestore for the veteran soft-delete tests: get, update,
 * orderBy, array-contains, and an auditLog collection that records adds.
 */
type Doc = Record<string, unknown>;

export function fakeFirestore(seed: Record<string, Record<string, Doc>>) {
  const store = new Map<string, Map<string, Doc>>();
  for (const [name, docs] of Object.entries(seed)) {
    store.set(name, new Map(Object.entries(docs).map(([id, d]) => [id, { ...d }])));
  }
  const col = (name: string) => {
    if (!store.has(name)) store.set(name, new Map());
    return store.get(name)!;
  };
  const snapOf = (id: string, data: Doc | undefined) => ({
    id,
    exists: data !== undefined,
    data: () => (data ? { ...data } : undefined),
  });
  const query = (name: string, filter: (d: Doc) => boolean = () => true) => ({
    orderBy: () => query(name, filter),
    where: (field: string, _op: string, value: unknown) =>
      query(name, (d) => filter(d) && ((d[field] as unknown[]) ?? []).includes(value)),
    get: async () => ({
      docs: [...col(name).entries()]
        .filter(([, d]) => filter(d))
        .map(([id, d]) => snapOf(id, d)),
    }),
  });

  const adminDb = {
    runTransaction: async <T>(
      fn: (tx: {
        get: (ref: { get: () => Promise<unknown> }) => Promise<unknown>;
        update: (ref: { update: (p: Doc) => Promise<void> }, patch: Doc) => void;
      }) => Promise<T>,
    ): Promise<T> => {
      const writes: (() => Promise<void>)[] = [];
      const result = await fn({
        get: (ref) => ref.get(),
        update: (ref, patch) => void writes.push(() => ref.update(patch)),
      });
      for (const w of writes) await w();
      return result;
    },
    collection: (name: string) => ({
      ...query(name),
      doc: (id: string) => ({
        get: async () => snapOf(id, col(name).get(id)),
        update: async (patch: Doc) => {
          col(name).set(id, { ...col(name).get(id), ...patch });
        },
      }),
      add: async (doc: Doc) => {
        const id = `auto${col(name).size + 1}`;
        col(name).set(id, doc);
        return { id };
      },
    }),
  };
  return { adminDb, store, col };
}

const now = new Date("2026-11-01T12:00:00Z");

export function veteranDoc(o: Doc = {}): Doc {
  return {
    firstName: "Sam",
    lastInitial: "D",
    preferredContact: "phone",
    phone: "4235550100",
    pipelineStage: "found",
    pipelineHistory: [],
    vsoIds: [],
    createdBy: "u1",
    createdAt: now,
    updatedBy: "u1",
    updatedAt: now,
    ...o,
  };
}
