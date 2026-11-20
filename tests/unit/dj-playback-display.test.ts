import { describe, expect, it } from "vitest";
import {
  formatTrackTime,
  getTrackProgress,
  getTrackProgressStatus,
} from "../../apps/web/modules/dj-playback-display.js";

describe("DJ playback display helpers", () => {
  it("formats elapsed and total track time without negative values", () => {
    expect(formatTrackTime(0)).toBe("0:00");
    expect(formatTrackTime(65000)).toBe("1:05");
    expect(formatTrackTime(3599000)).toBe("59:59");
    expect(formatTrackTime(-1000)).toBe("0:00");
  });

  it("clamps progress to the track duration and calculates a rounded percentage", () => {
    expect(getTrackProgress(25000, 100000)).toEqual({
      duration: 100000,
      progress: 25000,
      percent: 25,
    });
    expect(getTrackProgress(150000, 100000)).toEqual({
      duration: 100000,
      progress: 100000,
      percent: 100,
    });
    expect(getTrackProgress(-500, 100000)).toEqual({
      duration: 100000,
      progress: 0,
      percent: 0,
    });
    expect(getTrackProgress(500, 0)).toEqual({
      duration: 0,
      progress: 0,
      percent: 0,
    });
  });

  it("describes the playback state consistently", () => {
    expect(getTrackProgressStatus(0, true)).toBe("WAITING FOR TRACK");
    expect(getTrackProgressStatus(1000, true)).toBe("TRACK PLAYING");
    expect(getTrackProgressStatus(1000, false)).toBe("TRACK PAUSED");
  });
});
