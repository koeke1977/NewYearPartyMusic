// Application-facing actions for DJ AI suggestions and queue proposals.
// Keeps sequential writes, duplicate handling and partial failures out of DOM event handlers.
export async function addSelectedDjTracks({ tracks, addTrack, onProgress = () => {} }) {
  const results = { added: [], alreadyQueued: [], failed: [] };
  for (const track of tracks) {
    try {
      const result = await addTrack(track);
      if (result?.alreadyQueued) results.alreadyQueued.push(track);
      else results.added.push(track);
    } catch (error) {
      results.failed.push({ track, error: error instanceof Error ? error.message : String(error) });
    }
    onProgress({
      completed: results.added.length + results.alreadyQueued.length + results.failed.length,
      total: tracks.length,
      results,
    });
  }
  return results;
}

export async function applyDjQueueProposal({ proposedIds, queuedIds, saveOrder }) {
  const uniqueIds = new Set(proposedIds);
  if (!queuedIds.length || proposedIds.length !== queuedIds.length ||
      uniqueIds.size !== queuedIds.length ||
      queuedIds.some(id => !uniqueIds.has(id))) {
    return { applied: false, reason: "incomplete-or-duplicate-proposal" };
  }
  await saveOrder(proposedIds);
  return { applied: true, order: proposedIds };
}
