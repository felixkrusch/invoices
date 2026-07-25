'use client'

import { useEffect, useRef, useState } from 'react'
import { Lock, Paperclip, Send, Unlock, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import AmberTerminalThinking from './AmberTerminalThinking'

interface Message {
  role: 'user' | 'assistant'
  content: string
  action?: string
  createInvoice?: {
    contactName?: string
    amount?: number
    description?: string
    currency?: string
  }
  navigate?: { label: string; href: string }
  proposedAction?: { action?: string; params?: Record<string, unknown>; confidence?: number; reasoning?: string }
}

export default function ChatPage() {
  const router = useRouter()
  const t = useTranslations('app.chat')
  const tToasts = useTranslations('app.toasts')

  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: t('welcome') || 'Ask me to draft an invoice or add a contact.' },
  ])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [chatLocked, setChatLocked] = useState(false)
  const [threadId, setThreadId] = useState<string | null>(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('chatThreadId') || null
    return null
  })
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!threadId) return
    let cancelled = false
    fetch(`/api/chat/threads/${encodeURIComponent(threadId)}`)
      .then(async response => {
        if (response.status === 404) {
          localStorage.removeItem('chatThreadId')
          if (!cancelled) setThreadId(null)
          return null
        }
        if (!response.ok) throw new Error('Could not restore chat history')
        return response.json()
      })
      .then(data => {
        if (cancelled || !data?.messages?.length) return
        setMessages(data.messages.map((m: { role: 'user' | 'assistant'; content: string }) => ({
          role: m.role,
          content: m.content,
        })))
      })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [threadId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  const send = async (override?: string, approvedAction?: Message['proposedAction']) => {
    const text = (override ?? input).trim()
    if ((!text && !approvedAction) || isLoading) return

    if (text) {
      setMessages(prev => [...prev, { role: 'user', content: text }])
      setInput('')
    }
    setIsLoading(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          threadId,
          chatLocked,
          approved: !!approvedAction,
          approvedAction,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Chat failed')

      if (data.threadId) {
        setThreadId(data.threadId)
        localStorage.setItem('chatThreadId', data.threadId)
      }

      const assistant: Message = {
        role: 'assistant',
        content: data.response || 'OK',
        action: data.action,
        createInvoice: data.createInvoice,
        navigate: data.navigate,
        proposedAction: data.proposed ? data.proposedAction : undefined,
      }
      setMessages(prev => [...prev, assistant])

      if (data.createInvoice) {
        toast.success(tToasts('invoiceDraftReady') || 'Invoice draft ready — open Invoicing')
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Chat failed')
      setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, something went wrong.' }])
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="h-full flex flex-col max-w-3xl mx-auto w-full">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
              m.role === 'user' ? 'bg-emerald-900/40 text-emerald-50' : 'bg-zinc-900 border border-zinc-800 text-zinc-200'
            }`}>
              {m.content}
              {m.createInvoice && (
                <button
                  type="button"
                  className="mt-2 block text-xs text-emerald-400 hover:underline"
                  onClick={() => router.push('/app?view=invoicing')}
                >
                  Open invoicing
                </button>
              )}
              {m.navigate && (
                <button
                  type="button"
                  className="mt-2 block text-xs text-emerald-400 hover:underline"
                  onClick={() => router.push(m.navigate!.href)}
                >
                  {m.navigate.label}
                </button>
              )}
              {m.proposedAction && (
                <button
                  type="button"
                  className="mt-2 block text-xs bg-emerald-800/50 hover:bg-emerald-800 px-2 py-1 rounded"
                  onClick={() => void send('Yes, do it', m.proposedAction)}
                >
                  Confirm
                </button>
              )}
            </div>
          </div>
        ))}
        {isLoading && <AmberTerminalThinking />}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-zinc-800 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            title={chatLocked ? 'Unlock chat' : 'Lock chat (propose only)'}
            onClick={() => setChatLocked(v => !v)}
            className="p-2 rounded border border-zinc-800 text-zinc-400 hover:text-zinc-200"
          >
            {chatLocked ? <Lock size={16} /> : <Unlock size={16} />}
          </button>
          <input ref={fileInputRef} type="file" className="hidden" />
          <button
            type="button"
            className="p-2 rounded border border-zinc-800 text-zinc-600 cursor-not-allowed"
            title="Attachments coming later"
            disabled
          >
            <Paperclip size={16} />
          </button>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() } }}
            placeholder={t('placeholder') || 'Draft an invoice for…'}
            className="flex-1 bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-sm outline-none focus:border-zinc-600"
            disabled={isLoading}
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={isLoading || !input.trim()}
            className="p-2 rounded bg-emerald-800 hover:bg-emerald-700 disabled:opacity-40"
          >
            <Send size={16} />
          </button>
          {threadId && (
            <button
              type="button"
              title="New chat"
              className="p-2 rounded border border-zinc-800 text-zinc-400"
              onClick={() => {
                localStorage.removeItem('chatThreadId')
                setThreadId(null)
                setMessages([{ role: 'assistant', content: t('welcome') || 'New conversation.' }])
              }}
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
