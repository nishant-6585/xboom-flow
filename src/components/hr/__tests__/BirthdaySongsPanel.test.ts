import { describe, it, expect } from "vitest";
import {
  ACCEPTED_AUDIO_EXTENSIONS,
  daysUntilBirthday,
  isAcceptedAudioFile,
} from "../BirthdaySongsPanel";

describe("isAcceptedAudioFile", () => {
  it("accepts every browser-playable audio format", () => {
    for (const ext of ACCEPTED_AUDIO_EXTENSIONS) {
      expect(isAcceptedAudioFile(`song.${ext}`)).toBe(true);
      expect(isAcceptedAudioFile(`SONG.${ext.toUpperCase()}`)).toBe(true);
    }
  });

  it("rejects non-audio and unplayable formats", () => {
    for (const name of ["song.wma", "song.aiff", "notes.txt", "song.mp3.exe", "song"]) {
      expect(isAcceptedAudioFile(name)).toBe(false);
    }
  });
});

describe("daysUntilBirthday", () => {
  it("returns 0 on the birthday itself", () => {
    expect(daysUntilBirthday("1995-07-26", new Date(2026, 6, 26))).toBe(0);
  });

  it("counts days to an upcoming birthday this year", () => {
    expect(daysUntilBirthday("1995-08-01", new Date(2026, 6, 26))).toBe(6);
  });

  it("rolls over to next year when the birthday has passed", () => {
    expect(daysUntilBirthday("1995-07-25", new Date(2026, 6, 26))).toBe(364);
  });

  it("maps Feb 29 birthdays to Feb 28 in non-leap years", () => {
    // 2026 is not a leap year: the birthday is observed on Feb 28.
    expect(daysUntilBirthday("1996-02-29", new Date(2026, 1, 28))).toBe(0);
  });

  it("keeps Feb 29 birthdays on Feb 29 in leap years", () => {
    expect(daysUntilBirthday("1996-02-29", new Date(2028, 1, 28))).toBe(1);
  });
});
