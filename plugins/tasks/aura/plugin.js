// Seedance video generation through the Aura 灵环 open API (`/v1`), on its
// 超能版 channel (RunningHub account pool, BytePlus Global models).
//
// The plugin serves the same Seedance model names as the doubao and maitoken
// plugins, so a client switches upstreams by token group alone. Aura charges
// the calling account when the task is accepted and refunds it when the task
// fails; it clamps an unsupported duration, resolution or ratio to a default
// and reports that only in `downgrades`. Every limit below is therefore
// enforced before a request leaves the gateway, and a submission that comes
// back downgraded fails instead of billing the client for what it asked for.
//
// Limits are the 超能版 channel caps of each Aura model. References are not
// forwarded: Aura takes them only as asset ids uploaded under its own account.
const MODELS = {
  "doubao-seedance-2-0-260128": {
    aura: "seedance-2-global",
    resolutions: ["480p", "720p", "1080p", "2k", "4k", "native1080p", "native4k"],
    minSeconds: 4,
    maxSeconds: 15,
    billedMinSeconds: 4,
  },
  "doubao-seedance-2-0-fast-260128": {
    aura: "seedance-2-fast-global",
    resolutions: ["480p", "720p", "1080p", "2k", "4k"],
    minSeconds: 4,
    maxSeconds: 15,
    billedMinSeconds: 4,
  },
  "doubao-seedance-2-0-mini-260615": {
    aura: "seedance-2-mini",
    resolutions: ["480p", "720p", "1080p", "2k", "4k"],
    minSeconds: 4,
    maxSeconds: 15,
    billedMinSeconds: 4,
  },
  // Aura bills a Seedance 2.5 video shorter than 5 seconds as 5 seconds.
  "doubao-seedance-2-5-260628": {
    aura: "seedance-2-5-global",
    resolutions: ["480p", "720p", "1080p", "2k", "4k", "native1080p"],
    minSeconds: 4,
    maxSeconds: 30,
    billedMinSeconds: 5,
  },
};
const AURA_CHANNEL = "super";
const AURA_RESOLUTIONS = {
  "480p": "480P",
  "720p": "720P",
  "1080p": "1080P",
  "2k": "2K",
  "4k": "4K",
  native1080p: "原生1080P",
  native4k: "原生4K",
};
const RESOLUTION_LABELS = {
  "480p": { en: "480p", zh: "480p" },
  "720p": { en: "720p", zh: "720p" },
  "1080p": { en: "1080p (upscaled)", zh: "1080p（超分）" },
  "2k": { en: "2K (upscaled)", zh: "2K（超分）" },
  "4k": { en: "4K (upscaled)", zh: "4K（超分）" },
  native1080p: { en: "Native 1080p", zh: "原生 1080p" },
  native4k: { en: "Native 4K", zh: "原生 4K" },
};
const RATIOS = ["adaptive", "16:9", "4:3", "1:1", "3:4", "9:16", "21:9"];
const DEFAULT_SECONDS = 5;
const DEFAULT_RESOLUTION = "720p";
// Output links are presigned URLs of Aura's object storage, served on its own port.
const STORAGE_HOST = "auraaigc.ccwu.cc:56813";

function usageSchema(profile) {
  const labels = {};
  for (const resolution of profile.resolutions) labels[resolution] = RESOLUTION_LABELS[resolution];
  return {
    // Billed seconds: the requested duration, raised to the model's billed minimum.
    seconds: {
      type: "number",
      unit: "second",
      description: { en: "Video generation unit price", zh: "视频生成单价" },
    },
    // Each resolution has its own per-second price on Aura.
    resolution: {
      enum: profile.resolutions,
      enumLabels: labels,
      description: { en: "Output video resolution", zh: "输出视频分辨率" },
    },
  };
}

function usageExamples(profile) {
  return profile.resolutions.map((resolution) => ({ label: resolution + " · 5s", facts: { seconds: 5, resolution: resolution } }));
}

