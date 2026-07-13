import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { build } from "esbuild";

const exec = promisify(execFile);
const root = path.resolve(import.meta.dirname, "..");
const packageJson = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
const releaseVersion = packageJson.version;
const buildRoot = path.join(root, ".release-build");
const cacheRoot = path.join(root, ".release-cache");
const artifactsRoot = path.join(root, "releases", `v${releaseVersion}`);
const nodeVersion = process.env.AGENT_NODE_VERSION || process.versions.node;
const postject = path.join(root, "node_modules", ".bin", "postject");
const fuse = "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2";

const run = async (file, args, options = {}) => {
  process.stdout.write(`> ${path.basename(file)} ${args.join(" ")}\n`);
  const result = await exec(file, args, { cwd: root, maxBuffer: 20 * 1024 * 1024, ...options });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return result;
};

const listFiles = async (dir, prefix = "") => {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = path.join(prefix, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(path.join(dir, entry.name), relative));
    else if (entry.isFile()) files.push(relative);
  }
  return files.sort();
};

const sha256 = async (file) => {
  const hash = crypto.createHash("sha256");
  hash.update(await fs.readFile(file));
  return hash.digest("hex");
};

const download = async (url, target) => {
  try {
    await fs.access(target);
    return;
  } catch {}
  process.stdout.write(`Downloading ${url}\n`);
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`Download failed (${response.status}): ${url}`);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, Buffer.from(await response.arrayBuffer()));
};

const verifiedNodeArchive = async (filename) => {
  const base = `https://nodejs.org/dist/v${nodeVersion}`;
  const archive = path.join(cacheRoot, filename);
  const sumsFile = path.join(cacheRoot, `SHASUMS256-v${nodeVersion}.txt`);
  await download(`${base}/SHASUMS256.txt`, sumsFile);
  await download(`${base}/${filename}`, archive);
  const sums = await fs.readFile(sumsFile, "utf8");
  const match = sums.split(/\r?\n/).find((line) => line.endsWith(`  ${filename}`));
  if (!match) throw new Error(`No checksum published for ${filename}`);
  const expected = match.split(/\s+/)[0];
  const actual = await sha256(archive);
  if (actual !== expected) throw new Error(`Checksum mismatch for ${filename}`);
  return archive;
};

const prepareAssets = async () => {
  const assets = {};
  for (const relative of await listFiles(path.join(root, "dist"))) {
    assets[`dist/${relative.split(path.sep).join("/")}`] = path.join(root, "dist", relative);
  }
  const skills = [];
  for (const relative of await listFiles(path.join(root, "skills"))) {
    if (path.basename(relative) !== "SKILL.md") continue;
    const asset = `skills/${relative.split(path.sep).join("/")}`;
    assets[asset] = path.join(root, "skills", relative);
    skills.push({ path: relative.split(path.sep).join("/"), asset });
  }
  const manifestFile = path.join(buildRoot, "release-manifest.json");
  await fs.writeFile(manifestFile, `${JSON.stringify({ skills }, null, 2)}\n`);
  assets["release-manifest.json"] = manifestFile;
  return assets;
};

const injectSea = async (sourceBinary, outputBinary, blob, macho = false) => {
  await fs.copyFile(sourceBinary, outputBinary);
  await fs.chmod(outputBinary, 0o755);
  if (macho) await run("/usr/bin/codesign", ["--remove-signature", outputBinary]);
  else await stripPeSignature(outputBinary);
  const args = [outputBinary, "NODE_SEA_BLOB", blob, "--sentinel-fuse", fuse];
  if (macho) args.push("--macho-segment-name", "NODE_SEA");
  await run(postject, args);
  if (macho) await run("/usr/bin/codesign", ["--force", "--sign", "-", outputBinary]);
};

const stripPeSignature = async (file) => {
  let bytes = await fs.readFile(file);
  if (bytes.toString("ascii", 0, 2) !== "MZ") throw new Error("Invalid Windows executable");
  const pe = bytes.readUInt32LE(0x3c);
  if (bytes.toString("ascii", pe, pe + 4) !== "PE\0\0") throw new Error("Invalid PE header");
  const optional = pe + 24;
  const magic = bytes.readUInt16LE(optional);
  const directories = optional + (magic === 0x20b ? 112 : 96);
  const security = directories + (4 * 8);
  const certificateOffset = bytes.readUInt32LE(security);
  const certificateSize = bytes.readUInt32LE(security + 4);
  bytes.writeUInt32LE(0, security);
  bytes.writeUInt32LE(0, security + 4);
  if (certificateOffset > 0 && certificateOffset + certificateSize === bytes.length) {
    bytes = bytes.subarray(0, certificateOffset);
  }
  await fs.writeFile(file, bytes);
};

