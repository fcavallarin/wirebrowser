import { existsSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { app } from "electron";
import { getCurrentDir } from "#src/app/utils.js";


class AppSettingsManager {
  constructor(uiEvents) {
    this.uiEvents = uiEvents;
    this.settings = null;
    this.settingsFile = path.join(app.isPackaged
      ? app.getPath("userData")
      : path.join(getCurrentDir(import.meta.url), "..", ".."),
      "appsettings.json"
    );

    this.uiEvents.on("appSettings.set", (data) => {
      this.set(data);
    });
    this.uiEvents.on("appSettings.get", () => {
      this.read();
      this.uiEvents.dispatch("loadAppSettings", this.settings);
    });

    if (!existsSync(this.settingsFile)) {
      this.set({
        checkForUpdates: true
      });
    }
    this.read();
    this.uiEvents.dispatch("loadAppSettings", this.settings);
  }

  read = () => {
    this.settings = JSON.parse(readFileSync(this.settingsFile));
  }

  get = () => {
    return this.settings;
  }

  set = (value) => {
    this.settings = value;
    this.write();
  }

  write = () => {
    writeFileSync(this.settingsFile, JSON.stringify(this.settings), "utf8");
  }
}

export default AppSettingsManager;