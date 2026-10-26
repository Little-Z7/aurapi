// Seedance video generation through the Mai Token gateway (api.mai-token.com).
//
// The plugin serves the same Seedance model names as the doubao plugin, so a
// client switches between Ark and Mai Token by token group alone. Mai Token
// bills each task at submission on the requested seconds and resolution SKU,
// not on tokens, and it does not clamp or validate durations: an unlisted
// duration is accepted, charged in full and rendered shorter. Every limit
// below is therefore enforced before a request leaves the gateway.
//
// Request shapes differ per model (all measured against the live gateway):
// - Seedance 2.0: SKU per resolution, `seconds` as a string, Ark-style
//   `content[]` with roles, optional `generate_audio`.
// - Seedance 2.0 Mini: `contract_version: "video-v1"`, integer `duration`,
//   lower-case `resolution`, `references[]` of {type, role, source}.
// - Seedance 2.5: a single 720p SKU, integer `duration`, `images[]` for image
//   references, `content[]` once audio or video references are present.
const MODELS = {
  "doubao-seedance-2-0-260128": {
    shape: "sd",
    skus: { "480p": "sd-2.0-480p", "720p": "sd-2.0-720p", "1080p": "sd-2.0-1080p" },
    minSeconds: 5,
    maxSeconds: 15,
    ratios: ["16:9", "9:16", "1:1", "21:9"],
    limits: { image: 9, video: 3, audio: 3 },
    lastFrame: true,
    audioSwitch: true,
  },
  "doubao-seedance-2-0-mini-260615": {
    shape: "video-v1",
    skus: { "480p": "sd-mini-480p", "720p": "sd-mini-720p" },
    minSeconds: 4,
    maxSeconds: 15,
    ratios: ["16:9", "9:16", "1:1", "3:4", "4:3", "21:9"],
    limits: { image: 9, video: 3, audio: 3 },
    lastFrame: true,
    audioSwitch: false,
  },
  "doubao-seedance-2-5-260628": {
    shape: "sd25",
    skus: { "720p": "sd-2.5-720p" },
    minSeconds: 5,
    maxSeconds: 30,
    ratios: ["16:9", "9:16", "1:1", "21:9"],
    limits: { image: 30, video: 10, audio: 10 },
    lastFrame: false,
    audioSwitch: false,
  },
};
const DEFAULT_SECONDS = 5;
const DEFAULT_RESOLUTION = "720p";
const CONTENT_TYPES = { image: "image_url", video: "video_url", audio: "audio_url" };
const REFERENCE_ROLES = { image: "reference_image", video: "reference_video", audio: "reference_audio" };

function usageSchema(profile) {
  const resolutions = Object.keys(profile.skus);
  const labels = {};
  for (const resolution of resolutions) labels[resolution] = { en: resolution, zh: resolution };
  return {
    // Requested seconds; Mai Token charges them at submission whatever it renders.
    seconds: {
      type: "number",
      unit: "second",
      description: { en: "Video generation unit price", zh: "视频生成单价" },
    },
    // Each resolution is a separate Mai Token SKU with its own per-second price.
    resolution: {
      enum: resolutions,
      enumLabels: labels,
      description: { en: "Output video resolution", zh: "输出视频分辨率" },
    },
  };
}

function usageExamples(profile) {
  return Object.keys(profile.skus).map((resolution) => ({ label: resolution + " · 5s", facts: { seconds: 5, resolution: resolution } }));
}

export const meta = {
  apiVersion: 1,
  key: "maitoken",
  name: "Mai Token",
  icon: "text:MT",
  description: {
    en: "Seedance video generation through the Mai Token gateway",
    zh: "通过 Mai Token 网关生成 Seedance 视频",
  },
  version: "1.0.0",
  author: { name: "aurapi" },
  baseUrl: "https://api.mai-token.com",
  models: Object.keys(MODELS),
  fetchMode: "per_task",
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
    if (Object.prototype.hasOwnProperty.call(MODELS, model)) return { model: model, profile: MODELS[model] };
  }
  throw new Error("model " + trimmed(ctx && ctx.model) + " is not available through Mai Token");
}

