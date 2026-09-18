import { useState } from 'react'
import { cloud } from '../cloud'

type Tab = 'password' | 'otp' | 'signup' | 'forgot'

const TABS: { key: Tab; label: string }[] = [
  { key: 'password', label: '密码登录' },
  { key: 'otp', label: '验证码登录' },
  { key: 'signup', label: '注册' },
]

/**
 * 云端登录门。
 * 覆盖完整邮箱认证链路：密码登录、邮箱验证码登录、验证码注册（带密码）、找回密码。
 * 登录成功后由调用方 hydrate 云端数据再进入应用。
 */
export default function CloudGate({ onReady }: { onReady: () => void }) {
  const [tab, setTab] = useState<Tab>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [tip, setTip] = useState('')
  // 验证码流程的中间态
  const [otpStarted, setOtpStarted] = useState<null | { verify: (args: { token: string }) => Promise<{ error?: { message?: string } | null }> }>(null)
  const [signupVerify, setSignupVerify] = useState<null | { verificationId: string; isExistingUser: boolean }>(null)
  const [forgotStarted, setForgotStarted] = useState<null | { updateUser: (args: { nonce: string; password: string }) => Promise<{ error?: { message?: string } | null }> }>(null)

  const run = async (job: () => Promise<string | null>) => {
    if (busy) return
    setBusy(true)
    setErr('')
    try {
      const e = await job()
      if (e) setErr(e)
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : '操作失败，请稍后再试')
    } finally {
      setBusy(false)
    }
  }

  const needEmail = () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setErr('请输入正确的邮箱地址')
      return false
    }
    return true
  }

  /* ---------- 密码登录 ---------- */
  const loginPassword = () =>
    run(async () => {
      if (!needEmail()) return null
      if (!password) return '请输入密码'
      const { error } = await cloud.auth.signInWithPassword({ email: email.trim(), password })
      if (error) return '邮箱或密码不正确'
      onReady()
      return null
    })

  /* ---------- 验证码登录 ---------- */
  const sendLoginOtp = () =>
    run(async () => {
      if (!needEmail()) return null
      const started = await cloud.auth.signInWithOtp({ email: email.trim() })
      if (started.error) return started.error.message || '验证码发送失败'
      setOtpStarted(started.data as never)
      setTip('验证码已发送到邮箱，请查收（可能在垃圾邮件里）。')
      return null
    })
  const verifyLoginOtp = () =>
    run(async () => {
      if (!otpStarted) return '请先获取验证码'
      if (!code.trim()) return '请输入验证码'
      const done = await otpStarted.verify({ token: code.trim() })
      if (done.error) return done.error.message || '验证码不正确或已过期'
      onReady()
      return null
    })

  /* ---------- 注册（验证码 + 密码） ---------- */
  const sendSignupOtp = () =>
    run(async () => {
      if (!needEmail()) return null
      if (password.length < 6) return '密码至少 6 位'
      const sent = await cloud.auth.sendOtp({ email: email.trim() })
      if (sent.error) return sent.error.message || '验证码发送失败'
      setSignupVerify(sent.data as never)
      setTip('验证码已发送到邮箱。填上验证码后完成注册。')
      return null
    })
  const finishSignup = () =>
    run(async () => {
      if (!signupVerify) return '请先获取验证码'
      if (!code.trim()) return '请输入验证码'
      const done = await cloud.auth.verifyOtp({
        verificationId: signupVerify.verificationId,
        token: code.trim(),
        email: email.trim(),
        isExistingUser: signupVerify.isExistingUser,
        password: signupVerify.isExistingUser ? undefined : password,
      })
      if (done.error) return done.error.message || '验证码不正确或已过期'
      onReady()
      return null
    })

  /* ---------- 找回密码 ---------- */
  const sendForgot = () =>
    run(async () => {
      if (!needEmail()) return null
      const started = await cloud.auth.resetPasswordForEmail(email.trim())
      if (started.error) return started.error.message || '发送失败'
      setForgotStarted(started.data as never)
      setTip('验证码已发送到邮箱，输入验证码和新密码即可重置。')
      return null
    })
  const finishForgot = () =>
    run(async () => {
      if (!forgotStarted) return '请先发送验证码'
      if (!code.trim()) return '请输入验证码'
      if (password.length < 6) return '新密码至少 6 位'
      const done = await forgotStarted.updateUser({ nonce: code.trim(), password })
      if (done.error) return done.error.message || '重置失败，验证码可能不正确或已过期'
      onReady()
      return null
    })

  const switchTab = (t: Tab) => {
    setTab(t)
    setErr('')
    setTip('')
    setCode('')
  }

  return (
    <div className="gate-wrap">
      <div className="gate-card">
        <div className="brand" style={{ padding: 0, marginBottom: 18 }}>
          <div className="brand-mark" />
          <div className="brand-text">
            <b>小说创作工作台</b>
            <span>云端同步 · 登录后在多台电脑间同步写作数据</span>
          </div>
        </div>

        {tab !== 'forgot' && (
          <div className="seg" style={{ alignSelf: 'flex-start', marginBottom: 16 }}>
            {TABS.map((t) => (
              <button
                key={t.key}
                className={'seg-btn' + (tab === t.key ? ' on' : '')}
                onClick={() => switchTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        <div className="field">
          <label>邮箱</label>
          <input
            className="input"
            type="email"
            autoFocus
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        {tab === 'password' && (
          <>
            <div className="field">
              <label>密码</label>
              <input
                className="input"
                type="password"
                placeholder="登录密码"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && loginPassword()}
              />
            </div>
            <button className="btn primary" style={{ width: '100%' }} disabled={busy} onClick={loginPassword}>
              {busy ? '登录中…' : '登 录'}
            </button>
            <button className="btn ghost sm" style={{ marginTop: 8 }} onClick={() => switchTab('forgot')}>
              忘记密码？
            </button>
          </>
        )}

        {tab === 'otp' && (
          <>
            <div className="field">
              <label>邮箱验证码</label>
              <div className="row">
                <input
                  className="input"
                  placeholder="6 位验证码"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
                <button className="btn" style={{ flex: '0 0 auto' }} disabled={busy} onClick={sendLoginOtp}>
                  {otpStarted ? '重新发送' : '获取验证码'}
                </button>
              </div>
            </div>
            <button className="btn primary" style={{ width: '100%' }} disabled={busy || !otpStarted} onClick={verifyLoginOtp}>
              {busy ? '登录中…' : '登 录'}
            </button>
          </>
        )}

        {tab === 'signup' && (
          <>
            <div className="field">
              <label>设置密码</label>
              <input
                className="input"
                type="password"
                placeholder="至少 6 位，之后可用密码登录"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="field">
              <label>邮箱验证码</label>
              <div className="row">
                <input
                  className="input"
                  placeholder="6 位验证码"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
                <button className="btn" style={{ flex: '0 0 auto' }} disabled={busy} onClick={sendSignupOtp}>
                  {signupVerify ? '重新发送' : '获取验证码'}
                </button>
              </div>
            </div>
            <button className="btn primary" style={{ width: '100%' }} disabled={busy || !signupVerify} onClick={finishSignup}>
              {busy ? '注册中…' : '注册并进入'}
            </button>
            <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
              只为自己使用，注册一个账号即可；在两台电脑上登录同一个邮箱就能同步。
            </div>
          </>
        )}

        {tab === 'forgot' && (
          <>
            <b style={{ display: 'block', marginBottom: 12, fontSize: 15 }}>找回密码</b>
            <div className="field">
              <label>邮箱验证码</label>
              <div className="row">
                <input
                  className="input"
                  placeholder="6 位验证码"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
                <button className="btn" style={{ flex: '0 0 auto' }} disabled={busy} onClick={sendForgot}>
                  发送验证码
                </button>
              </div>
            </div>
            <div className="field">
              <label>新密码</label>
              <input
                className="input"
                type="password"
                placeholder="至少 6 位"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <button className="btn primary" style={{ width: '100%' }} disabled={busy || !forgotStarted} onClick={finishForgot}>
              {busy ? '重置中…' : '重置密码并登录'}
            </button>
            <button className="btn ghost sm" style={{ marginTop: 8 }} onClick={() => switchTab('password')}>
              返回登录
            </button>
          </>
        )}

        {tip && <div className="gate-tip">{tip}</div>}
        {err && <div className="gate-err">{err}</div>}
      </div>
    </div>
  )
}
