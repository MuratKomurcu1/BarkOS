import { useState, type FormEvent } from 'react'
import { AudioLines, LoaderCircle, Mic, MicOff, Send, Sparkles, X } from 'lucide-react'
import type { VoiceAssistantMessage } from '../../../../shared/voice-assistant-types'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import CommentMarkdown from '@/components/sidebar/CommentMarkdown'
import { translate } from '@/i18n/i18n'

export type VoiceAssistantDisplayMessage = VoiceAssistantMessage & { id: string }

type Props = {
  open: boolean
  listening: boolean
  busy: boolean
  status: string
  messages: VoiceAssistantDisplayMessage[]
  partialTranscript: string
  onOpenChange: (open: boolean) => void
  onStartListening: () => void
  onStopListening: () => void
  onSend: (text: string) => void
}

export function VoiceAssistantPanel({
  open,
  listening,
  busy,
  status,
  messages,
  partialTranscript,
  onOpenChange,
  onStartListening,
  onStopListening,
  onSend
}: Props): React.JSX.Element {
  const [draft, setDraft] = useState('')

  const handleSubmit = (event: FormEvent): void => {
    event.preventDefault()
    const text = draft.trim()
    if (!text || busy) {
      return
    }
    setDraft('')
    onSend(text)
  }

  return (
    <div className="fixed bottom-10 right-5 z-50">
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            size="icon"
            variant={listening ? 'default' : 'secondary'}
            className="size-11 rounded-full"
            aria-label={
              listening
                ? translate('barkos.voiceAssistant.openLabel', 'Open BarkOS Assistant')
                : translate(
                    'barkos.voiceAssistant.startListeningLabel',
                    'Start BarkOS Assistant listening'
                  )
            }
            onClick={() => {
              if (!listening) {
                onStartListening()
              }
            }}
          >
            {busy ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : listening ? (
              <AudioLines className="size-4" />
            ) : (
              <Mic className="size-4" />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent side="top" align="end" className="w-[min(24rem,calc(100vw-2rem))] p-0">
          <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Sparkles className="size-4 text-primary" />
                {translate('barkos.voiceAssistant.title', 'BarkOS Assistant')}
              </div>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{status}</p>
            </div>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={
                  listening
                    ? translate('barkos.voiceAssistant.stopListening', 'Stop listening')
                    : translate('barkos.voiceAssistant.startListening', 'Start listening')
                }
                onClick={listening ? onStopListening : onStartListening}
              >
                {listening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={translate('barkos.voiceAssistant.closeLabel', 'Close BarkOS Assistant')}
                onClick={() => onOpenChange(false)}
              >
                <X className="size-4" />
              </Button>
            </div>
          </header>

          <ScrollArea className="h-72">
            <div className="space-y-3 p-4" aria-live="polite">
              {messages.length === 0 ? (
                <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
                  {translate(
                    'barkos.voiceAssistant.emptyDescription',
                    'Say “Hey BarkOS”. You can have an everyday conversation or assign project, folder, and code work.'
                  )}
                </div>
              ) : null}
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={
                    message.role === 'user'
                      ? 'ml-8 rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground'
                      : 'mr-8 rounded-lg border bg-muted/30 px-3 py-2 text-sm'
                  }
                >
                  {message.role === 'assistant' ? (
                    <CommentMarkdown content={message.text} />
                  ) : (
                    message.text
                  )}
                </div>
              ))}
              {partialTranscript ? (
                <p className="text-xs italic text-muted-foreground">{partialTranscript}</p>
              ) : null}
            </div>
          </ScrollArea>

          <form className="flex gap-2 border-t p-3" onSubmit={handleSubmit}>
            <Input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              maxLength={2_000}
              placeholder={translate('barkos.voiceAssistant.inputPlaceholder', 'Talk to BarkOS…')}
              aria-label={translate(
                'barkos.voiceAssistant.messageLabel',
                'BarkOS Assistant message'
              )}
            />
            <Button type="submit" size="icon" disabled={!draft.trim() || busy}>
              <Send className="size-4" />
              <span className="sr-only">{translate('barkos.voiceAssistant.send', 'Send')}</span>
            </Button>
          </form>
        </PopoverContent>
      </Popover>
    </div>
  )
}
