import { defineConfig } from "@playwright/test";
import browserConfig from "./playwright.config.js";

export default defineConfig({ ...browserConfig, testDir: "./demo" });