function requestedSeconds(req, metadata, profile) {
  let raw = req.seconds;
  if (raw === undefined || raw === null || raw === "") raw = req.duration;
  if (raw === undefined || raw === null || raw === "") raw = metadata.duration;
  if (raw === undefined || raw === null || raw === "") return DEFAULT_SECONDS < profile.minSeconds ? profile.minSeconds : DEFAULT_SECONDS;
  const seconds = Number(raw);
  if (!Number.isInteger(seconds) || seconds < profile.minSeconds || seconds > profile.maxSeconds)
    throw new Error("seconds must be a whole number from " + profile.minSeconds + " to " + profile.maxSeconds + " on Mai Token");
  return seconds;
}

function requestedResolution(req, metadata, profile) {
  const raw = trimmed(metadata.resolution || req.resolution || req.size).toLowerCase();
  let resolution = raw || DEFAULT_RESOLUTION;
  const parts = raw.replace("*", "x").split("x");
  if (parts.length === 2) {
    const longest = Math.max(Number(parts[0]), Number(parts[1]));
    if (longest >= 1920) resolution = "1080p";
    else if (longest >= 1280) resolution = "720p";
    else resolution = "480p";
  }
  if (!Object.prototype.hasOwnProperty.call(profile.skus, resolution))
    throw new Error("resolution must be one of " + Object.keys(profile.skus).join(", ") + " on Mai Token");
  return resolution;
}

function requestedRatio(req, metadata, profile) {
  const ratio = trimmed(metadata.ratio || req.ratio);
  if (!ratio) return "";
  // The SKU models do not validate ratios: an unknown one is charged and rendered at 16:9.
  if (!profile.ratios.includes(ratio)) throw new Error("ratio must be one of " + profile.ratios.join(", ") + " on Mai Token");
  return ratio;
}

