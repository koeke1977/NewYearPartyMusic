import { createLatestRequestController } from "./dj-request-guard.js";
import { createSerialTaskQueue } from "./dj-serial-task-queue.js";

// Coordinates Spotify status reads and transport commands without retrying non-idempotent actions.
export function createDjPlaybackCoordinator({
  getToken,
  sendCommand,
  refreshStatus,
  onCommandSuccess = () => {},
  onCommandError = () => {},
}) {
  const statusRequests = createLatestRequestController();
  const commands = createSerialTaskQueue();

  return {
    beginStatus() {
      if (commands.isBusy()) return null;
      return statusRequests.begin();
    },
    isStatusCurrent(requestId) {
      return statusRequests.isCurrent(requestId);
    },
    completeStatus(requestId) {
      return statusRequests.complete(requestId);
    },
    invalidate() {
      statusRequests.invalidate();
      commands.invalidate();
    },
    async runCommand(action) {
      const commandToken = getToken();
      statusRequests.invalidate();

      if (!commandToken) return { skipped: true };

      let result;
      try {
        result = await commands.enqueue(async ({ isCurrent }) => {
          if (!isCurrent() || getToken() !== commandToken) return { skipped: true };
          await sendCommand(action);
          if (!isCurrent() || getToken() !== commandToken) return { skipped: true };
          onCommandSuccess(action);
          return { sent: true };
        });
      } catch (error) {
        if (getToken() === commandToken) onCommandError(error);
        result = { error };
      } finally {
        if (!commands.isBusy() && getToken() === commandToken) {
          await refreshStatus();
        }
      }
      return result;
    },
  };
}
