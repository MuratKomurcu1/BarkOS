export class VoiceAssistantCaptureRecovery {
  private timer: ReturnType<typeof setTimeout> | null = null

  cancel(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }

  async restartAfter(
    stop: () => Promise<void>,
    start: () => Promise<void>,
    shouldRestart: () => boolean
  ): Promise<void> {
    this.cancel()
    await stop()
    if (!shouldRestart()) {
      return
    }
    this.timer = setTimeout(() => {
      this.timer = null
      void start()
    }, 750)
  }
}
