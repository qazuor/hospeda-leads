import { createDecipheriv, createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { readFile, writeFile } from "node:fs/promises";

const input=process.argv[2];
const output=process.argv[3]||"migration-data.json";
const keyB64=process.env.MIGRATION_DATA_KEY;

if(!input)throw new Error("Usage: node scripts/decrypt-migration.mjs <encrypted-file> [output-file]");
if(!keyB64)throw new Error("MIGRATION_DATA_KEY is required");

const envelope=JSON.parse(await readFile(input,"utf8"));
if(envelope.version!==1||envelope.algorithm!=="aes-256-gcm"||envelope.compression!=="gzip"){
  throw new Error("Unsupported migration envelope");
}

const key=Buffer.from(keyB64,"base64");
if(key.length!==32)throw new Error("MIGRATION_DATA_KEY must decode to 32 bytes");

const decipher=createDecipheriv("aes-256-gcm",key,Buffer.from(envelope.iv,"base64"));
decipher.setAuthTag(Buffer.from(envelope.tag,"base64"));
const gzip=Buffer.concat([
  decipher.update(Buffer.from(envelope.data,"base64")),
  decipher.final()
]);
const plain=gunzipSync(gzip);

const sha=createHash("sha256").update(plain).digest("hex");
if(envelope.plaintextSha256&&sha!==envelope.plaintextSha256){
  throw new Error("Migration dump checksum mismatch");
}

await writeFile(output,plain,{mode:0o600});
console.log(JSON.stringify({
  output,
  bytes:plain.length,
  sha256:sha,
  counts:envelope.counts??null
}));
