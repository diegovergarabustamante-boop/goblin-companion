import { spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { join } from 'node:path'
import { app, BrowserWindow, shell } from 'electron'
import { IpcChannel, type UpdateDownloadProgress, type UpdateStatusInfo } from '../../shared/ipc'
import { appendActivity } from './activity-log'
import { getSettings } from './settings'

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

  private isDownloading = false
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

    appendActivity('info', '🔍 Checking for software updates…', `Current version: v${currentVer}`)

    try {
      const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`
      const res = await fetch(url, {
        headers: {
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': `GoblinCompanion/${currentVer}`
        }
      })

      if (res.status === 404) {
        // Check Django server endpoint for version fallback if available
        try {
          const settings = getSettings()
          if (settings.djangoUrl) {
            const djangoVerUrl = new URL('/api/companion/version/', settings.djangoUrl).toString()
            const djangoRes = await fetch(djangoVerUrl, {
              headers: { 'X-Companion-Token': settings.companionToken }
            })
            if (djangoRes.ok) {
              const body = (await djangoRes.json().catch(() => null)) as { latest_version?: string; release_url?: string; download_url?: string } | null
              if (body?.latest_version) {
                const latestVer = body.latest_version.replace(/^v/i, '')
                const hasUpdate = isNewerVersion(currentVer, latestVer)
                this.status = {
                  checking: false,
                  hasUpdate,
                  currentVersion: currentVer,
                  latestVersion: latestVer,
                  releaseUrl: body.release_url ?? `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases`,
                  downloadUrl: body.download_url ?? body.release_url ?? null,
                  releaseNotes: null,
                  publishedAt: null,
                  error: null,
                  lastCheckedAt: new Date().toISOString()
                }
                if (hasUpdate) {
                  appendActivity('success', `✨ New version available (v${latestVer})`, `Current: v${currentVer} · Click update badge to install`)
                } else {
                  appendActivity('info', '✅ Application up to date', `Version v${currentVer} is the latest`)
                }
                this.broadcastStatus()
                return this.getStatus()
              }
            }
          }
        } catch {
          // Ignore django version fallback errors
        }

        // GitHub API returned 404 because the repository is Private
        this.status.checking = false
        this.status.hasUpdate = false
        this.status.latestVersion = currentVer
        this.status.lastCheckedAt = new Date().toISOString()
        this.status.error = 'GitHub Repository is Private. Make repository Public on GitHub for automatic update detection.'
        appendActivity('warn', '⚠️ GitHub API returned 404 (Private Repo)', 'Make repository Public on GitHub to enable update detection')
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

      if (hasUpdate) {
        appendActivity('success', `✨ New version available (v${latestVer})`, `Current: v${currentVer} · Click update badge to install`)
      } else {
        appendActivity('info', '✅ Application up to date', `Version v${currentVer} is the latest`)
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      this.status.checking = false
      this.status.error = message
      this.status.lastCheckedAt = new Date().toISOString()
      appendActivity('error', '❌ Update check failed', message)
    }

    this.broadcastStatus()
    return this.getStatus()
  }

  public async downloadUpdate(): Promise<{ ok: boolean; error?: string }> {
    if (this.isDownloading) {
      return { ok: false, error: 'Download already in progress' }
    }

    const downloadUrl = this.status.downloadUrl || this.status.releaseUrl
    if (!downloadUrl) {
      return { ok: false, error: 'No download URL available' }
    }

    this.isDownloading = true
    const versionStr = this.status.latestVersion || 'latest'
    appendActivity('info', `📥 Downloading update v${versionStr}…`, downloadUrl)

    this.broadcastProgress({
      downloading: true,
      percent: 0,
      transferredBytes: 0,
      totalBytes: 0,
      statusText: 'Starting download…',
      error: null
    })

    try {
      const res = await fetch(downloadUrl, {
        headers: {
          'User-Agent': `GoblinCompanion/${this.status.currentVersion}`
        }
      })

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: Failed to download installer`)
      }

      const totalLength = parseInt(res.headers.get('content-length') || '0', 10)
      const tempPath = join(app.getPath('temp'), `GoblinCompanion-Setup-${versionStr}.exe`)
      const fileStream = createWriteStream(tempPath)

      if (res.body) {
        const reader = res.body.getReader()
        let downloadedBytes = 0

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          if (value) {
            fileStream.write(Buffer.from(value))
            downloadedBytes += value.length
            const percent = totalLength > 0 ? Math.round((downloadedBytes / totalLength) * 100) : 50
            this.broadcastProgress({
              downloading: true,
              percent,
              transferredBytes: downloadedBytes,
              totalBytes: totalLength,
              statusText: `Downloading v${versionStr} (${percent}%)`,
              error: null
            })
          }
        }
      }

      fileStream.end()
      this.isDownloading = false

      appendActivity('success', `✅ Update v${versionStr} downloaded`, `Installing silently in background: ${tempPath}`)
      this.broadcastProgress({
        downloading: false,
        percent: 100,
        transferredBytes: totalLength,
        totalBytes: totalLength,
        statusText: 'Installing & Restarting…',
        error: null
      })

      // Run NSIS installer silently in background (/S) and quit app so installer replaces files & restarts automatically
      setTimeout(() => {
        try {
          const child = spawn(tempPath, ['/S'], { detached: true, stdio: 'ignore' })
          child.unref()
        } catch {
          void shell.openPath(tempPath)
        }
        app.quit()
      }, 800)

      return { ok: true }
    } catch (err: unknown) {
      this.isDownloading = false
      const errorMsg = err instanceof Error ? err.message : String(err)
      appendActivity('error', '❌ Update download failed', errorMsg)
      this.broadcastProgress({
        downloading: false,
        percent: 0,
        transferredBytes: 0,
        totalBytes: 0,
        statusText: 'Download failed',
        error: errorMsg
      })
      return { ok: false, error: errorMsg }
    }
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

  private broadcastProgress(progress: UpdateDownloadProgress): void {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send(IpcChannel.UpdateProgressChanged, progress)
      }
    }
  }
}

export const updateManager = new UpdateManager()