const makeWindows = async (blob) => {
  const filename = `node-v${nodeVersion}-win-x64.zip`;
  const archive = await verifiedNodeArchive(filename);
  const extractRoot = path.join(buildRoot, "node-win");
  await fs.rm(extractRoot, { recursive: true, force: true });
  await fs.mkdir(extractRoot, { recursive: true });
  await run("/usr/bin/unzip", ["-q", archive, "-d", extractRoot]);
  const source = path.join(extractRoot, `node-v${nodeVersion}-win-x64`, "node.exe");
  const stage = path.join(buildRoot, "AgentChat-windows-x64");
  await fs.rm(stage, { recursive: true, force: true });
  await fs.mkdir(stage, { recursive: true });
  await injectSea(source, path.join(stage, "AgentChat.exe"), blob, false);
  await fs.writeFile(path.join(stage, "README.txt"), [
    "Agent Chat for Windows x64",
    "",
    "Double-click AgentChat.exe. The browser opens automatically.",
    "Keep the console window open while using Agent Chat; close it to stop the service.",
    "Data is stored in %APPDATA%\\Agent Chat.",
    "No Node.js installation is required.",
    "",
  ].join("\r\n"));
  const zip = path.join(artifactsRoot, "AgentChat-windows-x64.zip");
  await fs.rm(zip, { force: true });
  await run("/usr/bin/zip", ["-q", "-r", zip, path.basename(stage)], { cwd: buildRoot });
};

const makeMac = async (blob) => {
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  const filename = `node-v${nodeVersion}-darwin-${arch}.tar.gz`;
  const archive = await verifiedNodeArchive(filename);
  const extractRoot = path.join(buildRoot, "node-mac");
  await fs.rm(extractRoot, { recursive: true, force: true });
  await fs.mkdir(extractRoot, { recursive: true });
  await run("/usr/bin/tar", ["-xzf", archive, "-C", extractRoot]);
  const source = path.join(extractRoot, `node-v${nodeVersion}-darwin-${arch}`, "bin", "node");
  const app = path.join(buildRoot, "Agent Chat.app");
  const contents = path.join(app, "Contents");
  const macos = path.join(contents, "MacOS");
  const resources = path.join(contents, "Resources");
  await fs.rm(app, { recursive: true, force: true });
  await fs.mkdir(macos, { recursive: true });
  await fs.mkdir(resources, { recursive: true });
  await injectSea(source, path.join(macos, "AgentChat"), blob, true);
  const sourceIcon = path.join(root, "extension", "icons", "icon-128.png");
  await run("/usr/bin/sips", ["-s", "format", "icns", sourceIcon, "--out", path.join(resources, "AppIcon.icns")]);
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleDisplayName</key><string>Agent Chat</string>
  <key>CFBundleExecutable</key><string>AgentChat</string>
  <key>CFBundleIdentifier</key><string>com.realuckyang.agentchat</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>CFBundleName</key><string>Agent Chat</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>${releaseVersion}</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>LSMinimumSystemVersion</key><string>11.0</string>
  <key>LSUIElement</key><false/>
</dict></plist>
`;
  await fs.writeFile(path.join(contents, "Info.plist"), plist);
  await run("/usr/bin/codesign", ["--force", "--deep", "--sign", "-", app]);
  const zip = path.join(artifactsRoot, `AgentChat-macos-${arch}.zip`);
  await fs.rm(zip, { force: true });
  await run("/usr/bin/ditto", ["-c", "-k", "--sequesterRsrc", "--keepParent", app, zip]);
};

await fs.rm(buildRoot, { recursive: true, force: true });
await fs.mkdir(buildRoot, { recursive: true });
await fs.mkdir(cacheRoot, { recursive: true });
await fs.mkdir(artifactsRoot, { recursive: true });
await run(process.execPath, [path.join(root, "node_modules", "vite", "bin", "vite.js"), "build"]);

const bundle = path.join(buildRoot, "agent.cjs");
await build({
  entryPoints: [path.join(root, "server", "index.js")],
  outfile: bundle,
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  define: { "import.meta.url": JSON.stringify("file:///agent-chat/sea-entry.js") },
  logLevel: "info",
});

const seaConfig = path.join(buildRoot, "sea-config.json");
const blob = path.join(buildRoot, "sea-prep.blob");
await fs.writeFile(seaConfig, `${JSON.stringify({
  main: bundle,
  output: blob,
  disableExperimentalSEAWarning: true,
  useSnapshot: false,
  useCodeCache: false,
  assets: await prepareAssets(),
}, null, 2)}\n`);
await run(process.execPath, ["--experimental-sea-config", seaConfig]);
await makeWindows(blob);
await makeMac(blob);

const checksums = [];
for (const name of (await fs.readdir(artifactsRoot)).filter((name) => name.endsWith(".zip")).sort()) {
  checksums.push(`${await sha256(path.join(artifactsRoot, name))}  ${name}`);
}
await fs.writeFile(path.join(artifactsRoot, "SHA256SUMS.txt"), `${checksums.join("\n")}\n`);
process.stdout.write(`Release artifacts: ${artifactsRoot}\n`);
