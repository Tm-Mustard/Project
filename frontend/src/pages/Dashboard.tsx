import { useRef, useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import geminiLogo from '../assets/gemini-logo.jpeg'
import nemotron from "../assets/nemotron.png"
import qwen from "../assets/qwen_logo.webp"

/* ─── types ─── */
type BackendStatus = 'processing' | 'on_review' | 'rejected' | 'extraction_failed'
type Phase = 'idle' | 'uploading' | 'submitting' | 'processing' | 'on_review' | 'rejected' | 'extraction_failed' | 'network_error' | 'confirmed' | 'cancelled'

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
  model: 'gemini' | 'qwen' | 'nemotron'
  phase: Phase
  extracted: ExtractedField[]
  reason?: string
  message?: string
  confirmed: boolean
  createdAt: string
  originalFile?: File
  deletedFromStorage?: boolean
}

interface StagedFile {
  id: string
  file: File
  preview: string
}

interface HistoryRecord {
  id: string
  image_url: string
  data: ExtractedField[]
  created_at: string
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

const MODELS = [
  {
    key: 'gemini' as const,
    title: 'Gemini',
    subtitle: 'Maximum Accuracy',
    description: 'Superior OCR and handwriting recognition. Excels at complex layouts, noisy images, and fine-grained detail extraction.',
    logo: geminiLogo,
  },
  {
    key: 'qwen' as const,
    title: 'Qwen',
    subtitle: 'Fastest Model',
    description: 'Optimized for raw speed and high throughput. Best for clean, high-quality scans and simple documents where every second counts.',
    logo: qwen,
  },
  {
    key: 'nemotron' as const,
    title: 'Nemotron',
    subtitle: 'Balanced Model',
    description: 'Versatile and reliable across a wide range of document types. Handles mixed content, tables, and structured forms with consistent, predictable results.',
    logo: nemotron,
  },
]

const STORAGE_KEY = 'openlens_dashboard_state'

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

async function compressImage(file: File, maxWidth = 2048, quality = 0.95): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      let { width, height } = img
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width)
        width = maxWidth
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('Canvas not supported'))
      ctx.drawImage(img, 0, 0, width, height)
      canvas.toBlob(
        (blob) => {
          if (!blob) return reject(new Error('Compression failed'))
          const ext = file.name.split('.').pop()?.toLowerCase()
          const type = ext === 'png' ? 'image/png' : 'image/jpeg'
          const compressed = new File([blob], file.name, {
            type,
            lastModified: Date.now(),
          })
          resolve(compressed)
        },
        'image/jpeg',
        quality
      )
    }
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = URL.createObjectURL(file)
  })
}