export const meta = {
  apiVersion: 1,
  key: "aura",
  name: "Aura 灵环",
  icon: "text:AU",
  description: {
    en: "Seedance video generation through the Aura open API",
    zh: "通过灵环开放接口生成 Seedance 视频",
  },
  version: "1.0.0",
  author: { name: "aurapi" },
  baseUrl: "https://auraaigc.ccwu.cc:8603",
  models: Object.keys(MODELS),
  fetchMode: "per_task",
  allowedHosts: [STORAGE_HOST],
  usageSchema: usageSchema(MODELS["doubao-seedance-2-0-260128"]),
  usageExamples: usageExamples(MODELS["doubao-seedance-2-0-260128"]),
  usageProfiles: Object.keys(MODELS).map((model) => ({ models: [model], schema: usageSchema(MODELS[model]), examples: usageExamples(MODELS[model]) })),
  protocols: [{ name: "openai_responses", supports: ["stream", "sync", "background"] }, "openai_video"],
};

function trimmed(value) {
  return String(value || "").trim();
}

function objectValue(value, name) {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object" || Array.isArray(value)) throw new Error(name + " must be an object");
  return value;
}

function modelProfile(ctx) {
  for (const model of [ctx && ctx.upstreamModel, ctx && ctx.model].map(trimmed)) {
    if (Object.prototype.hasOwnProperty.call(MODELS, model)) return MODELS[model];
  }
  throw new Error("model " + trimmed(ctx && ctx.model) + " is not available through Aura");
}

function requestedSeconds(req, metadata, profile) {
  let raw = req.seconds;
  if (raw === undefined || raw === null || raw === "") raw = req.duration;
  if (raw === undefined || raw === null || raw === "") raw = metadata.duration;
  if (raw === undefined || raw === null || raw === "") return DEFAULT_SECONDS;
  const seconds = Number(raw);
  if (!Number.isInteger(seconds) || seconds < profile.minSeconds || seconds > profile.maxSeconds)
    throw new Error("seconds must be a whole number from " + profile.minSeconds + " to " + profile.maxSeconds + " on Aura");
  return seconds;
}

function requestedResolution(req, metadata, profile) {
  const raw = trimmed(metadata.resolution || req.resolution || req.size).toLowerCase();
  let resolution = raw.replace("原生", "native").replace(/\s+/g, "") || DEFAULT_RESOLUTION;
  const parts = raw.replace("*", "x").split("x");
  if (parts.length === 2) {
    const longest = Math.max(Number(parts[0]), Number(parts[1]));
    if (longest >= 3840) resolution = "4k";
    else if (longest >= 2560) resolution = "2k";
    else if (longest >= 1920) resolution = "1080p";
    else if (longest >= 1280) resolution = "720p";
    else resolution = "480p";
  }
  if (!profile.resolutions.includes(resolution)) throw new Error("resolution must be one of " + profile.resolutions.join(", ") + " on Aura");
  return resolution;
}

function requestedRatio(req, metadata) {
  const ratio = trimmed(metadata.ratio || req.ratio);
  if (!ratio) return "";
  if (!RATIOS.includes(ratio)) throw new Error("ratio must be one of " + RATIOS.join(", ") + " on Aura");
  return ratio;
}

function hasReferences(req, metadata) {
  if (trimmed(req.input_reference) || trimmed(req.image)) return true;
  if (Array.isArray(req.images) && req.images.length) return true;
  if (Array.isArray(req.references) && req.references.length) return true;
  return Array.isArray(metadata.content) && metadata.content.some((item) => item && typeof item === "object" && item.type !== "text");
}

