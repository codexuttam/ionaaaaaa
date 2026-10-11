import { useEffect, useState, useMemo, type FormEvent } from 'react'
import './admin.css'

interface WaitlistRecord {
  _id: string
  name: string
  email: string
  phone?: string
  city?: string
  status?: string
  source?: string
  createdAt: string
}

interface BulkRecord {
  _id: string
  name: string
  email: string
  phone?: string
  city?: string
  business?: string
  message?: string
  status?: string
  source?: string
  createdAt: string
}

interface ContactRecord {
  _id: string
  name: string
  email: string
  phone?: string
  message: string
  status?: string
  source?: string
  createdAt: string
}

interface AllRecord {
  _id: string
  kind: 'contact' | 'launch' | 'hospitality'
  name: string
  email: string
  phone?: string
  city?: string
  business?: string
  message?: string
  createdAt: string
}

interface DashboardData {
  stats: {
    totalWaitlist: number
    totalBulkOrders: number
    totalContacts: number
    totalAll: number
  }
  waitlists: WaitlistRecord[]
  bulkOrders: BulkRecord[]
  contacts: ContactRecord[]
  allSubmissions: AllRecord[]
}

type TabType = 'waitlist' | 'bulk' | 'contact' | 'all'

function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  if (!rows || rows.length === 0) return
  const headers = Object.keys(rows[0])
  const csvLines = [
    headers.join(','),
    ...rows.map((row) =>
      headers
        .map((h) => {
          const val = row[h] ?? ''
          const str = typeof val === 'object' ? JSON.stringify(val) : String(val)
          return `"${str.replace(/"/g, '""')}"`
        })
        .join(',')
    ),
  ]
  const blob = new Blob([csvLines.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export function AdminDashboard() {
  const [token, setToken] = useState<string>(() => sessionStorage.getItem('iona_admin_token') || '')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loginError, setLoginError] = useState('')
  const [isLoggingIn, setIsLoggingIn] = useState(false)

  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<TabType>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedRecord, setSelectedRecord] = useState<Record<string, unknown> | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [copiedEmail, setCopiedEmail] = useState(false)
  const [copiedPhone, setCopiedPhone] = useState(false)

  const copyEmail = (email: string) => {
    navigator.clipboard.writeText(email)
    setCopiedEmail(true)
    setTimeout(() => setCopiedEmail(false), 2000)
  }

  const copyPhone = (phone: string) => {
    navigator.clipboard.writeText(phone)
    setCopiedPhone(true)
    setTimeout(() => setCopiedPhone(false), 2000)
  }

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault()
    setLoginError('')
    setIsLoggingIn(true)
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const result = await res.json()
      if (res.ok && result.ok && result.token) {
        setToken(result.token)
        sessionStorage.setItem('iona_admin_token', result.token)
      } else {
        setLoginError(result.error || 'Invalid password. Please try again.')
      }
    } catch {
      setLoginError('Could not connect to server. Check your network.')
    } finally {
      setIsLoggingIn(false)
    }
  }

  const handleLogout = () => {
    setToken('')
    sessionStorage.removeItem('iona_admin_token')
    setData(null)
  }

  const fetchData = async () => {
    if (!token) return
    setLoading(true)
    try {
      const res = await fetch('/api/admin/data', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const result = await res.json()
      if (res.ok && result.ok && result.data) {
        setData(result.data)
      } else if (res.status === 401) {
        handleLogout()
      }
    } catch (err) {
      console.error('Failed to fetch dashboard data:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (token) {
      fetchData()
    }
  }, [token])

  const handleDelete = async (collection: string, id: string) => {
    if (!confirm('Are you sure you want to permanently delete this record?')) return
    setDeletingId(id)
    try {
      const res = await fetch('/api/admin/delete', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ collection, id }),
      })
      if (res.ok) {
        if (selectedRecord && (selectedRecord._id as string) === id) {
          setSelectedRecord(null)
        }
        await fetchData()
      } else {
        alert('Could not delete record.')
      }
    } catch {
      alert('Network error while deleting.')
    } finally {
      setDeletingId(null)
    }
  }

  const currentRecords = useMemo(() => {
    if (!data) return []
    let list: Record<string, unknown>[] = []
    if (activeTab === 'waitlist') list = data.waitlists as unknown as Record<string, unknown>[]
    else if (activeTab === 'bulk') list = data.bulkOrders as unknown as Record<string, unknown>[]
    else if (activeTab === 'contact') list = data.contacts as unknown as Record<string, unknown>[]
    else list = data.allSubmissions as unknown as Record<string, unknown>[]

    if (!searchTerm.trim()) return list

    const s = searchTerm.toLowerCase()
    return list.filter((r) =>
      Object.values(r).some((v) => typeof v === 'string' && v.toLowerCase().includes(s))
    )
  }, [data, activeTab, searchTerm])

  const handleExport = () => {
    if (!currentRecords.length) {
      alert('No records available to export.')
      return
    }
    const cleanRows = currentRecords.map((r) => {
      const { _id, ...rest } = r
      return {
        id: _id,
        ...rest,
        createdAt: formatDate((r.createdAt as string) || ''),
      }
    })
    const dateStr = new Date().toISOString().slice(0, 10)
    downloadCsv(`iona_${activeTab}_records_${dateStr}.csv`, cleanRows)
  }

  // 1. Login View
  if (!token) {
    return (
      <div className="admin-root">
        <div className="admin-login-wrapper">
          <div className="admin-login-card">
            <div className="admin-brand-badge">
              <span className="dot" />
              <span>IONA Portal</span>
            </div>
            <h1 className="admin-login-title">Owner Access</h1>
            <p className="admin-login-sub">Enter the administrator password to view database records and analytics.</p>

            {loginError && <div className="admin-error-msg">{loginError}</div>}

            <form onSubmit={handleLogin}>
              <div className="admin-form-group">
                <label className="admin-label" htmlFor="admin-pwd">
                  Security Password
                </label>
                <div className="admin-input-wrapper">
                  <input
                    id="admin-pwd"
                    className="admin-input"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter password..."
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoFocus
                  />
                  <button
                    type="button"
                    className="admin-toggle-pwd"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              <button className="admin-btn" type="submit" disabled={isLoggingIn}>
                {isLoggingIn ? 'Authenticating...' : 'Unlock Portal'}
              </button>
            </form>
          </div>
        </div>
      </div>
    )
  }

  // 2. Dashboard View
  const stats = data?.stats || {
    totalWaitlist: 0,
    totalBulkOrders: 0,
    totalContacts: 0,
    totalAll: 0,
  }

  return (
    <div className="admin-root">
      <div className="admin-container">
        {/* Top Navbar */}
        <header className="admin-nav">
          <div className="admin-logo-group">
            <h1 className="admin-brand-title">IONA</h1>
            <div className="admin-chip">
              <span className="pulse-dot" />
              <span>Live DB Connected</span>
            </div>
          </div>

          <div className="admin-nav-actions">
            <a href="/" target="_blank" rel="noopener noreferrer" className="admin-secondary-btn" title="Open live website in new tab">
              <span>&larr; View Website</span>
            </a>
            <button type="button" className="admin-secondary-btn" onClick={fetchData} title="Refresh records">
              <span>{loading ? 'Refreshing...' : '↻ Refresh'}</span>
            </button>
            <button type="button" className="admin-secondary-btn" onClick={handleLogout}>
              <span>Logout</span>
            </button>
          </div>
        </header>

        {/* Stats Grid - Clickable to switch tabs */}
        <section className="admin-stats-grid">
          <div
            className={`admin-stat-card ${activeTab === 'all' ? 'active-card' : ''}`}
            onClick={() => setActiveTab('all')}
            style={{ cursor: 'pointer' }}
            title="Click to view all submissions"
          >
            <div className="admin-stat-header">
              <span className="admin-stat-label">Total Submissions</span>
              <span className="admin-stat-icon">📊</span>
            </div>
            <div className="admin-stat-value">{stats.totalAll}</div>
            <p className="admin-stat-desc">All lifetime records across forms</p>
          </div>

          <div
            className={`admin-stat-card ${activeTab === 'waitlist' ? 'active-card' : ''}`}
            onClick={() => setActiveTab('waitlist')}
            style={{ cursor: 'pointer' }}
            title="Click to view launch list signups"
          >
            <div className="admin-stat-header">
              <span className="admin-stat-label">Launch List</span>
              <span className="admin-stat-icon">🚀</span>
            </div>
            <div className="admin-stat-value">{stats.totalWaitlist}</div>
            <p className="admin-stat-desc">"Join the Launch List" signups</p>
          </div>

          <div
            className={`admin-stat-card ${activeTab === 'bulk' ? 'active-card' : ''}`}
            onClick={() => setActiveTab('bulk')}
            style={{ cursor: 'pointer' }}
            title="Click to view hospitality enquiries"
          >
            <div className="admin-stat-header">
              <span className="admin-stat-label">Hospitality Enquiries</span>
              <span className="admin-stat-icon">🏢</span>
            </div>
            <div className="admin-stat-value">{stats.totalBulkOrders}</div>
            <p className="admin-stat-desc">Hotels, restaurants & venue requirements</p>
          </div>

          <div
            className={`admin-stat-card ${activeTab === 'contact' ? 'active-card' : ''}`}
            onClick={() => setActiveTab('contact')}
            style={{ cursor: 'pointer' }}
            title="Click to view contact messages"
          >
            <div className="admin-stat-header">
              <span className="admin-stat-label">Contact Messages</span>
              <span className="admin-stat-icon">✉️</span>
            </div>
            <div className="admin-stat-value">{stats.totalContacts}</div>
            <p className="admin-stat-desc">Direct visitor contact messages</p>
          </div>
        </section>

        {/* Controls Card */}
        <section className="admin-controls-card">
          <div className="admin-tabs">
            <button
              type="button"
              className={`admin-tab ${activeTab === 'all' ? 'active' : ''}`}
              onClick={() => setActiveTab('all')}
            >
              <span>All Submissions</span>
              <span className="admin-tab-count">{stats.totalAll}</span>
            </button>
            <button
              type="button"
              className={`admin-tab ${activeTab === 'waitlist' ? 'active' : ''}`}
              onClick={() => setActiveTab('waitlist')}
            >
              <span>Launch List</span>
              <span className="admin-tab-count">{stats.totalWaitlist}</span>
            </button>
            <button
              type="button"
              className={`admin-tab ${activeTab === 'bulk' ? 'active' : ''}`}
              onClick={() => setActiveTab('bulk')}
            >
              <span>Hospitality Enquiries</span>
              <span className="admin-tab-count">{stats.totalBulkOrders}</span>
            </button>
            <button
              type="button"
              className={`admin-tab ${activeTab === 'contact' ? 'active' : ''}`}
              onClick={() => setActiveTab('contact')}
            >
              <span>Contact</span>
              <span className="admin-tab-count">{stats.totalContacts}</span>
            </button>
          </div>

          <div className="admin-search-actions">
            <input
              type="text"
              className="admin-search-box"
              placeholder="Search by name, email, city, business..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <button type="button" className="admin-action-btn export" onClick={handleExport}>
              <span>⬇ Export CSV</span>
            </button>
          </div>
        </section>

        {/* Data Table */}
        <div className="admin-table-container">
          <div className="admin-table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  {activeTab === 'bulk' && <th>Business Name</th>}
                  {(activeTab === 'waitlist' || activeTab === 'bulk' || activeTab === 'all') && <th>City</th>}
                  {activeTab === 'all' && <th>Form</th>}
                  {activeTab === 'bulk' && <th>Requirements (Sizes, volumes, timing)</th>}
                  {activeTab === 'contact' && <th>Message</th>}
                  {activeTab === 'all' && <th>Message / Requirements</th>}
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {currentRecords.length === 0 ? (
                  <tr>
                    <td colSpan={10}>
                      <div className="admin-empty-state">
                        <div className="admin-empty-icon">💧</div>
                        <div>No submissions found in this section yet.</div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  currentRecords.map((row) => {
                    const id = row._id as string
                    const targetCollection =
                      activeTab === 'waitlist'
                        ? 'waitlists'
                        : activeTab === 'bulk'
                          ? 'bulk_orders'
                          : activeTab === 'contact'
                            ? 'contacts'
                            : 'all_submissions'

                    return (
                      <tr
                        key={id}
                        onClick={() => setSelectedRecord(row)}
                        style={{ cursor: 'pointer' }}
                        title="Click to view details"
                      >
                        <td style={{ whiteSpace: 'nowrap' }}>{formatDate((row.createdAt as string) || '')}</td>
                        <td style={{ fontWeight: 600, color: '#f5f7f8' }}>{(row.name as string) || '-'}</td>
                        <td>
                          <a
                            href={`mailto:${row.email}`}
                            onClick={(e) => e.stopPropagation()}
                            style={{ color: '#38bdf8', textDecoration: 'none' }}
                            title="Click to send email"
                          >
                            {(row.email as string) || '-'}
                          </a>
                        </td>

                        <td style={{ whiteSpace: 'nowrap' }}>
                          {row.phone ? (
                            <a
                              href={`tel:${row.phone}`}
                              onClick={(e) => e.stopPropagation()}
                              style={{ color: '#38bdf8', textDecoration: 'none' }}
                              title="Click to call"
                            >
                              📞 {(row.phone as string)}
                            </a>
                          ) : (
                            <span style={{ color: '#64748b' }}>-</span>
                          )}
                        </td>

                        {activeTab === 'bulk' && <td>{(row.business as string) || '-'}</td>}

                        {(activeTab === 'waitlist' || activeTab === 'bulk' || activeTab === 'all') && (
                          <td>{(row.city as string) || '-'}</td>
                        )}

                        {activeTab === 'all' && (
                          <td>
                            <span
                              className={`admin-badge ${
                                row.kind === 'launch'
                                  ? 'waitlist'
                                  : row.kind === 'hospitality'
                                    ? 'bulk'
                                    : 'contact'
                              }`}
                            >
                              {row.kind === 'launch'
                                ? 'Waitlist'
                                : row.kind === 'hospitality'
                                  ? 'Bulk Order'
                                  : 'Contact'}
                            </span>
                          </td>
                        )}

                        {(activeTab === 'bulk' || activeTab === 'contact' || activeTab === 'all') && (
                          <td>
                            <div
                              className="admin-truncate"
                              title={(row.message as string) || ''}
                            >
                              {(row.message as string) || '-'}
                            </div>
                          </td>
                        )}

                        <td>
                          <span
                            className={`admin-badge ${
                              activeTab === 'waitlist'
                                ? 'waitlist'
                                : activeTab === 'bulk'
                                  ? 'bulk'
                                  : 'contact'
                            }`}
                          >
                            {(row.status as string) || 'Received'}
                          </span>
                        </td>

                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <button
                            type="button"
                            className="admin-view-action-btn"
                            onClick={(e) => {
                              e.stopPropagation()
                              setSelectedRecord(row)
                            }}
                            title="View full submission details"
                          >
                            👁 View
                          </button>
                          <button
                            type="button"
                            className="admin-delete-btn"
                            disabled={deletingId === id}
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDelete(targetCollection, id)
                            }}
                            title="Delete record"
                            style={{ marginLeft: '6px' }}
                          >
                            {deletingId === id ? '...' : '✕'}
                          </button>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Enhanced Details Pop-up Card */}
        {selectedRecord &&
          (() => {
              const id = selectedRecord._id as string
              const isLaunch = selectedRecord.kind === 'launch' || activeTab === 'waitlist'
              const isHospitality =
                selectedRecord.kind === 'hospitality' || activeTab === 'bulk' || Boolean(selectedRecord.business)
              const categoryLabel = isLaunch
                ? 'Join the Launch List'
                : isHospitality
                  ? 'Hospitality Enquiry'
                  : 'Contact Message'
              const badgeClass = isLaunch ? 'waitlist' : isHospitality ? 'bulk' : 'contact'
              const targetCollection = isLaunch
                ? 'waitlists'
                : isHospitality
                  ? 'bulk_orders'
                  : 'contacts'
              const senderName = (selectedRecord.name as string) || 'Visitor'
              const initial = senderName.charAt(0).toUpperCase() || 'I'
              const userEmail = (selectedRecord.email as string) || ''
              const userPhone = (selectedRecord.phone as string) || ''

              return (
                <div
                  className="admin-modal-backdrop"
                  onClick={() => setSelectedRecord(null)}
                  role="dialog"
                  aria-modal="true"
                >
                  <div className="admin-modal-card" onClick={(e) => e.stopPropagation()}>
                    {/* Modal Header */}
                    <div className="admin-modal-header">
                      <div>
                        <h3 className="admin-modal-title">Submission Details</h3>
                        <div className="admin-modal-badge-row">
                          <span className={`admin-badge ${badgeClass}`}>{categoryLabel}</span>
                          <span style={{ fontSize: '11px', color: '#64748b' }}>
                            Received {formatDate((selectedRecord.createdAt as string) || '')}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="admin-modal-close"
                        onClick={() => setSelectedRecord(null)}
                        title="Close"
                      >
                        ✕
                      </button>
                    </div>

                    {/* Sender Identity Card */}
                    <div className="admin-sender-box">
                      <div className="admin-avatar">{initial}</div>
                      <div className="admin-sender-info">
                        <div className="admin-sender-name">{senderName}</div>
                        <div className="admin-sender-email">
                          <a href={`mailto:${userEmail}`} style={{ color: '#38bdf8' }}>
                            {userEmail || '-'}
                          </a>
                          {userEmail && (
                            <button
                              type="button"
                              className="admin-copy-chip"
                              onClick={() => copyEmail(userEmail)}
                            >
                              {copiedEmail ? '✓ Copied' : '📋 Copy Email'}
                            </button>
                          )}
                        </div>

                        {userPhone && (
                          <div
                            className="admin-sender-email"
                            style={{ marginTop: '8px', color: '#f5f7f8' }}
                          >
                            <span>📞</span>
                            <a
                              href={`tel:${userPhone}`}
                              style={{ color: '#38bdf8', fontWeight: 500 }}
                            >
                              {userPhone}
                            </a>
                            <button
                              type="button"
                              className="admin-copy-chip"
                              onClick={() => copyPhone(userPhone)}
                            >
                              {copiedPhone ? '✓ Copied' : '📋 Copy Phone'}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Submission Details Grid */}
                    <div className="admin-detail-grid">
                      {Boolean(userPhone) && (
                        <div className="admin-detail-block">
                          <div className="admin-detail-label">Phone Number</div>
                          <div className="admin-detail-value" style={{ color: '#38bdf8' }}>
                            <a
                              href={`tel:${userPhone}`}
                              style={{ color: '#38bdf8', textDecoration: 'none' }}
                            >
                              {userPhone}
                            </a>
                          </div>
                        </div>
                      )}

                      {Boolean(selectedRecord.city) && (
                        <div className="admin-detail-block">
                          <div className="admin-detail-label">City / Location</div>
                          <div className="admin-detail-value">
                            {(selectedRecord.city as string) || '-'}
                          </div>
                        </div>
                      )}

                      {Boolean(selectedRecord.business) && (
                        <div className="admin-detail-block">
                          <div className="admin-detail-label">Business / Venue</div>
                          <div className="admin-detail-value">
                            {(selectedRecord.business as string) || '-'}
                          </div>
                        </div>
                      )}

                      <div className="admin-detail-block">
                        <div className="admin-detail-label">Database Record ID</div>
                        <div
                          className="admin-detail-value"
                          style={{ fontSize: '12px', fontFamily: 'monospace', color: '#94a3b8' }}
                        >
                          {id}
                        </div>
                      </div>

                      <div className="admin-detail-block">
                        <div className="admin-detail-label">Storage Status</div>
                        <div
                          className="admin-detail-value"
                          style={{ color: '#22c55e', fontSize: '12px' }}
                        >
                          ● Stored Live in MongoDB Atlas
                        </div>
                      </div>
                    </div>

                    {/* Requirements / Message Box */}
                    {Boolean(selectedRecord.message) ? (
                      <div className="admin-detail-full">
                        <div className="admin-detail-label">
                          {isHospitality
                            ? 'Requirements (Sizes, volumes, locations, timing)'
                            : 'Message Content'}
                        </div>
                        <div className="admin-message-content">
                          {(selectedRecord.message as string) || '-'}
                        </div>
                      </div>
                    ) : (
                      <div
                        className="admin-detail-full"
                        style={{
                          background: 'rgba(3, 20, 27, 0.3)',
                          borderStyle: 'dashed',
                        }}
                      >
                        <div className="admin-detail-label">Message / Note</div>
                        <div style={{ fontSize: '13px', color: '#64748b', fontStyle: 'italic' }}>
                          No additional message text attached to this entry.
                        </div>
                      </div>
                    )}

                    {/* Modal Actions Footer */}
                    <div className="admin-modal-footer">
                      <button
                        type="button"
                        className="admin-btn-danger"
                        disabled={deletingId === id}
                        onClick={() => handleDelete(targetCollection, id)}
                      >
                        <span>🗑 Delete from MongoDB</span>
                      </button>

                      <button
                        type="button"
                        className="admin-btn-close"
                        onClick={() => setSelectedRecord(null)}
                      >
                        Close
                      </button>
                    </div>
                  </div>
                </div>
              )
            })()}
      </div>
    </div>
  )
}
