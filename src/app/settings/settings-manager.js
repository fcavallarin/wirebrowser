import SettingsDatabase from "#src/app/settings/db.js";
import { existsSync, readFileSync } from "fs";
import path from "path";
import defaultData from "./defaults.js"
import os from "os";

class SettingsManager {
  constructor(uiEvents) {
    this.uiEvents = uiEvents;
    this.settings = null;
    this.dbFilename = null;

    this.uiEvents.on("settings.set", async (data) => {
      await this.set(data);
    });
    this.uiEvents.on("settings.get", async () => {
      await this.read();
      this.uiEvents.dispatch("loadSettings", this.settings);
    });
    this.uiEvents.on("settings.setDbFile", async (filename) => {
      if (!filename) {
        filename = path.join(
          os.tmpdir(),
          "wirebrowser-tmp-project.json"
        );
      }
      if (existsSync(filename)) {
        try {
          const fc = readFileSync(filename, "utf8");
          const j = JSON.parse(fc);
          if (typeof j !== "object") {
            throw ""
          }
        } catch (e) {
          this.uiEvents.dispatch("Error", "Reading JSON file");
          return;
        }
      }
      this.dbFilename = filename;
      this.db = new SettingsDatabase(this.dbFilename, defaultData);
      await this.read();
      if (!existsSync(this.dbFilename)) {
        await this.db.write();
      }
      this.uiEvents.dispatch("loadSettings", this.settings);
    });
  }

  read = async () => {
    this.settings = await this.db.get();
  }

  get = () => {
    return this.settings;
  }

  set = async (value) => {
    await this.db.set(value);
    await this.read();
  }

  // Changes made by the main process (e.g. the MCP server). The GUI saves the
  // whole settings object, so it is sent the new settings: a stale copy in the
  // GUI would overwrite these changes on its next save.
  update = async (fn) => {
    if (!this.db) {
      throw new Error("No project is open");
    }
    await this.read();
    const next = structuredClone(this.settings);
    fn(next);
    await this.set(next);
    this.uiEvents.dispatch("loadSettings", this.settings);
    return this.settings;
  }
}

export default SettingsManager;