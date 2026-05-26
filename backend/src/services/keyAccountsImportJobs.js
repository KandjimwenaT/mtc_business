// In-memory registry for key-accounts Excel import jobs.
//
// We run the import as a background task so the HTTP request returns
// immediately (avoids reverse-proxy 504 timeouts) while the frontend
// polls a status endpoint to render a 0-100% progress bar.
//
// NOTE: This is single-process state. The backend runs as a single Node
// process behind the proxy, so in-memory state is sufficient and avoids
// adding Redis/queue dependencies. If the process restarts, in-flight
// jobs are lost — the frontend will see the status endpoint 404 and
// surface a clear error.

const crypto = require("crypto");

// jobId -> job record
const jobs = new Map();

// How long to keep finished jobs around so the UI can still read the
// final stats after completion (10 minutes).
const COMPLETED_TTL_MS = 10 * 60 * 1000;

function newJobId() {
  return crypto.randomBytes(12).toString("hex");
}

function makeInitialJob({ totalRows, sheetName, requestedBy }) {
  const now = Date.now();
  return {
    jobId: newJobId(),
    status: "pending", // 'pending' | 'running' | 'completed' | 'failed'
    sheetName: sheetName || null,
    totalRows: typeof totalRows === "number" && totalRows > 0 ? totalRows : 0,
    processedRows: 0,
    percent: 0,
    stats: null,
    createdExecutivesCount: 0,
    unresolvedSample: [],
    unresolvedTotal: 0,
    message: null,
    error: null,
    requestedBy: requestedBy || null,
    startedAt: now,
    finishedAt: null,
  };
}

function createJob(init) {
  const job = makeInitialJob(init || {});
  jobs.set(job.jobId, job);
  return job;
}

function getJob(jobId) {
  pruneOldJobs();
  return jobs.get(jobId) || null;
}

function setJob(jobId, updates) {
  const job = jobs.get(jobId);
  if (!job) return null;
  Object.assign(job, updates);
  return job;
}

function recordProgress(jobId, processedRows) {
  const job = jobs.get(jobId);
  if (!job) return;
  job.processedRows = processedRows;
  if (job.totalRows > 0) {
    const pct = Math.floor((processedRows / job.totalRows) * 100);
    job.percent = Math.min(99, Math.max(0, pct));
  }
}

function pruneOldJobs() {
  const cutoff = Date.now() - COMPLETED_TTL_MS;
  for (const [id, job] of jobs.entries()) {
    if (
      (job.status === "completed" || job.status === "failed") &&
      job.finishedAt != null &&
      job.finishedAt < cutoff
    ) {
      jobs.delete(id);
    }
  }
}

module.exports = {
  createJob,
  getJob,
  setJob,
  recordProgress,
};
