import { useCallback, useState } from 'react'
import type { ConflictPolicy } from '../types'
import * as api from '../lib/github/api'
import { commitUrl } from '../lib/github/links'
import type { GitHubSync } from '../hooks/useGitHubSync'

interface GitHubSettingsProps {
  sync: GitHubSync
  onShowHistory: () => void
}

export function GitHubSettings({ sync, onShowHistory }: GitHubSettingsProps) {
  const { config, update, reset } = sync
  const [confirming, setConfirming] = useState(false)

  // 마지막으로 올린 커밋으로 가는 길. 지을 수 없으면 null 이고, 그때는 링크를 안 내놓습니다.
  const lastCommitUrl = commitUrl(config, sync.lastCommit?.sha ?? null)
  const [viewer, setViewer] = useState<string | null>(null)
  const [repos, setRepos] = useState<api.RepoInfo[] | null>(null)
  const [branches, setBranches] = useState<string[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(async (label: string, task: () => Promise<void>) => {
    setBusy(label)
    setError(null)
    try {
      await task()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(null)
    }
  }, [])

  const connect = () =>
    run('토큰을 확인하는 중…', async () => {
      if (!config.token.trim()) throw new Error('먼저 액세스 토큰을 붙여넣어 주세요.')
      const me = await api.getViewer(config.token.trim())
      setViewer(me.login)
      setRepos(await api.listRepos(config.token.trim()))
    })

  const chooseRepo = (fullName: string, defaultBranch: string) =>
    run('브랜치를 읽는 중…', async () => {
      const [owner, repo] = fullName.split('/')
      update({ owner, repo, branch: defaultBranch })
      setBranches(await api.listBranches({ ...config, owner, repo, branch: defaultBranch }))
    })

  const loadBranches = () =>
    run('브랜치를 읽는 중…', async () => {
      if (!config.owner || !config.repo) throw new Error('저장소를 먼저 지정해 주세요.')
      setBranches(await api.listBranches(config))
    })

  const repoLabel = config.owner && config.repo ? `${config.owner}/${config.repo}` : ''


  return (
    <>
      <section className="field">
        <label htmlFor="gh-token">액세스 토큰</label>
        <div className="row">
          <input
            id="gh-token"
            className="dialog-input"
            type="password"
            value={config.token}
            placeholder="github_pat_..."
            autoComplete="off"
            onChange={(event) => update({ token: event.target.value })}
          />
          <button
            type="button"
            className="btn btn-primary"
            data-tip="토큰이 쓸 수 있는지 확인하고 접근 가능한 저장소를 불러옵니다"
            onClick={connect}
            disabled={busy !== null}
          >
            확인
          </button>
        </div>
        <p className="hint">
          GitHub → Settings → Developer settings → <strong>Fine-grained personal access token</strong> 에서
          대상 저장소만 고르고 <strong>Repository permissions → Contents: Read and write</strong> 만 주세요.
          토큰은 이 브라우저에만 저장되고 다른 곳으로 전송되지 않습니다.
        </p>
        {viewer && <span className="pill pill-ok">{viewer} 로 연결됨</span>}
      </section>

      {repos && (
        <section className="field">
          <label>저장소 고르기</label>
          <ul className="repo-list">
            {repos.length === 0 && <li className="panel-empty">토큰으로 접근할 수 있는 저장소가 없습니다.</li>}
            {repos.map((repo) => (
              <li key={repo.fullName}>
                <button
                  type="button"
                  className={repo.fullName === repoLabel ? 'is-active' : ''}
                  data-tip={`${repo.fullName} 를 동기화 대상으로 지정`}
                  onClick={() => chooseRepo(repo.fullName, repo.defaultBranch)}
                >
                  <span>{repo.fullName}</span>
                  <span className="repo-meta">
                    {repo.private ? '비공개' : '공개'}
                    {repo.permissions?.push === false && ' · 쓰기 권한 없음'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="field">
        <label htmlFor="gh-owner">저장소와 브랜치</label>
        <div className="row">
          <input
            id="gh-owner"
            className="dialog-input"
            value={config.owner}
            placeholder="계정 또는 조직"
            onChange={(event) => update({ owner: event.target.value.trim() })}
          />
          <span className="sep">/</span>
          <input
            className="dialog-input"
            value={config.repo}
            placeholder="저장소 이름"
            onChange={(event) => update({ repo: event.target.value.trim() })}
          />
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          {branches ? (
            <select
              className="dialog-input"
              value={config.branch}
              onChange={(event) => update({ branch: event.target.value })}
            >
              {branches.map((branch) => (
                <option key={branch} value={branch}>
                  {branch}
                </option>
              ))}
            </select>
          ) : (
            <input
              className="dialog-input"
              value={config.branch}
              placeholder="브랜치 (기본 main)"
              onChange={(event) => update({ branch: event.target.value.trim() })}
            />
          )}
          <button
            type="button"
            className="btn"
            data-tip="이 저장소의 브랜치를 불러와 고를 수 있게 합니다"
            onClick={loadBranches}
            disabled={busy !== null}
          >
            브랜치 목록
          </button>
        </div>
        <input
          className="dialog-input"
          style={{ marginTop: 8 }}
          value={config.basePath}
          placeholder="저장소 안 하위 폴더 (비우면 저장소 루트)"
          onChange={(event) => update({ basePath: event.target.value.replace(/^\/+|\/+$/g, '') })}
        />
        <p className="hint">
          하위 폴더를 적으면 <strong>연 폴더의 최상위가 저장소의 그 폴더에 대응</strong>합니다.
          예를 들어 <code>docs</code> 로 두면 <code>회고/8월.md</code> 는
          저장소의 <code>docs/회고/8월.md</code> 가 됩니다. 비우면 저장소 루트입니다.
        </p>
        <p className="hint">
          저장소·브랜치·하위 폴더를 바꾸면 문서가 올라갈 경로가 달라지므로,
          그 대상에 대한 비교 기준을 새로 잡습니다. 이전 대상의 기준점은 그대로 남아 있어
          되돌리면 다시 쓰입니다. 브랜치가 아직 없으면 첫 동기화 때 새로 만듭니다.
        </p>
      </section>

      <section className="field">
        <label htmlFor="gh-conflict">충돌 처리 방식</label>
        <select
          id="gh-conflict"
          className="dialog-input"
          value={config.conflictPolicy}
          onChange={(event) => update({ conflictPolicy: event.target.value as ConflictPolicy })}
        >
          <option value="keep-both">양쪽 다 보존 (저장소 버전을 사본으로 저장)</option>
          <option value="local-wins">로컬 우선</option>
          <option value="remote-wins">저장소 우선</option>
        </select>

        <label className="checkbox">
          <input
            type="checkbox"
            checked={config.propagateDeletes}
            onChange={(event) => update({ propagateDeletes: event.target.checked })}
          />
          한쪽에서 지운 문서를 반대쪽에서도 지우기
          <span className="hint">
            꺼두면 삭제가 전파되지 않고 남아 있는 쪽에서 다시 복사해옵니다.
            저장소 쪽 삭제는 커밋으로 남으므로 언제든 되돌릴 수 있습니다.
          </span>
        </label>
      </section>

      <section className="field">
        <label>자동 동기화</label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={config.autoSync}
            onChange={(event) => update({ autoSync: event.target.checked })}
          />
          정해진 간격마다 알아서 동기화하기
          <span className="hint">
            폴더를 연 직후 한 번 돌고, 그 뒤로는 아래 간격마다 반복합니다.
            이미 동기화 중이면 건너뜁니다.
          </span>
        </label>

        <div className="row" style={{ marginTop: 10 }}>
          <input
            id="gh-interval"
            className="dialog-input interval-input"
            type="number"
            min={1}
            max={1440}
            step={1}
            value={config.autoSyncMinutes}
            disabled={!config.autoSync}
            data-tip="1분에서 1440분(하루) 사이로 정할 수 있습니다"
            onChange={(event) => {
              const minutes = Number(event.target.value)
              if (Number.isFinite(minutes)) {
                update({ autoSyncMinutes: Math.min(Math.max(Math.round(minutes), 1), 1440) })
              }
            }}
          />
          <span className="hint" style={{ margin: 0 }}>분마다</span>
        </div>
      </section>

      <section className="field">
        <div className="row">
          <button
            type="button"
            className="btn btn-primary"
            data-tip={sync.isConfigured ? '지금 한 번 동기화합니다' : '토큰과 저장소를 먼저 채워 주세요'}
            onClick={() => void sync.run('manual')}
            disabled={!sync.isConfigured || sync.status.phase === 'running'}
          >
            {sync.status.phase === 'running' ? '동기화 중…' : '지금 동기화'}
          </button>
          <button
            type="button"
            className="btn"
            data-tip={
              sync.history.length > 0
                ? `이 폴더에서 돈 동기화 ${sync.history.length}건을 봅니다`
                : '아직 이 폴더에서 동기화한 적이 없습니다'
            }
            onClick={onShowHistory}
            disabled={sync.history.length === 0}
          >
            지난 결과 보기
          </button>
        </div>
        {busy && <p className="status">{busy}</p>}
        {error && <p className="status status-error">{error}</p>}

        <p className="hint" style={{ marginBottom: 0 }}>
          마지막 동기화:{' '}
          {sync.lastSyncAt ? new Date(sync.lastSyncAt).toLocaleString('ko-KR') : '아직 없습니다'}
          {lastCommitUrl && sync.lastCommit && (
            <>
              {' · '}
              <a
                className="commit-link"
                href={lastCommitUrl}
                target="_blank"
                rel="noreferrer noopener"
                data-tip={`${sync.lastCommit.sha.slice(0, 7)} 커밋을 GitHub 에서 새 탭으로 엽니다`}
              >
                {sync.lastCommit.sha.slice(0, 7)}
              </a>
            </>
          )}
        </p>
      </section>

      <section className="field">
        <label>이 폴더의 설정</label>
        <p className="hint" style={{ marginTop: 0 }}>
          저장소 설정과 액세스 토큰은 <strong>지금 열려 있는 폴더</strong>에만 딸려 있습니다.
          다른 폴더를 열면 그 폴더의 설정이 따로 있습니다.
        </p>
        <div className="row">
          <button
            type="button"
            className={confirming ? 'btn btn-danger' : 'btn'}
            data-tip="이 폴더에 맞춰 둔 저장소 설정과 토큰을 지웁니다"
            onClick={() => {
              if (!confirming) {
                setConfirming(true)
                return
              }
              setConfirming(false)
              void reset()
            }}
          >
            {confirming ? '정말 지울까요?' : '이 폴더의 설정 지우기'}
          </button>
          {confirming && (
            <button type="button" className="btn" onClick={() => setConfirming(false)}>
              그만두기
            </button>
          )}
        </div>
      </section>

    </>
  )
}
