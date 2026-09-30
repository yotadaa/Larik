import { useEffect, useMemo, useRef } from "react";
import { Form, useActionData, useNavigation, useRevalidator } from "react-router";
import {
  AdjustmentsHorizontalIcon,
  ArrowPathIcon,
  BoltIcon,
  CheckCircleIcon,
  ClockIcon,
  CommandLineIcon,
  CpuChipIcon,
  ExclamationTriangleIcon,
  PauseCircleIcon,
  PlayIcon,
  QueueListIcon,
  StopIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import type { Route } from "./+types/translate";
import {
  enqueueTranslationJobs,
  getTranslationAdminState,
  retryTranslationJob,
  saveTranslationSettings,
  stopTranslationJob,
  type TranslationJobView,
} from "~/lib/translation-admin.server";
import { BRAND_NAME } from "~/lib/brand";

export const meta: Route.MetaFunction = () => [
  { title: `${BRAND_NAME} — Translation Control` },
  { name: "description", content: "Persistent multi-novel translation control plane for the local Larik pipeline." },
];

export async function loader({ request }: Route.LoaderArgs) {
  if (process.env.LARIK_APP_MODE !== "translator") throw new Response("Not found", { status: 404 });
  const url = new URL(request.url);
  const langId = (url.searchParams.get("lang") || process.env.DEFAULT_LANG_ID || "id").trim() || "id";
  return getTranslationAdminState(langId);
}

export async function action({ request }: Route.ActionArgs) {
  if (process.env.LARIK_APP_MODE !== "translator") throw new Response("Not found", { status: 404 });
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");

  if (intent === "save-settings") {
    const result = saveTranslationSettings(formData);
    return { ok: true, message: `Saved ${result.changed.length} runtime setting(s). New jobs will use the database-backed configuration.` };
  }

  if (intent === "enqueue") {
    const novelIds = formData.getAll("novelIds").map(String).filter(Boolean);
    const langId = String(formData.get("langId") || "id").trim() || "id";
    const ranges: Record<string, { start: number; end: number }> = {};
    for (const novelId of novelIds) {
      ranges[novelId] = {
        start: Number.parseInt(String(formData.get(`start:${novelId}`) || ""), 10),
        end: Number.parseInt(String(formData.get(`end:${novelId}`) || ""), 10),
      };
    }
    const result = enqueueTranslationJobs({
      novelIds,
      langId,
      ranges,
      force: formData.get("force") === "on",
      allowContextGap: formData.get("allowContextGap") === "on",
    });
    const parts = [result.created.length ? `${result.created.length} job(s) queued` : "No jobs queued"];
    if (result.skipped.length) parts.push(result.skipped.join("; "));
    return { ok: Boolean(result.created.length), message: parts.join(". ") };
  }

  if (intent === "stop" || intent === "force-stop") {
    const jobId = String(formData.get("jobId") || "");
    const result = stopTranslationJob(jobId, intent === "force-stop");
    return { ok: result.ok, message: result.message };
  }

  if (intent === "retry") {
    const jobId = String(formData.get("jobId") || "");
    const newId = retryTranslationJob(jobId);
    return { ok: Boolean(newId), message: newId ? `Retry queued as ${newId.slice(0, 8)}` : "Job not found" };
  }

  return { ok: false, message: "Unknown translation control action" };
}

function statusIcon(status: string) {
  if (status === "completed") return CheckCircleIcon;
  if (status === "failed") return XCircleIcon;
  if (status === "stopped") return PauseCircleIcon;
  if (status === "running") return BoltIcon;
  return ClockIcon;
}

function chapterClass(stage?: string) {
  if (stage === "done") return "is-done";
  if (stage === "skipped") return "is-skipped";
  if (stage === "failed") return "is-failed";
  if (stage) return "is-active";
  return "is-pending";
}

function JobCard({ job }: { job: TranslationJobView }) {
  const StatusIcon = statusIcon(job.status);
  const total = Math.max(1, job.progressTotal || job.endChapter - job.startChapter + 1);
  const current = Math.max(0, Math.min(total, job.progressCurrent));
  const percent = Math.round((current / total) * 100);
  const active = ["queued", "running", "stopping"].includes(job.status);
  const chapters = useMemo(() => Array.from({ length: Math.max(0, job.endChapter - job.startChapter + 1) }, (_, index) => job.startChapter + index), [job.startChapter, job.endChapter]);
  const chapterGridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = chapterGridRef.current;
    if (!container || !job.currentChapter) return;
    const current = container.querySelector<HTMLElement>(`[data-chapter="${job.currentChapter}"]`);
    if (!current) return;
    const containerRect = container.getBoundingClientRect();
    const currentRect = current.getBoundingClientRect();
    if (currentRect.top < containerRect.top || currentRect.bottom > containerRect.bottom) {
      const target = Math.max(0, container.scrollTop + currentRect.top - containerRect.top - container.clientHeight / 2 + currentRect.height / 2);
      container.scrollTo({ top: target, behavior: "smooth" });
    }
  }, [job.currentChapter]);

  return <article className={`translation-job translation-job--${job.status}`}>
    <header className="translation-job__header">
      <div className="translation-job__identity">
        <span className="translation-job__status-icon"><StatusIcon aria-hidden="true" /></span>
        <div>
          <p className="eyebrow">{job.langId} · chapters {job.startChapter}–{job.endChapter}</p>
          <h3>{job.novelId}</h3>
          <small>job {job.jobId.slice(0, 10)}{job.pid ? ` · pid ${job.pid}` : ""}</small>
        </div>
      </div>
      <div className="translation-job__actions">
        {active ? <Form method="post"><input type="hidden" name="jobId" value={job.jobId} /><button className="button button--ghost button--danger" name="intent" value="stop" type="submit"><StopIcon aria-hidden="true" /><span>Stop</span></button></Form> : null}
        {job.status === "stopping" ? <Form method="post"><input type="hidden" name="jobId" value={job.jobId} /><button className="button button--ghost button--danger" name="intent" value="force-stop" type="submit"><ExclamationTriangleIcon aria-hidden="true" /><span>Force stop</span></button></Form> : null}
        {["failed", "stopped"].includes(job.status) ? <Form method="post"><input type="hidden" name="jobId" value={job.jobId} /><button className="button button--ghost" name="intent" value="retry" type="submit"><ArrowPathIcon aria-hidden="true" /><span>Retry</span></button></Form> : null}
      </div>
    </header>

    <div className="translation-job__progress">
      <div className="translation-job__progress-copy"><span>{job.status}</span><strong>{job.currentChapter ? `Chapter ${job.currentChapter} · ${job.currentStage}` : job.currentStage}</strong><span>{percent}%</span></div>
      <div className="translation-job__progress-track"><span style={{ width: `${percent}%` }} /></div>
      <p>{job.message || "Waiting for pipeline events…"}</p>
    </div>

    <div className="translation-job__chapter-region">
      <div className="translation-job__chapter-summary">
        <span><strong>{chapters.length}</strong> chapters in this job</span>
        <small>Grid scrolls vertically and follows the active chapter.</small>
      </div>
      <div ref={chapterGridRef} className="translation-job__chapters" aria-label="Per-chapter translation status">
        {chapters.map((chapter) => {
          const state = job.chapterStates[chapter];
          return <span key={chapter} data-chapter={chapter} className={chapterClass(state?.stage)} title={state?.message || `Chapter ${chapter} pending`}><strong>{chapter}</strong><small>{state?.stage || "pending"}</small></span>;
        })}
      </div>
    </div>

    <details className="translation-job__events">
      <summary><CommandLineIcon aria-hidden="true" /><span>Live process events</span><small>{job.events.length} recent</small></summary>
      <ol>{job.events.map((event) => <li key={event.id}><time>{event.at}</time><strong>{event.chapter ? `Ch. ${event.chapter}` : "run"} · {event.stage}</strong><span>{event.message}</span></li>)}</ol>
      {job.logFile ? <p className="translation-job__log-path">Verbose log: <code>{job.logFile}</code></p> : null}
    </details>
  </article>;
}

