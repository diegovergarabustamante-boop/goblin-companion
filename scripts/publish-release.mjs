import { execSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const REPO = 'diegovergarabustamante-boop/goblin-companion'
const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'))
const VERSION = pkg.version || '0.2.0'
const TAG = `v${VERSION}`
const RELEASE_NAME = `Goblin Companion ${TAG}`
const BODY = `## Goblin Companion ${TAG}

### Fixes
- **Remote / tunnel users:** new local \`POST /read\` endpoint so the web UI reads SavedVariables from the client PC instead of asking Django to open remote paths
- Prevents \`File not found\` / 404 on \`/api/load-tsm-from-path/\` when connected through a tunnel

### Notes
- Update recommended for anyone using Companion against a remote Django server
`
const ASSET_NAME = `GoblinCompanion-Setup-${VERSION}.exe`
const EXE_PATH = join(process.cwd(), `release/${ASSET_NAME}`)


function getGitHubToken() {
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN

  try {
    const input = 'protocol=https\nhost=github.com\n'
    const out = execSync('git credential fill', { input, encoding: 'utf8' })
    for (const line of out.split('\n')) {
      if (line.startsWith('password=')) {
        return line.substring(9).trim()
      }
    }
  } catch (err) {
    console.error('Failed to get git credential token:', err)
  }
  return null
}

async function main() {
  if (!existsSync(EXE_PATH)) {
    console.error(`Installer file not found at: ${EXE_PATH}`)
    process.exit(1)
  }

  const token = getGitHubToken()
  if (!token) {
    console.error('No GitHub token found. Please set GH_TOKEN environment variable.')
    process.exit(1)
  }

  console.log(`Connecting to GitHub API for ${REPO}...`)

  // Check if release already exists
  let releaseData = null
  const checkRes = await fetch(`https://api.github.com/repos/${REPO}/releases/tags/${TAG}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'Node-Release-Publisher'
    }
  })

  if (checkRes.ok) {
    releaseData = await checkRes.json()
    console.log(`Found existing release for tag ${TAG} (ID: ${releaseData.id})`)
  } else {
    console.log(`Creating release for ${TAG}...`)
    const createRes = await fetch(`https://api.github.com/repos/${REPO}/releases`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent': 'Node-Release-Publisher'
      },
      body: JSON.stringify({
        tag_name: TAG,
        name: RELEASE_NAME,
        body: BODY,
        draft: false,
        prerelease: false
      })
    })

    if (!createRes.ok) {
      const errText = await createRes.text()
      console.error(`Failed to create release: ${createRes.status} - ${errText}`)
      process.exit(1)
    }

    releaseData = await createRes.json()
    console.log(`Release created successfully! URL: ${releaseData.html_url}`)
  }

  // Upload asset
  const rawUploadUrl = releaseData.upload_url.replace(/\{.*?\}$/, '')
  const assetName = ASSET_NAME
  const uploadUrl = `${rawUploadUrl}?name=${encodeURIComponent(assetName)}`


  console.log(`Reading ${EXE_PATH}...`)
  const fileBuffer = readFileSync(EXE_PATH)
  console.log(`Uploading ${assetName} (${(fileBuffer.length / (1024 * 1024)).toFixed(2)} MB)...`)

  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/octet-stream',
      'Content-Length': fileBuffer.length.toString(),
      'User-Agent': 'Node-Release-Publisher'
    },
    body: fileBuffer
  })

  if (!uploadRes.ok) {
    const errText = await uploadRes.text()
    if (errText.includes('already_exists')) {
      console.log(`Asset ${assetName} already uploaded to release!`)
    } else {
      console.error(`Failed to upload asset: ${uploadRes.status} - ${errText}`)
      process.exit(1)
    }
  } else {
    const assetData = await uploadRes.json()
    console.log(`Asset uploaded successfully! Download URL: ${assetData.browser_download_url}`)
  }

  console.log(`🎉 Release process complete: ${releaseData.html_url}`)
}

main().catch((err) => {
  console.error('Unhandled error in release publisher:', err)
  process.exit(1)
})
