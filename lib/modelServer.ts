import { Client, handle_file } from "@gradio/client";

// The model server can be reached two ways, picked by environment variables (docs/DEPLOYMENT.md):
// - MODEL_SPACE set ("owner/space-name"): the Gradio Space on ZeroGPU, model-server/app.py.
// - otherwise: model-server/server.py over plain HTTP at MODEL_SERVER_URL (local, or a Docker Space).
// Both give back what server.py would: an HTTP status and its JSON body.
export type ModelServerReply = { status: number; body: any };

const secret = () => process.env.MODEL_SERVER_SECRET ?? "";
const serverUrl = () => (process.env.MODEL_SERVER_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");

// Connecting fetches the Space's config, so one connection is kept and reused.
let space: Promise<Client> | null = null;
function connectSpace(name: string) {
  space ??= Client.connect(name, {
    // ZeroGPU charges each call to the caller's daily quota; without a token it uses the smaller anonymous one.
    hf_token: process.env.HF_TOKEN as `hf_${string}` | undefined,
  }).catch((e) => {
    space = null;
    throw e;
  });
  return space;
}

async function callSpace(name: string, endpoint: string, data: Record<string, unknown>): Promise<ModelServerReply> {
  const client = await connectSpace(name);
  try {
    // app.py has one output, the reply.
    return ((await client.predict(endpoint, data)).data as ModelServerReply[])[0];
  } catch (e: any) {
    // Gradio rejects with a status message, not an Error, e.g. when the daily GPU quota is used up.
    return { status: 503, body: { error: `The model server couldn't run this: ${e?.message ?? "unknown error"}` } };
  }
}

// Throws when the server can't be reached at all.
export async function listTests(): Promise<ModelServerReply> {
  const name = process.env.MODEL_SPACE;
  if (name) return callSpace(name, "/tests", { secret: secret() });
  const res = await fetch(`${serverUrl()}/tests`, { cache: "no-store", headers: { "X-Server-Secret": secret() } });
  return { status: res.status, body: await res.json() };
}

// Throws when the server can't be reached at all.
export async function runTest(testId: string, image: Blob): Promise<ModelServerReply> {
  const name = process.env.MODEL_SPACE;
  if (name) return callSpace(name, "/analyze", { image: handle_file(image), test_id: testId, secret: secret() });
  const res = await fetch(`${serverUrl()}/tests/${testId}`, {
    method: "POST",
    headers: { "X-Server-Secret": secret(), "Content-Type": "image/png" },
    body: Buffer.from(await image.arrayBuffer()),
  });
  return { status: res.status, body: await res.json() };
}
