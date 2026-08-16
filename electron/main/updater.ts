import { app, BrowserWindow, shell } from 'electron'
import { IpcChannel, type UpdateStatusInfo } from '../../shared/ipc'

const REPO_OWNER = 'diegovergarabustamante-boop'
const REPO_NAME = 'goblin-companion'
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000 // 4 hours

/**
 * Compare two semver strings (e.g. "0.1.0" and "0.2.0").
 * Returns true if candidate is strictly greater than current.
 */
function isNewerVersion(current: string, candidate: string): boolean {
  const parse = (v: string): number[] =>
    v
      .replace(/^v/i, '')
      .split('.')
      .map((n) => parseInt(n, 10) || 0)

  const cParts = parse(current)
  const nParts = parse(candidate)

  const maxLen = Math.max(cParts.length, nParts.length)
  for (let i = 0; i < maxLen; i++) {
    const c = cParts[i] ?? 0
    const n = nParts[i] ?? 0
    if (n > c) return true
    if (n < c) return false
  }
  return false
}

export class UpdateManager {
  private status: UpdateStatusInfo = {
    checking: false,
    hasUpdate: false,
    currentVersion: app.getVersion() || '0.1.0',
    latestVersion: app.getVersion() || '0.1.0',
    releaseUrl: null,
    downloadUrl: null,
    releaseNotes: null,
    publishedAt: null,
    error: null,
    lastCheckedAt: null
  }

  private timer: NodeJS.Timeout | null = null

  public init(): void {
    // Schedule initial check 5s after boot, then every 4h
    setTimeout(() => {
      void this.checkForUpdates()
    }, 5000)

    this.timer = setInterval(() => {
      void this.checkForUpdates()
    }, CHECK_INTERVAL_MS)
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  public getStatus(): UpdateStatusInfo {
    return { ...this.status }
  }

  public async checkForUpdates(): Promise<UpdateStatusInfo> {
    this.status.checking = true
    this.status.error = null
    this.broadcastStatus()

    const currentVer = app.getVersion() || '0.1.0'
    this.status.currentVersion = currentVer

    try {
      const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`
      const res = await fetch(url, {
        headers: {
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': `GoblinCompanion/${currentVer}`
        }
      })

      if (res.status === 404) {
        // Fallback to checking /tags if no formal Release object exists on GitHub yet
        try {
          const tagsUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/tags`
          const tagsRes = await fetch(tagsUrl, {
            headers: {
              Accept: 'application/vnd.github.v3+json',
              'User-Agent': `GoblinCompanion/${currentVer}`
            }
          })
          if (tagsRes.ok) {
            const tagsList = (await tagsRes.json()) as Array<{ name?: string }>
            if (Array.isArray(tagsList) && tagsList.length > 0 && tagsList[0].name) {
              const rawTag = tagsList[0].name
              const latestVer = rawTag.replace(/^v/i, '')
              const hasUpdate = isNewerVersion(currentVer, latestVer)
              this.status = {
                checking: false,
                hasUpdate,
                currentVersion: currentVer,
                latestVersion: latestVer,
                releaseUrl: `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/tag/${rawTag}`,
                downloadUrl: `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/tag/${rawTag}`,
                releaseNotes: null,
                publishedAt: null,
                error: null,
                lastCheckedAt: new Date().toISOString()
              }
              this.broadcastStatus()
              return this.getStatus()
            }
          }
        } catch {
          // Ignore tags fallback errors
        }

        // Default up to date if no tags found
        this.status.checking = false
        this.status.hasUpdate = false
        this.status.latestVersion = currentVer
        this.status.lastCheckedAt = new Date().toISOString()
        this.broadcastStatus()
        return this.getStatus()
      }

      if (!res.ok) {
        throw new Error(`GitHub API returned status ${res.status}`)
      }

      const release = (await res.json()) as {
        tag_name?: string
        html_url?: string
        body?: string
        published_at?: string
        assets?: Array<{ browser_download_url?: string; name?: string }>
      }

      const rawTag = release.tag_name ?? currentVer
      const latestVer = rawTag.replace(/^v/i, '')
      const hasUpdate = isNewerVersion(currentVer, latestVer)

      // Find exe installer in assets if available
      let exeDownloadUrl: string | null = null
      if (release.assets && Array.isArray(release.assets)) {
        const exeAsset = release.assets.find((a) => a.name?.endsWith('.exe'))
        if (exeAsset?.browser_download_url) {
          exeDownloadUrl = exeAsset.browser_download_url
        }
      }

      this.status = {
        checking: false,
        hasUpdate,
        currentVersion: currentVer,
        latestVersion: latestVer,
        releaseUrl: release.html_url ?? `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases`,
        downloadUrl: exeDownloadUrl ?? release.html_url ?? null,
        releaseNotes: release.body ?? null,
        publishedAt: release.published_at ?? null,
        error: null,
        lastCheckedAt: new Date().toISOString()
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      this.status.checking = false
      this.status.error = message
      this.status.lastCheckedAt = new Date().toISOString()
    }

    this.broadcastStatus()
    return this.getStatus()
  }

  public async openReleaseUrl(customUrl?: string): Promise<void> {
    const url = customUrl || this.status.releaseUrl || `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases`
    await shell.openExternal(url)
  }

  private broadcastStatus(): void {
    const snapshot = this.getStatus()
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send(IpcChannel.UpdateStatusChanged, snapshot)
      }
    }
  }
}

export const updateManager = new UpdateManager()