// The single source of the submitted seconds, resolution and body; usage facts
// and the upstream request are both derived from it.
function videoPlan(ctx) {
  const profile = modelProfile(ctx);
  const req = ctx.requestBody || {};
  const metadata = objectValue(req.metadata, "metadata");
  const seconds = requestedSeconds(req, metadata, profile);
  const resolution = requestedResolution(req, metadata, profile);
  const ratio = requestedRatio(req, metadata);
  let generateAudio = metadata.generate_audio;
  if (generateAudio === undefined) generateAudio = req.generate_audio;
  if (generateAudio !== undefined && typeof generateAudio !== "boolean") throw new Error("generate_audio must be a boolean");
  if (hasReferences(req, metadata)) throw new Error("reference images, videos and audio are not supported through Aura; send a text prompt only");
  const prompt = trimmed(req.prompt);
  if (!prompt) throw new Error("prompt is required");
  if (prompt.length > 20000) throw new Error("prompt must be at most 20000 characters on Aura");
  return {
    profile: profile,
    seconds: seconds,
    billedSeconds: Math.max(seconds, profile.billedMinSeconds),
    resolution: resolution,
    ratio: ratio,
    generateAudio: generateAudio,
    prompt: prompt,
  };
}

function upstreamError(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return "";
  const error = body.error && typeof body.error === "object" ? body.error : null;
  if (!error) return "";
  const message = trimmed(error.message) || trimmed(error.hint);
  if (!message) return "";
  return (trimmed(error.code) ? trimmed(error.code) + ": " : "") + message;
}

function videoOutput(data) {
  const outputs = data && Array.isArray(data.outputs) ? data.outputs : [];
  return outputs.find((output) => output && typeof output === "object" && trimmed(output.asset_id)) || null;
}

export function buildSubmitRequest(ctx) {
  const plan = videoPlan(ctx);
  const body = {
    model: plan.profile.aura,
    channel: AURA_CHANNEL,
    prompt: plan.prompt,
    duration: plan.seconds + "s",
    resolution: AURA_RESOLUTIONS[plan.resolution],
    // Aura's automatic retry may move a failed task to another channel at another price.
    retry_policy: null,
  };
  if (plan.ratio) body.ratio = plan.ratio;
  if (plan.generateAudio !== undefined) body.generate_audio = plan.generateAudio;
  const headers = { "Content-Type": "application/json", Accept: "application/json", Authorization: "Bearer " + ctx.apiKey };
  if (trimmed(ctx.publicTaskId)) headers["Idempotency-Key"] = trimmed(ctx.publicTaskId);
  return { url: ctx.baseUrl + "/v1/videos/generations", method: "POST", headers: headers, body: body, action: "text_to_video" };
}

export function parseSubmitResponse(ctx, resp) {
  const body = resp.body;
  const declared = upstreamError(body);
  if (declared) throw new Error(declared);
  const taskId = trimmed(body && body.task_id);
  if (!taskId) throw new Error("task_id is empty");
  // Aura has already charged the downgraded task; the client is not billed for it.
  if (Array.isArray(body.downgrades) && body.downgrades.length)
    throw new Error("Aura changed the requested parameters (" + body.downgrades.join("; ") + "), task " + taskId + " was not accepted");
  return { taskId: taskId, taskData: body };
}

export function extractUsage(ctx) {
  if (ctx.usagePurpose === "billing_ratios") return null;
  const plan = videoPlan(ctx);
  return { seconds: plan.billedSeconds, resolution: plan.resolution };
}

// The submission charge is final: Aura bills the requested seconds when it
// accepts the task and refunds a failed task in full.
export function extractUsageOnComplete() {
  return {};
}

export function buildQueryRequest(ctx) {
  return {
    url: ctx.baseUrl + "/v1/tasks/" + encodeURIComponent(ctx.taskId),
    method: "GET",
    headers: { Accept: "application/json", Authorization: "Bearer " + ctx.apiKey },
  };
}

function progressOf(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 && number < 100 ? Math.round(number) + "%" : "";
}

