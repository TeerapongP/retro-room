import { spawn } from "node:child_process";
import { resolve } from "node:path";

const mode = process.argv[2];
if (mode !== "mock" && mode !== "emulator") throw new Error("Expected mock or emulator mode");

const env = { ...process.env };
if (mode === "mock") {
  env.NEXT_PUBLIC_MOCK_MODE = "true";
  env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR = "false";
} else {
  env.NEXT_PUBLIC_MOCK_MODE = "false";
  env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR = "true";
}

const child = spawn(process.execPath, [resolve("node_modules/next/dist/bin/next"), "dev", ...process.argv.slice(3)], {
  env,
  stdio: "inherit",
});

child.once("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});
child.once("exit", (code) => { process.exitCode = code ?? 1; });
