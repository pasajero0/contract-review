// Query keys shared by the screens, so that invalidating one refreshes every screen that reads it.
export const queryKeys = {
  documents: ['documents'] as const,
  quota: ['quota'] as const,
  document: (documentId: string) => ['document', documentId] as const,
};
