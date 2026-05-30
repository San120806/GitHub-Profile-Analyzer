import { useState, useEffect } from 'react';

const API = '/api';

function App() {
  const [username, setUsername] = useState('');
  const [currentProfile, setCurrentProfile] = useState('');
  const [result, setResult] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [status, setStatus] = useState({ msg: '', type: '' });
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [syncInfo, setSyncInfo] = useState(null);
  const [langFilter, setLangFilter] = useState('');
  const [sortFilter, setSortFilter] = useState('last_analyzed_at');

  const showStatus = (msg, type = '') => setStatus({ msg, type });

  const fetchProfiles = async () => {
    let url = `${API}/profiles?page=1&limit=12&sort=${sortFilter}`;
    if (langFilter) url += `&language=${langFilter}`;
    try {
      const res = await fetch(url);
      const json = await res.json();
      if (res.ok) setProfiles(json.data || []);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchProfiles();
  }, [langFilter, sortFilter]);

  const analyzeProfile = async (u) => {
    const target = u || username.trim();
    if (!target) { showStatus('Please enter a GitHub username.', 'error'); return; }
    
    setUsername(target);
    setCurrentProfile(target);
    setLoading(true);
    showStatus('Fetching profile and running analysis engine…', 'info');
    setSyncInfo(null);

    try {
      const res = await fetch(`${API}/github/${target}`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Analysis failed');
      setResult(json.data);
      showStatus('');
      fetchProfiles();
    } catch (e) {
      showStatus('❌ ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const refreshProfile = async () => {
    if (!currentProfile) return;
    setRefreshing(true);
    setSyncInfo(null);

    try {
      const res = await fetch(`${API}/github/${currentProfile}/refresh`, { method: 'PUT' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Refresh failed');
      setResult(json.data);
      if (json.incremental_sync) {
        setSyncInfo({ sync: json.incremental_sync, msg: json.message });
      }
      fetchProfiles();
    } catch (e) {
      showStatus('❌ ' + e.message, 'error');
    } finally {
      setRefreshing(false);
    }
  };

  const loadProfile = async (target) => {
    setCurrentProfile(target);
    setUsername(target);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    showStatus('Loading stored profile…', 'info');
    setSyncInfo(null);

    try {
      const res = await fetch(`${API}/profiles/${target}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setResult(json.data);
      showStatus('');
    } catch (e) {
      showStatus('❌ ' + e.message, 'error');
    }
  };

  const fmt = (n) => {
    if (n === null || n === undefined) return '—';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
    return String(n);
  };

  const timeAgo = (iso) => {
    if (!iso) return '—';
    const diff = Math.floor((Date.now() - new Date(iso)) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    return Math.floor(diff / 86400) + 'd ago';
  };

  return (
    <div className="container">
      <header>
        <div className="logo">
          <div className="logo-icon">⚡</div>
          Dev<span>Intel</span>
        </div>
        <span className="api-badge">GitHub Intelligence API</span>
      </header>

      <section className="hero">
        <div className="hero-tag">Live · Connected to Backend</div>
        <h1>Analyze Any GitHub<br/><span className="hi">Developer Profile</span></h1>
        <p>Enter a GitHub username to instantly detect tech stack, developer type, language distribution, and engineering insights — all powered by your backend analysis engine.</p>

        <div className="search-wrap">
          <input 
            type="text" 
            placeholder="Enter GitHub username (e.g. torvalds)" 
            value={username}
            onChange={e => setUsername(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && analyzeProfile()}
            spellCheck={false} 
          />
          <button 
            className="btn btn-primary" 
            onClick={() => analyzeProfile()} 
            disabled={loading}
          >
            {loading ? <><span className="spinner"></span>Analyzing…</> : 'Analyze'}
          </button>
        </div>
        <div className={`status-bar ${status.type}`}>{status.msg}</div>
      </section>

      {result && (
        <section id="result" className="visible">
          <div className="card profile-card">
            <img src={result.avatar_url || ''} alt="" className="avatar" />
            <div className="profile-info">
              <div className="profile-username">@{result.username}</div>
              <div className="profile-name">{result.name || result.username}</div>
              <div className="profile-bio">{result.bio || 'No bio available.'}</div>
              <div className="profile-stats">
                <div className="stat"><div className="stat-val">{fmt(result.followers)}</div><div className="stat-lbl">Followers</div></div>
                <div className="stat"><div className="stat-val">{fmt(result.following)}</div><div className="stat-lbl">Following</div></div>
                <div className="stat"><div className="stat-val">{fmt(result.public_repos)}</div><div className="stat-lbl">Repos</div></div>
              </div>
            </div>
            <div className="profile-badges">
              <div className="dev-type-badge">⚙ {result.developer_type || 'Developer'}</div>
              <button className="refresh-btn" onClick={refreshProfile} style={{ opacity: refreshing ? 0.6 : 1 }}>
                {refreshing ? '⏳ Refreshing…' : '↻ Refresh'}
              </button>
              <div className="timestamp">Analyzed {timeAgo(result.last_analyzed_at)}</div>
            </div>
          </div>

          {syncInfo && (
            <div className="sync-info" style={{ marginTop: 14 }}>
              ⚡ Incremental Sync — {syncInfo.sync.repos_updated} repo(s) updated, {syncInfo.sync.repos_skipped} skipped (unchanged). {syncInfo.msg}
            </div>
          )}

          <div className="stats-row" style={{ marginTop: 16 }}>
            <div className="stat-card"><div className="stat-card-val">{fmt(result.repositories_analyzed ?? result.repo_stats?.total_repos)}</div><div className="stat-card-lbl">Repos Analyzed</div></div>
            <div className="stat-card"><div className="stat-card-val">{fmt(result.repo_stats?.total_stars)}</div><div className="stat-card-lbl">Total Stars</div></div>
            <div className="stat-card"><div className="stat-card-val">{fmt(result.repo_stats?.total_forks)}</div><div className="stat-card-lbl">Total Forks</div></div>
            <div className="stat-card"><div className="stat-card-val">{result.top_language || '—'}</div><div className="stat-card-lbl">Top Language</div></div>
          </div>

          <div className="grid2" style={{ marginTop: 16 }}>
            <div className="card">
              <div className="section-title">Language Distribution</div>
              <div>
                {Object.keys(result.language_distribution || {}).length > 0 ? 
                  Object.keys(result.language_distribution).slice(0, 6).map((lang, i) => (
                    <div className="lang-bar-row" key={lang}>
                      <div className="lang-bar-header">
                        <span className="lang-name">{lang}</span>
                        <span className="lang-pct">{result.language_distribution[lang]}%</span>
                      </div>
                      <div className="lang-track">
                        <div className={`lang-fill lc-${i % 6}`} style={{ width: result.language_distribution[lang] + '%' }}></div>
                      </div>
                    </div>
                  ))
                : <p style={{ color: 'var(--muted)', fontSize: '.85rem' }}>No language data.</p>}
              </div>
            </div>
            <div className="card">
              <div className="section-title">Tech Stack Detected</div>
              <div className="chips">
                {(result.tech_stack || []).length > 0 ? 
                  result.tech_stack.map(t => <span className="chip" key={t}>{t}</span>)
                : <span style={{ color: 'var(--muted)', fontSize: '.85rem' }}>No stack detected.</span>}
              </div>
            </div>
          </div>

          <div className="card" style={{ marginTop: 16 }}>
            <div className="section-title">Top Repositories</div>
            <div className="repo-list">
              {(result.repositories || []).length > 0 ? 
                result.repositories.slice(0, 8).map(r => (
                  <div className="repo-item" key={r.repo_name || r.name}>
                    <div>
                      <div className="repo-name">{r.repo_name || r.name}</div>
                      <div className="repo-desc">{r.description || 'No description'}</div>
                    </div>
                    <div className="repo-meta">
                      {r.language && <span className="repo-lang">{r.language}</span>}
                      <span className="repo-stars">★ {fmt(r.stars ?? r.stargazers_count ?? 0)}</span>
                    </div>
                  </div>
                ))
              : <p style={{ color: 'var(--muted)', fontSize: '.85rem' }}>Repository data will appear after fetching from the stored profile endpoint.</p>}
            </div>
          </div>
        </section>
      )}

      <div className="divider"></div>

      <section id="profiles-section">
        <div className="section-header">
          <h2>📊 Analyzed Profiles</h2>
          <div className="filters">
            <select className="filter-select" value={langFilter} onChange={e => setLangFilter(e.target.value)}>
              <option value="">All Languages</option>
              <option>JavaScript</option><option>TypeScript</option>
              <option>Python</option><option>Go</option>
              <option>Java</option><option>C</option><option>C++</option>
              <option>Rust</option><option>Ruby</option><option>PHP</option>
            </select>
            <select className="filter-select" value={sortFilter} onChange={e => setSortFilter(e.target.value)}>
              <option value="last_analyzed_at">Latest Analyzed</option>
              <option value="followers">Most Followers</option>
              <option value="public_repos">Most Repos</option>
            </select>
          </div>
        </div>
        <div className="profiles-grid">
          {profiles.length > 0 ? 
            profiles.map(p => {
              const stack = Array.isArray(p.tech_stack) ? p.tech_stack : (JSON.parse(p.tech_stack || '[]'));
              return (
                <div className="profile-thumb" key={p.username} onClick={() => loadProfile(p.username)}>
                  <div className="thumb-top">
                    <img className="thumb-avatar" src={p.avatar_url || ''} alt={p.username} />
                    <div>
                      <div className="thumb-name">{p.name || p.username}</div>
                      <div className="thumb-user">@{p.username}</div>
                    </div>
                  </div>
                  <div className="thumb-type">{p.developer_type || 'Developer'}</div>
                  <div className="thumb-lang">Top language: <span>{p.top_language || 'Unknown'}</span></div>
                  <div style={{ marginTop: 10, display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    {stack.slice(0, 3).map(t => <span className="chip" key={t} style={{ fontSize: '.7rem', padding: '3px 9px' }}>{t}</span>)}
                  </div>
                  <div style={{ marginTop: 10, fontSize: '.75rem', color: 'var(--muted)' }}>
                    👥 {fmt(p.followers)} followers · 📁 {fmt(p.public_repos)} repos
                  </div>
                </div>
              );
            })
          : <div style={{ color: 'var(--muted)', fontSize: '.85rem', padding: '30px 0' }}>No profiles analyzed yet. Search for a GitHub username above to get started.</div>}
        </div>
      </section>

      <footer>
        <div className="container">
          Built with <span>React · Vite · Express · MySQL</span> &nbsp;·&nbsp; DevIntel © 2026
        </div>
      </footer>
    </div>
  );
}

export default App;