function referenceURL(value, kind) {
  const url = trimmed(value && typeof value === "object" ? value.url : value);
  if (!url) throw new Error(kind + " reference url is required");
  // Mai Token downloads references itself and only from public HTTPS URLs.
  if (!/^https:\/\//i.test(url)) throw new Error(kind + " references must be public https URLs on Mai Token");
  return url;
}

function requestedReferences(req, metadata) {
  if (trimmed(req.input_reference) || trimmed(req.image)) throw new Error("pass reference images in images or metadata.content on Mai Token");
  const references = [];
  if (req.images !== undefined && !Array.isArray(req.images)) throw new Error("images must be an array");
  for (const image of req.images || []) references.push({ kind: "image", role: REFERENCE_ROLES.image, url: referenceURL(image, "image") });
  if (metadata.content !== undefined && !Array.isArray(metadata.content)) throw new Error("metadata.content must be an array");
  for (const item of metadata.content || []) {
    if (!item || typeof item !== "object" || Array.isArray(item) || item.type === "text") continue;
    const kind = Object.keys(CONTENT_TYPES).find((name) => item.type === CONTENT_TYPES[name]);
    if (!kind) throw new Error("content type " + trimmed(item.type) + " is not supported on Mai Token");
    const role = trimmed(item.role) || REFERENCE_ROLES[kind];
    const imageRole = ["reference_image", "first_frame", "last_frame"].includes(role);
    if (kind === "image" ? !imageRole : role !== REFERENCE_ROLES[kind]) throw new Error("role " + role + " does not match a " + kind + " reference");
    references.push({ kind: kind, role: role, url: referenceURL(item[CONTENT_TYPES[kind]], kind) });
  }
  return references;
}

function validateReferences(references, profile) {
  const counts = { image: 0, video: 0, audio: 0 };
  for (const reference of references) counts[reference.kind] += 1;
  for (const kind of ["image", "video", "audio"]) {
    if (counts[kind] > profile.limits[kind]) throw new Error("at most " + profile.limits[kind] + " " + kind + " references are accepted on Mai Token");
  }
  // Mai Token rejects audio- or video-only references after charging the task.
  if ((counts.audio || counts.video) && !counts.image) throw new Error("audio or video references need at least one reference image on Mai Token");
  const roles = references.map((reference) => reference.role);
  if (!roles.some((role) => role === "first_frame" || role === "last_frame")) return;
  if (roles[0] !== "first_frame" || roles.length > 2 || (roles.length === 2 && roles[1] !== "last_frame"))
    throw new Error("frame mode takes a first_frame image, optionally followed by a last_frame image, and no other references");
  if (roles.length === 2 && !profile.lastFrame) throw new Error("last_frame is not supported for this model on Mai Token");
}

// The single source of the submitted seconds, SKU and body; usage facts and
// the upstream request are both derived from it.
function videoPlan(ctx) {
  const selected = modelProfile(ctx);
  const profile = selected.profile;
  const req = ctx.requestBody || {};
  const metadata = objectValue(req.metadata, "metadata");
  const seconds = requestedSeconds(req, metadata, profile);
  const resolution = requestedResolution(req, metadata, profile);
  const ratio = requestedRatio(req, metadata, profile);
  let generateAudio = metadata.generate_audio;
  if (generateAudio === undefined) generateAudio = req.generate_audio;
  if (generateAudio !== undefined && typeof generateAudio !== "boolean") throw new Error("generate_audio must be a boolean");
  // Only Seedance 2.0 honours the switch; the others would bill a silent request and return audio.
  if (generateAudio === false && !profile.audioSwitch) throw new Error("silent output is not supported for this model on Mai Token");
  const references = requestedReferences(req, metadata);
  validateReferences(references, profile);
  const prompt = trimmed(req.prompt);
  if (!prompt && !references.length) throw new Error("prompt is required");
  return {
    model: selected.model,
    profile: profile,
    seconds: seconds,
    resolution: resolution,
    ratio: ratio,
    generateAudio: generateAudio,
    references: references,
    prompt: prompt,
  };
}

function contentItem(reference) {
  const item = { type: CONTENT_TYPES[reference.kind], role: reference.role };
  item[CONTENT_TYPES[reference.kind]] = { url: reference.url };
  return item;
}

function upstreamBody(plan) {
  const sku = plan.profile.skus[plan.resolution];
  if (plan.profile.shape === "video-v1") {
    const body = { contract_version: "video-v1", model: sku, prompt: plan.prompt, duration: plan.seconds, resolution: plan.resolution };
    if (plan.ratio) body.ratio = plan.ratio;
    if (plan.references.length) body.references = plan.references.map((reference) => ({ type: reference.kind, role: reference.role, source: reference.url }));
    return body;
  }
  if (plan.profile.shape === "sd25") {
    const body = { model: sku, prompt: plan.prompt, duration: plan.seconds };
    if (plan.ratio) body.ratio = plan.ratio;
    if (plan.references.some((reference) => reference.kind !== "image"))
      body.content = [{ type: "text", text: plan.prompt }].concat(plan.references.map(contentItem));
    else if (plan.references.length) body.images = plan.references.map((reference) => reference.url);
    return body;
  }
  // The top-level prompt is validated by the gateway; content[0].text carries the @image references.
  const body = {
    model: sku,
    prompt: plan.prompt,
    seconds: String(plan.seconds),
    content: [{ type: "text", text: plan.prompt }].concat(plan.references.map(contentItem)),
  };
  if (plan.ratio) body.ratio = plan.ratio;
  if (plan.generateAudio !== undefined) body.generate_audio = plan.generateAudio;
  return body;
}

function upstreamError(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return "";
  const error = body.error && typeof body.error === "object" ? body.error : null;
  if (error && trimmed(error.message)) return (trimmed(error.code) ? trimmed(error.code) + ": " : "") + trimmed(error.message);
  if (!body.id && !body.task_id && trimmed(body.message)) return (trimmed(body.code) ? trimmed(body.code) + ": " : "") + trimmed(body.message);
  return "";
}

function videoURL(data) {
  if (!data || typeof data !== "object") return "";
  const result = data.result && typeof data.result === "object" ? data.result : {};
  const metadata = data.metadata && typeof data.metadata === "object" ? data.metadata : {};
  return trimmed(data.video_url) || trimmed(result.url) || trimmed(metadata.url);
}

export function buildSubmitRequest(ctx) {
  const plan = videoPlan(ctx);
  return {
    url: ctx.baseUrl + "/v1/videos",
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: "Bearer " + ctx.apiKey },
    body: upstreamBody(plan),
    action: plan.references.length ? "image_to_video" : "text_to_video",
  };
}

export function parseSubmitResponse(ctx, resp) {
  const body = resp.body;
  const declared = upstreamError(body);
  if (declared) throw new Error(declared);
  const taskId = trimmed(body && (body.id || body.task_id));
  if (!taskId) throw new Error("task_id is empty");
  return { taskId: taskId, taskData: body };
}

export function extractUsage(ctx) {
  if (ctx.usagePurpose === "billing_ratios") return null;
  const plan = videoPlan(ctx);
  return { seconds: plan.seconds, resolution: plan.resolution };
}

