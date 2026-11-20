// Sequential DJ-confirmed additions; queue reordering remains a separate manual DJ action.
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
