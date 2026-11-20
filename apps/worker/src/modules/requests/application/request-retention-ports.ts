export interface CompletedRequestRetentionRepository {
  deleteExpiredCompletedRequests(): Promise<void>;
}