// The submission charge is final: Mai Token bills the requested seconds and
// reports no usage that could change it.
export function extractUsageOnComplete() {
  return {};
}

export function buildQueryRequest(ctx) {
  return {
    url: ctx.baseUrl + "/v1/videos/" + encodeURIComponent(ctx.taskId),
    method: "GET",
    headers: { Accept: "application/json", Authorization: "Bearer " + ctx.apiKey },
  };
}

function progressOf(value) {
  const number = Number(String(value === undefined || value === null ? "" : value).replace("%", ""));
  return Number.isFinite(number) && number > 0 && number < 100 ? Math.round(number) + "%" : "";
}

export function parseTaskResult(ctx, body) {
  const statuses = {
    queued: "QUEUED",
    pending: "QUEUED",
    submitted: "QUEUED",
    in_progress: "IN_PROGRESS",
    processing: "IN_PROGRESS",
    running: "IN_PROGRESS",
    completed: "SUCCESS",
    succeeded: "SUCCESS",
    success: "SUCCESS",
    failed: "FAILURE",
    failure: "FAILURE",
    cancelled: "FAILURE",
    expired: "FAILURE",
  };
  const status = statuses[trimmed(body && body.status).toLowerCase()];
  if (!status) return { status: "UNKNOWN", reason: "unrecognized status: " + trimmed(body && body.status) };
  if (status === "FAILURE") return { status: "FAILURE", progress: "100%", reason: upstreamError(body) || "video generation failed" };
  if (status === "SUCCESS") {
    const url = videoURL(body);
    // A completed task without its video is not finished yet from the client's view.
    if (!url) return { status: "UNKNOWN", reason: "completed task has no video url" };
    return { status: "SUCCESS", progress: "100%", url: url };
  }
  const result = { status: status };
  const progress = progressOf(body.progress);
  if (progress) result.progress = progress;
  return result;
}

export function listArtifacts(task) {
  return task.status === "SUCCESS" && videoURL(task.data) ? [{ key: "video", type: "video" }] : [];
}

export function buildContentRequest(ctx) {
  const url = ctx.artifactKey === "video" ? videoURL(ctx.data) : "";
  if (!url) throw new Error("artifact_not_found");
  return { url: url, method: ctx.clientRequest.method, credentialless: true };
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
      const images = [];
      for (const image of (req.images || []).concat(input.images)) {
        if (trimmed(image) && !images.includes(trimmed(image))) images.push(trimmed(image));
      }
      if (!prompt && !images.length) throw new Error("input is required");
      const metadata = Object.assign({}, objectValue(req.metadata, "metadata"));
      for (const key of ["resolution", "ratio", "generate_audio"]) {
        if (Object.prototype.hasOwnProperty.call(req, key)) metadata[key] = req[key];
      }
      const requestBody = { model: model, prompt: prompt, metadata: metadata };
      if (images.length) requestBody.images = images;
      if (Object.prototype.hasOwnProperty.call(req, "seconds")) requestBody.seconds = req.seconds;
      else if (Object.prototype.hasOwnProperty.call(req, "duration")) requestBody.seconds = req.duration;
      if (Object.prototype.hasOwnProperty.call(req, "size")) requestBody.size = req.size;
      return { kind: "submit", model: model, action: images.length ? "image_to_video" : "text_to_video", requestBody: requestBody };
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
        metadata: { vendor: "maitoken" },
      };
    },
  },
  openai_video: {
    // Validation runs after channel selection (extractUsage), so a request
    // meant for another plugin's channel is never rejected here.
    decodeRequest: function (ctx) {
      if (!ctx.body || ctx.body.kind !== "json") throw new Error("JSON body required; Mai Token takes references as https URLs");
      const req = ctx.body.value;
      if (!req || typeof req !== "object" || Array.isArray(req)) throw new Error("JSON object required");
      const requestBody = Object.assign({}, req, { model: ctx.model });
      const seconds = req.seconds === undefined ? req.duration : req.seconds;
      if (seconds !== undefined) requestBody.seconds = seconds;
      const metadata = req.metadata && typeof req.metadata === "object" ? req.metadata : {};
      const hasReference =
        (Array.isArray(req.images) && req.images.length > 0) ||
        (Array.isArray(metadata.content) && metadata.content.some((item) => item && item.type !== "text"));
      return { kind: "submit", model: ctx.model, action: hasReference ? "image_to_video" : "text_to_video", requestBody: requestBody };
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