export default function TranslateControl({ loaderData }: Route.ComponentProps) {
  const { databasePath, projectRoot, rawStoryRoot, langId, novels, jobs, settings, maxParallel } = loaderData;
  const actionData = useActionData<typeof action>();
  const revalidator = useRevalidator();
  const navigation = useNavigation();
  const active = jobs.some((job) => ["queued", "running", "stopping"].includes(job.status));

  useEffect(() => {
    const delay = active ? 1400 : 5000;
    const timer = window.setInterval(() => {
      if (revalidator.state === "idle" && navigation.state === "idle") revalidator.revalidate();
    }, delay);
    return () => window.clearInterval(timer);
  }, [active, navigation.state, revalidator]);

  const groups = ["connection", "budget", "context", "quality", "worker"] as const;
  const groupLabels = { connection: "LLM connection", budget: "Token & request budget", context: "Continuity context", quality: "Quality", worker: "Worker & concurrency" };

  return <div className="translation-control page-shell">
    <section className="translation-control__hero">
      <div>
        <p className="eyebrow">Persistent translation control plane</p>
        <h1>Translate without tying the job to the browser.</h1>
        <p className="lede">Queue one or many novels, run different novels in parallel, inspect every chapter stage, and stop the worker explicitly. Refreshing or closing this page does not own the Python process.</p>
      </div>
      <div className="translation-control__runtime">
        <div><CpuChipIcon aria-hidden="true" /><span><strong>{maxParallel}</strong> parallel novel/language stream{maxParallel === 1 ? "" : "s"}</span></div>
        <div><QueueListIcon aria-hidden="true" /><span><strong>{jobs.filter((job) => ["queued", "running", "stopping"].includes(job.status)).length}</strong> active / queued</span></div>
        <div><BoltIcon aria-hidden="true" /><span><strong>1</strong> raw chapter look-ahead per worker</span></div>
        <small>Safe concurrency is across independent novel/language jobs. Chapters inside one stream remain strictly sequential; only raw file I/O is prefetched.</small>
      </div>
    </section>

    {actionData ? <div className={`translation-flash${actionData.ok ? " is-success" : " is-warning"}`} role="status">{actionData.message}</div> : null}

    <section className="translation-panel">
      <div className="translation-panel__heading">
        <div><p className="eyebrow">Queue</p><h2>Select novels and chapter ranges</h2></div>
        <Form method="get" className="translation-language"><label htmlFor="translation-lang">Target language</label><input id="translation-lang" name="lang" defaultValue={langId} maxLength={20} /><button className="button button--ghost" type="submit">Load</button></Form>
      </div>
      <Form method="post" className="translation-queue-form">
        <input type="hidden" name="langId" value={langId} />
        <div className="translation-series-table">
          <div className="translation-series-row translation-series-row--head"><span>Select</span><span>Novel</span><span>Local progress</span><span>Start</span><span>End</span></div>
          {novels.map((novel) => <label className="translation-series-row" key={novel.novelId}>
            <span><input type="checkbox" name="novelIds" value={novel.novelId} /></span>
            <span><strong>{novel.novelId}</strong><small>{novel.rawChapters} raw chapter{novel.rawChapters === 1 ? "" : "s"} · {novel.complete ? "fully translated" : `next ${novel.suggestedStart}`}</small></span>
            <span><strong>{novel.completedChapters}/{novel.rawChapters}</strong><small>{novel.lastCompletedChapter ? `through Ch. ${novel.lastCompletedChapter}` : "not started"}</small></span>
            <span><input aria-label={`${novel.novelId} start chapter`} name={`start:${novel.novelId}`} type="number" min={novel.firstChapter} max={novel.lastChapter} defaultValue={novel.suggestedStart} /></span>
            <span><input aria-label={`${novel.novelId} end chapter`} name={`end:${novel.novelId}`} type="number" min={novel.firstChapter} max={novel.lastChapter} defaultValue={novel.suggestedEnd} /></span>
          </label>)}
          {!novels.length ? <div className="empty-state"><h3>No raw novels found</h3><p>Current raw root: <code>{rawStoryRoot}</code></p></div> : null}
        </div>
        <div className="translation-queue-options">
          <label><input type="checkbox" name="force" /> <span>Force retranslation even when cache is current</span></label>
          <label><input type="checkbox" name="allowContextGap" /> <span>Allow context gap for intentionally non-contiguous imports</span></label>
          <button className="button button--primary" name="intent" value="enqueue" type="submit" disabled={navigation.state !== "idle"}><PlayIcon aria-hidden="true" /><span>Queue selected novels</span></button>
        </div>
      </Form>
    </section>

    <section className="translation-panel">
      <div className="translation-panel__heading"><div><p className="eyebrow">Jobs</p><h2>Chapter-by-chapter status</h2></div><span className={`translation-live${active ? " is-active" : ""}`}><span />{active ? "Live polling" : "Idle"}</span></div>
      <div className="translation-job-list">{jobs.length ? jobs.map((job) => <JobCard key={job.jobId} job={job} />) : <div className="empty-state"><h3>No translation jobs yet</h3><p>Choose one or more novels above. Their workers will persist independently from page refreshes.</p></div>}</div>
    </section>

    <details className="translation-panel translation-settings">
      <summary><AdjustmentsHorizontalIcon aria-hidden="true" /><div><p className="eyebrow">Database-backed environment</p><h2>Runtime translation configuration</h2></div><span>Configure</span></summary>
      <div className="translation-settings__note"><strong>Worker configuration lives in SQLite.</strong><span>New jobs receive these values as process environment variables. API keys stay server-side; an empty API-key field keeps the stored key.</span></div>
      <Form method="post" className="translation-settings__form">
        {groups.map((group) => <fieldset key={group}><legend>{groupLabels[group]}</legend><div className="translation-settings__grid">{settings.filter((item) => item.group === group).map((item) => <label key={item.key}><span>{item.label}</span>{item.type === "select" ? <select name={item.key} defaultValue={item.value}>{item.options?.map((option) => <option key={option} value={option}>{option || "default / unset"}</option>)}</select> : <input name={item.key} type={item.type === "password" ? "password" : item.type === "number" ? "number" : "text"} step={item.type === "number" && /THRESHOLD|TEMPERATURE|SECONDS/.test(item.key) ? "any" : undefined} defaultValue={item.secret ? "" : item.value} placeholder={item.secret && item.configured ? "Configured — leave blank to keep" : undefined} autoComplete={item.secret ? "new-password" : undefined} />}<small>{item.help || item.key}</small></label>)}</div></fieldset>)}
        <div className="translation-settings__footer"><div><small>Project</small><code>{projectRoot}</code><small>Database</small><code>{databasePath}</code></div><button className="button button--primary" name="intent" value="save-settings" type="submit"><AdjustmentsHorizontalIcon aria-hidden="true" /><span>Save runtime configuration</span></button></div>
      </Form>
    </details>
  </div>;
}
