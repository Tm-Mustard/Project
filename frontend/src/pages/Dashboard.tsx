import { useRef, useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

/* ─── types ─── */
type BackendStatus = 'processing' | 'on_review' | 'rejected' | 'extraction_failed'
type Phase = 'idle' | 'uploading' | 'submitting' | 'processing' | 'on_review' | 'rejected' | 'extraction_failed' | 'network_error' | 'confirmed'

interface ExtractedField {
  id: string
  label: string
  value: string
  confidence: number
}

interface DocumentJob {
  id: string
  document_id: string
  imageUrl: string
  imagePath: string
  fileName: string
  model: 'gemini' | 'claude' | 'gpt'
  phase: Phase
  extracted: ExtractedField[]
  reason?: string
  message?: string
  confirmed: boolean
  createdAt: string
  originalFile?: File
}

interface StagedFile {
  id: string
  file: File
  preview: string
}

const MODELS = [
  {
    key: 'gemini' as const,
    title: 'Gemini',
    subtitle: 'Lightning Fast',
    description:
      'Optimized for raw speed and high throughput. Best for clean, high-quality scans and simple documents where every second counts.',
    icon: '⚡',
  },
  {
    key: 'claude' as const,
    title: 'Claude',
    subtitle: 'Maximum Accuracy',
    description:
      'Superior OCR and handwriting recognition. Excels at complex layouts, noisy images, and fine-grained detail extraction.',
    icon: '🎯',
  },
  {
    key: 'gpt' as const,
    title: 'ChatGPT',
    subtitle: 'Structured & Smart',
    description:
      'Best-in-class understanding of tables, forms, and structured layouts. Ideal for invoices, receipts, and tabular data.',
    icon: '🧠',
  },
]

/* ─── helpers ─── */
function formatDate(value: string | undefined) {
  if (!value) return '—'
  return new Date(value).toLocaleString()
}

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/* ─── component ─── */
export function Dashboard() {
  const { user, signOut, configured } = useAuth()
  const navigate = useNavigate()

  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([])
  const [selectedModel, setSelectedModel] = useState<'gemini' | 'claude' | 'gpt' | null>(null)
  const [jobs, setJobs] = useState<DocumentJob[]>([])
  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [selectedFailedIds, setSelectedFailedIds] = useState<Set<string>>(new Set())
  const inputRef = useRef<HTMLInputElement>(null)
  const pollIntervals = useRef<Map<string, number>>(new Map())

  const activeJob = jobs.find((j) => j.id === activeJobId) ?? null

  const processingJobs = jobs.filter((j) =>
    ['uploading', 'submitting', 'processing'].includes(j.phase)
  )
  const reviewJobs = jobs.filter((j) => j.phase === 'on_review')
  const confirmedJobs = jobs.filter((j) => j.phase === 'confirmed')
  const failedJobs = jobs.filter((j) =>
    ['rejected', 'extraction_failed', 'network_error'].includes(j.phase)
  )

  const allFailedSelected = failedJobs.length > 0 && failedJobs.every((j) => selectedFailedIds.has(j.id))
  const someFailedSelected = failedJobs.some((j) => selectedFailedIds.has(j.id))

  const displayName =
    user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'there'

  /* ── cleanup polling on unmount ── */
  useEffect(() => {
    return () => {
      pollIntervals.current.forEach((id) => clearInterval(id))
    }
  }, [])

  /* ── prune selected ids that no longer exist ── */
  useEffect(() => {
    const failedIds = new Set(failedJobs.map((j) => j.id))
    setSelectedFailedIds((prev) => {
      const next = new Set(prev)
      let changed = false
      for (const id of next) {
        if (!failedIds.has(id)) {
          next.delete(id)
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [failedJobs.map((j) => j.id).join(',')])

  async function onSignOut() {
    await signOut()
    navigate('/', { replace: true })
  }

  /* ── staging ── */
  function addFiles(fileList: FileList | null) {
    if (!fileList) return
    const newFiles = Array.from(fileList)
      .filter((f) => f.type.startsWith('image/'))
      .map((file) => ({
        id: generateUUID(),
        file,
        preview: URL.createObjectURL(file),
      }))
    setStagedFiles((prev) => [...prev, ...newFiles])
  }

  function removeStagedFile(id: string) {
    setStagedFiles((prev) => {
      const target = prev.find((f) => f.id === id)
      if (target) URL.revokeObjectURL(target.preview)
      return prev.filter((f) => f.id !== id)
    })
  }

  function onSelectFile(e: React.ChangeEvent<HTMLInputElement>) {
    addFiles(e.target.files)
    if (inputRef.current) inputRef.current.value = ''
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    addFiles(e.dataTransfer.files)
  }, [])

  /* ── polling ── */
  function startPolling(documentId: string) {
    stopPolling(documentId)

    const interval = window.setInterval(async () => {
      try {
        const session = await supabase.auth.getSession()
        const token = session.data.session?.access_token

        const res = await fetch(
          `${import.meta.env.VITE_API_URL}/documents/${documentId}`,
          {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          }
        )
        if (!res.ok) return
        const data = await res.json()
        handleBackendStatus(documentId, data)
      } catch {
        // silent fail — next poll in 2s
      }
    }, 2000)

    pollIntervals.current.set(documentId, interval)
  }

  function stopPolling(documentId: string) {
    const id = pollIntervals.current.get(documentId)
    if (id) {
      clearInterval(id)
      pollIntervals.current.delete(documentId)
    }
  }

  function handleBackendStatus(documentId: string, data: any) {
    const status = data.status as BackendStatus

    if (status === 'processing') {
      setJobs((prev) =>
        prev.map((j) =>
          j.document_id === documentId ? { ...j, phase: 'processing' } : j
        )
      )
      return
    }

    stopPolling(documentId)

    setJobs((prev) =>
      prev.map((j) => {
        if (j.document_id !== documentId) return j
        if (j.phase === 'confirmed') return j

        if (status === 'on_review') {
          const extracted = Object.entries(data.extracted_json ?? {}).map(
            ([label, value], i) => ({
              id: `${documentId}-${i}`,
              label,
              value: String(value),
              confidence: data.field_confidences?.[label] ?? 0.8,
            })
          )
          return {
            ...j,
            phase: 'on_review',
            extracted,
            reason: data.reason,
          }
        }

        if (status === 'rejected') {
          return { ...j, phase: 'rejected', reason: data.reason }
        }

        if (status === 'extraction_failed') {
          return {
            ...j,
            phase: 'extraction_failed',
            message:
              data.message ??
              'The document could not be processed. Please retry.',
          }
        }

        return j
      })
    )
  }

  /* ── single job pipeline ── */
  async function runPipeline(job: DocumentJob, file: File) {
    if (!user) return

    /* 1. uploading */
    setJobs((prev) =>
      prev.map((j) => (j.id === job.id ? { ...j, phase: 'uploading' } : j))
    )

    // FIX: Sanitize filename — spaces & special chars break Supabase Storage keys
    const safeFileName = file.name
      .replace(/[^a-zA-Z0-9.-]/g, '_')
      .replace(/_{2,}/g, '_')
      .replace(/^[_]+|[_]+$/g, '') || 'image'

    const path = `${user.id}/${job.document_id}/${safeFileName}`
    const { error: uploadError } = await supabase.storage
      .from('images')
      .upload(path, file, { upsert: true })

    if (uploadError) {
      setJobs((prev) =>
        prev.map((j) =>
          j.id === job.id
            ? { ...j, phase: 'network_error', message: uploadError.message }
            : j
        )
      )
      return
    }

    const { data: urlData } = supabase.storage.from('images').getPublicUrl(path)

    setJobs((prev) =>
      prev.map((j) =>
        j.id === job.id
          ? { ...j, imageUrl: urlData.publicUrl, imagePath: path }
          : j
      )
    )

    /* 2. submitting */
    setJobs((prev) =>
      prev.map((j) => (j.id === job.id ? { ...j, phase: 'submitting' } : j))
    )

    try {
      const session = await supabase.auth.getSession()
      const token = session.data.session?.access_token

      const res = await fetch(`${import.meta.env.VITE_API_URL}/imgpip`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          document_id: job.document_id,
          image_path: path,
          model: job.model,
        }),
      })

      if (!res.ok)
        throw new Error('Could not connect to the processing service')

      const data = await res.json()

      if (data.status === 'processing') {
        setJobs((prev) =>
          prev.map((j) =>
            j.id === job.id ? { ...j, phase: 'processing' } : j
          )
        )
        startPolling(job.document_id)
      } else {
        handleBackendStatus(job.document_id, data)
      }
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Could not connect to the processing service. Please try again.'
      setJobs((prev) =>
        prev.map((j) =>
          j.id === job.id ? { ...j, phase: 'network_error', message: msg } : j
        )
      )
    }
  }

  /* ── submit all staged ── */
  async function handleSubmit() {
    if (!user || !configured || stagedFiles.length === 0 || !selectedModel)
      return

    const model = selectedModel
    const files = [...stagedFiles]

    const newJobs: DocumentJob[] = files.map((staged) => ({
      id: generateUUID(),
      document_id: generateUUID(),
      imageUrl: staged.preview,
      imagePath: '',
      fileName: staged.file.name,
      model,
      phase: 'idle',
      extracted: [],
      confirmed: false,
      createdAt: new Date().toISOString(),
      originalFile: staged.file,
    }))

    setJobs((prev) => [...newJobs, ...prev])
    setStagedFiles([])
    setSelectedModel(null)

    await Promise.all(
      newJobs.map(async (job) => {
        const staged = files.find((f) => f.preview === job.imageUrl)
        if (!staged) return
        await runPipeline(job, staged.file)
      })
    )
  }

  /* ── retry extraction (backend retry, no re-upload) ── */
  async function retryExtraction(documentId: string) {
    // FIX: Look up the job so we can send image_path + model to the retry endpoint
    const job = jobs.find((j) => j.document_id === documentId)
    if (!job || !job.imagePath) return

    setJobs((prev) =>
      prev.map((j) =>
        j.document_id === documentId ? { ...j, phase: 'submitting' } : j
      )
    )

    try {
      const session = await supabase.auth.getSession()
      const token = session.data.session?.access_token

      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/documents/${documentId}/retry`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          // FIX: Backend needs image_path and model to re-run extraction
          body: JSON.stringify({
            image_path: job.imagePath,
            model: job.model,
          }),
        }
      )

      if (!res.ok) throw new Error('Retry request failed')

      const data = await res.json()
      if (data.status === 'processing') {
        setJobs((prev) =>
          prev.map((j) =>
            j.document_id === documentId ? { ...j, phase: 'processing' } : j
          )
        )
        startPolling(documentId)
      } else {
        handleBackendStatus(documentId, data)
      }
    } catch {
      setJobs((prev) =>
        prev.map((j) =>
          j.document_id === documentId
            ? {
                ...j,
                phase: 'extraction_failed',
                message: 'Retry failed. Please try again.',
              }
            : j
        )
      )
    }
  }

  /* ── retry upload (re-runs full pipeline with stored file) ── */
  async function retryUpload(jobId: string) {
    const job = jobs.find((j) => j.id === jobId)
    if (!job || !job.originalFile) return
    await runPipeline(job, job.originalFile)
  }

  /* ── batch retry all failed ── */
  async function retryAllFailed() {
    await Promise.all(
      failedJobs.map((job) => {
        if (job.phase === 'extraction_failed') {
          return retryExtraction(job.document_id)
        }
        if (job.phase === 'network_error' && job.originalFile) {
          return retryUpload(job.id)
        }
        return Promise.resolve()
      })
    )
  }

  /* ── batch retry selected failed ── */
  async function retrySelectedFailed() {
    const targets = failedJobs.filter((j) => selectedFailedIds.has(j.id))
    await Promise.all(
      targets.map((job) => {
        if (job.phase === 'extraction_failed') {
          return retryExtraction(job.document_id)
        }
        if (job.phase === 'network_error' && job.originalFile) {
          return retryUpload(job.id)
        }
        return Promise.resolve()
      })
    )
    setSelectedFailedIds(new Set())
  }

  /* ── batch cancel selected failed ── */
  function cancelSelectedFailed() {
    const toRemove = new Set(selectedFailedIds)
    setJobs((prev) => prev.filter((j) => !toRemove.has(j.id)))
    setSelectedFailedIds(new Set())
    setActiveJobId((prev) => (prev && toRemove.has(prev) ? null : prev))
  }

  /* ── select / deselect ── */
  function toggleFailedSelection(jobId: string) {
    setSelectedFailedIds((prev) => {
      const next = new Set(prev)
      if (next.has(jobId)) next.delete(jobId)
      else next.add(jobId)
      return next
    })
  }

  function toggleSelectAllFailed() {
    if (allFailedSelected) {
      setSelectedFailedIds(new Set())
    } else {
      setSelectedFailedIds(new Set(failedJobs.map((j) => j.id)))
    }
  }

  /* ── retake / remove rejected ── */
  function retakeDocument(documentId: string) {
    stopPolling(documentId)
    setJobs((prev) => prev.filter((j) => j.document_id !== documentId))
    setActiveJobId((prev) => {
      const job = jobs.find((j) => j.document_id === documentId)
      return job?.id === prev ? null : prev
    })
  }

  /* ── edit ── */
  function updateField(jobId: string, fieldId: string, value: string) {
    setJobs((prev) =>
      prev.map((j) =>
        j.id === jobId && j.phase === 'on_review'
          ? {
              ...j,
              extracted: j.extracted.map((f) =>
                f.id === fieldId ? { ...f, value } : f
              ),
            }
          : j
      )
    )
  }

  /* ── confirm ── */
  async function confirmJob(jobId: string) {
    const job = jobs.find((j) => j.id === jobId)
    if (!job || job.phase !== 'on_review') return

    await supabase.from('extractions').insert({
      user_id: user?.id,
      image_url: job.imageUrl,
      data: job.extracted,
      confirmed: true,
    })

    await supabase
      .from('extractions')
      .delete()
      .eq('user_id', user?.id)
      .eq('confirmed', false)

    setJobs((prev) =>
      prev.map((j) => (j.id === jobId ? { ...j, phase: 'confirmed' } : j))
    )
  }

  /* ── export ── */
  function exportCSV(job: DocumentJob) {
    const headers = job.extracted.map((f) => f.label).join(',')
    const values = job.extracted
      .map((f) => `"${f.value.replace(/"/g, '""')}"`)
      .join(',')
    const blob = new Blob([`${headers}\n${values}`], { type: 'text/csv' })
    downloadBlob(blob, `openlens-${job.document_id}.csv`)
  }

  function exportExcel(job: DocumentJob) {
    const rows = job.extracted
      .map(
        (f) =>
          `<Row><Cell><Data ss:Type="String">${f.label}</Data></Cell><Cell><Data ss:Type="String">${f.value}</Data></Cell></Row>`
      )
      .join('')
    const xml = `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Sheet1"><Table>${rows}</Table></Worksheet></Workbook>`
    const blob = new Blob([xml], { type: 'application/vnd.ms-excel' })
    downloadBlob(blob, `openlens-${job.document_id}.xls`)
  }

  const canSubmit =
    stagedFiles.length > 0 && selectedModel !== null && processingJobs.length === 0

  /* ─── render ─── */
  return (
    <div className="mx-auto max-w-6xl p-6">
      {/* Header */}
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-accent">
            OpenLens
          </p>
          <h1 className="mt-1 text-4xl font-bold tracking-tight text-ink">
            Welcome, {displayName}.
          </h1>
          <p className="mt-1 text-muted">
            Stage images, pick an AI model, then extract.
          </p>
        </div>
        <button
          onClick={() => void onSignOut()}
          className="rounded-lg border border-line bg-card px-4 py-2 text-sm font-medium text-ink shadow-sm transition hover:bg-paper"
        >
          Sign out
        </button>
      </header>

      {/* ── 1. Stage Images ── */}
      <section className="rounded-2xl border border-line bg-card p-6 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          1. Stage Images
        </h2>

        {stagedFiles.length > 0 && (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {stagedFiles.map((staged) => (
              <div
                key={staged.id}
                className="group relative aspect-square overflow-hidden rounded-xl border border-line"
              >
                <img
                  src={staged.preview}
                  alt={staged.file.name}
                  className="h-full w-full object-cover"
                />
                <button
                  onClick={() => removeStagedFile(staged.id)}
                  className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-danger/90 text-xs font-bold text-white opacity-0 shadow transition group-hover:opacity-100"
                  title="Remove"
                >
                  ✕
                </button>
                <span className="absolute bottom-0 left-0 right-0 truncate bg-black/50 px-2 py-1 text-[10px] text-white">
                  {staged.file.name}
                </span>
              </div>
            ))}

            <button
              onClick={() => inputRef.current?.click()}
              className="flex aspect-square flex-col items-center justify-center rounded-xl border-2 border-dashed border-line bg-paper text-muted transition hover:border-accent hover:text-accent"
            >
              <span className="text-2xl">+</span>
              <span className="mt-1 text-xs font-medium">Add more</span>
            </button>
          </div>
        )}

        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`mt-4 cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition ${
            dragOver
              ? 'border-accent bg-accent/5'
              : 'border-line bg-paper hover:border-muted'
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={onSelectFile}
            className="hidden"
          />
          <p className="text-sm font-medium text-ink">
            {dragOver ? 'Drop images here' : 'Drag & drop images here'}
          </p>
          <p className="mt-2 text-sm text-accent underline hover:text-accent-hover">
            or click to browse files
          </p>
        </div>
      </section>

      {/* ── 2. Choose AI Model ── */}
      {stagedFiles.length > 0 && (
        <section className="mt-6 rounded-2xl border border-line bg-card p-6 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
            2. Choose AI Model
          </h2>

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            {MODELS.map((m) => {
              const isSelected = selectedModel === m.key
              return (
                <button
                  key={m.key}
                  onClick={() => setSelectedModel(m.key)}
                  className={`relative rounded-xl border p-5 text-left transition ${
                    isSelected
                      ? 'border-accent bg-accent/5 ring-1 ring-accent'
                      : 'border-line bg-paper hover:bg-card hover:border-muted'
                  }`}
                >
                  {isSelected && (
                    <span className="absolute right-3 top-3 text-accent">
                      <svg
                        className="h-5 w-5"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </span>
                  )}
                  <span className="text-2xl">{m.icon}</span>
                  <h3 className="mt-2 text-lg font-bold text-ink">{m.title}</h3>
                  <p className="text-xs font-semibold uppercase tracking-wide text-accent">
                    {m.subtitle}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-muted">
                    {m.description}
                  </p>
                </button>
              )
            })}
          </div>
        </section>
      )}

      {/* ── 3. Submit ── */}
      {stagedFiles.length > 0 && (
        <div className="mt-6 flex flex-col items-center gap-3">
          <button
            onClick={() => void handleSubmit()}
            disabled={!canSubmit}
            className="w-full rounded-xl bg-accent py-3.5 text-base font-bold text-white shadow-lg transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto sm:px-16"
          >
            {processingJobs.length > 0
              ? 'Processing…'
              : `Extract ${stagedFiles.length} image${
                  stagedFiles.length > 1 ? 's' : ''
                }`}
          </button>
          {!selectedModel && processingJobs.length === 0 && (
            <p className="text-xs text-muted">Select a model above to continue</p>
          )}
        </div>
      )}

      {/* ── Processing Jobs ── */}
      {processingJobs.length > 0 && (
        <section className="mt-8 rounded-2xl border border-line bg-card p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
            Processing ({processingJobs.length})
          </h2>
          <div className="mt-3 space-y-3">
            {processingJobs.map((job) => (
              <div
                key={job.id}
                className="flex items-center gap-4 rounded-xl border border-line bg-paper p-4"
              >
                <img
                  src={job.imageUrl}
                  alt=""
                  className="h-14 w-14 shrink-0 rounded-lg border border-line object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">
                    {job.fileName}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    {job.phase === 'uploading' && (
                      <>
                        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
                        <span className="text-xs font-medium text-accent">
                          Uploading document…
                        </span>
                      </>
                    )}
                    {job.phase === 'submitting' && (
                      <>
                        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
                        <span className="text-xs font-medium text-accent">
                          Starting document analysis…
                        </span>
                      </>
                    )}
                    {job.phase === 'processing' && (
                      <>
                        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
                        <span className="text-xs font-medium text-accent">
                          Analyzing document…
                        </span>
                        <span className="text-xs text-muted">
                          Checking image quality and extracting information.
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <span className="shrink-0 rounded-full bg-accent/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-accent">
                  {job.phase}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Active Review Workspace ── */}
      {activeJob && activeJob.phase === 'on_review' && (
        <section className="mt-8 grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-line bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
                Source Image
              </h2>
              <span className="max-w-[200px] truncate text-xs text-muted">
                {activeJob.fileName}
              </span>
            </div>
            <img
              src={activeJob.imageUrl}
              alt="uploaded"
              className="mt-3 w-full rounded-xl border border-line object-contain"
            />
          </div>

          <div className="rounded-2xl border border-line bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
                Extracted Data
              </h2>
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                Needs Manual Review
              </span>
            </div>

            {activeJob.reason && (
              <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                {activeJob.reason}
              </p>
            )}

            <div className="mt-4 space-y-3">
              {activeJob.extracted.map((field) => {
                const lowConfidence = field.confidence < 0.75
                return (
                  <div key={field.id}>
                    <label className="flex items-center justify-between text-xs font-medium text-muted">
                      <span
                        className={lowConfidence ? 'font-bold text-danger' : ''}
                      >
                        {field.label}
                        {lowConfidence && ' ⚠️'}
                      </span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                          field.confidence >= 0.75
                            ? 'bg-accent/10 text-accent'
                            : 'bg-danger/10 text-danger'
                        }`}
                      >
                        {Math.round(field.confidence * 100)}%
                      </span>
                    </label>
                    <input
                      type="text"
                      value={field.value}
                      onChange={(e) =>
                        updateField(activeJob.id, field.id, e.target.value)
                      }
                      className={`mt-1 w-full rounded-lg border bg-paper px-3 py-2 text-sm text-ink outline-none transition focus:ring-1 ${
                        lowConfidence
                          ? 'border-danger focus:border-danger focus:ring-danger'
                          : 'border-line focus:border-accent focus:ring-accent'
                      }`}
                    />
                  </div>
                )
              })}
            </div>

            <div className="mt-6">
              <button
                onClick={() => confirmJob(activeJob.id)}
                className="w-full rounded-lg bg-accent py-3 text-sm font-bold text-white shadow transition hover:bg-accent-hover sm:w-auto sm:px-8"
              >
                Confirm & Save to Database
              </button>
              <p className="mt-2 text-xs text-muted">
                After confirming, you can download the data as CSV or Excel.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* ── Review Queue ── */}
      {reviewJobs.length > 0 && (
        <section className="mt-8 rounded-2xl border border-line bg-card p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
            Pending Review ({reviewJobs.length})
          </h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {reviewJobs.map((job) => (
              <button
                key={job.id}
                onClick={() => setActiveJobId(job.id)}
                className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${
                  activeJobId === job.id
                    ? 'border-accent bg-accent/5'
                    : 'border-line bg-paper hover:bg-card'
                }`}
              >
                <img
                  src={job.imageUrl}
                  alt=""
                  className="h-12 w-12 shrink-0 rounded-lg border border-line object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">
                    {job.fileName}
                  </p>
                  <p className="text-[10px] text-muted">
                    {formatDate(job.createdAt)}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                  Review
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ── Confirmed Results ── */}
      {confirmedJobs.length > 0 && (
        <>
          {activeJob && activeJob.phase === 'confirmed' && (
            <section className="mt-8 grid gap-6 lg:grid-cols-2">
              <div className="rounded-2xl border border-line bg-card p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
                    Source Image
                  </h2>
                  <span className="max-w-[200px] truncate text-xs text-muted">
                    {activeJob.fileName}
                  </span>
                </div>
                <img
                  src={activeJob.imageUrl}
                  alt="uploaded"
                  className="mt-3 w-full rounded-xl border border-line object-contain"
                />
              </div>

              <div className="rounded-2xl border border-line bg-card p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
                    Extracted Data
                  </h2>
                  <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent">
                    ✓ Confirmed
                  </span>
                </div>

                <div className="mt-4 space-y-3">
                  {activeJob.extracted.map((field) => (
                    <div key={field.id}>
                      <label className="flex items-center justify-between text-xs font-medium text-muted">
                        <span>{field.label}</span>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                            field.confidence >= 0.75
                              ? 'bg-accent/10 text-accent'
                              : 'bg-danger/10 text-danger'
                          }`}
                        >
                          {Math.round(field.confidence * 100)}%
                        </span>
                      </label>
                      <div className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink">
                        {field.value}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-6 flex flex-wrap gap-3">
                  <button
                    onClick={() => exportCSV(activeJob)}
                    className="rounded-lg border border-line bg-paper px-4 py-2 text-sm font-medium text-ink transition hover:bg-card"
                  >
                    Download CSV
                  </button>
                  <button
                    onClick={() => exportExcel(activeJob)}
                    className="rounded-lg border border-line bg-paper px-4 py-2 text-sm font-medium text-ink transition hover:bg-card"
                  >
                    Download Excel
                  </button>
                </div>
              </div>
            </section>
          )}

          <section className="mt-8 rounded-2xl border border-line bg-card p-5 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
              Confirmed & Saved ({confirmedJobs.length})
            </h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {confirmedJobs.map((job) => (
                <button
                  key={job.id}
                  onClick={() => setActiveJobId(job.id)}
                  className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${
                    activeJobId === job.id
                      ? 'border-accent bg-accent/5'
                      : 'border-line bg-paper hover:bg-card'
                  }`}
                >
                  <img
                    src={job.imageUrl}
                    alt=""
                    className="h-12 w-12 shrink-0 rounded-lg border border-line object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">
                      {job.fileName}
                    </p>
                    <p className="text-[10px] text-muted">
                      {formatDate(job.createdAt)}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent">
                    Saved
                  </span>
                </button>
              ))}
            </div>
          </section>
        </>
      )}

      {/* ── Failed Jobs ── */}
      {failedJobs.length > 0 && (
        <section className="mt-8 rounded-2xl border border-danger/20 bg-danger/5 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-danger">
              Failed Jobs ({failedJobs.length})
            </h2>

            <div className="flex flex-wrap items-center gap-2">
              <label className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-ink">
                <input
                  type="checkbox"
                  checked={allFailedSelected}
                  onChange={toggleSelectAllFailed}
                  className="h-4 w-4 rounded border-line text-accent focus:ring-accent"
                />
                Select all
              </label>

              <button
                onClick={() => void retryAllFailed()}
                className="rounded-lg border border-line bg-paper px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-card"
              >
                Retry All
              </button>

              <button
                onClick={() => void retrySelectedFailed()}
                disabled={!someFailedSelected}
                className="rounded-lg border border-line bg-paper px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-card disabled:cursor-not-allowed disabled:opacity-40"
              >
                Retry Selected
              </button>

              <button
                onClick={cancelSelectedFailed}
                disabled={!someFailedSelected}
                className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-1.5 text-xs font-medium text-danger transition hover:bg-danger/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Cancel Selected
              </button>
            </div>
          </div>

          <div className="mt-3 space-y-3">
            {failedJobs.map((job) => {
              const isSelected = selectedFailedIds.has(job.id)
              return (
                <div
                  key={job.id}
                  className={`flex items-center gap-3 rounded-xl border p-3 transition ${
                    isSelected
                      ? 'border-danger/40 bg-danger/10'
                      : 'border-danger/20 bg-card'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleFailedSelection(job.id)}
                    className="h-4 w-4 shrink-0 rounded border-line text-accent focus:ring-accent"
                  />

                  <img
                    src={job.imageUrl}
                    alt=""
                    className="h-12 w-12 shrink-0 rounded-lg border border-line object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">
                      {job.fileName}
                    </p>
                    {job.phase === 'rejected' && (
                      <p className="text-xs text-danger">
                        {job.reason ?? 'Document rejected'}
                      </p>
                    )}
                    {job.phase === 'extraction_failed' && (
                      <p className="text-xs text-danger">
                        {job.message ?? 'Processing failed'}
                      </p>
                    )}
                    {job.phase === 'network_error' && (
                      <p className="text-xs text-danger">
                        {job.message ?? 'Network error'}
                      </p>
                    )}
                  </div>

                  {job.phase === 'extraction_failed' && (
                    <button
                      onClick={() => void retryExtraction(job.document_id)}
                      className="shrink-0 rounded-lg border border-line bg-paper px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-card"
                    >
                      Retry
                    </button>
                  )}

                  {job.phase === 'rejected' && (
                    <button
                      onClick={() => retakeDocument(job.document_id)}
                      className="shrink-0 rounded-lg border border-line bg-paper px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-card"
                    >
                      New Photo
                    </button>
                  )}

                  {job.phase === 'network_error' && (
                    <button
                      onClick={() => void retryUpload(job.id)}
                      className="shrink-0 rounded-lg border border-line bg-paper px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-card"
                    >
                      Try Again
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}