export async function acquireBarkosProjectWorkspace<TTarget, TRepo>(args: {
  currentTarget: TTarget | null
  pickFolder: () => Promise<string | null>
  addFolder: (path: string) => Promise<TRepo | null>
  resolveTarget: () => TTarget | null
}): Promise<{ state: 'cancelled' } | { state: 'ready'; target: TTarget }> {
  if (args.currentTarget) {
    return { state: 'ready', target: args.currentTarget }
  }

  const path = await args.pickFolder()
  if (!path) {
    return { state: 'cancelled' }
  }

  const repo = await args.addFolder(path)
  if (!repo) {
    throw new Error('Seçilen proje klasörü BarkOS çalışma alanına eklenemedi')
  }

  const target = args.resolveTarget()
  if (!target) {
    throw new Error('Proje klasörü eklendi ancak BarkOS ajan çalışma alanını hazırlayamadı')
  }
  return { state: 'ready', target }
}