export function parseTaskResult(ctx, body) {
  const statuses = { queued: "QUEUED", running: "IN_PROGRESS", succeeded: "SUCCESS", failed: "FAILURE" };
  const status = statuses[trimmed(body && body.status).toLowerCase()];
  if (!status) return { status: "UNKNOWN", reason: "unrecognized status: " + trimmed(body && body.status) };
  if (status === "FAILURE") return { status: "FAILURE", progress: "100%", reason: upstreamError(body) || "video generation failed" };
  if (status === "SUCCESS") {
    // A succeeded task without its video is not finished yet from the client's view.
    if (!videoOutput(body)) return { status: "UNKNOWN", reason: "succeeded task has no video output" };
    return { status: "SUCCESS", progress: "100%" };
  }
  const result = { status: status };
  const progress = progressOf(body.progress);
  if (progress) result.progress = progress;
  return result;
}

export function listArtifacts(task) {
  return task.status === "SUCCESS" && videoOutput(task.data) ? [{ key: "video", type: "video", mimeType: "video/mp4" }] : [];
}

// Output links expire after 30 minutes, so each download asks Aura for a fresh
// one. A link on Aura's public origin is reached through the channel base URL,
// the address of the same server inside the deployment network.
export function buildContentRequest(ctx) {
  if (ctx.artifactKey !== "video") throw new Error("artifact_not_found");
  const response = utils.fetch({
    url: ctx.baseUrl + "/v1/tasks/" + encodeURIComponent(ctx.upstreamTaskId),
    headers: { Accept: "application/json", Authorization: "Bearer " + ctx.apiKey },
  });
  if (response.status !== 200) throw new Error("Aura task lookup returned HTTP " + response.status);
  const output = videoOutput(response.body);
  const link = trimmed(output && output.url);
  if (!link) throw new Error("artifact_not_found");
  const parsed = /^https?:\/\/([^/?#]+)([/?#].*)?$/i.exec(link);
  if (!parsed) throw new Error("Aura returned an invalid video link");
  const base = /^(https?:\/\/)([^/?#:]+)(:\d+)?/i.exec(ctx.baseUrl);
  let url = link;
  if (parsed[1].toLowerCase() !== STORAGE_HOST) {
    const hostname = parsed[1].replace(/:\d+$/, "").toLowerCase();
    if (!base || hostname !== base[2].toLowerCase()) throw new Error("Aura returned a video link on an unexpected host");
    url = base[0] + (parsed[2] || "/");
  }
  // The link carries its own signature; the channel key is not sent with it.
  return { url: url, method: ctx.clientRequest.method };
}

function responsesInput(req) {
  const texts = [];
  const images = [];
  const input = req.input;
  if (typeof input === "string") texts.push(input);
  else if (Array.isArray(input)) {
    for (const item of input) {
      if (typeof item === "string") {
        texts.push(item);
        continue;
      }
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const content = item.content === undefined ? [item] : Array.isArray(item.content) ? item.content : [item.content];
      for (const part of content) {
        if (typeof part === "string") {
          texts.push(part);
          continue;
        }
        if (!part || typeof part !== "object" || Array.isArray(part)) continue;
        if (["input_text", "text"].includes(part.type) && typeof part.text === "string") texts.push(part.text);
        if (["input_image", "image_url"].includes(part.type)) {
          let image = part.image_url;
          if (image && typeof image === "object") image = image.url;
          if (trimmed(image)) images.push(trimmed(image));
        }
      }
    }
  }
  return { prompt: texts.filter((text) => trimmed(text)).join("\n"), images: images };
}

function responsesVideoText(ctx) {
  const artifact = ctx && ctx.artifacts && ctx.artifacts.video;
  const url = trimmed(artifact && artifact.url);
  if (!url) throw new Error("video artifact is unavailable");
  const escaped = url.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return '<video controls src="' + escaped + '"></video>';
}

export const protocols = {
  openai_responses: {
    decodeRequest: function (ctx) {
      if (!ctx.body || ctx.body.kind !== "json") throw new Error("JSON body required");
      const req = ctx.body.value;
      if (!req || typeof req !== "object" || Array.isArray(req)) throw new Error("request body must be an object");
      const model = trimmed(req.model);
      if (!model) throw new Error("model is required");
      if (req.input !== undefined && typeof req.input !== "string" && !Array.isArray(req.input)) throw new Error("input must be a string or array");
      if (req.images !== undefined && !Array.isArray(req.images)) throw new Error("images must be an array");
      const input = responsesInput(req);
      const prompt = input.prompt || trimmed(req.prompt);
      const images = (req.images || []).concat(input.images).filter((image) => trimmed(image));
      if (!prompt && !images.length) throw new Error("input is required");
      const metadata = Object.assign({}, objectValue(req.metadata, "metadata"));
      for (const key of ["resolution", "ratio", "generate_audio"]) {
        if (Object.prototype.hasOwnProperty.call(req, key)) metadata[key] = req[key];
      }
      const requestBody = { model: model, prompt: prompt, metadata: metadata };
      // Kept so that the driver rejects them instead of silently dropping them.
      if (images.length) requestBody.images = images;
      if (Object.prototype.hasOwnProperty.call(req, "seconds")) requestBody.seconds = req.seconds;
      else if (Object.prototype.hasOwnProperty.call(req, "duration")) requestBody.seconds = req.duration;
      if (Object.prototype.hasOwnProperty.call(req, "size")) requestBody.size = req.size;
      return { kind: "submit", model: model, action: "text_to_video", requestBody: requestBody };
    },
    renderEvents: function (ctx, task, previousState) {
      const status = String(task.status || "UNKNOWN").toUpperCase();
      const value = Number(String(task.progress || "").replace("%", ""));
      const progress = Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
      const state = { status: status, progress: progress };
      if (status === "SUCCESS") {
        const events = previousState && previousState.status === status ? [] : [{ type: "output", data: responsesVideoText(ctx) }];
        return { events: events, state: state, done: true };
      }
      if (status === "FAILURE")
        return { events: [{ type: "error", code: "task_failed", message: task.fail_reason || "task failed" }], state: state, done: true };
      if (previousState && previousState.status === status && previousState.progress === progress) return { events: [], state: state, done: false };
      const event = { type: "progress", message: status.toLowerCase() };
      if (progress !== null) event.progress = progress;
      return { events: [event], state: state, done: false };
    },
    renderFinal: function (ctx) {
      return {
        output: [
          {
            type: "message",
            status: "completed",
            role: "assistant",
            content: [{ type: "output_text", text: responsesVideoText(ctx), annotations: [], logprobs: [] }],
          },
        ],
        metadata: { vendor: "aura" },
      };
    },
  },
  openai_video: {
    // Validation runs after channel selection (extractUsage), so a request
    // meant for another plugin's channel is never rejected here.
    decodeRequest: function (ctx) {
      if (!ctx.body || ctx.body.kind !== "json") throw new Error("JSON body required; Aura takes a text prompt only");
      const req = ctx.body.value;
      if (!req || typeof req !== "object" || Array.isArray(req)) throw new Error("JSON object required");
      const requestBody = Object.assign({}, req, { model: ctx.model });
      const seconds = req.seconds === undefined ? req.duration : req.seconds;
      if (seconds !== undefined) requestBody.seconds = seconds;
      return { kind: "submit", model: ctx.model, action: "text_to_video", requestBody: requestBody };
    },
    render: function (ctx, task) {
      const statuses = { NOT_START: "queued", SUBMITTED: "queued", QUEUED: "queued", IN_PROGRESS: "in_progress", SUCCESS: "completed", FAILURE: "failed" };
      const output = {
        id: task.task_id,
        object: "video",
        model: task.properties ? task.properties.origin_model_name || "" : "",
        status: statuses[task.status] || "unknown",
        progress: Number(String(task.progress || "0").replace("%", "")),
        created_at: task.created_at,
        completed_at: task.updated_at,
      };
      if (task.status === "FAILURE") output.error = { code: "video_generation_failed", message: task.fail_reason || "video generation failed" };
      return output;
    },
  },
};