/* ─── component ─── */
export function Dashboard() {
  const { user, signOut, configured } = useAuth()
  const navigate = useNavigate()

  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([])
  const [selectedModel, setSelectedModel] = useState<'gemini' | 'qwen' | 'nemotron' | null>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      return raw ? (JSON.parse(raw).selectedModel ?? null) : null
    } catch { return null }
  })
  const [jobs, setJobs] = useState<DocumentJob[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return []
      const state = JSON.parse(raw)
      if (!state.jobs || !Array.isArray(state.jobs)) return []
      return state.jobs
        .filter((j: DocumentJob) => !j.imageUrl?.startsWith('blob:'))
        .map((j: DocumentJob) => ({ ...j, originalFile: undefined }))
    } catch { return [] }
  })
  const [activeJobId, setActiveJobId] = useState<string | null>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      return raw ? (JSON.parse(raw).activeJobId ?? null) : null
    } catch { return null }
  })
  const [dragOver, setDragOver] = useState(false)
  const [selectedFailedIds, setSelectedFailedIds] = useState<Set<string>>(new Set())
  const [history, setHistory] = useState<HistoryRecord[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [mergeViewOpen, setMergeViewOpen] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const pollIntervals = useRef<Map<string, number>>(new Map())

  const cancelledIds = useRef<Set<string>>(new Set())
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

  const displayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'there'


  /* ── restart polling for in-progress jobs after refresh ── */
  useEffect(() => {
    jobs.forEach((j) => {
      if (j.phase === 'processing') startPolling(j.document_id)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  /* ── persist state ── */
  useEffect(() => {
    try {
      const persistable = jobs.map((j) => {
        const { originalFile, ...rest } = j
        return rest
      })
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ jobs: persistable, selectedModel, activeJobId }))
    } catch { /* ignore */ }
  }, [jobs, selectedModel, activeJobId])

  /* ── load history from supabase ── */
  useEffect(() => {
    if (!user) return
    supabase
      .from('extractions')
      .select('*')
      .eq('user_id', user.id)
      .eq('confirmed', true)
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => {
        if (data) setHistory(data as HistoryRecord[])
      })
  }, [user, confirmedJobs.length])

  /* ── scroll chat to bottom ── */
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

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
    localStorage.removeItem(STORAGE_KEY)
    navigate('/', { replace: true })
  }

  /* ── staging with compression ── */
  async function addFiles(fileList: FileList | null) {
    if (!fileList) return
    const files = Array.from(fileList).filter((f) => f.type.startsWith('image/'))
    const compressed = await Promise.all(
      files.map(async (file) => {
        try {
          const cf = await compressImage(file)
          return {
            id: generateUUID(),
            file: cf,
            preview: URL.createObjectURL(cf),
          }
        } catch {
          // fallback to original if compression fails
          return {
            id: generateUUID(),
            file,
            preview: URL.createObjectURL(file),
          }
        }
      })
    )
    setStagedFiles((prev) => [...prev, ...compressed])
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
          { headers: token ? { Authorization: `Bearer ${token}` } : {} }
        )
        if (!res.ok) return
        const data = await res.json()
        handleBackendStatus(documentId, data)
      } catch { /* silent */ }
    }, 2000)
    pollIntervals.current.set(documentId, interval)
  }
  function cancelJob(jobId: string) {
    const job = jobs.find((j) => j.id === jobId)
    if (!job) return
    cancelledIds.current.add(job.document_id)
    stopPolling(job.document_id)
    setJobs((prev) => prev.filter((j) => j.id !== jobId))
    setActiveJobId((prev) => (prev === jobId ? null : prev))
  }

  function stopPolling(documentId: string) {
    const id = pollIntervals.current.get(documentId)
    if (id) {
      clearInterval(id)
      pollIntervals.current.delete(documentId)
    }
  }

  function handleBackendStatus(documentId: string, data: any) {
    if (cancelledIds.current.has(documentId)) return
    const status = data.status as BackendStatus
    if (status === 'processing') {
      setJobs((prev) =>
        prev.map((j) => (j.document_id === documentId ? { ...j, phase: 'processing' } : j))
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
          return { ...j, phase: 'on_review', extracted, reason: data.reason }
        }
        if (status === 'rejected') return { ...j, phase: 'rejected', reason: data.reason }
        if (status === 'extraction_failed') {
          return { ...j, phase: 'extraction_failed', message: data.message ?? 'The document could not be processed. Please retry.' }
        }
        return j
      })
    )
  }

  /* ── single job pipeline ── */
  async function runPipeline(job: DocumentJob, file: File) {
    if (!user) { console.error('[pipeline] no user, aborting'); return }
  
    console.log('[pipeline] starting for', job.fileName, 'model:', job.model, 'document_id:', job.document_id)
    setJobs((prev) => prev.map((j) => (j.id === job.id ? { ...j, phase: 'uploading' } : j)))
  
    const safeFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_').replace(/_{2,}/g, '_').replace(/^[_]+|[_]+$/g, '') || 'image'
    const path = `${user.id}/${job.document_id}/${safeFileName}`
    console.log('[pipeline] uploading to storage path:', path)
  
    const { error: uploadError } = await supabase.storage.from('images').upload(path, file, { upsert: true })
  
    if (uploadError) {
      console.error('[pipeline] storage upload failed:', uploadError)
      setJobs((prev) => prev.map((j) => (j.id === job.id ? { ...j, phase: 'network_error', message: uploadError.message } : j)))
      return
    }
    console.log('[pipeline] storage upload succeeded')
  
    const { data: urlData } = supabase.storage.from('images').getPublicUrl(path)
    console.log('[pipeline] public url:', urlData.publicUrl)
    setJobs((prev) => prev.map((j) => (j.id === job.id ? { ...j, imageUrl: urlData.publicUrl, imagePath: path } : j)))
    setJobs((prev) => prev.map((j) => (j.id === job.id ? { ...j, phase: 'submitting' } : j)))
  
    const session = await supabase.auth.getSession()
    const token = session.data.session?.access_token
    console.log('[pipeline] auth token present:', !!token)
    console.log('[pipeline] posting to:', `${import.meta.env.VITE_API_URL}/imgpip`)
    console.log('[pipeline] payload:', { document_id: job.document_id, image_path: path, model: job.model })
  
    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => {
      console.warn('[pipeline] request timed out after 20s')
      controller.abort()
    }, 60000)
  
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/imgpip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ document_id: job.document_id, image_path: path, model: job.model }),
        signal: controller.signal,
      })
      clearTimeout(timeoutId)
      console.log('[pipeline] response status:', res.status)
  
      if (!res.ok) {
        const errorText = await res.text()
        console.error('[pipeline] non-ok response body:', errorText)
        throw new Error(`Server returned ${res.status}: ${errorText}`)
      }
  
      const data = await res.json()
      console.log('[pipeline] response data:', data)
  
      if (data.status === 'processing') {
        setJobs((prev) => prev.map((j) => (j.id === job.id ? { ...j, phase: 'processing' } : j)))
        startPolling(job.document_id)
      } else {
        handleBackendStatus(job.document_id, data)
      }
    } catch (err) {
      clearTimeout(timeoutId)
      console.error('[pipeline] fetch error:', err)
      const msg = err instanceof Error && err.name === 'AbortError'
        ? 'Request timed out. The server took too long to respond — please retry.'
        : err instanceof Error ? err.message : 'Could not connect to the processing service. Please try again.'
      setJobs((prev) => prev.map((j) => (j.id === job.id ? { ...j, phase: 'network_error', message: msg } : j)))
    }
  }

  async function handleSubmit() {
    if (!user || !configured || stagedFiles.length === 0 || !selectedModel) return
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
    await Promise.all(newJobs.map(async (job) => {
      const staged = files.find((f) => f.preview === job.imageUrl)
      if (!staged) return
      await runPipeline(job, staged.file)
    }))
  }

  async function retryExtraction(documentId: string) {
    const job = jobs.find((j) => j.document_id === documentId)
    if (!job || !job.imagePath) return
    setJobs((prev) => prev.map((j) => (j.document_id === documentId ? { ...j, phase: 'submitting' } : j)))
    try {
      const session = await supabase.auth.getSession()
      const token = session.data.session?.access_token
      const res = await fetch(`${import.meta.env.VITE_API_URL}/documents/${documentId}/retry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ image_path: job.imagePath, model: job.model }),
      })
      if (!res.ok) throw new Error('Retry request failed')
      const data = await res.json()
      if (data.status === 'processing') {
        setJobs((prev) => prev.map((j) => (j.document_id === documentId ? { ...j, phase: 'processing' } : j)))
        startPolling(documentId)
      } else {
        handleBackendStatus(documentId, data)
      }
    } catch {
      setJobs((prev) => prev.map((j) => (j.document_id === documentId ? { ...j, phase: 'extraction_failed', message: 'Retry failed. Please try again.' } : j)))
    }
  }

  async function retryUpload(jobId: string) {
    const job = jobs.find((j) => j.id === jobId)
    if (!job) return
    if (job.originalFile) {
      await runPipeline(job, job.originalFile)
    } else {
      try {
        const res = await fetch(job.imageUrl)
        const blob = await res.blob()
        const file = new File([blob], job.fileName, { type: blob.type || 'image/jpeg' })
        await runPipeline(job, file)
      } catch {
        setJobs((prev) => prev.map((j) => (j.id === jobId ? { ...j, phase: 'network_error', message: 'Original file not available after refresh. Please upload again.' } : j)))
      }
    }
  }

  async function retryAllFailed() {
    await Promise.all(failedJobs.map((job) => {
      if (job.phase === 'extraction_failed') return retryExtraction(job.document_id)
      if (job.phase === 'network_error' && job.originalFile) return retryUpload(job.id)
      return Promise.resolve()
    }))
  }

  async function retrySelectedFailed() {
    const targets = failedJobs.filter((j) => selectedFailedIds.has(j.id))
    await Promise.all(targets.map((job) => {
      if (job.phase === 'extraction_failed') return retryExtraction(job.document_id)
      if (job.phase === 'network_error' && job.originalFile) return retryUpload(job.id)
      return Promise.resolve()
    }))
    setSelectedFailedIds(new Set())
  }

  function cancelSelectedFailed() {
    const toRemove = new Set(selectedFailedIds)
    setJobs((prev) => prev.filter((j) => !toRemove.has(j.id)))
    setSelectedFailedIds(new Set())
    setActiveJobId((prev) => (prev && toRemove.has(prev) ? null : prev))
  }

  function toggleFailedSelection(jobId: string) {
    setSelectedFailedIds((prev) => {
      const next = new Set(prev)
      if (next.has(jobId)) next.delete(jobId)
      else next.add(jobId)
      return next
    })
  }

  function toggleSelectAllFailed() {
    if (allFailedSelected) setSelectedFailedIds(new Set())
    else setSelectedFailedIds(new Set(failedJobs.map((j) => j.id)))
  }

  function retakeDocument(documentId: string) {
    stopPolling(documentId)
    setJobs((prev) => prev.filter((j) => j.document_id !== documentId))
    setActiveJobId((prev) => {
      const job = jobs.find((j) => j.document_id === documentId)
      return job?.id === prev ? null : prev
    })
  }

  function updateField(jobId: string, fieldId: string, value: string) {
    setJobs((prev) =>
      prev.map((j) =>
        j.id === jobId && j.phase === 'on_review'
          ? { ...j, extracted: j.extracted.map((f) => (f.id === fieldId ? { ...f, value } : f)) }
          : j
      )
    )
  }

  async function confirmJob(jobId: string) {
    const job = jobs.find((j) => j.id === jobId)
    if (!job || job.phase !== 'on_review') return
  
    let historyImageUrl = job.imageUrl
  
    if (job.imagePath) {
      try {
        const ext = job.imagePath.split('.').pop()?.toLowerCase() || 'jpg'
        const historyPath = `history/${user?.id}/${job.document_id}.${ext}`
  
        const { error: copyError } = await supabase.storage
          .from('images')
          .copy(job.imagePath, historyPath)
  
        if (copyError) {
          console.error('[confirmJob] copy failed:', copyError)
        } else {
          const { data: historyUrlData } = supabase.storage
            .from('images')
            .getPublicUrl(historyPath)
          historyImageUrl = historyUrlData.publicUrl
          console.log('[confirmJob] history image url:', historyImageUrl)
        }
      } catch (e) {
        console.error('[confirmJob] unexpected error during copy:', e)
      }
    }
  
    await supabase.from('extractions').insert({
      user_id: user?.id,
      image_url: historyImageUrl,
      data: job.extracted,
      confirmed: true,
    })
    await supabase.from('extractions').delete().eq('user_id', user?.id).eq('confirmed', false)
    setJobs((prev) => prev.map((j) => (j.id === jobId ? { ...j, phase: 'confirmed' } : j)))
  }

  /* ── delete from supabase storage ── */
  async function deleteImageFromStorage(path: string) {
    if (!path) return
    await supabase.storage.from('images').remove([path])
  }

  /* ── export with auto-delete ── */
  async function exportCSV(job: DocumentJob) {
    const headers = job.extracted.map((f) => f.label).join(',')
    const values = job.extracted.map((f) => `"${f.value.replace(/"/g, '""')}"`).join(',')
    const blob = new Blob([`${headers}\n${values}`], { type: 'text/csv' })
    downloadBlob(blob, `openlens-${job.document_id}.csv`)
    if (job.imagePath && !job.deletedFromStorage) {
      await deleteImageFromStorage(job.imagePath)
      setJobs((prev) => prev.map((j) => (j.id === job.id ? { ...j, deletedFromStorage: true } : j)))
    }
  }

  async function exportExcel(job: DocumentJob) {
    const rows = job.extracted.map(
      (f) => `<Row><Cell><Data ss:Type="String">${f.label}</Data></Cell><Cell><Data ss:Type="String">${f.value}</Data></Cell></Row>`
    ).join('')
    const xml = `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Sheet1"><Table>${rows}</Table></Worksheet></Workbook>`
    const blob = new Blob([xml], { type: 'application/vnd.ms-excel' })
    downloadBlob(blob, `openlens-${job.document_id}.xls`)
    if (job.imagePath && !job.deletedFromStorage) {
      await deleteImageFromStorage(job.imagePath)
      setJobs((prev) => prev.map((j) => (j.id === job.id ? { ...j, deletedFromStorage: true } : j)))
    }
  }

  async function exportBatchCSV() {
    if (confirmedJobs.length === 0) return
    const allLabels = Array.from(new Set(confirmedJobs.flatMap((j) => j.extracted.map((f) => f.label))))
    const headers = ['Document', 'Model', 'Date', ...allLabels].join(',')
    const rows = confirmedJobs.map((job) => {
      const fieldMap = new Map(job.extracted.map((f) => [f.label, f.value]))
      const values = allLabels.map((l) => `"${(fieldMap.get(l) ?? '').replace(/"/g, '""')}"`).join(',')
      return `"${job.fileName}","${job.model}","${job.createdAt}",${values}`
    })
    const blob = new Blob([`${headers}\n${rows.join('\n')}`], { type: 'text/csv' })
    downloadBlob(blob, `openlens-batch-${Date.now()}.csv`)
    // Delete all confirmed images
    await Promise.all(
      confirmedJobs.map(async (job) => {
        if (job.imagePath && !job.deletedFromStorage) {
          await deleteImageFromStorage(job.imagePath)
        }
      })
    )
    setJobs((prev) => prev.map((j) => (j.phase === 'confirmed' ? { ...j, deletedFromStorage: true } : j)))
  }

  /* ── Q&A chat ── */
  async function sendChatMessage() {
    if (!chatInput.trim() || !activeJob || chatLoading) return
    const question = chatInput.trim()
    const userMsg: ChatMessage = { role: 'user', content: question, timestamp: new Date().toISOString() }
    setChatMessages((prev) => [...prev, userMsg])
    setChatInput('')
    setChatLoading(true)

    try {
      const session = await supabase.auth.getSession()
      const token = session.data.session?.access_token
      const res = await fetch(`${import.meta.env.VITE_API_URL}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          question,
          context: activeJob.extracted.reduce((acc, f) => ({ ...acc, [f.label]: f.value }), {}),
          document_id: activeJob.document_id,
        }),
      })
      if (!res.ok) throw new Error('Failed to get answer')
      const data = await res.json()
      console.log(data)
      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: data.answer ?? data.response ?? 'No answer returned.',
        timestamp: new Date().toISOString(),
      }
      setChatMessages((prev) => [...prev, assistantMsg])
    } catch (err) {
      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: err instanceof Error ? err.message : 'Sorry, I could not process your question. Please try again.',
        timestamp: new Date().toISOString(),
      }
      setChatMessages((prev) => [...prev, assistantMsg])
    } finally {
      setChatLoading(false)
    }
  }

  const canSubmit = stagedFiles.length > 0 && selectedModel !== null && processingJobs.length === 0

  /* ─── render helpers ─── */
  const renderConfidenceBadge = (c: number) => {
    const pct = Math.round(c * 100)
    if (c >= 0.9)
      return (
        <span className="rounded px-1.5 py-0.5 text-[10px] font-bold bg-accent/10 text-accent">
          {pct}%
        </span>
      )
    if (c >= 0.75)
      return (
        <span className="rounded px-1.5 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-700">
          {pct}%
        </span>
      )
    return (
      <span className="rounded px-1.5 py-0.5 text-[10px] font-bold bg-danger/10 text-danger">
        {pct}%
      </span>
    )
  }
  return (
    <div className="mx-auto max-w-7xl p-4 md:p-6">
      {/* Header */}
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-accent">OpenLens</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-ink md:text-4xl">Welcome, {displayName}.</h1>
          <p className="mt-1 text-sm text-muted">Upload documents, extract data with AI, review, and export.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowHistory((s) => !s)}
            className="rounded-lg border border-line bg-card px-3 py-2 text-sm font-medium text-ink shadow-sm transition hover:bg-paper cursor-pointer"
          >
            {showHistory ? 'Hide History' : 'History'}
          </button>
          <button
            onClick={() => void onSignOut()}
            className="rounded-lg border border-line bg-card px-4 py-2 text-sm font-medium text-ink shadow-sm transition hover:bg-paper cursor-pointer"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* History Panel */}
      {showHistory && (
        <section className="mb-8 rounded-2xl border border-line bg-card p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Extraction History</h2>
          {history.length === 0 ? (
            <p className="mt-3 text-sm text-muted">No confirmed extractions yet.</p>
          ) : (
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {history.map((h) => (
                <div key={h.id} className="rounded-xl border border-line bg-paper p-3">
                  <img src={h.image_url} alt="" className="h-24 w-full rounded-lg object-cover" />
                  <div className="mt-2 space-y-1">
                    {h.data.slice(0, 3).map((f) => (
                      <div key={f.id} className="flex justify-between text-xs">
                        <span className="text-muted">{f.label}:</span>
                        <span className="truncate text-ink">{f.value}</span>
                      </div>
                    ))}
                    {h.data.length > 3 && <p className="text-[10px] text-muted">+{h.data.length - 3} more fields</p>}
                  </div>
                  <p className="mt-2 text-[10px] text-muted">{formatDate(h.created_at)}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── 1. Stage Images ── */}
      <section className="rounded-2xl border border-line bg-card p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">1. Stage Images</h2>
          <span className="text-xs text-muted">Images are auto-compressed before upload</span>
        </div>

        {stagedFiles.length > 0 && (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {stagedFiles.map((staged) => (
              <div key={staged.id} className="group relative aspect-square overflow-hidden rounded-xl border border-line cursor-pointer">
                <img src={staged.preview} alt={staged.file.name} className="h-full w-full object-cover" />
                <button
                  onClick={() => removeStagedFile(staged.id)}
                  className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-danger/90 text-xs font-bold text-white opacity-0 shadow transition group-hover:opacity-100 cursor-pointer"
                  title="Remove"
                >
                  ✕
                </button>
                <span className="absolute bottom-0 left-0 right-0 truncate bg-black/60 px-2 py-1 text-[10px] text-white">{staged.file.name}</span>
                <span className="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[9px] text-white">{(staged.file.size / 1024).toFixed(0)} KB</span>
              </div>
            ))}
            <button
              onClick={() => inputRef.current?.click()}
              className="flex aspect-square flex-col items-center justify-center rounded-xl border-2 border-dashed border-line bg-paper text-muted transition hover:border-accent hover:text-accent cursor-pointer"
            >
              <span className="text-2xl">+</span>
              <span className="mt-1 text-xs font-medium">Add more</span>
            </button>
          </div>
        )}

        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`mt-4 cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition ${dragOver ? 'border-accent bg-accent/5' : 'border-line bg-paper hover:border-muted'}`}
        >
          <input ref={inputRef} type="file" accept="image/*" multiple onChange={onSelectFile} className="hidden" />
          <p className="text-sm font-medium text-ink">{dragOver ? 'Drop images here' : 'Drag & drop images here'}</p>
          <p className="mt-2 text-sm text-accent underline hover:text-accent-hover">or click to browse files</p>
          <p className="mt-1 text-xs text-muted">Supports JPG, PNG, HEIC. Large batches welcome.</p>
        </div>
      </section>

      {/* ── 2. Choose AI Model ── */}
      {stagedFiles.length > 0 && (
        <section className="mt-6 rounded-2xl border border-line bg-card p-6 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">2. Choose AI Model</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-3 ">
            {MODELS.map((m) => {
              const isSelected = selectedModel === m.key
              return (
                <button
                  key={m.key}
                  onClick={() => setSelectedModel(m.key)}
                  className={`relative rounded-xl border p-5 text-left transition ${isSelected ? 'border-accent bg-accent/5 ring-1 ring-accent' : 'border-line bg-paper hover:bg-card hover:border-muted'} cursor-pointer`}
                >
                  {isSelected && (
                    <span className="absolute right-3 top-3 text-accent">
                      <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    </span>
                  )}
                  <img src={m.logo} alt={m.title} className="h-8 w-8 rounded-lg object-contain" />
                  <h3 className="mt-2 text-lg font-bold text-ink">{m.title}</h3>
                  <p className="text-xs font-semibold uppercase tracking-wide text-accent">{m.subtitle}</p>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{m.description}</p>
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
            className="w-full rounded-xl bg-accent py-3.5 text-base font-bold text-white shadow-lg transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto sm:px-16 cursor-pointer"
          >
            {processingJobs.length > 0 ? 'Processing…' : `Extract ${stagedFiles.length} image${stagedFiles.length > 1 ? 's' : ''}`}
          </button>
          {!selectedModel && processingJobs.length === 0 && <p className="text-xs text-muted">Select a model above to continue</p>}
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
          className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-line bg-paper p-4"
        >
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <img
              src={job.imageUrl}
              alt=""
              className="h-14 w-14 shrink-0 rounded-lg border border-line object-cover"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">
                {job.fileName}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
                <span className="text-xs font-medium text-accent">
                  {job.phase === 'uploading'
                    ? 'Uploading document…'
                    : job.phase === 'submitting'
                      ? 'Starting document analysis…'
                      : 'Analyzing document…'}
                </span>
                {job.phase === 'processing' && (
                  <span className="text-xs text-muted">
                    Checking image quality and extracting information.
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <span className="shrink-0 rounded-full bg-accent/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-accent">
              {job.phase}
            </span>
            <button
              onClick={() => cancelJob(job.id)}
              className="shrink-0 rounded-lg border border-danger/30 bg-danger/10 px-3 py-1.5 text-xs font-medium text-danger transition hover:bg-danger/20 cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      ))}
    </div>
  </section>
)}

{/* ── Active Review Workspace ── */}
{activeJob && activeJob.phase === 'on_review' && (
  <section className="mt-8 grid gap-6 lg:grid-cols-2">
    {/* Source Image */}
    <div className="rounded-2xl border border-line bg-card p-5 shadow-sm lg:sticky lg:top-4 lg:self-start lg:max-h-[80vh] lg:overflow-hidden">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Source Image</h2>
        <span className="max-w-[200px] truncate text-xs text-muted">{activeJob.fileName}</span>
      </div>
      <img src={activeJob.imageUrl} alt="uploaded" className="mt-3 w-full rounded-xl border border-line object-contain lg:max-h-[calc(80vh-4rem)]" />
      {activeJob.reason && (
        <div className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
          <span className="font-semibold">Document Quality Notice:</span> {activeJob.reason}
        </div>
      )}
    </div>

          {/* Extracted Data */}
          <div className="rounded-2xl border border-line bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Extracted Data</h2>
              <span className="rounded-full bg-[#e3eee9] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[#477968]">
                Please Review
              </span>
            </div>

            <div className="mt-4 space-y-3">
              {activeJob.extracted.map((field) => {
                const lowConfidence = field.confidence < 0.75
                const veryLow = field.confidence < 0.5
                return (
                  <div key={field.id}>
                    <label className="flex items-center justify-between text-xs font-medium text-muted">
                      <span className={veryLow ? 'font-bold text-danger' : lowConfidence ? 'font-semibold text-amber-700' : ''}>
                        {field.label}
                        {veryLow && 'Needs Verification'}
                        {lowConfidence && !veryLow && ' ❓ Review Suggested'}
                      </span>
                      {renderConfidenceBadge(field.confidence)}
                    </label>
                    <input
                      type="text"
                      value={field.value}
                      onChange={(e) => updateField(activeJob.id, field.id, e.target.value)}
                      className={`mt-1 w-full rounded-lg border bg-paper px-3 py-2 text-sm text-ink outline-none transition focus:ring-1 ${veryLow ? 'border-danger focus:border-danger focus:ring-danger' : lowConfidence ? 'border-amber-300 focus:border-amber-500 focus:ring-amber-500' : 'border-line focus:border-accent focus:ring-accent'}`}
                    />
                  </div>
                )
              })}
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button onClick={() => confirmJob(activeJob.id)} className="rounded-lg bg-accent px-6 py-3 text-sm font-bold text-white shadow transition hover:bg-accent-hover cursor-pointer">Confirm & Save</button>
              <button onClick={() => setChatOpen(true)} className="rounded-lg border border-line bg-paper px-4 py-3 text-sm font-medium text-ink transition hover:bg-card cursor-pointer">Ask AI about this</button>
            </div>
            <p className="mt-2 text-xs text-muted">After confirming, you can download the data as CSV or Excel. The image will be removed from storage after export.</p>
          </div>
        </section>
      )}

      {/* ── Q&A Chat Panel ── */}
      {chatOpen && activeJob && (
        <section className="mt-6 rounded-2xl border border-line bg-card p-4 sm:p-5 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
              Ask about this document
            </h2>
              <button
              onClick={() => setChatOpen(false)}
              className="rounded-lg border border-line bg-paper px-4 py-2 text-sm font-medium text-ink transition hover:bg-card cursor-pointer"
            >
              Close
            </button>
          </div>

          {/* Taller on mobile so it’s usable; fixed on desktop */}
          <div className="mt-3 flex h-[50vh] min-h-[16rem] flex-col rounded-xl border border-line bg-paper sm:h-64">
            <div className="flex-1 space-y-3 overflow-y-auto p-3">
              {chatMessages.length === 0 && (
                <p className="px-2 pt-4 text-center text-xs leading-relaxed text-muted">
                  Ask a question about the extracted data. For example: "What is the total amount?" or "Summarize this invoice."
                </p>
              )}
              {chatMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm sm:max-w-[80%] ${msg.role === 'user' ? 'bg-accent text-white' : 'bg-line text-ink'}`}>
                    {msg.content}
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div className="flex justify-start">
                  <div className="rounded-xl bg-line px-3 py-2 text-sm text-ink">
                    <span className="inline-block h-3 w-3 animate-bounce rounded-full bg-muted" />
                    <span className="ml-1 inline-block h-3 w-3 animate-bounce rounded-full bg-muted" style={{ animationDelay: '0.1s' }} />
                    <span className="ml-1 inline-block h-3 w-3 animate-bounce rounded-full bg-muted" style={{ animationDelay: '0.2s' }} />
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input row: button can never shrink or wrap onto a second line */}
            <div className="flex gap-2 border-t border-line p-3">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendChatMessage()}
                placeholder="Ask anything about this document..."
                className="min-w-0 flex-1 rounded-lg border border-line bg-card px-3 py-2 text-sm text-ink outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              />
              {/* Add an enter to send and shift enter to go to the next line*/}
              <button
                onClick={() => void sendChatMessage()}
                disabled={chatLoading}
                className="shrink-0 whitespace-nowrap rounded-lg bg-accent px-3 py-2 text-sm font-bold text-white transition hover:bg-accent-hover disabled:opacity-50 sm:px-4 cursor-pointer"
              >
                Send
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ── Review Queue ── */}
      {reviewJobs.length > 0 && (
        <section className="mt-8 rounded-2xl border border-line bg-card p-4 sm:p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
            Pending Review ({reviewJobs.length})
          </h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {reviewJobs.map((job) => (
              <button
                key={job.id}
                onClick={() => { setActiveJobId(job.id); setChatOpen(false) }}
                className={`flex items-center gap-2.5 sm:gap-3 rounded-xl border p-2.5 sm:p-3 text-left transition overflow-hidden ${activeJobId === job.id ? 'border-accent bg-accent/5' : 'border-line bg-paper hover:bg-card'} cursor-pointer`}
              >
                <img
                  src={job.imageUrl}
                  alt=""
                  className="h-10 w-10 sm:h-12 sm:w-12 shrink-0 rounded-lg border border-line object-cover"
                />
                <div className="min-w-0 flex-1 overflow-hidden">
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
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Source Image</h2>
                  <span className="max-w-[200px] truncate text-xs text-muted">{activeJob.fileName}</span>
                </div>
                <img src={activeJob.imageUrl} alt="uploaded" className="mt-3 w-full rounded-xl border border-line object-contain" />
              </div>

              <div className="rounded-2xl border border-line bg-card p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Extracted Data</h2>
                  <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent">✓ Confirmed</span>
                </div>

                <div className="mt-4 space-y-3">
                  {activeJob.extracted.map((field) => (
                    <div key={field.id}>
                      <label className="flex items-center justify-between text-xs font-medium text-muted">
                        <span>{field.label}</span>
                        {renderConfidenceBadge(field.confidence)}
                      </label>
                      <div className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink">{field.value}</div>
                    </div>
                  ))}
                </div>

                <div className="mt-6 flex flex-wrap gap-3">
                  <button onClick={() => exportCSV(activeJob)} className="rounded-lg border border-line bg-paper px-4 py-2 text-sm font-medium text-ink transition hover:bg-card cursor-pointer">Download CSV</button>
                  <button onClick={() => exportExcel(activeJob)} className="rounded-lg border border-line bg-paper px-4 py-2 text-sm font-medium text-ink transition hover:bg-card cursor-pointer">Download Excel</button>
                  {activeJob.deletedFromStorage && <span className="self-center text-xs text-accent">✓ Image cleaned from storage</span>}
                </div>
              </div>
            </section>
          )}

          <section className="mt-8 rounded-2xl border border-line bg-card p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Confirmed & Saved ({confirmedJobs.length})</h2>
              <div className="flex gap-2">
                <button onClick={() => setMergeViewOpen((s) => !s)} className="rounded-lg border border-line bg-paper px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-card cursor-pointer">{mergeViewOpen ? 'Hide Merge View' : 'Merge View'}</button>
                <button onClick={() => void exportBatchCSV()} className="rounded-lg border border-line bg-paper px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-card cursor-pointer">Export All CSV</button>
              </div>
            </div>

            {/* Merge View */}
            {mergeViewOpen && confirmedJobs.length > 0 && (
              <div className="mt-4 overflow-x-auto rounded-xl border border-line">
                <table className="w-full text-left text-sm">
                  <thead className="bg-paper text-xs uppercase text-muted">
                    <tr>
                      <th className="px-3 py-2">Document</th>
                      <th className="px-3 py-2">Model</th>
                      {Array.from(new Set(confirmedJobs.flatMap((j) => j.extracted.map((f) => f.label)))).map((label) => (
                        <th key={label} className="px-3 py-2">{label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {confirmedJobs.map((job) => {
                      const fieldMap = new Map(job.extracted.map((f) => [f.label, f.value]))
                      const allLabels = Array.from(new Set(confirmedJobs.flatMap((j) => j.extracted.map((f) => f.label))))
                      return (
                        <tr key={job.id} className="bg-card">
                          <td className="px-3 py-2 font-medium text-ink">{job.fileName}</td>
                          <td className="px-3 py-2 text-muted">{job.model}</td>
                          {allLabels.map((label) => (
                            <td key={label} className="px-3 py-2 text-ink">{fieldMap.get(label) ?? '—'}</td>
                          ))}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {confirmedJobs.map((job) => (
                <button
                    key={job.id}
                    onClick={() => setActiveJobId(job.id)}
                    className={`flex items-center gap-3 rounded-xl border p-3 text-left transition overflow-hidden w-full ${activeJobId === job.id ? 'border-accent bg-accent/5' : 'border-line bg-paper hover:bg-card'}`}
                  >
                  <img src={job.imageUrl} alt="" className="h-12 w-12 shrink-0 rounded-lg border border-line object-cover" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{job.fileName}</p>
                    <p className="text-[10px] text-muted">{formatDate(job.createdAt)}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent">Saved</span>
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
            <h2 className="text-sm font-semibold uppercase tracking-wide text-danger">Failed Jobs ({failedJobs.length})</h2>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-ink">
                <input type="checkbox" checked={allFailedSelected} onChange={toggleSelectAllFailed} className="h-4 w-4 rounded border-line text-accent focus:ring-accent" />
                Select all
              </label>
              <button onClick={() => void retryAllFailed()} className="rounded-lg border border-line bg-paper px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-card">Retry All</button>
              <button onClick={() => void retrySelectedFailed()} disabled={!someFailedSelected} className="rounded-lg border border-line bg-paper px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-card disabled:cursor-not-allowed disabled:opacity-40">Retry Selected</button>
              <button onClick={cancelSelectedFailed} disabled={!someFailedSelected} className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-1.5 text-xs font-medium text-danger transition hover:bg-danger/20 disabled:cursor-not-allowed disabled:opacity-40">Cancel Selected</button>
            </div>
          </div>

          <div className="mt-3 space-y-3">
            {failedJobs.map((job) => {
              const isSelected = selectedFailedIds.has(job.id)
              return (
                <div key={job.id} className={`flex items-center gap-3 rounded-xl border p-3 transition ${isSelected ? 'border-danger/40 bg-danger/10' : 'border-danger/20 bg-card'}`}>
                  <input type="checkbox" checked={isSelected} onChange={() => toggleFailedSelection(job.id)} className="h-4 w-4 shrink-0 rounded border-line text-accent focus:ring-accent" />
                  <img src={job.imageUrl} alt="" className="h-12 w-12 shrink-0 rounded-lg border border-line object-cover" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{job.fileName}</p>
                    {job.phase === 'rejected' && <p className="text-xs text-danger">{job.reason ?? 'Document rejected'}</p>}
                    {job.phase === 'extraction_failed' && <p className="text-xs text-danger">{job.message ?? 'Processing failed'}</p>}
                    {job.phase === 'network_error' && <p className="text-xs text-danger">{job.message ?? 'Network error'}</p>}
                  </div>
                  {job.phase === 'extraction_failed' && <button onClick={() => void retryExtraction(job.document_id)} className="shrink-0 rounded-lg border border-line bg-paper px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-card">Retry</button>}
                  {job.phase === 'rejected' && <button onClick={() => retakeDocument(job.document_id)} className="shrink-0 rounded-lg border border-line bg-paper px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-card">New Photo</button>}
                  {job.phase === 'network_error' && <button onClick={() => void retryUpload(job.id)} className="shrink-0 rounded-lg border border-line bg-paper px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-card">Try Again</button>}
                </div>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}